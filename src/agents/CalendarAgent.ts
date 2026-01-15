import { BaseAgent } from './BaseAgent';
import type { AgentConfig, Tool } from '../types/AgentTypes';
import type { GraphCalendarEvent } from '../types/CalendarEvent';
import { fetchCalendarEvents } from '../services/graphService';
import type { IPublicClientApplication } from '@azure/msal-browser';

const CALENDAR_TOOLS: Tool[] = [
  {
    name: 'fetch_calendar_events',
    description: 'Fetch calendar events from Microsoft Outlook for a given date range. Can fetch for yourself or another user if they shared their calendar.',
    parameters: {
      type: 'object',
      properties: {
        start_date: {
          type: 'string',
          description: 'Start date in ISO format (YYYY-MM-DD)',
        },
        end_date: {
          type: 'string',
          description: 'End date in ISO format (YYYY-MM-DD)',
        },
        target_user: {
          type: 'string',
          description: 'Email of the user whose calendar to fetch (optional, requires shared calendar access)',
        },
      },
      required: ['start_date', 'end_date'],
    },
  },
  {
    name: 'filter_meetings',
    description: 'Filter meetings by criteria like organizer domain, attendee count, or keywords',
    parameters: {
      type: 'object',
      properties: {
        filter_type: {
          type: 'string',
          description: 'Type of filter to apply',
          enum: ['organizer_domain', 'min_attendees', 'keyword', 'external_only', 'internal_only'],
        },
        filter_value: {
          type: 'string',
          description: 'Value to filter by (domain name, number, or keyword)',
        },
      },
      required: ['filter_type'],
    },
  },
  {
    name: 'get_meeting_stats',
    description: 'Get statistics about the fetched meetings',
    parameters: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
];

const SYSTEM_PROMPT = `You are a Calendar Agent specialized in fetching and processing Microsoft Outlook calendar data.

Your capabilities:
1. Fetch calendar events for a specified date range
2. Filter meetings by various criteria
3. Provide meeting statistics

When asked to get meeting data:
1. First use fetch_calendar_events to retrieve the data
2. Apply any requested filters
3. Provide a summary of what was found

Always be helpful and provide clear information about the meetings found.`;

export class CalendarAgent extends BaseAgent {
  private msalInstance: IPublicClientApplication | null = null;
  private meetings: GraphCalendarEvent[] = [];
  private userDomain: string = '';

  constructor() {
    const config: AgentConfig = {
      name: 'CalendarAgent',
      description: 'Fetches and processes calendar data from Microsoft Outlook',
      systemPrompt: SYSTEM_PROMPT,
      tools: CALENDAR_TOOLS,
      maxIterations: 5,
    };
    super(config);
    this.registerTools();
  }

  /**
   * Set the MSAL instance for authentication
   */
  setMsalInstance(instance: IPublicClientApplication): void {
    this.msalInstance = instance;
    // Try to get user domain from account
    const accounts = instance.getAllAccounts();
    if (accounts.length > 0) {
      const email = accounts[0].username;
      this.userDomain = email.split('@')[1] || '';
    }
  }

  /**
   * Get fetched meetings
   */
  getMeetings(): GraphCalendarEvent[] {
    return this.meetings;
  }

  private registerTools(): void {
    // Fetch calendar events tool
    this.registerTool('fetch_calendar_events', async (args) => {
      if (!this.msalInstance) {
        throw new Error('Not authenticated. Please sign in first.');
      }

      const startDate = new Date(args.start_date as string);
      const endDate = new Date(args.end_date as string);
      const targetUser = args.target_user as string | undefined;

      // Set end date to end of day
      endDate.setHours(23, 59, 59, 999);

      const userInfo = targetUser ? `for ${targetUser}` : 'for yourself';
      this.emit('thinking', `Fetching calendar events ${userInfo} from ${startDate.toDateString()} to ${endDate.toDateString()}...`);

      this.meetings = await fetchCalendarEvents(this.msalInstance, startDate, endDate, targetUser);

      // Store in context for other agents
      this.context.meetings = this.meetings;
      this.context.startDate = startDate;
      this.context.endDate = endDate;

      return {
        success: true,
        totalMeetings: this.meetings.length,
        dateRange: {
          start: startDate.toISOString(),
          end: endDate.toISOString(),
        },
        meetings: this.meetings.map((m) => ({
          id: m.id,
          subject: m.subject,
          start: m.start.dateTime,
          organizer: m.organizer?.emailAddress?.name,
          attendeeCount: m.attendees?.length || 0,
        })),
      };
    });

    // Filter meetings tool
    this.registerTool('filter_meetings', async (args) => {
      const filterType = args.filter_type as string;
      const filterValue = args.filter_value as string;

      let filtered = [...this.meetings];

      switch (filterType) {
        case 'organizer_domain':
          filtered = filtered.filter((m) =>
            m.organizer?.emailAddress?.address?.toLowerCase().includes(filterValue.toLowerCase())
          );
          break;

        case 'min_attendees':
          const minCount = parseInt(filterValue) || 0;
          filtered = filtered.filter((m) => (m.attendees?.length || 0) >= minCount);
          break;

        case 'keyword':
          const keyword = filterValue.toLowerCase();
          filtered = filtered.filter(
            (m) =>
              m.subject?.toLowerCase().includes(keyword) ||
              m.bodyPreview?.toLowerCase().includes(keyword)
          );
          break;

        case 'external_only':
          filtered = filtered.filter((m) => {
            const organizerDomain = m.organizer?.emailAddress?.address?.split('@')[1];
            return organizerDomain !== this.userDomain;
          });
          break;

        case 'internal_only':
          filtered = filtered.filter((m) => {
            const organizerDomain = m.organizer?.emailAddress?.address?.split('@')[1];
            return organizerDomain === this.userDomain;
          });
          break;
      }

      this.meetings = filtered;
      this.context.meetings = filtered;

      return {
        success: true,
        filteredCount: filtered.length,
        filterApplied: { type: filterType, value: filterValue },
      };
    });

    // Get meeting stats tool
    this.registerTool('get_meeting_stats', async () => {
      const meetings = this.meetings;

      // Count by organizer domain
      const domainCounts: Record<string, number> = {};
      meetings.forEach((m) => {
        const domain = m.organizer?.emailAddress?.address?.split('@')[1] || 'unknown';
        domainCounts[domain] = (domainCounts[domain] || 0) + 1;
      });

      // Calculate total meeting time
      let totalMinutes = 0;
      meetings.forEach((m) => {
        const start = new Date(m.start.dateTime);
        const end = new Date(m.end.dateTime);
        totalMinutes += (end.getTime() - start.getTime()) / (1000 * 60);
      });

      return {
        totalMeetings: meetings.length,
        totalHours: Math.round(totalMinutes / 60 * 10) / 10,
        byDomain: domainCounts,
        cancelledCount: meetings.filter((m) => m.isCancelled).length,
        allDayCount: meetings.filter((m) => m.isAllDay).length,
      };
    });
  }
}
