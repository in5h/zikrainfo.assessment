import { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { AIMessage, type BaseMessage } from "@langchain/core/messages";
import type { ChatResult } from "@langchain/core/outputs";

/** Deterministic chat model that replays a fixed script — for offline harness tests. */
export class ScriptedChatModel extends BaseChatModel {
  i = 0;
  seen: BaseMessage[][] = [];
  constructor(private script: AIMessage[]) {
    super({});
  }
  _llmType() {
    return "scripted";
  }
  bindTools() {
    return this as never;
  }
  async _generate(messages: BaseMessage[]): Promise<ChatResult> {
    this.seen.push(messages);
    const msg = this.script[Math.min(this.i++, this.script.length - 1)];
    return { generations: [{ message: msg, text: typeof msg.content === "string" ? msg.content : "" }] };
  }
}
