import { BaseAgent } from './BaseAgent';
import type { AgentConfig, Tool } from '../types/AgentTypes';
import type { GraphCalendarEvent } from '../types/CalendarEvent';
import type { MeetingAnalysis } from '../types/LLMTypes';
import { analyzeMeeting, generateExecutiveSummary } from '../services/llmService';

const ANALYSIS_TOOLS: Tool[] = [
  {
    name: 'analyze_single_meeting',
    description: 'Analyze a single meeting to extract summary, category, action items, and key topics',
    parameters: {
      type: 'object',
      properties: {
        meeting_id: {
          type: 'string',
          description: 'The ID of the meeting to analyze',
        },
      },
      required: ['meeting_id'],
    },
  },
  {
    name: 'analyze_all_meetings',
    description: 'Analyze all meetings in the current context',
    parameters: {
      type: 'object',
      properties: {
        batch_size: {
          type: 'string',
          description: 'Number of meetings to analyze at once (default: 10)',
        },
      },
      required: [],
    },
  },
  {
    name: 'generate_executive_summary',
    description: 'Generate an executive summary of all analyzed meetings',
    parameters: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
  {
    name: 'get_action_items',
    description: 'Get all action items extracted from analyzed meetings',
    parameters: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
  {
    name: 'get_meetings_by_category',
    description: 'Get meetings grouped by their category',
    parameters: {
      type: 'object',
      properties: {
        category: {
          type: 'string',
          description: 'Filter by specific category (optional)',
          enum: [
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
          ],
        },
      },
      required: [],
    },
  },
];

const SYSTEM_PROMPT = `You are an Analysis Agent specialized in analyzing meeting data using AI.

Your capabilities:
1. Analyze individual meetings to extract summaries, categories, and action items
2. Batch analyze multiple meetings
3. Generate executive summaries
4. Categorize meetings and extract insights

When asked to analyze meetings:
1. Use analyze_all_meetings for batch processing
2. Use generate_executive_summary for an overview
3. Provide insights about meeting patterns and action items

Always provide clear, actionable insights from the meeting data.`;

export class AnalysisAgent extends BaseAgent {
  private analysisResults: Map<string, MeetingAnalysis> = new Map();
  private executiveSummary: string = '';

  constructor() {
    const config: AgentConfig = {
      name: 'AnalysisAgent',
      description: 'Analyzes meeting data with LLM to extract insights',
      systemPrompt: SYSTEM_PROMPT,
      tools: ANALYSIS_TOOLS,
      maxIterations: 10,
    };
    super(config);
    this.registerTools();
  }

  /**
   * Get analysis results
   */
  getAnalysisResults(): Map<string, MeetingAnalysis> {
    return this.analysisResults;
  }

  /**
   * Get executive summary
   */
  getExecutiveSummary(): string {
    return this.executiveSummary;
  }

  private getMeetings(): GraphCalendarEvent[] {
    return (this.context.meetings as GraphCalendarEvent[]) || [];
  }

  private registerTools(): void {
    // Analyze single meeting
    this.registerTool('analyze_single_meeting', async (args) => {
      const meetingId = args.meeting_id as string;
      const meetings = this.getMeetings();
      const meeting = meetings.find((m) => m.id === meetingId);

      if (!meeting) {
        throw new Error(`Meeting with ID ${meetingId} not found`);
      }

      this.emit('thinking', `Analyzing meeting: ${meeting.subject}...`);

      const analysis = await analyzeMeeting(meeting);
      this.analysisResults.set(meetingId, analysis);

      return {
        success: true,
        meetingId,
        subject: meeting.subject,
        analysis,
      };
    });

    // Analyze all meetings
    this.registerTool('analyze_all_meetings', async (_args) => {
      const meetings = this.getMeetings();

      if (meetings.length === 0) {
        return {
          success: false,
          error: 'No meetings found in context. Fetch calendar data first.',
        };
      }

      this.emit('thinking', `Analyzing ${meetings.length} meetings...`);

      let analyzed = 0;
      for (const meeting of meetings) {
        if (meeting.isCancelled) continue;

        try {
          this.emit('thinking', `Analyzing (${analyzed + 1}/${meetings.length}): ${meeting.subject}`);
          const analysis = await analyzeMeeting(meeting);
          this.analysisResults.set(meeting.id, analysis);
          analyzed++;

          // Small delay to avoid rate limiting
          if (analyzed < meetings.length) {
            await new Promise((resolve) => setTimeout(resolve, 200));
          }
        } catch (error) {
          console.error(`Failed to analyze meeting ${meeting.id}:`, error);
        }
      }

      // Store in context
      this.context.analysisResults = this.analysisResults;

      // Categorize results
      const categories: Record<string, number> = {};
      this.analysisResults.forEach((analysis) => {
        categories[analysis.category] = (categories[analysis.category] || 0) + 1;
      });

      return {
        success: true,
        totalAnalyzed: analyzed,
        categories,
        totalActionItems: [...this.analysisResults.values()].reduce(
          (sum, a) => sum + a.actionItems.length,
          0
        ),
      };
    });

    // Generate executive summary
    this.registerTool('generate_executive_summary', async () => {
      const meetings = this.getMeetings();

      if (this.analysisResults.size === 0) {
        return {
          success: false,
          error: 'No analysis results available. Run analyze_all_meetings first.',
        };
      }

      this.emit('thinking', 'Generating executive summary...');

      this.executiveSummary = await generateExecutiveSummary(meetings, this.analysisResults);

      return {
        success: true,
        summary: this.executiveSummary,
      };
    });

    // Get action items
    this.registerTool('get_action_items', async () => {
      const actionItems: { meeting: string; items: string[] }[] = [];

      const meetings = this.getMeetings();
      this.analysisResults.forEach((analysis, meetingId) => {
        if (analysis.actionItems.length > 0) {
          const meeting = meetings.find((m) => m.id === meetingId);
          actionItems.push({
            meeting: meeting?.subject || 'Unknown',
            items: analysis.actionItems,
          });
        }
      });

      return {
        success: true,
        totalActionItems: actionItems.reduce((sum, m) => sum + m.items.length, 0),
        byMeeting: actionItems,
      };
    });

    // Get meetings by category
    this.registerTool('get_meetings_by_category', async (args) => {
      const filterCategory = args.category as string | undefined;
      const meetings = this.getMeetings();

      const byCategory: Record<string, { subject: string; date: string }[]> = {};

      this.analysisResults.forEach((analysis, meetingId) => {
        const meeting = meetings.find((m) => m.id === meetingId);
        if (!meeting) return;

        if (filterCategory && analysis.category !== filterCategory) return;

        if (!byCategory[analysis.category]) {
          byCategory[analysis.category] = [];
        }
        byCategory[analysis.category].push({
          subject: meeting.subject,
          date: meeting.start.dateTime,
        });
      });

      return {
        success: true,
        filter: filterCategory || 'all',
        byCategory,
      };
    });
  }

  /**
   * Reset agent state including analysis results
   */
  reset(): void {
    super.reset();
    this.analysisResults.clear();
    this.executiveSummary = '';
  }
}
