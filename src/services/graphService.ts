import { IPublicClientApplication, InteractionRequiredAuthError } from '@azure/msal-browser';
import { graphScopes } from './authConfig';
import type { GraphCalendarResponse, GraphCalendarEvent } from '../types/CalendarEvent';

const GRAPH_BASE_URL = 'https://graph.microsoft.com/v1.0';

/**
 * Acquire access token for Microsoft Graph API
 */
async function getAccessToken(msalInstance: IPublicClientApplication): Promise<string> {
  const accounts = msalInstance.getAllAccounts();
  if (accounts.length === 0) {
    throw new Error('No authenticated account found. Please sign in first.');
  }

  const request = {
    scopes: graphScopes.calendar,
    account: accounts[0],
  };

  try {
    const response = await msalInstance.acquireTokenSilent(request);
    return response.accessToken;
  } catch (error) {
    if (error instanceof InteractionRequiredAuthError) {
      // Fallback to interactive if silent fails
      const response = await msalInstance.acquireTokenPopup(request);
      return response.accessToken;
    }
    throw error;
  }
}

/**
 * Fetch calendar events from Microsoft Graph API
 * Uses calendarView endpoint to get events within a date range
 * @param targetUser - Optional user email to fetch calendar for (requires shared calendar access)
 */
export async function fetchCalendarEvents(
  msalInstance: IPublicClientApplication,
  startDate: Date,
  endDate: Date,
  targetUser?: string
): Promise<GraphCalendarEvent[]> {
  const accessToken = await getAccessToken(msalInstance);

  // Format dates to ISO 8601
  const startDateTime = startDate.toISOString();
  const endDateTime = endDate.toISOString();

  // Use /me for self or /users/{email} for shared calendar
  const userPath = targetUser ? `users/${targetUser}` : 'me';

  const allEvents: GraphCalendarEvent[] = [];
  let nextLink: string | undefined =
    `${GRAPH_BASE_URL}/${userPath}/calendar/calendarView?startDateTime=${startDateTime}&endDateTime=${endDateTime}&$top=50&$orderby=start/dateTime`;

  // Handle pagination
  while (nextLink) {
    const response = await fetch(nextLink, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        Prefer: 'outlook.timezone="UTC"',
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Graph API error: ${response.status} - ${errorText}`);
    }

    const data: GraphCalendarResponse = await response.json();
    allEvents.push(...data.value);

    // Check for more pages
    nextLink = data['@odata.nextLink'];
  }

  return allEvents;
}

/**
 * Get user profile info (for display purposes)
 */
export async function getUserProfile(msalInstance: IPublicClientApplication): Promise<{ displayName: string; mail: string }> {
  const accessToken = await getAccessToken(msalInstance);

  const response = await fetch(`${GRAPH_BASE_URL}/me`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch user profile: ${response.status}`);
  }

  return response.json();
}

/**
 * Shared calendar info
 */
export interface SharedCalendar {
  id: string;
  name: string;
  owner?: {
    name: string;
    address: string;
  };
  isDefaultCalendar: boolean;
}

/**
 * Get all calendars the user has access to (including shared calendars)
 */
export async function getAvailableCalendars(msalInstance: IPublicClientApplication): Promise<SharedCalendar[]> {
  const accessToken = await getAccessToken(msalInstance);

  const response = await fetch(`${GRAPH_BASE_URL}/me/calendars?$top=50`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch calendars: ${response.status}`);
  }

  const data = await response.json();

  return data.value.map((cal: { id: string; name: string; owner?: { name: string; address: string }; isDefaultCalendar?: boolean }) => ({
    id: cal.id,
    name: cal.name,
    owner: cal.owner,
    isDefaultCalendar: cal.isDefaultCalendar || false,
  }));
}

/**
 * Get people who shared their calendar with the current user
 */
export async function getSharedCalendarOwners(msalInstance: IPublicClientApplication): Promise<{ name: string; email: string }[]> {
  const calendars = await getAvailableCalendars(msalInstance);

  // Get current user to filter out their own calendar
  const currentUser = await getUserProfile(msalInstance);
  const currentUserEmail = currentUser.mail?.toLowerCase();

  // Filter to only shared calendars (where owner is different from current user)
  const sharedOwners = calendars
    .filter(cal => cal.owner && cal.owner.address?.toLowerCase() !== currentUserEmail)
    .map(cal => ({
      name: cal.owner?.name || cal.name,
      email: cal.owner?.address || '',
    }))
    .filter(owner => owner.email); // Only include if we have an email

  // Remove duplicates (same owner might have multiple calendars shared)
  const uniqueOwners = Array.from(
    new Map(sharedOwners.map(o => [o.email.toLowerCase(), o])).values()
  );

  return uniqueOwners;
}
