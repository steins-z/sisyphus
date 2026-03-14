import OpenAI from 'openai';
import type { SisyphusConfig } from '../shared/config.js';
import type { ChatMessage } from './session.js';

function createClient(config: SisyphusConfig): OpenAI {
  return new OpenAI({
    apiKey: config.llm.apiKey || 'not-needed',
    ...(config.llm.baseUrl ? { baseURL: config.llm.baseUrl } : {}),
  });
}

function toOpenAIMessages(messages: ChatMessage[]): OpenAI.ChatCompletionMessageParam[] {
  return messages.map(m => ({
    role: m.role,
    content: m.content,
  }));
}

export async function* streamChat(
  messages: ChatMessage[],
  config: SisyphusConfig,
): AsyncIterable<string> {
  const client = createClient(config);
  const stream = await client.chat.completions.create({
    model: config.llm.model,
    messages: toOpenAIMessages(messages),
    stream: true,
  });

  for await (const chunk of stream) {
    const content = chunk.choices[0]?.delta?.content;
    if (content) {
      yield content;
    }
  }
}

export async function chat(
  messages: ChatMessage[],
  config: SisyphusConfig,
): Promise<string> {
  const parts: string[] = [];
  for await (const chunk of streamChat(messages, config)) {
    parts.push(chunk);
  }
  return parts.join('');
}
