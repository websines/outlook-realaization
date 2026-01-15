// Microsoft Graph Calendar Event types

export interface EmailAddress {
  name: string;
  address: string;
}

export interface Attendee {
  type: 'required' | 'optional' | 'resource';
  status: {
    response: 'none' | 'organizer' | 'tentativelyAccepted' | 'accepted' | 'declined' | 'notResponded';
    time: string;
  };
  emailAddress: EmailAddress;
}

export interface DateTimeTimeZone {
  dateTime: string;
  timeZone: string;
}

export interface GraphCalendarEvent {
  id: string;
  subject: string;
  bodyPreview: string;
  body?: {
    contentType: 'text' | 'html';
    content: string;
  };
  start: DateTimeTimeZone;
  end: DateTimeTimeZone;
  organizer: {
    emailAddress: EmailAddress;
  };
  attendees: Attendee[];
  isAllDay: boolean;
  isCancelled: boolean;
  webLink: string;
}

export interface GraphCalendarResponse {
  '@odata.context': string;
  '@odata.nextLink'?: string;
  value: GraphCalendarEvent[];
}

// Transformed meeting data for Excel export
export interface MeetingReportRow {
  meetingName: string;
  date: string;
  startTime: string;
  endTime: string;
  organizerName: string;
  organizerEmail: string;
  organizerCompany: string;
  attendees: string;
  attendeeEmails: string;
  attendeeCompanies: string;
  agenda: string;
}
