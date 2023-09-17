import { Voy as VoyClient } from "voy-search";

import { HuggingFaceTransformersEmbeddings } from "langchain/embeddings/hf_transformers";
import { VoyVectorStore } from "langchain/vectorstores/voy";
import { ChatOllama } from "langchain/chat_models/ollama";
import { Document } from "langchain/document";

const embeddings = new HuggingFaceTransformersEmbeddings({
  modelName: "Xenova/all-MiniLM-L6-v2",
});

const voyClient = new VoyClient();
const vectorstore = new VoyVectorStore(voyClient, embeddings);
const ollama = new ChatOllama({});

// Listen for messages from the main thread
self.addEventListener('message', async (event: any) => {
  console.log(event);
  self.postMessage({
    status: "ready"
  });

  await vectorstore.addDocuments([
    new Document({
      pageContent: "Mitochondria is the powerhouse of the cell",
      metadata: {
        foo: "Mike",
      },
    }),
    new Document({
      pageContent: "Buildings are made out of brick",
      metadata: {
        foo: "Testing",
      },
    }),
  ]);

  // Perform a similarity search.
  const results = await vectorstore.similaritySearch(event.data.text, 1);

  self.postMessage({
    status: "progress",
    output: JSON.stringify(results),
  });

  const reply0 = await ollama.invoke(`Is the following a true statement:\n${results.map((doc) => doc.pageContent)}`)

  // Print the results.
  console.log(JSON.stringify(reply0, null, 2));

  self.postMessage({
    status: 'complete',
    output: reply0,
  });
});