export type ContentKind = "html" | "pdf" | "docx" | "image" | "json" | "xml" | "csv" | "text";

export interface SummaryResponse {
  title: string;
  kind?: ContentKind;
  requested_model?: string | null;
  url: string;
  summary: string;
  provider: string;
  model: string;
  model_label?: string;
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
  unavailable_models?: UnavailableModel[];
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

export interface UnavailableModel extends ModelOption {
  reason: string;
}

export interface HistoryItem extends SummaryResponse {
  id: string;
  created_at: number;
}

export type Progress =
  | { type: "step"; step: "fetching" | "rendering" | "reading"; title?: string; kind?: ContentKind }
  | { type: "model"; provider: string; model: string; label: string }
  | { type: "model_switch"; from_label: string; reason: string; provider: string; model: string; label: string };
