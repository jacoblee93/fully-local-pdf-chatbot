# 🏠 Fully Client-Side Chat Over Documents

Yes, it's another chat over documents implementation... but this one is entirely local!

![](/public/images/demo.gif)

It's a Next.js app that read the content of an uploaded PDF, chunks it, adds it to a vector store, and
performs RAG, all client side. You can even turn off your WiFi after the site loads!

You can see a live version at https://webml-demo.vercel.app.

Users will need to download and set up [Ollama](https://ollama.ai), then run the following commands to
allow the site access to a locally running Mistral instance:

```bash
$ OLLAMA_ORIGINS=https://webml-demo.vercel.app OLLAMA_HOST=127.0.0.1:11435 ollama serve
```
Then, in another terminal window:

```bash
$ OLLAMA_HOST=127.0.0.1:11435 ollama pull mistral
```

## ⚡ Stack

It uses the following:

- [Voy](https://github.com/tantaraio/voy) as the vector store, fully WASM in the browser.
- [Ollama](https://ollama.ai/) to run an LLM locally and expose it to the web app.
- [LangChain.js](https://js.langchain.com) to call the models, perform retrieval, and generally orchestrate all the pieces.
- [Transformers.js](https://huggingface.co/docs/transformers.js/index) to run embeddings in the browser.

I wanted to run as much of the app as possible directly in the browser, but you can swap in [Ollama embeddings](https://js.langchain.com/docs/modules/data_connection/text_embedding/integrations/ollama) as well.

## 🔱 Forking

To run/deploy this yourself, simply fork this repo and install the required dependencies with `yarn`.

There are no required environment variables!

## 📖 Further reading

For a bit more on this topic, check out [my blog post on Ollama](https://ollama.ai/blog/building-llm-powered-web-apps) or the [my Google Summit talk on building with LLMs in the browser](https://www.youtube.com/watch?v=-1sdWLr3TbI).

## 🙏 Thank you!

Special thanks to [@dawchihliou](https://twitter.com/dawchihliou) for making Voy, [@jmorgan](https://twitter.com/jmorgan) and [@mchiang0610](https://twitter.com/mchiang0610) for making Ollama and for your feedback, and [@xenovacom](https://twitter.com/xenovacom) for making Transformers.js.

For more, follow me on Twitter [@Hacubu](https://x.com/hacubu)!
