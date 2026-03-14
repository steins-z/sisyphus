import OpenAI from 'openai';
import type { SisyphusConfig } from '../shared/config.js';
import type { ChatMessage } from './session.js';
import { recordUsage } from '../shared/usage.js';

interface StreamContext {
  sessionId?: string;
  taskId?: string;
}

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
  context?: StreamContext,
): AsyncIterable<string> {
  const client = createClient(config);
  const stream = await client.chat.completions.create({
    model: config.llm.model,
    messages: toOpenAIMessages(messages),
    stream: true,
    stream_options: { include_usage: true },
  });

  let usageData: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number } | undefined;

  for await (const chunk of stream) {
    const content = chunk.choices[0]?.delta?.content;
    if (content) {
      yield content;
    }
    if (chunk.usage) {
      usageData = chunk.usage;
    }
  }

  if (usageData) {
    recordUsage({
      timestamp: new Date().toISOString(),
      sessionId: context?.sessionId,
      taskId: context?.taskId,
      model: config.llm.model,
      promptTokens: usageData.prompt_tokens ?? 0,
      completionTokens: usageData.completion_tokens ?? 0,
      totalTokens: usageData.total_tokens ?? 0,
    });
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
