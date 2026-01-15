/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_AZURE_CLIENT_ID: string;
  readonly VITE_LLM_BASE_URL: string;
  readonly VITE_LLM_MODEL: string;
  readonly VITE_LLM_API_KEY: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
