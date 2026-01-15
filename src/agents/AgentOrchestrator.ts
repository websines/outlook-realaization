import type { IPublicClientApplication } from '@azure/msal-browser';
import type { AgentEvent, AgentEventHandler, AgentContext } from '../types/AgentTypes';
import { CalendarAgent } from './CalendarAgent';
import { AnalysisAgent } from './AnalysisAgent';
import { ReportAgent } from './ReportAgent';
import { isLLMConfigured } from '../services/llmService';

export interface OrchestratorOptions {
  msalInstance: IPublicClientApplication;
  onEvent?: AgentEventHandler;
}

export interface ReportGenerationOptions {
  startDate: Date;
  endDate: Date;
  targetUser?: string; // Email of user whose calendar to fetch (requires shared access)
  includeAnalysis?: boolean;
  includeExecutiveSummary?: boolean;
}

/**
 * Agent Orchestrator - Coordinates multiple specialized agents
 * to generate meeting reports
 */
export class AgentOrchestrator {
  private calendarAgent: CalendarAgent;
  private analysisAgent: AnalysisAgent;
  private reportAgent: ReportAgent;
  private msalInstance: IPublicClientApplication;
  private eventHandlers: AgentEventHandler[];
  private sharedContext: AgentContext;

  constructor(options: OrchestratorOptions) {
    this.msalInstance = options.msalInstance;
    this.eventHandlers = [];
    this.sharedContext = {};

    // Initialize agents
    this.calendarAgent = new CalendarAgent();
    this.analysisAgent = new AnalysisAgent();
    this.reportAgent = new ReportAgent();

    // Set MSAL instance for calendar agent
    this.calendarAgent.setMsalInstance(this.msalInstance);

    // Subscribe to agent events
    if (options.onEvent) {
      this.onEvent(options.onEvent);
    }
  }

  /**
   * Subscribe to all agent events
   */
  onEvent(handler: AgentEventHandler): () => void {
    this.eventHandlers.push(handler);

    // Forward to all agents
    const unsubscribers = [
      this.calendarAgent.onEvent(handler),
      this.analysisAgent.onEvent(handler),
      this.reportAgent.onEvent(handler),
    ];

    return () => {
      unsubscribers.forEach((unsub) => unsub());
      const index = this.eventHandlers.indexOf(handler);
      if (index > -1) this.eventHandlers.splice(index, 1);
    };
  }

  /**
   * Emit an orchestrator event
   */
  private emit(type: AgentEvent['type'], message: string, data?: unknown): void {
    const event: AgentEvent = {
      type,
      agent: 'Orchestrator',
      message,
      data,
      timestamp: new Date(),
    };
    this.eventHandlers.forEach((handler) => handler(event));
  }

  /**
   * Generate a meeting report - the main workflow
   */
  async generateReport(options: ReportGenerationOptions): Promise<{
    success: boolean;
    message: string;
    filename?: string;
    downloadUrl?: string;
    error?: string;
  }> {
    const { startDate, endDate, targetUser, includeAnalysis = true, includeExecutiveSummary = true } = options;

    try {
      // Step 1: Fetch calendar data
      this.emit('thinking', 'Starting report generation...');
      const userInfo = targetUser ? `for ${targetUser}` : 'for yourself';
      this.emit('thinking', `Date range: ${startDate.toDateString()} to ${endDate.toDateString()} ${userInfo}`);

      const targetUserClause = targetUser ? ` for user ${targetUser}` : '';
      const calendarResult = await this.calendarAgent.run(
        `Fetch all calendar events from ${startDate.toISOString().split('T')[0]} to ${endDate.toISOString().split('T')[0]}${targetUserClause}`
      );

      if (!calendarResult.success) {
        throw new Error(calendarResult.error || 'Failed to fetch calendar data');
      }

      // Share context between agents
      this.sharedContext = { ...this.calendarAgent['context'] };
      const meetings = this.calendarAgent.getMeetings();

      this.emit('response', `Found ${meetings.length} meetings`);

      if (meetings.length === 0) {
        return {
          success: false,
          message: 'No meetings found in the specified date range',
        };
      }

      // Step 2: Analyze meetings (if LLM is configured and analysis requested)
      if (includeAnalysis && isLLMConfigured()) {
        this.emit('thinking', 'Analyzing meetings with AI...');

        // Share context with analysis agent
        this.analysisAgent.setContext(this.sharedContext);

        const analysisResult = await this.analysisAgent.run(
          'Analyze all meetings in the context to extract summaries, categories, and action items'
        );

        if (analysisResult.success) {
          // Update shared context with analysis results
          this.sharedContext.analysisResults = this.analysisAgent.getAnalysisResults();

          // Generate executive summary if requested
          if (includeExecutiveSummary) {
            this.emit('thinking', 'Generating executive summary...');
            await this.analysisAgent.run('Generate an executive summary of all analyzed meetings');
            this.sharedContext.executiveSummary = this.analysisAgent.getExecutiveSummary();
          }
        } else {
          this.emit('error', 'Analysis failed, generating report without AI insights');
        }
      } else if (includeAnalysis && !isLLMConfigured()) {
        this.emit('response', 'LLM not configured - skipping AI analysis');
      }

      // Step 3: Generate report
      this.emit('thinking', 'Generating Excel report...');

      // Share all context with report agent
      this.reportAgent.setContext(this.sharedContext);

      const reportResult = await this.reportAgent.run(
        `Generate an Excel report with include_analysis=${includeAnalysis} and include_executive_summary=${includeExecutiveSummary}`
      );

      if (!reportResult.success) {
        throw new Error(reportResult.error || 'Failed to generate report');
      }

      this.emit('complete', 'Report generated successfully!');

      // Debug: log what we're getting back
      console.log('Report result data:', reportResult.data);

      const reportData = reportResult.data as { downloadFilename?: string; downloadUrl?: string };
      console.log('Download URL:', reportData?.downloadUrl);
      console.log('Download filename:', reportData?.downloadFilename);

      return {
        success: true,
        message: `Report generated with ${meetings.length} meetings`,
        filename: reportData?.downloadFilename,
        downloadUrl: reportData?.downloadUrl,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.emit('error', errorMessage);
      return {
        success: false,
        message: 'Failed to generate report',
        error: errorMessage,
      };
    }
  }

  /**
   * Run a custom command through the appropriate agent
   */
  async runCommand(command: string): Promise<{
    success: boolean;
    message: string;
    data?: unknown;
  }> {
    // Determine which agent should handle the command
    const lowerCommand = command.toLowerCase();

    if (
      lowerCommand.includes('fetch') ||
      lowerCommand.includes('calendar') ||
      lowerCommand.includes('meetings')
    ) {
      const result = await this.calendarAgent.run(command);
      this.sharedContext = { ...this.calendarAgent['context'] };
      return result;
    }

    if (
      lowerCommand.includes('analyz') ||
      lowerCommand.includes('summar') ||
      lowerCommand.includes('action item') ||
      lowerCommand.includes('categor')
    ) {
      this.analysisAgent.setContext(this.sharedContext);
      const result = await this.analysisAgent.run(command);
      this.sharedContext.analysisResults = this.analysisAgent.getAnalysisResults();
      this.sharedContext.executiveSummary = this.analysisAgent.getExecutiveSummary();
      return result;
    }

    if (
      lowerCommand.includes('report') ||
      lowerCommand.includes('excel') ||
      lowerCommand.includes('export') ||
      lowerCommand.includes('download')
    ) {
      this.reportAgent.setContext(this.sharedContext);
      return this.reportAgent.run(command);
    }

    // Default to calendar agent for unknown commands
    return this.calendarAgent.run(command);
  }

  /**
   * Reset all agents
   */
  reset(): void {
    this.calendarAgent.reset();
    this.analysisAgent.reset();
    this.reportAgent.reset();
    this.sharedContext = {};
  }
}
