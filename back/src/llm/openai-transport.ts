import OpenAI from "openai";
import type { ChatTransport } from "./client.js";

// Transport réel : timeout 60 s et 2 nouveaux essais avec backoff exponentiel (429, 5xx, erreurs réseau),
// gérés par le SDK OpenAI.
export function createOpenAiTransport(apiKey: string): ChatTransport {
  const openai = new OpenAI({ apiKey, timeout: 60_000, maxRetries: 2 });

  return async (params) => {
    const completion = await openai.chat.completions.create(params);
    const message = completion.choices[0]?.message;
    return {
      content: message?.content ?? null,
      refusal: message?.refusal ?? null,
      model: completion.model,
      input_tokens: completion.usage?.prompt_tokens ?? 0,
      output_tokens: completion.usage?.completion_tokens ?? 0,
    };
  };
}
