import { ChatWindowMessage } from "@/schema/ChatWindowMessage";

import { Voy as VoyClient } from "voy-search";

import {
  Annotation,
  MessagesAnnotation,
  StateGraph,
} from "@langchain/langgraph/web";

import { WebPDFLoader } from "@langchain/community/document_loaders/web/pdf";

import { HuggingFaceTransformersEmbeddings } from "@langchain/community/embeddings/hf_transformers";
import { VoyVectorStore } from "@langchain/community/vectorstores/voy";
import { ChatPromptTemplate, PromptTemplate } from "@langchain/core/prompts";
import { type BaseMessage } from "@langchain/core/messages";
import { RecursiveCharacterTextSplitter } from "langchain/text_splitter";
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import type { LanguageModelLike } from "@langchain/core/language_models/base";

import { LangChainTracer } from "@langchain/core/tracers/tracer_langchain";
import { Client } from "langsmith";

import { ChatOllama } from "@langchain/ollama";
import { ChatWebLLM } from "@langchain/community/chat_models/webllm";
import { ChromeAI } from "@langchain/community/experimental/llms/chrome_ai";
import { Document } from "@langchain/core/documents";
import { RunnableConfig } from "@langchain/core/runnables";
import { BaseLLM } from "@langchain/core/language_models/llms";

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

{conversation_turns}
assistant: `;

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

const generateRAGResponse = async (
  messages: ChatWindowMessage[],
  {
    model,
    modelProvider,
    devModeTracer,
  }: {
    model: LanguageModelLike;
    modelProvider: "ollama" | "webllm" | "chrome_ai";
    devModeTracer?: LangChainTracer;
  },
) => {
  const RAGStateAnnotation = Annotation.Root({
    ...MessagesAnnotation.spec,
    rephrasedQuestion: Annotation<string>,
    sourceDocuments: Annotation<Document[]>,
  });

  const rephraseQuestion = async (
    state: typeof RAGStateAnnotation.State,
    config: RunnableConfig,
  ) => {
    const originalQuery = state.messages.at(-1)?.content as string;
    let formattedPrompt;
    if (modelProvider === "ollama") {
      const rephrasePrompt = ChatPromptTemplate.fromMessages([
        ["placeholder", "{messages}"],
        [
          "user",
          "Given the above conversation, generate a natural language search query to look up in order to get information relevant to the conversation. Do not respond with anything except the query.",
        ],
      ]);
      formattedPrompt = await rephrasePrompt.invoke(
        {
          messages: state.messages,
          input: originalQuery,
        },
        config,
      );
    } else if (modelProvider === "webllm") {
      const rephrasePrompt = ChatPromptTemplate.fromMessages([
        ["placeholder", "{messages}"],
        [
          "user",
          "Given the above conversation, rephrase the following question into a standalone, natural language query with important keywords that a researcher could later pass into a search engine to get information relevant to the conversation. Do not respond with anything except the query.\n\n<question_to_rephrase>\n{input}\n</question_to_rephrase>",
        ],
      ]);
      formattedPrompt = await rephrasePrompt.invoke(
        {
          messages: state.messages,
          input: originalQuery,
        },
        config,
      );
    } else {
      const rephrasePrompt = PromptTemplate.fromTemplate(`{conversation_turns}
Given the above conversation, rephrase the following question into a standalone, natural language query with important keywords that a researcher could later pass into a search engine to get information relevant to the conversation. Do not respond with anything except the query.\n\n<question_to_rephrase>\n{input}\n</question_to_rephrase>`);
      const conversationTurns = state.messages
        .map((message) => {
          const role = message.getType() === "ai" ? "assistant" : "user";
          return `${role}: ${message.content}`;
        })
        .join("\n");
      formattedPrompt = await rephrasePrompt.invoke(
        {
          conversation_turns: conversationTurns,
          input: originalQuery,
        },
        config,
      );
    }
    const response = await model.invoke(formattedPrompt, config);
    // ChromeAI is a text-in, text-out LLM and we therefore must wrap it in a message object
    if (typeof response === "string") {
      return { rephrasedQuestion: response };
    } else {
      return { rephrasedQuestion: response.content };
    }
  };

  const retrieveSourceDocuments = async (
    state: typeof RAGStateAnnotation.State,
    config: RunnableConfig,
  ) => {
    let retrieverQuery: string;
    if (state.rephrasedQuestion != null) {
      retrieverQuery = state.rephrasedQuestion;
    } else {
      retrieverQuery = state.messages.at(-1)?.content as string;
    }
    const retriever = vectorstore.asRetriever();
    const docs = await retriever.invoke(retrieverQuery, config);
    return {
      sourceDocuments: docs,
    };
  };

  const generateResponse = async (
    state: typeof RAGStateAnnotation.State,
    config: RunnableConfig,
  ) => {
    let responseChainPrompt;
    let formattedPrompt;
    const context = state.sourceDocuments
      .map((sourceDoc) => {
        return `<doc>\n${sourceDoc.pageContent}\n</doc>`;
      })
      .join("\n\n");
    if (modelProvider === "ollama") {
      responseChainPrompt = ChatPromptTemplate.fromMessages<{
        context: string;
        messages: BaseMessage[];
      }>([
        ["system", OLLAMA_RESPONSE_SYSTEM_TEMPLATE],
        ["placeholder", "{messages}"],
      ]);
      formattedPrompt = await responseChainPrompt.invoke(
        {
          context,
          messages: state.messages,
        },
        config,
      );
    } else if (modelProvider === "webllm") {
      responseChainPrompt = ChatPromptTemplate.fromMessages<{
        context: string;
        messages: BaseMessage[];
      }>([
        ["system", WEBLLM_RESPONSE_SYSTEM_TEMPLATE],
        [
          "user",
          "When responding to me, use the following documents as context:\n<context>\n{context}\n</context>",
        ],
        [
          "assistant",
          "Understood! I will use the documents between the above <context> tags as context when answering your next questions.",
        ],
        ["placeholder", "{messages}"],
      ]);
      formattedPrompt = await responseChainPrompt.invoke(
        {
          context,
          messages: state.messages,
        },
        config,
      );
    } else {
      // ChromeAI is a text-in, text-out LLM and we therefore format chat history as strings
      responseChainPrompt = PromptTemplate.fromTemplate(
        CHROME_AI_SYSTEM_TEMPLATE,
      );
      const conversationTurns = state.messages
        .map((message) => {
          const role = message.getType() === "ai" ? "assistant" : "user";
          return `${role}: ${message.content}`;
        })
        .join("\n");
      formattedPrompt = await responseChainPrompt.invoke(
        {
          context,
          conversation_turns: conversationTurns,
        },
        config,
      );
    }

    const response = await model
      .withConfig({ tags: ["response_generator"] })
      .invoke(formattedPrompt, config);
    // ChromeAI is a text-in, text-out LLM and we therefore must wrap it in a message-like object
    if (typeof response === "string") {
      return { messages: [{ role: "assistant", content: response }] };
    } else {
      return { messages: [response] };
    }
  };

  const graph = new StateGraph(RAGStateAnnotation)
    .addNode("rephraseQuestion", rephraseQuestion)
    .addNode("retrieveSourceDocuments", retrieveSourceDocuments)
    .addNode("generateResponse", generateResponse)
    .addConditionalEdges("__start__", async (state) => {
      if (state.messages.length > 1) {
        return "rephraseQuestion";
      }
      return "retrieveSourceDocuments";
    })
    .addEdge("rephraseQuestion", "retrieveSourceDocuments")
    .addEdge("retrieveSourceDocuments", "generateResponse")
    .compile();

  const eventStream = await graph.streamEvents(
    {
      messages,
    },
    {
      version: "v2",
      callbacks: devModeTracer !== undefined ? [devModeTracer] : [],
    },
  );

  for await (const { event, data, tags } of eventStream) {
    if (tags?.includes("response_generator")) {
      if (event === "on_chat_model_stream") {
        self.postMessage({
          type: "chunk",
          data: data.chunk.content,
        });
        // Chrome LLM is a text-in/text-out model
      } else if (event === "on_llm_stream") {
        self.postMessage({
          type: "chunk",
          data: data.chunk.text,
        });
      }
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
    let model: BaseChatModel | BaseLLM | LanguageModelLike;
    if (modelProvider === "webllm") {
      const webllmModel = new ChatWebLLM(modelConfig);
      await webllmModel.initialize((event) =>
        self.postMessage({ type: "init_progress", data: event }),
      );
      // Best guess at Phi-3.5 tokens
      model = webllmModel.bind({
        stop: ["\nInstruct:", "Instruct:", "<hr>", "\n<hr>"],
      });
    } else if (modelProvider === "chrome_ai") {
      model = new ChromeAI(modelConfig);
    } else {
      model = new ChatOllama(modelConfig);
    }
    try {
      await generateRAGResponse(event.data.messages, {
        devModeTracer,
        modelProvider,
        model,
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
