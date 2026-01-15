import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTrigger,
  DialogSurface,
  DialogTitle,
  DialogBody,
  DialogActions,
  DialogContent,
  Button,
  Field,
  Input,
  Select,
  makeStyles,
  tokens,
} from '@fluentui/react-components';
import { Settings24Regular } from '@fluentui/react-icons';
import { configureLLM, getLLMConfig, isLLMConfigured } from '../services/llmService';

const useStyles = makeStyles({
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalM,
  },
  presetInfo: {
    fontSize: tokens.fontSizeBase200,
    color: tokens.colorNeutralForeground3,
    marginTop: tokens.spacingVerticalXS,
  },
});

// Preset configurations for common providers
const PRESETS = {
  openai: {
    baseUrl: 'https://api.openai.com/v1',
    model: 'gpt-4o-mini',
  },
  'azure-openai': {
    baseUrl: 'https://{resource}.openai.azure.com/openai/deployments/{deployment}',
    model: 'gpt-4',
  },
  ollama: {
    baseUrl: 'http://localhost:11434/v1',
    model: 'llama2',
  },
  openrouter: {
    baseUrl: 'https://openrouter.ai/api/v1',
    model: 'openai/gpt-4o-mini',
  },
  'lm-studio': {
    baseUrl: 'http://localhost:1234/v1',
    model: 'local-model',
  },
  'lm-studio-remote': {
    baseUrl: 'https://lmstudio.subh-dev.xyz/llm/v1',
    model: 'cpatonn/Qwen3-VL-30B-A3B-Thinking-AWQ-4bit',
  },
  together: {
    baseUrl: 'https://api.together.xyz/v1',
    model: 'meta-llama/Llama-3-70b-chat-hf',
  },
  custom: {
    baseUrl: '',
    model: '',
  },
};

interface SettingsPanelProps {
  onSave?: () => void;
}

export const SettingsPanel: React.FC<SettingsPanelProps> = ({ onSave }) => {
  const styles = useStyles();
  const [open, setOpen] = useState(false);
  const [preset, setPreset] = useState<string>('openai');
  const [baseUrl, setBaseUrl] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [model, setModel] = useState('');

  // Load existing config on mount
  useEffect(() => {
    const config = getLLMConfig();
    setBaseUrl(config.baseUrl);
    setApiKey(config.apiKey);
    setModel(config.model);
  }, [open]);

  const handlePresetChange = (value: string) => {
    setPreset(value);
    const presetConfig = PRESETS[value as keyof typeof PRESETS];
    if (presetConfig && value !== 'custom') {
      setBaseUrl(presetConfig.baseUrl);
      setModel(presetConfig.model);
    }
  };

  const handleSave = () => {
    configureLLM({
      baseUrl,
      apiKey,
      model,
    });
    setOpen(false);
    onSave?.();
  };

  return (
    <Dialog open={open} onOpenChange={(_, data) => setOpen(data.open)}>
      <DialogTrigger disableButtonEnhancement>
        <Button
          appearance="subtle"
          icon={<Settings24Regular />}
          aria-label="Settings"
        />
      </DialogTrigger>
      <DialogSurface>
        <DialogBody>
          <DialogTitle>LLM Settings</DialogTitle>
          <DialogContent>
            <div className={styles.form}>
              <Field label="Provider Preset">
                <Select
                  value={preset}
                  onChange={(_, data) => handlePresetChange(data.value)}
                >
                  <option value="openai">OpenAI</option>
                  <option value="azure-openai">Azure OpenAI</option>
                  <option value="ollama">Ollama (Local)</option>
                  <option value="openrouter">OpenRouter</option>
                  <option value="lm-studio">LM Studio (Local)</option>
                  <option value="lm-studio-remote">LM Studio (Remote)</option>
                  <option value="together">Together AI</option>
                  <option value="custom">Custom</option>
                </Select>
              </Field>

              <Field label="API Base URL">
                <Input
                  value={baseUrl}
                  onChange={(e) => setBaseUrl(e.target.value)}
                  placeholder="https://api.openai.com/v1"
                />
                <div className={styles.presetInfo}>
                  {preset === 'azure-openai' &&
                    'Replace {resource} and {deployment} with your values'}
                  {preset === 'ollama' && 'Make sure Ollama is running locally'}
                  {preset === 'lm-studio-remote' && 'Using remote LM Studio server'}
                </div>
              </Field>

              <Field label="API Key">
                <Input
                  type="password"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="sk-..."
                />
                <div className={styles.presetInfo}>
                  {(preset === 'ollama' || preset === 'lm-studio' || preset === 'lm-studio-remote') &&
                    'Leave empty for local/self-hosted endpoints'}
                </div>
              </Field>

              <Field label="Model">
                <Input
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                  placeholder="gpt-4o-mini"
                />
              </Field>

              {isLLMConfigured() && (
                <div className={styles.presetInfo}>
                  ✓ LLM is configured
                </div>
              )}
            </div>
          </DialogContent>
          <DialogActions>
            <DialogTrigger disableButtonEnhancement>
              <Button appearance="secondary">Cancel</Button>
            </DialogTrigger>
            <Button appearance="primary" onClick={handleSave}>
              Save
            </Button>
          </DialogActions>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  );
};
