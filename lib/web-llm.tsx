import {
    SimpleChatModel,
    type BaseChatModelParams,
} from "@langchain/core/language_models/chat_models";
import type { BaseLanguageModelCallOptions } from "@langchain/core/language_models/base";
import { CallbackManagerForLLMRun } from "@langchain/core/callbacks/manager";
import {
    BaseMessage,
    AIMessageChunk,
    ChatMessage,
} from "@langchain/core/messages";
import { ChatGenerationChunk } from "@langchain/core/outputs";
import { ChatWorkerHandler, ChatModule } from "@mlc-ai/web-llm";

/**
 * Note that the modelPath is the only required parameter. For testing you
 * can set this in the environment variable `LLAMA_PATH`.
 */
export interface WebLLMInputs
    extends BaseChatModelParams { }

export interface WebLLMCallOptions extends BaseLanguageModelCallOptions {
}

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

    /** @ignore */
    _combineLLMOutput() {
        return {};
    }

    invocationParams() {
        return {
        };
    }

    /** @ignore */
    async _call(
        messages: BaseMessage[],
        options: this["ParsedCallOptions"]
    ): Promise<string> {
        await this._chatModule.reload("Llama-2-7b-chat-hf-q4f32_1");

        console.log(messages)

        const lastMessage = messages[messages.length - 1]
        if (typeof lastMessage.content !== "string") {
            throw new Error(
                "ChatWebLLM does not support non-string message content in sessions."
            );
        }
        const prompt: string = lastMessage.content

        try {
            const completion = await this._chatModule.generate(prompt);
            return completion;
        } catch (e) {
            throw new Error("Error getting prompt completion.");
        }
    }
}
