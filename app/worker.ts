import { ChatWindowMessage } from "@/schema/ChatWindowMessage";

import { Voy as VoyClient } from "voy-search";

import { createRetrievalChain } from "langchain/chains/retrieval";
import { createStuffDocumentsChain } from "langchain/chains/combine_documents";
import { createHistoryAwareRetriever } from "langchain/chains/history_aware_retriever";

import { WebPDFLoader } from "langchain/document_loaders/web/pdf";

import { HuggingFaceTransformersEmbeddings } from "@langchain/community/embeddings/hf_transformers";
import { VoyVectorStore } from "@langchain/community/vectorstores/voy";
import { ChatOllama } from "@langchain/community/chat_models/ollama";
import { ChatWebLLM } from "./lib/chat_models/webllm";
import {
  ChatPromptTemplate,
  MessagesPlaceholder,
  PromptTemplate,
} from "@langchain/core/prompts";
import { RunnableSequence, RunnablePick } from "@langchain/core/runnables";
import {
  AIMessage,
  type BaseMessage,
  HumanMessage,
} from "@langchain/core/messages";
import { RecursiveCharacterTextSplitter } from "langchain/text_splitter";
import { LangChainTracer } from "@langchain/core/tracers/tracer_langchain";
import { Client } from "langsmith";

const embeddings = new HuggingFaceTransformersEmbeddings({
  // modelName: "nomic-ai/nomic-embed-text-v1",
  modelName: "Xenova/all-MiniLM-L6-v2",
  // Can use "Xenova/all-MiniLM-L6-v2" for less powerful but faster embeddings
});

const voyClient = new VoyClient();
const vectorstore = new VoyVectorStore(voyClient, embeddings);
// const chatModel = new ChatOllama({
//   baseUrl: "http://localhost:11435",
//   temperature: 0.3,
//   model: "mistral",
// });
const chatModel = new ChatWebLLM({});

const RESPONSE_SYSTEM_TEMPLATE = `You are an experienced researcher, expert at interpreting and answering questions based on provided sources. Using the provided context, answer the user's question to the best of your ability using the resources provided.
Generate a concise answer for a given question based solely on the provided search results (URL and content). You must only use information from the provided search results. Use an unbiased and journalistic tone. Combine search results together into a coherent answer. Do not repeat text.
If there is nothing in the context relevant to the question at hand, just say "Hmm, I'm not sure." Don't try to make up an answer.
Anything between the following \`context\` html blocks is retrieved from a knowledge bank, not part of the conversation with the user.
<context>
    {context}
<context/>

REMEMBER: If there is no relevant information within the context, just say "Hmm, I'm not sure." Don't try to make up an answer. Anything between the preceding 'context' html blocks is retrieved from a knowledge bank, not part of the conversation with the user.`;

const responseChainPrompt = ChatPromptTemplate.fromMessages<{
  context: string;
  chat_history: BaseMessage[];
  question: string;
}>([
  ["system", RESPONSE_SYSTEM_TEMPLATE],
  new MessagesPlaceholder("chat_history"),
  ["user", `{input}`],
]);

const embedPDF = async (pdfBlob: Blob) => {
  const pdfLoader = new WebPDFLoader(pdfBlob, { parsedItemSeparator: " " });
  const docs = await pdfLoader.load();

  const splitter = new RecursiveCharacterTextSplitter({
    chunkSize: 500,
    chunkOverlap: 50,
  });

  const splitDocs = await splitter.splitDocuments(docs);

  self.postMessage({
    type: "log",
    data: splitDocs,
  });

  await vectorstore.addDocuments(splitDocs);
};

const _formatChatHistoryAsMessages = async (
  chatHistory: ChatWindowMessage[],
) => {
  return chatHistory.map((chatMessage) => {
    if (chatMessage.role === "human") {
      return new HumanMessage(chatMessage.content);
    } else {
      return new AIMessage(chatMessage.content);
    }
  });
};

const queryVectorStore = async (
  messages: ChatWindowMessage[],
  devModeTracer?: LangChainTracer,
) => {
  const text = messages[messages.length - 1].content;
  const chatHistory = await _formatChatHistoryAsMessages(messages.slice(0, -1));

  const documentChain = await createStuffDocumentsChain({
    llm: chatModel,
    prompt: responseChainPrompt,
    documentPrompt: PromptTemplate.fromTemplate(
      `<doc>\n{page_content}\n</doc>`,
    ),
  });

  const historyAwarePrompt = ChatPromptTemplate.fromMessages([
    new MessagesPlaceholder("chat_history"),
    ["user", "{input}"],
    [
      "user",
      "Given the above conversation, generate a natural language search query to look up in order to get information relevant to the conversation. Do not respond with anything except the query.",
    ],
  ]);

  const historyAwareRetrieverChain = await createHistoryAwareRetriever({
    llm: chatModel,
    retriever: vectorstore.asRetriever(),
    rephrasePrompt: historyAwarePrompt,
  });

  const retrievalChain = await createRetrievalChain({
    combineDocsChain: documentChain,
    retriever: historyAwareRetrieverChain,
  });

  const fullChain = RunnableSequence.from([
    retrievalChain,
    new RunnablePick("answer"),
  ]);

  const stream = await fullChain.stream(
    {
      input: text,
      chat_history: chatHistory,
    },
    {
      callbacks: devModeTracer !== undefined ? [devModeTracer] : [],
    },
  );

  for await (const chunk of stream) {
    if (chunk) {
      self.postMessage({
        type: "chunk",
        data: chunk,
      });
    }
  }

  self.postMessage({
    type: "complete",
    data: "OK",
  });
};

// Listen for messages from the main thread
self.addEventListener("message", async (event: { data: any }) => {
  self.postMessage({
    type: "log",
    data: `Received data!`,
  });

  let devModeTracer;
  if (
    event.data.DEV_LANGCHAIN_TRACING !== undefined &&
    typeof event.data.DEV_LANGCHAIN_TRACING === "object"
  ) {
    devModeTracer = new LangChainTracer({
      projectName: event.data.DEV_LANGCHAIN_TRACING.LANGCHAIN_PROJECT,
      client: new Client({
        apiKey: event.data.DEV_LANGCHAIN_TRACING.LANGCHAIN_API_KEY,
      }),
    });
  }

  if (event.data.pdf) {
    try {
      await embedPDF(event.data.pdf);
    } catch (e: any) {
      self.postMessage({
        type: "error",
        error: e.message,
      });
      throw e;
    }
  } else {
    try {
      await queryVectorStore(event.data.messages, devModeTracer);
    } catch (e: any) {
      self.postMessage({
        type: "error",
        error: `${e.message}. Make sure you are running Ollama.`,
      });
      throw e;
    }
  }

  self.postMessage({
    type: "complete",
    data: "OK",
  });
});
