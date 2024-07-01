# 🏠 Fully Local Chat Over Documents

Yes, it's another chat over documents implementation... but this one is entirely local!

You can run it in three different ways:

- 🦙 Exposing a port to a local LLM running on your desktop via [Ollama](https://ollama.ai).
- 🌐 Downloading weights into your browser and running via [WebLLM](https://webllm.mlc.ai/).
- ♊ Joining the early preview program for [Chrome's experimental built-in Gemini Nano model](https://developer.chrome.com/docs/ai/built-in) and using it directly!

![](/public/images/demo_builtin_chrome.gif)

It's a Next.js app that read the content of an uploaded PDF, chunks it, adds it to a vector store, and
performs RAG, all client side. You can even turn off your WiFi after the site loads.

You can see a live version at https://webml-demo.vercel.app.

Users can choose one of the below options to run inference:

## 🦙 Ollama

You can run more powerful, general models outside the browser using [Ollama's desktop app](https://ollama.ai). Users will need to download and set up then run the following commands to allow the site access to a locally running Mistral instance:

### Mac/Linux

```bash
$ OLLAMA_ORIGINS=https://webml-demo.vercel.app OLLAMA_HOST=127.0.0.1:11435 ollama serve
```
Then, in another terminal window:

```bash
$ OLLAMA_HOST=127.0.0.1:11435 ollama pull mistral
```

### Windows

```cmd
$ set OLLAMA_ORIGINS=https://webml-demo.vercel.app
set OLLAMA_HOST=127.0.0.1:11435
ollama serve
```
Then, in another terminal window:

```cmd
$ set OLLAMA_HOST=127.0.0.1:11435
ollama pull mistral
```

## 🌐 Fully in-browser (WebLLM)

You can run the entire stack your browser via [WebLLM](https://webllm.mlc.ai/). The model used is the small, 3.8B parameter [Phi-3](https://huggingface.co/microsoft/phi-3).

You don't have to leave the window to set this up - just upload a PDF and go!

Note that the first time you start a chat, the app will download and cache the model weights. This download is several GB in size and may take a little while, so make sure you have a good internet connection!

## ♊ Built-in Gemini Nano

You can also use the experimental preview of Chrome's built-in Gemini Nano model. You'll need to join the early preview program to use this mode. Install Chrome while following the directions given in the official guide provided, and you should be all set!

Note that the built-in Gemini Nano model is experimental and is not chat tuned, so results may vary!

## ⚡ Stack

It uses the following:

- [Voy](https://github.com/tantaraio/voy) as the vector store, fully WASM in the browser.
- [Ollama](https://ollama.ai/), [WebLLM](https://webllm.mlc.ai/), or [Chrome's built-in Gemini Nano](https://developer.chrome.com/docs/ai/built-in) to run an LLM locally and expose it to the web app.
- [LangChain.js](https://js.langchain.com) to call the models, perform retrieval, and generally orchestrate all the pieces.
- [Transformers.js](https://huggingface.co/docs/transformers.js/index) to run open source [Nomic](https://www.nomic.ai/) embeddings in the browser.
  - For higher-quality embeddings, switch to `"nomic-ai/nomic-embed-text-v1"` in `app/worker.ts`.

While the goal is to run as much of the app as possible directly in the browser, but you can swap in [Ollama embeddings](https://js.langchain.com/docs/modules/data_connection/text_embedding/integrations/ollama) in lieu of Transformers.js as well.

## 🔱 Forking

To run/deploy this yourself, simply fork this repo and install the required dependencies with `yarn`.

There are no required environment variables, but you can optionally set up [LangSmith tracing](https://smith.langchain.com/) while developing locally to help debug the prompts and the chain. Copy the `.env.example` file into a `.env.local` file:

```ini
# No environment variables required!

# LangSmith tracing from the web worker.
# WARNING: FOR DEVELOPMENT ONLY. DO NOT DEPLOY A LIVE VERSION WITH THESE
# VARIABLES SET AS YOU WILL LEAK YOUR LANGCHAIN API KEY.
NEXT_PUBLIC_LANGCHAIN_TRACING_V2="true"
NEXT_PUBLIC_LANGCHAIN_API_KEY=
NEXT_PUBLIC_LANGCHAIN_PROJECT=
```

Just make sure you don't set this in production, as your LangChain API key will be public on the frontend!

## 📖 Further reading

For a bit more on this topic, check out [my blog post on Ollama](https://ollama.ai/blog/building-llm-powered-web-apps) or [my Google Summit talk on building with LLMs in the browser](https://www.youtube.com/watch?v=-1sdWLr3TbI).

## 🙏 Thank you!

Special thanks to:

- [@dawchihliou](https://twitter.com/dawchihliou) for making Voy
- [@jmorgan](https://twitter.com/jmorgan) and [@mchiang0610](https://twitter.com/mchiang0610) for making Ollama and for your feedback
- [@charlie_ruan](https://twitter.com/charlie_ruan) for your incredible work on WebLLM
- [@xenovacom](https://twitter.com/xenovacom) for making Transformers.js
- And [@jason_mayes](https://twitter.com/jason_mayes) and [@nfcampos](https://twitter.com/nfcampos) for inspiration and some great conversations.

For more, follow me on Twitter [@Hacubu](https://x.com/hacubu)!
