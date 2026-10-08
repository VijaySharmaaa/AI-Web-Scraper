export interface FailedAttempt {
  provider: string;
  model: string;
  error: string;
}

export interface SummaryResponse {
  title: string;
  url: string;
  summary: string;
  provider: string;
  model: string;
  failed_attempts: FailedAttempt[];
  char_count: number;
  word_count: number;
  truncated: boolean;
  took_seconds: number;
}

export interface HealthResponse {
  status: string;
  ai_ready: boolean;
  providers: string[];
  models: string[];
}

export interface HistoryItem extends SummaryResponse {
  id: string;
  created_at: number;
}
