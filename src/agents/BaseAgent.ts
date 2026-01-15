import type {
  AgentConfig,
  AgentContext,
  AgentMessage,
  AgentResponse,
  AgentEvent,
  AgentEventHandler,
  Tool,
  ToolCall,
} from '../types/AgentTypes';
import { getLLMConfig } from '../services/llmService';

/**
 * Base Agent class that all specialized agents extend
 * Implements the core agentic loop with tool calling
 */
export abstract class BaseAgent {
  protected config: AgentConfig;
  protected context: AgentContext;
  protected conversationHistory: AgentMessage[];
  protected eventHandlers: AgentEventHandler[];
  protected toolHandlers: Map<string, (args: Record<string, unknown>) => Promise<unknown>>;

  constructor(config: AgentConfig) {
    this.config = config;
    this.context = {};
    this.conversationHistory = [];
    this.eventHandlers = [];
    this.toolHandlers = new Map();

    // Initialize with system prompt
    this.conversationHistory.push({
      role: 'system',
      content: config.systemPrompt,
    });
  }

  /**
   * Register a tool handler function
   */
  protected registerTool(
    name: string,
    handler: (args: Record<string, unknown>) => Promise<unknown>
  ): void {
    this.toolHandlers.set(name, handler);
  }

  /**
   * Subscribe to agent events
   */
  onEvent(handler: AgentEventHandler): () => void {
    this.eventHandlers.push(handler);
    return () => {
      const index = this.eventHandlers.indexOf(handler);
      if (index > -1) this.eventHandlers.splice(index, 1);
    };
  }

  /**
   * Emit an event to all handlers
   */
  protected emit(type: AgentEvent['type'], message: string, data?: unknown): void {
    const event: AgentEvent = {
      type,
      agent: this.config.name,
      message,
      data,
      timestamp: new Date(),
    };
    this.eventHandlers.forEach((handler) => handler(event));
  }

  /**
   * Set the agent context (shared state)
   */
  setContext(context: Partial<AgentContext>): void {
    this.context = { ...this.context, ...context };
  }

  /**
   * Get available tools in OpenAI function calling format
   */
  protected getToolsForAPI(): { type: 'function'; function: Tool }[] {
    return this.config.tools.map((tool) => ({
      type: 'function' as const,
      function: tool,
    }));
  }

  /**
   * Execute a tool by name with arguments
   */
  protected async executeTool(name: string, args: Record<string, unknown>): Promise<unknown> {
    const handler = this.toolHandlers.get(name);
    if (!handler) {
      throw new Error(`Unknown tool: ${name}`);
    }
    return handler(args);
  }

  /**
   * Make LLM API call with tool support
   */
  protected async callLLM(): Promise<AgentMessage> {
    const llmConfig = getLLMConfig();

    const requestBody: Record<string, unknown> = {
      model: this.config.model || llmConfig.model,
      messages: this.conversationHistory,
      temperature: this.config.temperature ?? 0.3,
    };

    // Add tools if available
    if (this.config.tools.length > 0) {
      requestBody.tools = this.getToolsForAPI();
      requestBody.tool_choice = 'auto';
    }

    const response = await fetch(`${llmConfig.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${llmConfig.apiKey}`,
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`LLM API error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    const choice = data.choices[0];

    return {
      role: 'assistant',
      content: choice.message.content,
      tool_calls: choice.message.tool_calls,
    };
  }

  /**
   * Main agentic loop - processes user request with tool calls
   */
  async run(userMessage: string): Promise<AgentResponse> {
    const maxIterations = this.config.maxIterations ?? 10;
    let iterations = 0;

    // Add user message to history
    this.conversationHistory.push({
      role: 'user',
      content: userMessage,
    });

    this.emit('thinking', 'Processing request...');

    while (iterations < maxIterations) {
      iterations++;

      try {
        // Get LLM response
        const assistantMessage = await this.callLLM();
        this.conversationHistory.push(assistantMessage);

        // Check if there are tool calls
        if (assistantMessage.tool_calls && assistantMessage.tool_calls.length > 0) {
          // Process each tool call
          for (const toolCall of assistantMessage.tool_calls) {
            const { name, arguments: argsJson } = toolCall.function;
            this.emit('tool_call', `Calling tool: ${name}`, { name, args: argsJson });

            try {
              const args = JSON.parse(argsJson);
              const result = await this.executeTool(name, args);

              this.emit('tool_result', `Tool ${name} completed`, result);

              // Add tool result to history
              this.conversationHistory.push({
                role: 'tool',
                tool_call_id: toolCall.id,
                content: JSON.stringify(result),
              });
            } catch (error) {
              const errorMessage = error instanceof Error ? error.message : 'Unknown error';
              this.emit('error', `Tool ${name} failed: ${errorMessage}`);

              this.conversationHistory.push({
                role: 'tool',
                tool_call_id: toolCall.id,
                content: JSON.stringify({ error: errorMessage }),
              });
            }
          }
          // Continue the loop to let LLM process tool results
          continue;
        }

        // No tool calls - agent is done
        this.emit('complete', 'Task completed');
        return {
          success: true,
          message: assistantMessage.content || 'Task completed',
          data: this.context,
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        this.emit('error', errorMessage);
        return {
          success: false,
          message: 'Agent failed',
          error: errorMessage,
        };
      }
    }

    this.emit('error', 'Max iterations reached');
    return {
      success: false,
      message: 'Agent reached maximum iterations',
      error: 'Max iterations exceeded',
    };
  }

  /**
   * Reset the agent state
   */
  reset(): void {
    this.conversationHistory = [
      {
        role: 'system',
        content: this.config.systemPrompt,
      },
    ];
    this.context = {};
  }
}
