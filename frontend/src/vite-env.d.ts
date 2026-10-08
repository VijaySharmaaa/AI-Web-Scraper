/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_APP_NAME?: string;
  readonly VITE_API_URL?: string;
  readonly VITE_SOURCE_URL?: string;
  readonly VITE_REQUEST_TIMEOUT_MS?: string;
  readonly VITE_HISTORY_LIMIT?: string;
  readonly VITE_MAX_URL_LENGTH?: string;
  readonly VITE_LOADING_FETCH_SECONDS?: string;
  readonly VITE_LOADING_EXTRACT_SECONDS?: string;
  readonly VITE_LOADING_SLOW_SECONDS?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
