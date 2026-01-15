// Agentic Architecture Types

export interface Tool {
  name: string;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, {
      type: string;
      description: string;
      enum?: string[];
    }>;
    required: string[];
  };
}

export interface ToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string; // JSON string
  };
}

export interface ToolResult {
  tool_call_id: string;
  role: 'tool';
  content: string;
}

export interface AgentMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | null;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
}

export interface AgentConfig {
  name: string;
  description: string;
  systemPrompt: string;
  tools: Tool[];
  model?: string;
  temperature?: number;
  maxIterations?: number;
}

export interface AgentContext {
  accessToken?: string;
  userEmail?: string;
  startDate?: Date;
  endDate?: Date;
  meetings?: unknown[];
  analysisResults?: Map<string, unknown>;
  [key: string]: unknown;
}

export interface AgentResponse {
  success: boolean;
  message: string;
  data?: unknown;
  error?: string;
}

// Event types for agent progress
export type AgentEventType =
  | 'thinking'
  | 'tool_call'
  | 'tool_result'
  | 'response'
  | 'error'
  | 'complete';

export interface AgentEvent {
  type: AgentEventType;
  agent: string;
  message: string;
  data?: unknown;
  timestamp: Date;
}

export type AgentEventHandler = (event: AgentEvent) => void;
