# Outlook Calendar Report Add-in

An Outlook Add-in that generates meeting reports as downloadable Excel files. Uses AI agents to analyze meetings, extract action items, and generate executive summaries.

## Features

- **Calendar Data Export**: Fetch meetings for any date range
- **Meeting Details**: Organizer, attendees, company extraction from email domains, agenda
- **AI Analysis** (optional):
  - Meeting summaries
  - Auto-categorization (internal, external, 1:1, etc.)
  - Action item extraction
  - Key topics identification
  - Executive summary generation
- **Excel Export**: Download as formatted .xlsx file

## Architecture

This add-in uses an agentic architecture with three specialized agents:

1. **CalendarAgent**: Fetches and processes calendar data from Microsoft Graph
2. **AnalysisAgent**: Analyzes meetings using any OpenAI-compatible LLM
3. **ReportAgent**: Generates Excel reports with optional AI insights

The agents can use any OpenAI-compatible endpoint:
- OpenAI
- Azure OpenAI
- Ollama (local)
- OpenRouter
- LM Studio (local)
- Together AI
- Any other compatible endpoint

## Prerequisites

1. **Node.js 18+**: Install from https://nodejs.org
2. **Microsoft 365 Account**: Work/school account or [free developer tenant](https://developer.microsoft.com/en-us/microsoft-365/dev-program)
3. **Azure AD App Registration**: See setup below

## Setup

### 1. Install Dependencies

```bash
npm install
```

### 2. Create Azure AD App Registration

1. Go to [Azure Portal](https://portal.azure.com)
2. Navigate to **Microsoft Entra ID** > **App registrations**
3. Click **New registration**
4. Enter name: "Outlook Calendar Report"
5. Supported account types: "Accounts in any organizational directory and personal Microsoft accounts"
6. Redirect URI: Select "Single-page application (SPA)" and enter `https://localhost:3000`
7. Click **Register**
8. Note the **Application (client) ID**

### 3. Add API Permissions

1. In your app registration, go to **API permissions**
2. Click **Add a permission** > **Microsoft Graph** > **Delegated permissions**
3. Add:
   - `User.Read`
   - `Calendars.Read`
4. Click **Grant admin consent** (if you're an admin)

### 4. Configure the App

Update `src/services/authConfig.ts`:

```typescript
clientId: 'YOUR_CLIENT_ID', // Replace with your Application ID
```

### 5. Install Dev Certificates

Office Add-ins require HTTPS. Install development certificates:

```bash
npm run certs
```

### 6. Start Development Server

```bash
npm run dev
```

The app will be available at https://localhost:3000

### 7. Sideload the Add-in

#### Option A: Web-based Outlook
1. Go to https://outlook.office.com
2. Open an email
3. Click **...** > **Get Add-ins**
4. Click **My add-ins** > **+ Add a custom add-in** > **Add from file**
5. Upload `manifest.json`

#### Option B: Outlook Desktop (Windows)
1. In Outlook, go to **File** > **Manage Add-ins**
2. Click **+ Add a custom add-in**
3. Select `manifest.json`

## Usage

1. Click the **Calendar Report** button in Outlook's ribbon
2. Sign in with your Microsoft account
3. (Optional) Configure LLM settings for AI analysis
4. Select a date range
5. Choose report options
6. Click **Generate Report**
7. The Excel file will download automatically

## LLM Configuration

To enable AI features:

1. Click the **Settings** (gear) icon
2. Select your LLM provider or choose "Custom"
3. Enter your API Base URL
4. Enter your API Key
5. Enter the Model name
6. Click **Save**

### Example Configurations

**OpenAI:**
- Base URL: `https://api.openai.com/v1`
- Model: `gpt-4o-mini`

**Ollama (Local):**
- Base URL: `http://localhost:11434/v1`
- API Key: (leave empty)
- Model: `llama2`

**Azure OpenAI:**
- Base URL: `https://{resource}.openai.azure.com/openai/deployments/{deployment}`
- Model: `gpt-4`

## Project Structure

```
outlook-agent/
├── manifest.json           # Outlook Add-in manifest (unified format)
├── package.json
├── vite.config.ts
├── index.html
├── src/
│   ├── main.tsx            # Entry point with MSAL setup
│   ├── App.tsx             # Main UI component
│   ├── agents/
│   │   ├── BaseAgent.ts    # Abstract agent with tool calling
│   │   ├── CalendarAgent.ts
│   │   ├── AnalysisAgent.ts
│   │   ├── ReportAgent.ts
│   │   └── AgentOrchestrator.ts
│   ├── components/
│   │   ├── DateRangePicker.tsx
│   │   ├── SettingsPanel.tsx
│   │   └── AgentActivityLog.tsx
│   ├── services/
│   │   ├── authConfig.ts   # MSAL configuration
│   │   ├── graphService.ts # Microsoft Graph API
│   │   ├── llmService.ts   # OpenAI-compatible LLM
│   │   └── excelService.ts # Excel generation
│   ├── types/
│   │   ├── CalendarEvent.ts
│   │   ├── LLMTypes.ts
│   │   └── AgentTypes.ts
│   └── utils/
│       └── domainExtractor.ts
└── assets/
    └── icon-*.png          # Add-in icons
```

## Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run certs` - Install HTTPS certificates

## Technologies

- **React 18** + **TypeScript**
- **Fluent UI React v9** - Microsoft's design system
- **MSAL.js** - Microsoft authentication
- **Microsoft Graph API** - Calendar data
- **SheetJS (xlsx)** - Excel generation
- **Vite** - Build tool

## License

MIT
# outlook-realaization
