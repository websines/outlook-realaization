import React, { useRef, useEffect } from 'react';
import {
  makeStyles,
  tokens,
  Spinner,
  Text,
} from '@fluentui/react-components';
import {
  Checkmark16Regular,
  Dismiss16Regular,
  Wrench16Regular,
  Bot16Regular,
} from '@fluentui/react-icons';
import type { AgentEvent } from '../types/AgentTypes';

const useStyles = makeStyles({
  container: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalXS,
    maxHeight: '300px',
    overflowY: 'auto',
    padding: tokens.spacingHorizontalS,
    backgroundColor: tokens.colorNeutralBackground2,
    borderRadius: tokens.borderRadiusMedium,
    fontFamily: 'monospace',
    fontSize: tokens.fontSizeBase200,
  },
  entry: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: tokens.spacingHorizontalS,
  },
  icon: {
    flexShrink: 0,
    marginTop: '2px',
  },
  thinking: {
    color: tokens.colorNeutralForeground3,
  },
  toolCall: {
    color: tokens.colorBrandForeground1,
  },
  toolResult: {
    color: tokens.colorPaletteGreenForeground1,
  },
  error: {
    color: tokens.colorPaletteRedForeground1,
  },
  complete: {
    color: tokens.colorPaletteGreenForeground1,
  },
  timestamp: {
    color: tokens.colorNeutralForeground4,
    fontSize: tokens.fontSizeBase100,
  },
  agent: {
    fontWeight: tokens.fontWeightSemibold,
    color: tokens.colorBrandForeground1,
  },
  message: {
    flex: 1,
  },
});

interface AgentActivityLogProps {
  events: AgentEvent[];
  isRunning?: boolean;
}

export const AgentActivityLog: React.FC<AgentActivityLogProps> = ({
  events,
  isRunning = false,
}) => {
  const styles = useStyles();
  const containerRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom on new events
  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [events]);

  const getIcon = (type: AgentEvent['type']) => {
    switch (type) {
      case 'thinking':
        return <Spinner size="tiny" />;
      case 'tool_call':
        return <Wrench16Regular className={styles.icon} />;
      case 'tool_result':
        return <Checkmark16Regular className={styles.icon} />;
      case 'error':
        return <Dismiss16Regular className={styles.icon} />;
      case 'complete':
        return <Checkmark16Regular className={styles.icon} />;
      default:
        return <Bot16Regular className={styles.icon} />;
    }
  };

  const getStyle = (type: AgentEvent['type']) => {
    switch (type) {
      case 'thinking':
        return styles.thinking;
      case 'tool_call':
        return styles.toolCall;
      case 'tool_result':
        return styles.toolResult;
      case 'error':
        return styles.error;
      case 'complete':
        return styles.complete;
      default:
        return '';
    }
  };

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString('en-US', {
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  };

  if (events.length === 0 && !isRunning) {
    return null;
  }

  return (
    <div ref={containerRef} className={styles.container}>
      {events.map((event, index) => (
        <div key={index} className={`${styles.entry} ${getStyle(event.type)}`}>
          {getIcon(event.type)}
          <span className={styles.timestamp}>[{formatTime(event.timestamp)}]</span>
          <span className={styles.agent}>{event.agent}:</span>
          <span className={styles.message}>{event.message}</span>
        </div>
      ))}
      {isRunning && events.length === 0 && (
        <div className={styles.entry}>
          <Spinner size="tiny" />
          <Text>Starting...</Text>
        </div>
      )}
    </div>
  );
};
