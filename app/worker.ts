import { ChatWindowMessage } from "@/schema/ChatWindowMessage";

import { Voy as VoyClient } from "voy-search";

import { createRetrievalChain } from "langchain/chains/retrieval";
import { createStuffDocumentsChain } from "langchain/chains/combine_documents";
import { createHistoryAwareRetriever } from "langchain/chains/history_aware_retriever";

import { WebPDFLoader } from "@langchain/community/document_loaders/web/pdf";

import { HuggingFaceTransformersEmbeddings } from "@langchain/community/embeddings/hf_transformers";
import { VoyVectorStore } from "@langchain/community/vectorstores/voy";
import { ChatPromptTemplate, PromptTemplate } from "@langchain/core/prompts";
import {
  AIMessage,
  type BaseMessage,
  HumanMessage,
} from "@langchain/core/messages";
import { RecursiveCharacterTextSplitter } from "langchain/text_splitter";
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import type { LanguageModelLike } from "@langchain/core/language_models/base";

import { LangChainTracer } from "@langchain/core/tracers/tracer_langchain";
import { Client } from "langsmith";

import { ChatOllama } from "@langchain/ollama";
import { ChatWebLLM } from "@langchain/community/chat_models/webllm";
import { ChromeAI } from "@langchain/community/experimental/llms/chrome_ai";

const embeddings = new HuggingFaceTransformersEmbeddings({
  modelName: "Xenova/all-MiniLM-L6-v2",
  // Can use "nomic-ai/nomic-embed-text-v1" for more powerful but slower embeddings
  // modelName: "nomic-ai/nomic-embed-text-v1",
});

const voyClient = new VoyClient();
const vectorstore = new VoyVectorStore(voyClient, embeddings);

const OLLAMA_RESPONSE_SYSTEM_TEMPLATE = `You are an experienced researcher, expert at interpreting and answering questions based on provided sources. Using the provided context, answer the user's question to the best of your ability using the resources provided.
Generate a concise answer for a given question based solely on the provided search results. You must only use information from the provided search results. Use an unbiased and journalistic tone. Combine search results together into a coherent answer. Do not repeat text.
If there is nothing in the context relevant to the question at hand, just say "Hmm, I'm not sure." Don't try to make up an answer.
Anything between the following \`context\` html blocks is retrieved from a knowledge bank, not part of the conversation with the user.
<context>
{context}
<context/>

REMEMBER: If there is no relevant information within the context, just say "Hmm, I'm not sure." Don't try to make up an answer. Anything between the preceding 'context' html blocks is retrieved from a knowledge bank, not part of the conversation with the user.`;

const WEBLLM_RESPONSE_SYSTEM_TEMPLATE = `You are an experienced researcher, expert at interpreting and answering questions based on provided sources. Using the provided context, answer the user's question to the best of your ability using the resources provided.
Generate a concise answer for a given question based solely on the provided search results. You must only use information from the provided search results. Use an unbiased and journalistic tone. Combine search results together into a coherent answer. Do not repeat text, stay focused, and stop generating when you have answered the question.
If there is nothing in the context relevant to the question at hand, just say "Hmm, I'm not sure." Don't try to make up an answer.`;

const CHROME_AI_SYSTEM_TEMPLATE = `You are an AI assistant acting as an experienced researcher, expert at interpreting and answering questions based on provided sources. Using the provided context, answer the user's question to the best of your ability using the resources provided.
Generate a concise answer for a given question based solely on the provided search results. You must only use information from the provided search results. Use an unbiased and journalistic tone. Combine search results together into a coherent answer. Do not repeat text, stay focused, and don't make up answers.

When responding, use the following documents as context:\n<context>\n{context}\n</context>

You do not need to exactly cite your sources from the above documents.

{chat_history}

human: {input}
ai: `;

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

const generateRAGResponse = async (
  messages: ChatWindowMessage[],
  {
    chatModel,
    modelProvider,
    devModeTracer,
  }: {
    chatModel: LanguageModelLike;
    modelProvider: "ollama" | "webllm" | "chrome_ai";
    devModeTracer?: LangChainTracer;
  },
) => {
  const text = messages[messages.length - 1].content;
  const chatHistory = await _formatChatHistoryAsMessages(messages.slice(0, -1));

  let responseChainPrompt;
  if (modelProvider === "ollama") {
    responseChainPrompt = ChatPromptTemplate.fromMessages<{
      context: string;
      chat_history: BaseMessage[];
      question: string;
    }>([
      ["system", OLLAMA_RESPONSE_SYSTEM_TEMPLATE],
      ["placeholder", "{chat_history}"],
      ["user", `{input}`],
    ]);
  } else if (modelProvider === "webllm") {
    responseChainPrompt = ChatPromptTemplate.fromMessages<{
      context: string;
      chat_history: BaseMessage[];
      question: string;
    }>([
      ["system", WEBLLM_RESPONSE_SYSTEM_TEMPLATE],
      [
        "user",
        "When responding to me, use the following documents as context:\n<context>\n{context}\n</context>",
      ],
      [
        "ai",
        "Understood! I will use the documents between the above <context> tags as context when answering your next questions.",
      ],
      ["placeholder", "{chat_history}"],
      ["user", `{input}`],
    ]);
  } else {
    responseChainPrompt = PromptTemplate.fromTemplate(
      CHROME_AI_SYSTEM_TEMPLATE,
    );
  }

  const documentChain = await createStuffDocumentsChain({
    llm: chatModel,
    prompt: responseChainPrompt,
    documentPrompt: PromptTemplate.fromTemplate(
      `<doc>\n{page_content}\n</doc>`,
    ),
  });

  let historyAwarePrompt;
  if (modelProvider === "ollama") {
    historyAwarePrompt = ChatPromptTemplate.fromMessages([
      ["placeholder", "{chat_history}"],
      ["user", "{input}"],
      [
        "user",
        "Given the above conversation, generate a natural language search query to look up in order to get information relevant to the conversation. Do not respond with anything except the query.",
      ],
    ]);
  } else if (modelProvider === "webllm") {
    historyAwarePrompt = ChatPromptTemplate.fromMessages([
      ["placeholder", "{chat_history}"],
      [
        "user",
        "Given the above conversation, rephrase the following question into a standalone, natural language query with important keywords that a researcher could later pass into a search engine to get information relevant to the conversation. Do not respond with anything except the query.\n\n<question_to_rephrase>\n{input}\n</question_to_rephrase>",
      ],
    ]);
  } else {
    historyAwarePrompt = PromptTemplate.fromTemplate(`{chat_history}
Given the above conversation, rephrase the following question into a standalone, natural language query with important keywords that a researcher could later pass into a search engine to get information relevant to the conversation. Do not respond with anything except the query.\n\n<question_to_rephrase>\n{input}\n</question_to_rephrase>`);
  }

  const historyAwareRetrieverChain = await createHistoryAwareRetriever({
    llm: chatModel,
    retriever: vectorstore.asRetriever(),
    rephrasePrompt: historyAwarePrompt,
  });

  const retrievalChain = await createRetrievalChain({
    combineDocsChain: documentChain,
    retriever: historyAwareRetrieverChain,
  });

  // retrievalChain streams back an object with a few fields.
  // We only want to stream back the answer, so pick it out.
  const fullChain = retrievalChain.pick("answer");

  let formattedChatHistory =
    modelProvider === "chrome_ai"
      ? chatHistory
          .map((message) => {
            return `${message._getType()}: ${message.content}`;
          })
          .join("\n")
      : chatHistory;
  const stream = await fullChain.stream(
    {
      input: text,
      chat_history: formattedChatHistory,
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
    const modelProvider = event.data.modelProvider;
    const modelConfig = event.data.modelConfig;
    let chatModel: BaseChatModel | LanguageModelLike;
    if (modelProvider === "webllm") {
      const webllmModel = new ChatWebLLM(modelConfig);
      await webllmModel.initialize((event) =>
        self.postMessage({ type: "init_progress", data: event }),
      );
      // Best guess at Phi-3 tokens
      chatModel = webllmModel.bind({
        stop: ["\nInstruct:", "Instruct:", "<hr>", "\n<hr>"],
      });
    } else if (modelProvider === "chrome_ai") {
      chatModel = new ChromeAI(modelConfig);
    } else {
      chatModel = new ChatOllama(modelConfig);
    }
    try {
      await generateRAGResponse(event.data.messages, {
        devModeTracer,
        modelProvider,
        chatModel,
      });
    } catch (e: any) {
      self.postMessage({
        type: "error",
        error:
          event.data.modelProvider === "ollama"
            ? `${e.message}. Make sure you are running Ollama.`
            : `${e.message}. Make sure your browser supports WebLLM/WebGPU.`,
      });
      throw e;
    }
  }

  self.postMessage({
    type: "complete",
    data: "OK",
  });
});
