import type {
  LLMConfig,
  ChatMessage,
  ChatCompletionRequest,
  ChatCompletionResponse,
  MeetingAnalysis,
  MeetingCategory,
} from '../types/LLMTypes';
import type { GraphCalendarEvent } from '../types/CalendarEvent';

// Load config from environment variables with fallbacks
const DEFAULT_CONFIG: LLMConfig = {
  baseUrl: import.meta.env.VITE_LLM_BASE_URL || 'https://api.openai.com/v1',
  apiKey: import.meta.env.VITE_LLM_API_KEY || '',
  model: import.meta.env.VITE_LLM_MODEL || 'gpt-4o-mini',
};

let currentConfig: LLMConfig = { ...DEFAULT_CONFIG };

/**
 * Configure the LLM service
 * Supports any OpenAI-compatible endpoint:
 * - OpenAI: https://api.openai.com/v1
 * - Azure OpenAI: https://{resource}.openai.azure.com/openai/deployments/{deployment}
 * - Ollama: http://localhost:11434/v1
 * - OpenRouter: https://openrouter.ai/api/v1
 * - LM Studio: http://localhost:1234/v1
 * - Together AI: https://api.together.xyz/v1
 */
export function configureLLM(config: Partial<LLMConfig>): void {
  currentConfig = { ...currentConfig, ...config };
}

export function getLLMConfig(): LLMConfig {
  return { ...currentConfig };
}

/**
 * Check if LLM is configured (has base URL and model)
 * API key is optional for local endpoints like Ollama/LM Studio
 */
export function isLLMConfigured(): boolean {
  return currentConfig.baseUrl.length > 0 && currentConfig.model.length > 0;
}

/**
 * Make a chat completion request to any OpenAI-compatible API
 */
async function chatCompletion(messages: ChatMessage[]): Promise<string> {
  if (!isLLMConfigured()) {
    throw new Error('LLM not configured. Please configure in settings.');
  }

  const request: ChatCompletionRequest = {
    model: currentConfig.model,
    messages,
    temperature: 0.3, // Lower temperature for more consistent outputs
    max_tokens: 1000,
  };

  // Build headers - API key is optional for local endpoints
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (currentConfig.apiKey) {
    headers['Authorization'] = `Bearer ${currentConfig.apiKey}`;
  }

  const response = await fetch(`${currentConfig.baseUrl}/chat/completions`, {
    method: 'POST',
    headers,
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`LLM API error: ${response.status} - ${errorText}`);
  }

  const data: ChatCompletionResponse = await response.json();
  return data.choices[0]?.message?.content || '';
}

/**
 * Analyze a single meeting with LLM
 */
export async function analyzeMeeting(event: GraphCalendarEvent): Promise<MeetingAnalysis> {
  const attendeeList = event.attendees
    .map((a) => `${a.emailAddress.name} (${a.emailAddress.address})`)
    .join(', ');

  const prompt = `Analyze this calendar meeting and provide a JSON response:

Meeting Subject: ${event.subject || '(No subject)'}
Organizer: ${event.organizer?.emailAddress?.name} (${event.organizer?.emailAddress?.address})
Attendees: ${attendeeList || 'None'}
Description/Agenda:
${event.bodyPreview || '(No description)'}

Respond ONLY with valid JSON in this exact format:
{
  "summary": "A brief 1-2 sentence summary of what this meeting is about",
  "category": "one of: internal-team, external-client, one-on-one, all-hands, interview, training, review, planning, social, other",
  "actionItems": ["list of action items or tasks mentioned, or empty array if none"],
  "keyTopics": ["list of main topics to be discussed, max 5"]
}`;

  const messages: ChatMessage[] = [
    {
      role: 'system',
      content:
        'You are a meeting analyst. Analyze calendar meetings and extract structured information. Always respond with valid JSON only, no additional text.',
    },
    { role: 'user', content: prompt },
  ];

  try {
    const response = await chatCompletion(messages);

    // Parse JSON response (handle potential markdown code blocks)
    let jsonStr = response.trim();
    if (jsonStr.startsWith('```json')) {
      jsonStr = jsonStr.slice(7);
    }
    if (jsonStr.startsWith('```')) {
      jsonStr = jsonStr.slice(3);
    }
    if (jsonStr.endsWith('```')) {
      jsonStr = jsonStr.slice(0, -3);
    }

    const analysis = JSON.parse(jsonStr.trim()) as MeetingAnalysis;

    // Validate category
    const validCategories: MeetingCategory[] = [
      'internal-team',
      'external-client',
      'one-on-one',
      'all-hands',
      'interview',
      'training',
      'review',
      'planning',
      'social',
      'other',
    ];
    if (!validCategories.includes(analysis.category)) {
      analysis.category = 'other';
    }

    return analysis;
  } catch (error) {
    console.error('Failed to analyze meeting:', error);
    // Return default analysis on error
    return {
      summary: event.bodyPreview?.substring(0, 100) || 'No description available',
      category: 'other',
      actionItems: [],
      keyTopics: [],
    };
  }
}

/**
 * Batch analyze multiple meetings
 * Includes rate limiting to avoid API throttling
 */
export async function analyzeMeetings(
  events: GraphCalendarEvent[],
  onProgress?: (current: number, total: number) => void
): Promise<Map<string, MeetingAnalysis>> {
  const results = new Map<string, MeetingAnalysis>();

  for (let i = 0; i < events.length; i++) {
    const event = events[i];
    onProgress?.(i + 1, events.length);

    try {
      const analysis = await analyzeMeeting(event);
      results.set(event.id, analysis);

      // Small delay between requests to avoid rate limiting
      if (i < events.length - 1) {
        await new Promise((resolve) => setTimeout(resolve, 200));
      }
    } catch (error) {
      console.error(`Failed to analyze meeting ${event.id}:`, error);
      // Continue with other meetings
    }
  }

  return results;
}

/**
 * Generate an executive summary of all meetings in the date range
 */
export async function generateExecutiveSummary(
  events: GraphCalendarEvent[],
  analyses: Map<string, MeetingAnalysis>
): Promise<string> {
  const meetingSummaries = events
    .filter((e) => !e.isCancelled)
    .map((event) => {
      const analysis = analyses.get(event.id);
      return `- ${event.subject}: ${analysis?.summary || 'No summary'}`;
    })
    .join('\n');

  const categories = [...analyses.values()].reduce(
    (acc, a) => {
      acc[a.category] = (acc[a.category] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>
  );

  const allActionItems = [...analyses.values()].flatMap((a) => a.actionItems);

  const prompt = `Generate a brief executive summary (3-4 paragraphs) of these meetings:

Total Meetings: ${events.length}
Categories: ${JSON.stringify(categories)}

Meeting Summaries:
${meetingSummaries}

Action Items Found: ${allActionItems.length > 0 ? allActionItems.join('; ') : 'None'}

Write a professional summary highlighting key themes, important meetings, and action items.`;

  const messages: ChatMessage[] = [
    {
      role: 'system',
      content:
        'You are an executive assistant writing meeting summaries. Be concise and professional.',
    },
    { role: 'user', content: prompt },
  ];

  return chatCompletion(messages);
}
