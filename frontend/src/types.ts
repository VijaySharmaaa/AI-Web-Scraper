export interface SummaryResponse {
  title: string;
  url: string;
  summary: string;
  model: string;
  char_count: number;
  truncated: boolean;
  took_seconds: number;
}

export interface ErrorResponse {
  error: string;
}
