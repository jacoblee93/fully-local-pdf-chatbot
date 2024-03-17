import {
  SimpleChatModel,
  type BaseChatModelParams,
} from "@langchain/core/language_models/chat_models";
import type { BaseLanguageModelCallOptions } from "@langchain/core/language_models/base";
import { CallbackManagerForLLMRun } from "@langchain/core/callbacks/manager";
import { BaseMessage, AIMessageChunk } from "@langchain/core/messages";
import { ChatGenerationChunk } from "@langchain/core/outputs";
import { ChatModule, ChatCompletionMessageParam } from "@mlc-ai/web-llm";

/**
 * Note that the modelPath is the only required parameter. For testing you
 * can set this in the environment variable `LLAMA_PATH`.
 */
export interface WebLLMInputs extends BaseChatModelParams {}

export interface WebLLMCallOptions extends BaseLanguageModelCallOptions {}

/**
 *  To use this model you need to have the `@mlc-ai/web-llm` module installed.
 *  This can be installed using `npm install -S @mlc-ai/web-llm`
 * @example
 * ```typescript
 * // Initialize the ChatWebLLM model with the path to the model binary file.
 * const model = new ChatWebLLM({
 *   modelPath: "/Replace/with/path/to/your/model/gguf-llama2-q4_0.bin",
 *   temperature: 0.5,
 * });
 *
 * // Call the model with a message and await the response.
 * const response = await model.call([
 *   new HumanMessage({ content: "My name is John." }),
 * ]);
 *
 * // Log the response to the console.
 * console.log({ response });
 *
 * ```
 */
export class ChatWebLLM extends SimpleChatModel<WebLLMCallOptions> {
  static inputs: WebLLMInputs;

  _chatModule: ChatModule;

  static lc_name() {
    return "ChatWebLLM";
  }

  constructor(inputs: WebLLMInputs) {
    super(inputs);
    this._chatModule = new ChatModule();
  }

  _llmType() {
    return "web-llm";
  }

  async *_streamResponseChunks(
    messages: BaseMessage[],
    _options: this["ParsedCallOptions"],
    runManager?: CallbackManagerForLLMRun | undefined,
  ): AsyncGenerator<ChatGenerationChunk> {
    // Config copied from:
    // https://github.com/mlc-ai/web-llm/blob/eaaff6a7730b6403810bb4fd2bbc4af113c36050/examples/simple-chat/src/gh-config.js
    await this._chatModule.reload("gemma-2b-it-q4f16_1", undefined, {
      model_list: [
        {
          model_url:
            "https://huggingface.co/mlc-ai/gemma-2b-it-q4f16_1-MLC/resolve/main/",
          local_id: "gemma-2b-it-q4f16_1",
          model_lib_url:
            "https://raw.githubusercontent.com/mlc-ai/binary-mlc-llm-libs/main/gemma-2b-it/gemma-2b-it-q4f16_1-ctx4k_cs1k-webgpu.wasm",
          vram_required_MB: 1476.52,
          low_resource_required: false,
          buffer_size_required_bytes: 262144000,
          required_features: ["shader-f16"],
        },
      ],
    });

    const messagesInput: ChatCompletionMessageParam[] = messages.map(
      (message) => {
        if (typeof message.content !== "string") {
          throw new Error(
            "ChatWebLLM does not support non-string message content in sessions.",
          );
        }
        const langChainType = message._getType();
        let role;
        if (langChainType === "ai") {
          role = "assistant" as const;
        } else if (langChainType === "human") {
          role = "user" as const;
        } else if (langChainType === "system") {
          role = "system" as const;
        } else {
          throw new Error(
            "Function, tool, and generic messages are not supported.",
          );
        }
        return {
          role,
          content: message.content,
        };
      },
    );
    const stream = this._chatModule.chatCompletionAsyncChunkGenerator(
      {
        stream: true,
        messages: messagesInput,
      },
      {},
    );
    for await (const chunk of stream) {
      const text = chunk.choices[0].delta.content ?? "";
      yield new ChatGenerationChunk({
        text,
        message: new AIMessageChunk({
          content: text,
          additional_kwargs: {
            logprobs: chunk.choices[0].logprobs,
          },
        }),
      });
      await runManager?.handleLLMNewToken(text ?? "");
    }
  }

  async _call(
    messages: BaseMessage[],
    options: this["ParsedCallOptions"],
    runManager?: CallbackManagerForLLMRun,
  ): Promise<string> {
    const chunks = [];
    for await (const chunk of this._streamResponseChunks(
      messages,
      options,
      runManager,
    )) {
      chunks.push(chunk.text);
    }
    return chunks.join("");
  }
}
