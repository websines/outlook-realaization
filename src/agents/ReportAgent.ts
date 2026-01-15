import { BaseAgent } from './BaseAgent';
import type { AgentConfig, Tool } from '../types/AgentTypes';
import type { GraphCalendarEvent, MeetingReportRow } from '../types/CalendarEvent';
import type { MeetingAnalysis } from '../types/LLMTypes';
import { transformEventsToReportRows, generateExcelFile, generateFilename } from '../services/excelService';
import { extractCompanyFromEmail } from '../utils/domainExtractor';

const REPORT_TOOLS: Tool[] = [
  {
    name: 'generate_excel_report',
    description: 'Generate an Excel report from the meeting data and analysis',
    parameters: {
      type: 'object',
      properties: {
        include_analysis: {
          type: 'string',
          description: 'Whether to include LLM analysis columns (true/false)',
        },
        include_executive_summary: {
          type: 'string',
          description: 'Whether to include executive summary sheet (true/false)',
        },
      },
      required: [],
    },
  },
  {
    name: 'preview_report',
    description: 'Get a preview of what the report will contain',
    parameters: {
      type: 'object',
      properties: {
        rows: {
          type: 'string',
          description: 'Number of preview rows to return (default: 5)',
        },
      },
      required: [],
    },
  },
  {
    name: 'get_report_summary',
    description: 'Get a summary of the report contents',
    parameters: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
];

const SYSTEM_PROMPT = `You are a Report Agent specialized in generating Excel reports from meeting data.

Your capabilities:
1. Generate Excel reports with meeting details
2. Include LLM analysis (summaries, categories, action items)
3. Provide report previews
4. Add executive summaries

When generating reports:
1. First check if meeting data is available in context
2. Check if analysis results are available (optional)
3. Generate the report with appropriate columns
4. Provide a summary of what was included

Always confirm successful report generation with the user.`;

// Extended report row with analysis
interface EnhancedReportRow extends MeetingReportRow {
  aiSummary?: string;
  category?: string;
  actionItems?: string;
  keyTopics?: string;
}

export class ReportAgent extends BaseAgent {
  private reportData: EnhancedReportRow[] = [];

  constructor() {
    const config: AgentConfig = {
      name: 'ReportAgent',
      description: 'Generates Excel reports from meeting data',
      systemPrompt: SYSTEM_PROMPT,
      tools: REPORT_TOOLS,
      maxIterations: 5,
    };
    super(config);
    this.registerTools();
  }

  private getMeetings(): GraphCalendarEvent[] {
    return (this.context.meetings as GraphCalendarEvent[]) || [];
  }

  private getAnalysisResults(): Map<string, MeetingAnalysis> {
    return (this.context.analysisResults as Map<string, MeetingAnalysis>) || new Map();
  }

  private getExecutiveSummary(): string {
    return (this.context.executiveSummary as string) || '';
  }

  private registerTools(): void {
    // Generate Excel report
    this.registerTool('generate_excel_report', async (args) => {
      const meetings = this.getMeetings();
      const analysisResults = this.getAnalysisResults();
      const includeAnalysis = args.include_analysis !== 'false';
      const includeExecSummary = args.include_executive_summary !== 'false';

      if (meetings.length === 0) {
        return {
          success: false,
          error: 'No meetings found. Please fetch calendar data first.',
        };
      }

      this.emit('thinking', 'Generating Excel report...');

      // Transform to base report rows
      const baseRows = transformEventsToReportRows(meetings);

      // Enhance with analysis if available
      this.reportData = baseRows.map((row, index) => {
        const meeting = meetings.filter((m) => !m.isCancelled)[index];
        const analysis = meeting ? analysisResults.get(meeting.id) : undefined;

        const enhanced: EnhancedReportRow = { ...row };

        if (includeAnalysis && analysis) {
          enhanced.aiSummary = analysis.summary;
          enhanced.category = analysis.category;
          enhanced.actionItems = analysis.actionItems.join('; ');
          enhanced.keyTopics = analysis.keyTopics.join(', ');
        }

        return enhanced;
      });

      // Generate filename with date range
      const startDate = this.context.startDate as Date;
      const endDate = this.context.endDate as Date;
      const filename = generateFilename(startDate || new Date(), endDate || new Date());

      // Create Excel workbook with XLSX
      const XLSX = await import('xlsx');

      // Main meetings sheet
      const headers = [
        'Meeting Name',
        'Date',
        'Start Time',
        'End Time',
        'Organizer Name',
        'Organizer Email',
        'Organizer Company',
        'Attendees',
        'Attendee Emails',
        'Attendee Companies',
        'Agenda',
      ];

      if (includeAnalysis && analysisResults.size > 0) {
        headers.push('AI Summary', 'Category', 'Action Items', 'Key Topics');
      }

      const worksheetData = [
        headers,
        ...this.reportData.map((row) => {
          const baseData = [
            row.meetingName,
            row.date,
            row.startTime,
            row.endTime,
            row.organizerName,
            row.organizerEmail,
            row.organizerCompany,
            row.attendees,
            row.attendeeEmails,
            row.attendeeCompanies,
            row.agenda,
          ];

          if (includeAnalysis && analysisResults.size > 0) {
            baseData.push(
              row.aiSummary || '',
              row.category || '',
              row.actionItems || '',
              row.keyTopics || ''
            );
          }

          return baseData;
        }),
      ];

      const workbook = XLSX.utils.book_new();
      const mainSheet = XLSX.utils.aoa_to_sheet(worksheetData);

      // Set column widths
      mainSheet['!cols'] = headers.map((h) => ({
        wch: Math.max(h.length, 20),
      }));

      XLSX.utils.book_append_sheet(workbook, mainSheet, 'Meetings');

      // Add executive summary sheet if available
      const execSummary = this.getExecutiveSummary();
      if (includeExecSummary && execSummary) {
        const summarySheet = XLSX.utils.aoa_to_sheet([
          ['Executive Summary'],
          [''],
          [`Date Range: ${startDate?.toDateString()} - ${endDate?.toDateString()}`],
          [`Total Meetings: ${meetings.filter((m) => !m.isCancelled).length}`],
          [''],
          [execSummary],
        ]);
        summarySheet['!cols'] = [{ wch: 100 }];
        XLSX.utils.book_append_sheet(workbook, summarySheet, 'Summary');
      }

      // Trigger download
      XLSX.writeFile(workbook, filename);

      return {
        success: true,
        filename,
        rowCount: this.reportData.length,
        columnsIncluded: headers.length,
        sheetsIncluded: includeExecSummary && execSummary ? 2 : 1,
      };
    });

    // Preview report
    this.registerTool('preview_report', async (args) => {
      const meetings = this.getMeetings();
      const rowCount = parseInt(args.rows as string) || 5;

      if (meetings.length === 0) {
        return {
          success: false,
          error: 'No meetings found',
        };
      }

      const baseRows = transformEventsToReportRows(meetings.slice(0, rowCount));

      return {
        success: true,
        previewRows: baseRows,
        totalAvailable: meetings.length,
      };
    });

    // Get report summary
    this.registerTool('get_report_summary', async () => {
      const meetings = this.getMeetings();
      const analysisResults = this.getAnalysisResults();

      // Count unique companies
      const companies = new Set<string>();
      meetings.forEach((m) => {
        const organizerCompany = extractCompanyFromEmail(
          m.organizer?.emailAddress?.address || ''
        );
        if (organizerCompany) companies.add(organizerCompany);

        m.attendees?.forEach((a) => {
          const company = extractCompanyFromEmail(a.emailAddress.address);
          if (company) companies.add(company);
        });
      });

      // Category breakdown
      const categories: Record<string, number> = {};
      analysisResults.forEach((analysis) => {
        categories[analysis.category] = (categories[analysis.category] || 0) + 1;
      });

      return {
        success: true,
        summary: {
          totalMeetings: meetings.filter((m) => !m.isCancelled).length,
          cancelledMeetings: meetings.filter((m) => m.isCancelled).length,
          uniqueCompanies: companies.size,
          analyzedMeetings: analysisResults.size,
          categories: Object.keys(categories).length > 0 ? categories : 'Not analyzed',
          hasExecutiveSummary: !!this.getExecutiveSummary(),
        },
      };
    });
  }
}
