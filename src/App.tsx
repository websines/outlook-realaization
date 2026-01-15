import React, { useState, useCallback, useMemo, useEffect } from 'react';
import {
  FluentProvider,
  webLightTheme,
  makeStyles,
  tokens,
  Button,
  Title1,
  Title3,
  Text,
  Card,
  CardHeader,
  Checkbox,
  MessageBar,
  MessageBarBody,
  MessageBarTitle,
  Spinner,
  Field,
  Dropdown,
  Option,
} from '@fluentui/react-components';
import {
  CalendarMonth24Regular,
  ArrowDownload24Regular,
  Person24Regular,
  SignOut24Regular,
  BrainCircuit24Regular,
  People24Regular,
} from '@fluentui/react-icons';
import { useMsal, useIsAuthenticated } from '@azure/msal-react';
import { loginRequest } from './services/authConfig';
import { isLLMConfigured } from './services/llmService';
import { getSharedCalendarOwners } from './services/graphService';
import { AgentOrchestrator } from './agents';
import type { AgentEvent } from './types/AgentTypes';

import { DateRangePicker } from './components/DateRangePicker';
import { SettingsPanel } from './components/SettingsPanel';
import { AgentActivityLog } from './components/AgentActivityLog';

const useStyles = makeStyles({
  root: {
    minHeight: '100vh',
    backgroundColor: '#f5f5f5',
    paddingTop: tokens.spacingVerticalXXL,
    paddingBottom: tokens.spacingVerticalXXL,
  },
  container: {
    maxWidth: '560px',
    margin: '0 auto',
    padding: tokens.spacingHorizontalL,
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: tokens.spacingVerticalXL,
    paddingBottom: tokens.spacingVerticalM,
    borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
  },
  headerLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalM,
  },
  headerIcon: {
    fontSize: '28px',
    color: tokens.colorBrandForeground1,
  },
  headerRight: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalS,
  },
  card: {
    marginBottom: tokens.spacingVerticalM,
    boxShadow: tokens.shadow4,
    borderRadius: tokens.borderRadiusLarge,
  },
  cardContent: {
    padding: tokens.spacingHorizontalL,
    paddingTop: tokens.spacingVerticalS,
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalM,
  },
  options: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalM,
  },
  actions: {
    display: 'flex',
    gap: tokens.spacingHorizontalS,
    marginTop: tokens.spacingVerticalM,
  },
  statusBar: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: tokens.spacingHorizontalM,
    backgroundColor: tokens.colorNeutralBackground1,
    borderRadius: tokens.borderRadiusMedium,
    marginBottom: tokens.spacingVerticalM,
    boxShadow: tokens.shadow2,
  },
  userInfo: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalS,
  },
  llmStatus: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalXS,
    fontSize: tokens.fontSizeBase200,
    padding: `${tokens.spacingVerticalXS} ${tokens.spacingHorizontalS}`,
    borderRadius: tokens.borderRadiusMedium,
  },
  llmConfigured: {
    color: tokens.colorPaletteGreenForeground1,
    backgroundColor: tokens.colorPaletteGreenBackground1,
  },
  llmNotConfigured: {
    color: tokens.colorPaletteRedForeground1,
    backgroundColor: tokens.colorPaletteRedBackground1,
  },
  generateButton: {
    width: '100%',
    height: '44px',
    fontSize: tokens.fontSizeBase400,
  },
  welcomeCard: {
    textAlign: 'center',
    padding: tokens.spacingVerticalXXL,
  },
  welcomeIcon: {
    fontSize: '48px',
    color: tokens.colorBrandForeground1,
    marginBottom: tokens.spacingVerticalM,
  },
  hint: {
    fontSize: tokens.fontSizeBase200,
    color: tokens.colorNeutralForeground3,
    marginTop: tokens.spacingVerticalXS,
  },
});

// Get default date range (last 30 days)
const getDefaultDates = () => {
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - 30);
  return {
    start: start.toISOString().split('T')[0],
    end: end.toISOString().split('T')[0],
  };
};

export const App: React.FC = () => {
  const styles = useStyles();
  const { instance, accounts } = useMsal();
  const isAuthenticated = useIsAuthenticated();

  const defaultDates = useMemo(() => getDefaultDates(), []);
  const [startDate, setStartDate] = useState(defaultDates.start);
  const [endDate, setEndDate] = useState(defaultDates.end);
  const [targetUser, setTargetUser] = useState(''); // Email of user to fetch calendar for
  const [includeAnalysis, setIncludeAnalysis] = useState(true);
  const [includeExecutiveSummary, setIncludeExecutiveSummary] = useState(true);

  const [isLoading, setIsLoading] = useState(false);
  const [events, setEvents] = useState<AgentEvent[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [, setLlmConfigured] = useState(isLLMConfigured());
  const [availableUsers, setAvailableUsers] = useState<{ name: string; email: string }[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);

  // Fetch available shared calendar owners when authenticated
  useEffect(() => {
    if (isAuthenticated) {
      setLoadingUsers(true);
      getSharedCalendarOwners(instance)
        .then(users => {
          setAvailableUsers(users);
        })
        .catch(err => {
          console.error('Failed to fetch shared calendars:', err);
        })
        .finally(() => {
          setLoadingUsers(false);
        });
    }
  }, [isAuthenticated, instance]);

  // Handle login
  const handleLogin = async () => {
    try {
      await instance.loginPopup(loginRequest);
    } catch (err) {
      console.error('Login failed:', err);
      setError('Login failed. Please try again.');
    }
  };

  // Handle logout
  const handleLogout = () => {
    instance.logoutPopup();
  };

  // Handle report generation
  const handleGenerateReport = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    setSuccess(null);
    setEvents([]);

    try {
      const orchestrator = new AgentOrchestrator({
        msalInstance: instance,
        onEvent: (event) => {
          setEvents((prev) => [...prev, event]);
        },
      });

      const result = await orchestrator.generateReport({
        startDate: new Date(startDate),
        endDate: new Date(endDate),
        targetUser: targetUser.trim() || undefined, // Pass target user if provided
        includeAnalysis: includeAnalysis && isLLMConfigured(),
        includeExecutiveSummary: includeExecutiveSummary && isLLMConfigured(),
      });

      if (result.success) {
        setSuccess(`Report generated successfully! File: ${result.filename || 'meeting-report.xlsx'}`);
      } else {
        setError(result.error || 'Failed to generate report');
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  }, [instance, startDate, endDate, includeAnalysis, includeExecutiveSummary]);

  // Settings saved callback
  const handleSettingsSaved = () => {
    setLlmConfigured(isLLMConfigured());
  };

  const account = accounts[0];
  const llmReady = isLLMConfigured();

  return (
    <FluentProvider theme={webLightTheme}>
      <div className={styles.root}>
        <div className={styles.container}>
          {/* Header */}
          <div className={styles.header}>
            <div className={styles.headerLeft}>
              <CalendarMonth24Regular className={styles.headerIcon} />
              <div>
                <Title1>Calendar Report</Title1>
                <Text size={200} style={{ color: '#666' }}>Generate meeting reports with AI</Text>
              </div>
            </div>
            <div className={styles.headerRight}>
              <SettingsPanel onSave={handleSettingsSaved} />
              {isAuthenticated && (
                <Button
                  appearance="subtle"
                  icon={<SignOut24Regular />}
                  onClick={handleLogout}
                  aria-label="Sign out"
                />
              )}
            </div>
          </div>

          {/* Not authenticated */}
          {!isAuthenticated && (
            <Card className={styles.card}>
              <div className={styles.welcomeCard}>
                <CalendarMonth24Regular className={styles.welcomeIcon} />
                <Title3>Welcome to Calendar Report</Title3>
                <Text style={{ display: 'block', marginTop: 8, marginBottom: 24, color: '#666' }}>
                  Generate detailed meeting reports from your Outlook calendar with AI-powered analysis
                </Text>
                <Button
                  appearance="primary"
                  icon={<Person24Regular />}
                  onClick={handleLogin}
                  size="large"
                >
                  Sign in with Microsoft
                </Button>
              </div>
            </Card>
          )}

          {/* Authenticated */}
          {isAuthenticated && (
            <>
              {/* Status Bar */}
              <div className={styles.statusBar}>
                <div className={styles.userInfo}>
                  <Person24Regular />
                  <div>
                    <Text weight="semibold">{account?.name}</Text>
                    <Text size={200} style={{ display: 'block', color: '#666' }}>{account?.username}</Text>
                  </div>
                </div>
                <div className={`${styles.llmStatus} ${llmReady ? styles.llmConfigured : styles.llmNotConfigured}`}>
                  <BrainCircuit24Regular />
                  {llmReady ? 'AI Ready' : 'AI Off'}
                </div>
              </div>

              {/* Target User */}
              <Card className={styles.card}>
                <CardHeader
                  header={<Title3>Target User</Title3>}
                  description="Select whose calendar to generate report for"
                />
                <div className={styles.cardContent}>
                  <Field>
                    <Dropdown
                      placeholder={loadingUsers ? "Loading users..." : "Select user (default: yourself)"}
                      value={targetUser ? availableUsers.find(u => u.email === targetUser)?.name || targetUser : "My Calendar"}
                      selectedOptions={[targetUser || '']}
                      onOptionSelect={(_, data) => setTargetUser(data.optionValue || '')}
                      disabled={isLoading || loadingUsers}
                    >
                      <Option key="" value="" text="My Calendar">
                        <People24Regular style={{ marginRight: 8 }} />
                        My Calendar (myself)
                      </Option>
                      {availableUsers.map(user => (
                        <Option key={user.email} value={user.email} text={user.name}>
                          <People24Regular style={{ marginRight: 8 }} />
                          {user.name} ({user.email})
                        </Option>
                      ))}
                    </Dropdown>
                  </Field>
                  {availableUsers.length === 0 && !loadingUsers && (
                    <Text size={200} style={{ color: '#666' }}>
                      No shared calendars found. Ask others to share their calendar with you.
                    </Text>
                  )}
                </div>
              </Card>

              {/* Date Range */}
              <Card className={styles.card}>
                <CardHeader header={<Title3>Date Range</Title3>} />
                <div className={styles.cardContent}>
                  <DateRangePicker
                    startDate={startDate}
                    endDate={endDate}
                    onStartDateChange={setStartDate}
                    onEndDateChange={setEndDate}
                    disabled={isLoading}
                  />
                </div>
              </Card>

              {/* Options */}
              <Card className={styles.card}>
                <CardHeader header={<Title3>Report Options</Title3>} />
                <div className={styles.cardContent}>
                  <div className={styles.options}>
                    <Checkbox
                      checked={includeAnalysis}
                      onChange={(_, data) => setIncludeAnalysis(data.checked === true)}
                      label="Include AI analysis (summaries, categories, action items)"
                      disabled={isLoading || !llmReady}
                    />
                    <Checkbox
                      checked={includeExecutiveSummary}
                      onChange={(_, data) => setIncludeExecutiveSummary(data.checked === true)}
                      label="Include executive summary"
                      disabled={isLoading || !llmReady || !includeAnalysis}
                    />
                  </div>

                  <Button
                    appearance="primary"
                    icon={isLoading ? <Spinner size="tiny" /> : <ArrowDownload24Regular />}
                    onClick={handleGenerateReport}
                    disabled={isLoading}
                    className={styles.generateButton}
                  >
                    {isLoading ? 'Generating Report...' : 'Generate Report'}
                  </Button>
                </div>
              </Card>

              {/* Agent Activity */}
              {(events.length > 0 || isLoading) && (
                <Card className={styles.card}>
                  <CardHeader header={<Title3>Agent Activity</Title3>} />
                  <div className={styles.cardContent}>
                    <AgentActivityLog events={events} isRunning={isLoading} />
                  </div>
                </Card>
              )}

              {/* Messages */}
              {error && (
                <MessageBar intent="error" style={{ marginTop: tokens.spacingVerticalM }}>
                  <MessageBarBody>
                    <MessageBarTitle>Error</MessageBarTitle>
                    {error}
                  </MessageBarBody>
                </MessageBar>
              )}

              {success && (
                <MessageBar intent="success" style={{ marginTop: tokens.spacingVerticalM }}>
                  <MessageBarBody>
                    <MessageBarTitle>Success</MessageBarTitle>
                    {success}
                  </MessageBarBody>
                </MessageBar>
              )}
            </>
          )}
        </div>
      </div>
    </FluentProvider>
  );
};

export default App;
