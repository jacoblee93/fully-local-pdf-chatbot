import {
  SimpleChatModel,
  type BaseChatModelParams,
} from "@langchain/core/language_models/chat_models";
import type { BaseLanguageModelCallOptions } from "@langchain/core/language_models/base";
import { BaseMessage, AIMessageChunk } from "@langchain/core/messages";
import { AIMaskClient, ChatCompletionMessageParam } from "@ai-mask/sdk";
import { ChatGenerationChunk } from "@langchain/core/outputs";

export interface AIMaskInputs extends BaseChatModelParams {
  modelId: string;
  temperature?: number;
  aiMaskClient?: AIMaskClient;
  appName?: string;
}

export interface AIMaskCallOptions extends BaseLanguageModelCallOptions {}

function convertMessages(
  messages: BaseMessage[],
): ChatCompletionMessageParam[] {
  return messages.map((message) => {
    let role: ChatCompletionMessageParam["role"],
      content: ChatCompletionMessageParam["content"];
    if (message._getType() === "human") {
      role = "user";
    } else if (message._getType() === "ai") {
      role = "assistant";
    } else if (message._getType() === "system") {
      role = "system";
    } else {
      throw new Error(
        `Unsupported message type for AIMask: ${message._getType()}`,
      );
    }
    if (typeof message.content === "string") {
      content = message.content;
    } else {
      throw new Error("unsupported content type");
    }
    return { role, content };
  });
}

/**
 * @example
 * ```typescript
 * // Initialize the ChatAIMask model with the path to the model binary file.
 * const model = new ChatAIMask({
 *   modelId: "Mistral-7B-Instruct-v0.2-q4f16_1",
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
export class ChatAIMask extends SimpleChatModel<AIMaskCallOptions> {
  static inputs: AIMaskInputs;

  protected _aiMaskClient: AIMaskClient;

  modelId: string;
  temperature?: number;

  static lc_name() {
    return "ChatAIMask";
  }

  constructor(inputs: AIMaskInputs) {
    super(inputs);

    this._aiMaskClient =
      inputs?.aiMaskClient ?? new AIMaskClient({ name: inputs?.appName });

    this.modelId = inputs.modelId;
    this.temperature = inputs.temperature;
  }

  _llmType() {
    return "ai-mask";
  }

  async *_streamResponseChunks(
    messages: BaseMessage[],
  ): AsyncGenerator<ChatGenerationChunk> {
    const stream = await this._aiMaskClient.chat(
      {
        messages: convertMessages(messages),
        temperature: this.temperature,
      },
      {
        modelId: this.modelId,
        stream: true,
      },
    );

    for await (const chunk of stream) {
      const text = chunk;
      yield new ChatGenerationChunk({
        text,
        message: new AIMessageChunk({
          content: text,
        }),
      });
    }
    return stream;
  }

  async _call(messages: BaseMessage[]): Promise<string> {
    try {
      const completion = await this._aiMaskClient.chat(
        {
          messages: convertMessages(messages),
          temperature: this.temperature,
        },
        {
          modelId: this.modelId,
        },
      );
      return completion;
    } catch (e) {
      throw new Error("Error getting prompt completion.");
    }
  }
}
