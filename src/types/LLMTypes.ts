// OpenAI-compatible API types

export interface LLMConfig {
  baseUrl: string; // e.g., "https://api.openai.com/v1" or "http://localhost:11434/v1"
  apiKey: string;
  model: string; // e.g., "gpt-4", "gpt-3.5-turbo", "llama2"
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ChatCompletionRequest {
  model: string;
  messages: ChatMessage[];
  temperature?: number;
  max_tokens?: number;
}

export interface ChatCompletionResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: {
    index: number;
    message: ChatMessage;
    finish_reason: string;
  }[];
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

// Meeting analysis types
export type MeetingCategory =
  | 'internal-team'
  | 'external-client'
  | 'one-on-one'
  | 'all-hands'
  | 'interview'
  | 'training'
  | 'review'
  | 'planning'
  | 'social'
  | 'other';

export interface MeetingAnalysis {
  summary: string;
  category: MeetingCategory;
  actionItems: string[];
  keyTopics: string[];
}
