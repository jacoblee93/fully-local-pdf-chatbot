"use client";

import { Id, ToastContainer, toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';

import { useRef, useState, useEffect } from "react";
import type { FormEvent } from "react";
import { useSearchParams } from "next/navigation";

import { ChatMessageBubble } from '@/components/ChatMessageBubble';
import { ChatWindowMessage } from '@/schema/ChatWindowMessage';

type ModelProvider = "ollama" | "webllm" | "chrome_ai";

const titleTexts: Record<ModelProvider, string> = {
  ollama: "Fully Local Chat Over Documents",
  webllm: "Fully In-Browser Chat Over Documents",
  chrome_ai: "Chrome-Native Chat Over Documents",
};

const modelListItems: Record<ModelProvider, React.JSX.Element> = {
  ollama: (
    <li>
      ⚙️
      <span className="ml-2">
        The default LLM is <code>Mistral-7B</code> run locally by Ollama. You&apos;ll need to install <a target="_blank" href="https://ollama.ai">the Ollama desktop app</a> and run the following commands to give this site access to the locally running model:
        <br/>
        <pre className="inline-flex px-2 py-1 my-2 rounded">$ OLLAMA_ORIGINS=https://webml-demo.vercel.app OLLAMA_HOST=127.0.0.1:11435 ollama serve
        </pre>
        <br/>
        Then, in another window:
        <br/>
        <pre className="inline-flex px-2 py-1 my-2 rounded">$ OLLAMA_HOST=127.0.0.1:11435 ollama pull mistral</pre>
      </span>
    </li>
  ),
  webllm: (
    <>
      <li>
        ⚙️
        <span className="ml-2">
          The default LLM is <code>Phi-3</code> run using <a href="https://webllm.mlc.ai/">WebLLM</a>.
          The first time you start a chat, the app will automatically download the weights and cache them in your browser.
        </span>
      </li>
      <li>
        🏋️
        <span className="ml-2">
          These weights are several GB in size, so it may take some time. Make sure you have a good internet connection!
        </span>
      </li>
    </>
  ),
  chrome_ai: (
    <>
      <li>
        ♊
        <span className="ml-2">
          It uses the experimental preview of <code>Chrome's built-in Gemini Nano</code> model. You'll need access to the program to use this mode.
        </span>
      </li>
      <li>
        🚧
        <span className="ml-2">
          Note that the built-in Gemini Nano model is quite small and is not tuned for chat, so do not expect good results, especially with multi-turn interactions (yet!).
        </span>
      </li>
    </>
  ),
};

const emojis: Record<ModelProvider, React.JSX.Element> = {
  ollama: <span>🦙</span>,
  webllm: <span>🏠</span>,
  chrome_ai: <span>♊</span>
}

export function ChatWindow(props: {
  placeholder?: string;
}) {
  const searchParams = useSearchParams()
  const presetProvider = searchParams.get("provider");
  const validModelProviders: ModelProvider[] = ["ollama", "webllm", "chrome_ai"];
  const initialModelProvider: ModelProvider = validModelProviders.includes(presetProvider as ModelProvider)
    ? (presetProvider as ModelProvider)
    : "ollama";

  const { placeholder } = props;
  const [messages, setMessages] = useState<ChatWindowMessage[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [selectedPDF, setSelectedPDF] = useState<File | null>(null);
  const [readyToChat, setReadyToChat] = useState(false);
  const [modelProvider, setModelProvider] = useState<ModelProvider>(initialModelProvider);
  const initProgressToastId = useRef<Id | null>(null);
  const titleText = titleTexts[modelProvider];
  const emoji = emojis[modelProvider];

  const worker = useRef<Worker | null>(null);

  async function queryStore(messages: ChatWindowMessage[]) {
    if (!worker.current) {
      throw new Error("Worker is not ready.");
    }
    return new ReadableStream({
      start(controller) {
        if (!worker.current) {
          controller.close();
          return;
        }
        const modelConfigs: Record<ModelProvider, Record<string, any>> = {
          ollama: {
            baseUrl: "http://localhost:11435",
            temperature: 0.3,
            model: "mistral",
          },
          webllm: {
            // See https://github.com/mlc-ai/web-llm/blob/main/src/config.ts for a list of available models
            model: "Phi-3-mini-4k-instruct-q4f16_1-MLC",
            chatOptions: {
              temperature: 0.1,
            },
          },
          chrome_ai: {},
        };
        const payload: Record<string, any> = {
          messages,
          modelProvider,
          modelConfig: modelConfigs[modelProvider],
        };
        if (
          process.env.NEXT_PUBLIC_LANGCHAIN_TRACING_V2 === "true" &&
          process.env.NEXT_PUBLIC_LANGCHAIN_API_KEY !== undefined
        ) {
          console.warn(
            "[WARNING]: You have set your LangChain API key publicly. This should only be done in local devlopment - remember to remove it before deploying!"
          );
          payload.DEV_LANGCHAIN_TRACING = {
            LANGCHAIN_TRACING_V2: "true",
            LANGCHAIN_API_KEY: process.env.NEXT_PUBLIC_LANGCHAIN_API_KEY,
            LANGCHAIN_PROJECT: process.env.NEXT_PUBLIC_LANGCHAIN_PROJECT,
          };
        }
        worker.current?.postMessage(payload);
        const onMessageReceived = async (e: any) => {
          switch (e.data.type) {
            case "log":
              console.log(e.data);
              break;
            case "init_progress":
              if (initProgressToastId.current === null) {
                initProgressToastId.current = toast(
                  "Loading model weights... This may take a while",
                  {
                    progress: e.data.data.progress || 0.01,
                    theme: "dark"
                  }
                );
              } else {
                if (e.data.data.progress === 1) {
                  await new Promise((resolve) => setTimeout(resolve, 2000));
                }
                toast.update(initProgressToastId.current, { progress: e.data.data.progress || 0.01 });
              }
              break
            case "chunk":
              controller.enqueue(e.data.data);
              break;
            case "error":
              worker.current?.removeEventListener("message", onMessageReceived);
              console.log(e.data.error);
              const error = new Error(e.data.error);
              controller.error(error);
              break;
            case "complete":
              worker.current?.removeEventListener("message", onMessageReceived);
              controller.close();
              break;
          }
        };
        worker.current?.addEventListener("message", onMessageReceived);
      },
    });

  }

  async function sendMessage(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();

    if (isLoading || !input) {
      return;
    }

    const initialInput = input;
    const initialMessages = [...messages];
    const newMessages = [...initialMessages, { role: "human" as const, content: input }];

    setMessages(newMessages)
    setIsLoading(true);
    setInput("");

    try {
      const stream = await queryStore(newMessages);
      const reader = stream.getReader();

      let chunk = await reader.read();

      const aiResponseMessage: ChatWindowMessage = {
        content: "",
        role: "ai" as const,
      };

      setMessages([...newMessages, aiResponseMessage]);

      while (!chunk.done) {
        aiResponseMessage.content = aiResponseMessage.content + chunk.value;
        setMessages([...newMessages, aiResponseMessage]);
        chunk = await reader.read();
      }

      setIsLoading(false);
    } catch (e: any) {
      setMessages(initialMessages);
      setIsLoading(false);
      setInput(initialInput);
      toast(`There was an issue with querying your PDF: ${e.message}`, {
        theme: "dark",
      });
    }
  }

  // We use the `useEffect` hook to set up the worker as soon as the `App` component is mounted.
  useEffect(() => {
    if (!worker.current) {
      // Create the worker if it does not yet exist.
      worker.current = new Worker(new URL('../app/worker.ts', import.meta.url), {
        type: 'module',
      });
      setIsLoading(false);
    }
  }, []);

  async function embedPDF (e: FormEvent<HTMLFormElement>) {
    console.log(e);
    console.log(selectedPDF);
    e.preventDefault();
    // const reader = new FileReader();
    if (selectedPDF === null) {
      toast(`You must select a file to embed.`, {
        theme: "dark",
      });
      return;
    }
    setIsLoading(true);
    worker.current?.postMessage({ pdf: selectedPDF });
    const onMessageReceived = (e: any) => {
      switch (e.data.type) {
        case "log":
          console.log(e.data);
          break;
        case "error":
          worker.current?.removeEventListener("message", onMessageReceived);
          setIsLoading(false);
          console.log(e.data.error);
          toast(`There was an issue embedding your PDF: ${e.data.error}`, {
            theme: "dark",
          });
          break;
        case "complete":
          worker.current?.removeEventListener("message", onMessageReceived);
          setIsLoading(false);
          setReadyToChat(true);
          toast(`Embedding successful! Now try asking a question about your PDF.`, {
            theme: "dark",
          });
          break;
      }
    };
    worker.current?.addEventListener("message", onMessageReceived);
  }

  const choosePDFComponent = (
    <>
      <div className="p-4 md:p-8 rounded bg-[#25252d] w-full max-h-[85%] overflow-hidden flex flex-col">
        <h1 className="text-3xl md:text-4xl mb-2 ml-auto mr-auto flex justify-center max-h-[36px]">
          {emoji}<span className="mx-2">{titleTexts[modelProvider]}</span>{emoji}
        </h1>
        <div className="p-2 my-4 flex items-center justify-center">
          <div className="inline-flex overflow-hidden border border-gray-200 rounded-lg">
            <label htmlFor="ollama" className="cursor-pointer">
              <input type="radio"
                name="model_provider"
                id="ollama"
                className="sr-only peer"
                checked={modelProvider === "ollama"}
                onChange={() => {
                  const params = new URLSearchParams(window.location.search);
                  params.set("provider", "ollama");
                  window.location.search = params.toString();
                  setModelProvider("ollama");
                }} />
              <span className="relative inline-flex items-center h-full py-2 pr-2 space-x-2 text-sm pl-2 peer-checked:text-black peer-checked:bg-blue-200">
                <span>{emojis["ollama"]} Ollama (Mistral)</span>
              </span>
            </label>
            <label htmlFor="webllm" className="cursor-pointer">
              <input type="radio"
                name="model_provider"
                id="webllm"
                className="sr-only peer"
                checked={modelProvider === "webllm"}
                onChange={() => {
                  const params = new URLSearchParams(window.location.search);
                  params.set("provider", "webllm");
                  window.location.search = params.toString();
                  setModelProvider("webllm");
                }} />
              <span className="relative inline-flex items-center h-full py-2 pr-2 space-x-2 text-sm pl-2 peer-checked:text-black peer-checked:bg-green-200">
                <span>{emojis["webllm"]} WebLLM (Phi-3)</span>
              </span>
            </label>
            <label htmlFor="chrome_ai" className="cursor-pointer">
              <input type="radio"
                name="model_provider"
                id="chrome_ai"
                className="sr-only peer"
                checked={modelProvider === "chrome_ai"}
                onChange={() => {
                  const params = new URLSearchParams(window.location.search);
                  params.set("provider", "chrome_ai");
                  window.location.search = params.toString();
                  setModelProvider("chrome_ai");
                }} />
              <span className="relative inline-flex items-center h-full py-2 pr-2 space-x-2 text-sm pl-2 peer-checked:text-black peer-checked:bg-indigo-200">
                <span>{emojis["chrome_ai"]} Chrome AI (Gemini Nano)</span>
              </span>
            </label>
          </div>
        </div>
        <ul>
          <li className="text-l">
            🏡
            <span className="ml-2">
              Yes, it&apos;s another LLM-powered chat over documents implementation... but this one is entirely {modelProvider === "ollama" ? "local" : "local in your browser"}!
            </span>
          </li>
          <li className="hidden text-l md:block">
            🌐
            <span className="ml-2">
              The vector store (<a target="_blank" href="https://github.com/tantaraio/voy">Voy</a>) and embeddings (<a target="_blank" href="https://huggingface.co/docs/transformers.js/index">Transformers.js</a>) are served via Vercel Edge function and run fully in the browser with no setup required.
            </span>
          </li>
          {modelListItems[modelProvider]}
          <li>
            🗺️
            <span className="ml-2">
              The default embeddings are <pre className="inline-flex px-2 py-1 my-2 rounded">&quot;Xenova/all-MiniLM-L6-v2&quot;</pre>. For higher-quality embeddings on machines that can handle it, switch to <pre className="inline-flex px-2 py-1 my-2 rounded">nomic-ai/nomic-embed-text-v1</pre> in <pre className="inline-flex px-2 py-1 my-2 rounded">app/worker.ts</pre>.
            </span>
          </li>
          <li className="hidden text-l md:block">
            🦜
            <span className="ml-2">
              <a target="_blank" href="https://js.langchain.com">LangChain.js</a> handles orchestration and ties everything together!
            </span>
          </li>
          <li className="text-l">
            🐙
            <span className="ml-2">
              This template is open source - you can see the source code and
              deploy your own version{" "}
              <a
                href="https://github.com/jacoblee93/fully-local-pdf-chatbot"
                target="_blank"
              >
                from the GitHub repo
              </a>
              !
            </span>
          </li>
          <li className="text-l">
            👇
            <span className="ml-2">
              Try embedding a PDF below, then asking questions! You can even turn off your WiFi{modelProvider !== "ollama" && " after the initial model download"}.
            </span>
          </li>
        </ul>
      </div>
      <form onSubmit={embedPDF} className="mt-4 flex justify-between items-center w-full">
        <input id="file_input" type="file" accept="pdf" className="text-white" onChange={(e) => e.target.files ? setSelectedPDF(e.target.files[0]) : null}></input>
        <button type="submit" className="shrink-0 px-8 py-4 bg-sky-600 rounded w-28">
          <div role="status" className={`${isLoading ? "" : "hidden"} flex justify-center`}>
            <svg aria-hidden="true" className="w-6 h-6 text-white animate-spin dark:text-white fill-sky-800" viewBox="0 0 100 101" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M100 50.5908C100 78.2051 77.6142 100.591 50 100.591C22.3858 100.591 0 78.2051 0 50.5908C0 22.9766 22.3858 0.59082 50 0.59082C77.6142 0.59082 100 22.9766 100 50.5908ZM9.08144 50.5908C9.08144 73.1895 27.4013 91.5094 50 91.5094C72.5987 91.5094 90.9186 73.1895 90.9186 50.5908C90.9186 27.9921 72.5987 9.67226 50 9.67226C27.4013 9.67226 9.08144 27.9921 9.08144 50.5908Z" fill="currentColor"/>
                <path d="M93.9676 39.0409C96.393 38.4038 97.8624 35.9116 97.0079 33.5539C95.2932 28.8227 92.871 24.3692 89.8167 20.348C85.8452 15.1192 80.8826 10.7238 75.2124 7.41289C69.5422 4.10194 63.2754 1.94025 56.7698 1.05124C51.7666 0.367541 46.6976 0.446843 41.7345 1.27873C39.2613 1.69328 37.813 4.19778 38.4501 6.62326C39.0873 9.04874 41.5694 10.4717 44.0505 10.1071C47.8511 9.54855 51.7191 9.52689 55.5402 10.0491C60.8642 10.7766 65.9928 12.5457 70.6331 15.2552C75.2735 17.9648 79.3347 21.5619 82.5849 25.841C84.9175 28.9121 86.7997 32.2913 88.1811 35.8758C89.083 38.2158 91.5421 39.6781 93.9676 39.0409Z" fill="currentFill"/>
            </svg>
            <span className="sr-only">Loading...</span>
          </div>
          <span className={isLoading ? "hidden" : ""}>Embed</span>
        </button>
      </form>
    </>
  );

  const chatInterfaceComponent = (
    <>
      <div className="flex flex-col-reverse w-full mb-4 overflow-auto grow">
        {messages.length > 0 ? (
          [...messages]
            .reverse()
            .map((m, i) => (
              <ChatMessageBubble
                key={i}
                message={m}
                aiEmoji={emoji}
                onRemovePressed={() => setMessages(
                  (previousMessages) => {
                    const displayOrderedMessages = previousMessages.reverse();
                    return [...displayOrderedMessages.slice(0, i), ...displayOrderedMessages.slice(i + 1)].reverse();
                  }
                )}
              ></ChatMessageBubble>
            ))
        ) : (
          ""
        )}
      </div>
      <button onClick={() => setMessages([])} className={(messages.length === 0 ? "hidden " : "") + "shrink-0 rounded mr-auto text-gray-400 border py-1 px-2"}>
        <span>Clear all messages</span>
      </button>
      <form onSubmit={sendMessage} className="flex w-full flex-col">
        <div className="flex w-full mt-4">
          <input
            className="grow mr-8 p-4 rounded"
            value={input}
            placeholder={placeholder ?? "What's it like to be a pirate?"}
            onChange={(e) => setInput(e.target.value)}
          />
          <button type="submit" className="shrink-0 px-8 py-4 bg-sky-600 rounded w-28">
            <div role="status" className={`${isLoading ? "" : "hidden"} flex justify-center`}>
              <svg aria-hidden="true" className="w-6 h-6 text-white animate-spin dark:text-white fill-sky-800" viewBox="0 0 100 101" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M100 50.5908C100 78.2051 77.6142 100.591 50 100.591C22.3858 100.591 0 78.2051 0 50.5908C0 22.9766 22.3858 0.59082 50 0.59082C77.6142 0.59082 100 22.9766 100 50.5908ZM9.08144 50.5908C9.08144 73.1895 27.4013 91.5094 50 91.5094C72.5987 91.5094 90.9186 73.1895 90.9186 50.5908C90.9186 27.9921 72.5987 9.67226 50 9.67226C27.4013 9.67226 9.08144 27.9921 9.08144 50.5908Z" fill="currentColor"/>
                  <path d="M93.9676 39.0409C96.393 38.4038 97.8624 35.9116 97.0079 33.5539C95.2932 28.8227 92.871 24.3692 89.8167 20.348C85.8452 15.1192 80.8826 10.7238 75.2124 7.41289C69.5422 4.10194 63.2754 1.94025 56.7698 1.05124C51.7666 0.367541 46.6976 0.446843 41.7345 1.27873C39.2613 1.69328 37.813 4.19778 38.4501 6.62326C39.0873 9.04874 41.5694 10.4717 44.0505 10.1071C47.8511 9.54855 51.7191 9.52689 55.5402 10.0491C60.8642 10.7766 65.9928 12.5457 70.6331 15.2552C75.2735 17.9648 79.3347 21.5619 82.5849 25.841C84.9175 28.9121 86.7997 32.2913 88.1811 35.8758C89.083 38.2158 91.5421 39.6781 93.9676 39.0409Z" fill="currentFill"/>
              </svg>
              <span className="sr-only">Loading...</span>
            </div>
            <span className={isLoading ? "hidden" : ""}>Send</span>
          </button>
        </div>
      </form>
    </>
  );

  return (
    <div className={`flex flex-col items-center p-4 md:p-8 rounded grow overflow-hidden ${(readyToChat ? "border" : "")}`}>
      <h2 className={`${readyToChat ? "" : "hidden"} text-2xl`}>{emoji} {titleText}</h2>
      {readyToChat
        ? chatInterfaceComponent
        : choosePDFComponent}
      <ToastContainer/>
    </div>
  );
}