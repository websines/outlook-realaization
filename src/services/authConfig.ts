import { Configuration, LogLevel, PopupRequest } from '@azure/msal-browser';

// Azure AD app registration values from environment
// Get these from: Azure Portal > Microsoft Entra ID > App registrations
export const msalConfig: Configuration = {
  auth: {
    clientId: import.meta.env.VITE_AZURE_CLIENT_ID || 'YOUR_CLIENT_ID', // Application (client) ID from Azure
    authority: 'https://login.microsoftonline.com/common', // Multi-tenant
    redirectUri: 'https://outlook-realaization.vercel.app',
    postLogoutRedirectUri: 'https://outlook-realaization.vercel.app',
  },
  cache: {
    cacheLocation: 'sessionStorage',
    storeAuthStateInCookie: false,
  },
  system: {
    loggerOptions: {
      loggerCallback: (level, message, containsPii) => {
        if (containsPii) return;
        switch (level) {
          case LogLevel.Error:
            console.error(message);
            return;
          case LogLevel.Warning:
            console.warn(message);
            return;
        }
      },
    },
  },
};

// Scopes needed for Microsoft Graph Calendar API
export const loginRequest: PopupRequest = {
  scopes: ['User.Read', 'Calendars.Read', 'Calendars.Read.Shared'],
};

export const graphScopes = {
  calendar: ['Calendars.Read', 'Calendars.Read.Shared'],
};
