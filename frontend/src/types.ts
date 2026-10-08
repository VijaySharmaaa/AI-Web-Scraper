export interface FailedAttempt {
  provider: string;
  model: string;
  error: string;
}

export interface SummaryResponse {
  title: string;
  requested_model?: string | null;
  url: string;
  summary: string;
  provider: string;
  model: string;
  model_label?: string;
  failed_attempts: FailedAttempt[];
  char_count: number;
  word_count: number;
  truncated: boolean;
  took_seconds: number;
  usage?: Usage | null;
}

export interface HealthResponse {
  status: string;
  ai_ready: boolean;
  providers: string[];
  models: string[];
  model_options?: ModelOption[];
  hidden_models?: string[];
  usage?: Usage | null;
  limits?: { max_url_length: number; summaries_per_day: number | null };
  examples?: ExampleLink[];
}

export interface Usage {
  limit: number;
  used: number;
  remaining: number;
  resets_at: string;
}

export interface ExampleLink {
  label: string;
  url: string;
}

export interface ModelOption {
  provider: string;
  model: string;
  label?: string;
}

export interface HistoryItem extends SummaryResponse {
  id: string;
  created_at: number;
}
