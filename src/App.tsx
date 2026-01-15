import React, { useState, useCallback, useMemo, useEffect } from 'react';
import {
  FluentProvider,
  webLightTheme,
  makeStyles,
  tokens,
  Button,
  Text,
  Card,
  Checkbox,
  MessageBar,
  MessageBarBody,
  Spinner,
  Dropdown,
  Option,
} from '@fluentui/react-components';
import {
  CalendarMonth24Regular,
  ArrowDownload24Regular,
  Person24Regular,
  SignOut24Regular,
  BrainCircuit24Regular,
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
    backgroundColor: tokens.colorNeutralBackground2,
    padding: tokens.spacingVerticalM,
  },
  container: {
    width: '100%',
    maxWidth: '100%',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: tokens.spacingVerticalM,
    paddingBottom: tokens.spacingVerticalS,
    borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
  },
  headerLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalS,
  },
  headerIcon: {
    fontSize: '20px',
    color: tokens.colorBrandForeground1,
  },
  headerRight: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalXS,
  },
  section: {
    marginBottom: tokens.spacingVerticalM,
  },
  sectionTitle: {
    fontSize: tokens.fontSizeBase300,
    fontWeight: tokens.fontWeightSemibold,
    marginBottom: tokens.spacingVerticalS,
    color: tokens.colorNeutralForeground1,
  },
  card: {
    marginBottom: tokens.spacingVerticalS,
    boxShadow: tokens.shadow2,
    borderRadius: tokens.borderRadiusMedium,
  },
  cardContent: {
    padding: tokens.spacingHorizontalM,
    paddingTop: tokens.spacingVerticalXS,
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalS,
  },
  options: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalS,
  },
  actions: {
    display: 'flex',
    gap: tokens.spacingHorizontalS,
    marginTop: tokens.spacingVerticalS,
  },
  statusBar: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: tokens.spacingHorizontalS,
    backgroundColor: tokens.colorNeutralBackground1,
    borderRadius: tokens.borderRadiusMedium,
    marginBottom: tokens.spacingVerticalM,
    boxShadow: tokens.shadow2,
  },
  userInfo: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalXS,
    overflow: 'hidden',
    flex: 1,
    minWidth: 0,
  },
  userText: {
    overflow: 'hidden',
    minWidth: 0,
  },
  userName: {
    display: 'block',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  userEmail: {
    display: 'block',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    color: tokens.colorNeutralForeground3,
  },
  llmStatus: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalXXS,
    fontSize: tokens.fontSizeBase100,
    padding: `2px ${tokens.spacingHorizontalXS}`,
    borderRadius: tokens.borderRadiusMedium,
    flexShrink: 0,
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
    height: '40px',
  },
  welcomeCard: {
    textAlign: 'center',
    padding: tokens.spacingVerticalL,
  },
  welcomeIcon: {
    fontSize: '36px',
    color: tokens.colorBrandForeground1,
    marginBottom: tokens.spacingVerticalS,
  },
  hint: {
    fontSize: tokens.fontSizeBase200,
    color: tokens.colorNeutralForeground3,
    marginTop: tokens.spacingVerticalXS,
  },
  compactField: {
    marginBottom: tokens.spacingVerticalXS,
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
              <Text weight="semibold" size={400}>Calendar Report</Text>
            </div>
            <div className={styles.headerRight}>
              <SettingsPanel onSave={handleSettingsSaved} />
              {isAuthenticated && (
                <Button
                  appearance="subtle"
                  icon={<SignOut24Regular />}
                  onClick={handleLogout}
                  size="small"
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
                <Text weight="semibold" size={400} block>Welcome</Text>
                <Text size={200} style={{ display: 'block', marginTop: 4, marginBottom: 16, color: '#666' }}>
                  Generate meeting reports with AI analysis
                </Text>
                <Button
                  appearance="primary"
                  icon={<Person24Regular />}
                  onClick={handleLogin}
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
                  <Person24Regular style={{ flexShrink: 0 }} />
                  <div className={styles.userText}>
                    <Text weight="semibold" size={200} className={styles.userName}>{account?.name}</Text>
                    <Text size={100} className={styles.userEmail}>{account?.username}</Text>
                  </div>
                </div>
                <div className={`${styles.llmStatus} ${llmReady ? styles.llmConfigured : styles.llmNotConfigured}`}>
                  <BrainCircuit24Regular style={{ fontSize: '14px' }} />
                  <span>{llmReady ? 'AI' : 'Off'}</span>
                </div>
              </div>

              {/* Target User */}
              <div className={styles.section}>
                <Text className={styles.sectionTitle}>Calendar</Text>
                <Dropdown
                  placeholder={loadingUsers ? "Loading..." : "Select calendar"}
                  value={targetUser ? availableUsers.find(u => u.email === targetUser)?.name || targetUser : "My Calendar"}
                  selectedOptions={[targetUser || '']}
                  onOptionSelect={(_, data) => setTargetUser(data.optionValue || '')}
                  disabled={isLoading || loadingUsers}
                  size="small"
                  style={{ width: '100%' }}
                >
                  <Option key="" value="" text="My Calendar">
                    My Calendar
                  </Option>
                  {availableUsers.map(user => (
                    <Option key={user.email} value={user.email} text={user.name}>
                      {user.name}
                    </Option>
                  ))}
                </Dropdown>
                {availableUsers.length === 0 && !loadingUsers && (
                  <Text size={100} style={{ color: '#888', marginTop: 4, display: 'block' }}>
                    No shared calendars found
                  </Text>
                )}
              </div>

              {/* Date Range */}
              <div className={styles.section}>
                <Text className={styles.sectionTitle}>Date Range</Text>
                <DateRangePicker
                  startDate={startDate}
                  endDate={endDate}
                  onStartDateChange={setStartDate}
                  onEndDateChange={setEndDate}
                  disabled={isLoading}
                />
              </div>

              {/* Options */}
              <div className={styles.section}>
                <Text className={styles.sectionTitle}>Options</Text>
                <div className={styles.options}>
                  <Checkbox
                    checked={includeAnalysis}
                    onChange={(_, data) => setIncludeAnalysis(data.checked === true)}
                    label="AI analysis"
                    disabled={isLoading || !llmReady}
                  />
                  <Checkbox
                    checked={includeExecutiveSummary}
                    onChange={(_, data) => setIncludeExecutiveSummary(data.checked === true)}
                    label="Executive summary"
                    disabled={isLoading || !llmReady || !includeAnalysis}
                  />
                </div>
              </div>

              {/* Generate Button */}
              <Button
                appearance="primary"
                icon={isLoading ? <Spinner size="tiny" /> : <ArrowDownload24Regular />}
                onClick={handleGenerateReport}
                disabled={isLoading}
                className={styles.generateButton}
              >
                {isLoading ? 'Generating...' : 'Generate Report'}
              </Button>

              {/* Agent Activity */}
              {(events.length > 0 || isLoading) && (
                <div className={styles.section} style={{ marginTop: tokens.spacingVerticalM }}>
                  <Text className={styles.sectionTitle}>Activity</Text>
                  <AgentActivityLog events={events} isRunning={isLoading} />
                </div>
              )}

              {/* Messages */}
              {error && (
                <MessageBar intent="error" style={{ marginTop: tokens.spacingVerticalS }}>
                  <MessageBarBody>
                    <Text size={200}>{error}</Text>
                  </MessageBarBody>
                </MessageBar>
              )}

              {success && (
                <MessageBar intent="success" style={{ marginTop: tokens.spacingVerticalS }}>
                  <MessageBarBody>
                    <Text size={200}>{success}</Text>
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
