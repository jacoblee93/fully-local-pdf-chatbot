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
import { AIMaskClient, ChatCompletionMessageParam } from '@ai-mask/sdk';

/**
 * Note that the modelPath is the only required parameter. For testing you
 * can set this in the environment variable `LLAMA_PATH`.
 */
export interface WebLLMInputs
    extends BaseChatModelParams {
    modelId: string
}

export interface WebLLMCallOptions extends BaseLanguageModelCallOptions {
}

function convertMessages(messages: BaseMessage[]): ChatCompletionMessageParam[] {
    return messages.map((message) => {
        let role: ChatCompletionMessageParam['role'], content: ChatCompletionMessageParam['content'];
        if (message._getType() === "human") {
            role = "user";
        } else if (message._getType() === "ai") {
            role = "assistant";
        } else if (message._getType() === "system") {
            role = "system";
        } else {
            throw new Error(
                `Unsupported message type for Ollama: ${message._getType()}`
            );
        }
        if (typeof message.content === "string") {
            content = message.content;
        } else {
            throw new Error('unsopported content type')
        }
        return { role, content }
    })
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
export class ChatAIMask extends SimpleChatModel<WebLLMCallOptions> {
    static inputs: WebLLMInputs;

    _aiMaskClient: AIMaskClient;
    modelId: string;

    static lc_name() {
        return "ChatAIMask";
    }

    constructor(inputs: WebLLMInputs) {
        super(inputs);

        if (!AIMaskClient.isExtensionAvailable()) {
            throw new Error('AI Mask extension is not available')
        }
        this._aiMaskClient = new AIMaskClient({ name: 'fully-local-pdf-chatbot' })
        this.modelId = inputs.modelId
    }

    _llmType() {
        return "ai-mask";
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
        console.log(messages)

        const lastMessage = messages[messages.length - 1]
        if (typeof lastMessage.content !== "string") {
            throw new Error(
                "ChatAIMask does not support non-string message content in sessions."
            );
        }

        try {
            const completion = await this._aiMaskClient.chat(this.modelId, {
                messages: convertMessages(messages),
            })
            return completion;
        } catch (e) {
            throw new Error("Error getting prompt completion.");
        }
    }
}
