import * as XLSX from 'xlsx';
import type { GraphCalendarEvent, MeetingReportRow } from '../types/CalendarEvent';
import { extractCompanyFromEmail, getUniqueCompanies } from '../utils/domainExtractor';

/**
 * Format date from ISO string to YYYY-MM-DD
 */
function formatDate(isoString: string): string {
  const date = new Date(isoString);
  return date.toISOString().split('T')[0];
}

/**
 * Format time from ISO string to HH:MM
 */
function formatTime(isoString: string): string {
  const date = new Date(isoString);
  return date.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

/**
 * Check if event has zero duration (start time equals end time)
 */
function hasZeroDuration(event: GraphCalendarEvent): boolean {
  const startTime = new Date(event.start.dateTime).getTime();
  const endTime = new Date(event.end.dateTime).getTime();
  return startTime === endTime;
}

/**
 * Transform Graph API calendar events to report rows
 */
export function transformEventsToReportRows(events: GraphCalendarEvent[]): MeetingReportRow[] {
  return events
    .filter((event) => !event.isCancelled) // Skip cancelled meetings
    .filter((event) => !hasZeroDuration(event)) // Skip events with same start/end time (e.g., "Home" placeholders)
    .map((event) => {
      const attendeeNames = event.attendees
        .map((a) => a.emailAddress.name)
        .filter((name) => name)
        .join(', ');

      const attendeeEmails = event.attendees
        .map((a) => a.emailAddress.address)
        .filter((email) => email);

      const attendeeCompanies = getUniqueCompanies(attendeeEmails).join(', ');

      return {
        meetingName: event.subject || '(No subject)',
        date: formatDate(event.start.dateTime),
        startTime: formatTime(event.start.dateTime),
        endTime: formatTime(event.end.dateTime),
        organizerName: event.organizer?.emailAddress?.name || '',
        organizerEmail: event.organizer?.emailAddress?.address || '',
        organizerCompany: extractCompanyFromEmail(event.organizer?.emailAddress?.address || ''),
        attendees: attendeeNames,
        attendeeEmails: attendeeEmails.join(', '),
        attendeeCompanies: attendeeCompanies,
        agenda: (event.bodyPreview || '').substring(0, 500), // Limit agenda length
      };
    });
}

/**
 * Generate Excel file from meeting report data
 */
export function generateExcelFile(data: MeetingReportRow[], filename: string = 'meeting-report.xlsx'): void {
  // Define column headers with friendly names
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

  // Transform data to array format for xlsx
  const worksheetData = [
    headers,
    ...data.map((row) => [
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
    ]),
  ];

  // Create worksheet
  const worksheet = XLSX.utils.aoa_to_sheet(worksheetData);

  // Set column widths for better readability
  worksheet['!cols'] = [
    { wch: 40 }, // Meeting Name
    { wch: 12 }, // Date
    { wch: 10 }, // Start Time
    { wch: 10 }, // End Time
    { wch: 25 }, // Organizer Name
    { wch: 30 }, // Organizer Email
    { wch: 20 }, // Organizer Company
    { wch: 40 }, // Attendees
    { wch: 50 }, // Attendee Emails
    { wch: 30 }, // Attendee Companies
    { wch: 60 }, // Agenda
  ];

  // Create workbook
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Meetings');

  // Trigger download
  XLSX.writeFile(workbook, filename);
}

/**
 * Generate filename with date range
 */
export function generateFilename(startDate: Date, endDate: Date): string {
  const formatDateStr = (date: Date) =>
    date.toISOString().split('T')[0].replace(/-/g, '');
  return `meeting-report_${formatDateStr(startDate)}_to_${formatDateStr(endDate)}.xlsx`;
}
