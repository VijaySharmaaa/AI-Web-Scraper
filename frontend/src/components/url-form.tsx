import { useState, type FormEvent, type RefObject } from "react";
import { ClipboardPaste, Link2, Sparkles, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ModelSelect } from "@/components/model-select";
import { UsageRing } from "@/components/usage-ring";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { checkUrl } from "@/lib/url";
import { cn } from "@/lib/utils";
import type { ExampleLink, ModelOption, UnavailableModel, Usage } from "@/types";

interface Props {
  value: string;
  onChange: (value: string) => void;
  onSubmit: (url: string) => void;
  loading: boolean;
  blockedReason?: string;
  inputRef: RefObject<HTMLInputElement | null>;
  showExamples: boolean;
  model: string;
  onModelChange: (model: string) => void;
  modelOptions: ModelOption[];
  unavailableModels?: UnavailableModel[];
  examples: ExampleLink[];
  maxUrlLength?: number;
  usage?: Usage | null;
}

export function UrlForm({
  value,
  onChange,
  onSubmit,
  loading,
  blockedReason,
  inputRef,
  showExamples,
  model,
  onModelChange,
  modelOptions,
  unavailableModels,
  examples,
  maxUrlLength,
  usage,
}: Props) {
  const [touched, setTouched] = useState(false);
  const check = checkUrl(value, maxUrlLength);
  const showError = touched && !check.ok && value.trim() !== "";
  const canPaste = typeof navigator !== "undefined" && !!navigator.clipboard?.readText;

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setTouched(true);
    if (loading || blockedReason) return;
    if (!check.ok) {
      inputRef.current?.focus();
      return;
    }
    onSubmit(check.url);
  }

  async function pasteFromClipboard() {
    try {
      const text = (await navigator.clipboard.readText()).trim();
      if (text) {
        onChange(text);
        setTouched(true);
      }
    } catch (err) {
      console.warn("clipboard read failed", err);
    }
    inputRef.current?.focus();
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-3">
      <div
        className={cn(
          "rounded-xl border bg-card shadow-xs transition-[border-color,box-shadow] focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/50",
          showError && "border-destructive focus-within:border-destructive focus-within:ring-destructive/20",
          loading && "opacity-90"
        )}
      >
        <div className="relative flex items-center">
          <Link2 className="pointer-events-none absolute left-3.5 size-4 text-muted-foreground" />
          <Input
            ref={inputRef}
            type="url"
            inputMode="url"
            autoComplete="url"
            spellCheck={false}
            placeholder="Paste a link, e.g. https://example.com/article"
            value={value}
            onChange={(e) => {
              onChange(e.target.value);
              if (!e.target.value) setTouched(false);
            }}
            onBlur={() => value.trim() && setTouched(true)}
            disabled={loading}
            aria-label="Web page URL"
            aria-invalid={showError || undefined}
            aria-describedby={showError ? "url-error" : "url-help"}
            className="h-12 rounded-xl border-0 bg-transparent pr-20 pl-10 text-base shadow-none focus-visible:ring-0 aria-invalid:ring-0 md:text-sm dark:bg-transparent"
            maxLength={maxUrlLength}
          />
          <div className="absolute right-2 flex items-center gap-0.5">
            {value && !loading && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    hover="danger"
                    size="icon-sm"
                    onClick={() => {
                      onChange("");
                      setTouched(false);
                      inputRef.current?.focus();
                    }}
                    aria-label="Clear URL"
                  >
                    <X />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Clear</TooltipContent>
              </Tooltip>
            )}
            {canPaste && !loading && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    hover="info"
                    size="icon-sm"
                    onClick={pasteFromClipboard}
                    aria-label="Paste from clipboard"
                  >
                    <ClipboardPaste />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Paste</TooltipContent>
              </Tooltip>
            )}
          </div>
        </div>

        <div className="flex items-center justify-between gap-2 px-2 pb-2">
          <div className="flex min-w-0 items-center gap-0.5">
            {modelOptions.length > 0 && (
              <ModelSelect
                value={model}
                onChange={onModelChange}
                options={modelOptions}
                unavailable={unavailableModels}
                disabled={loading}
              />
            )}
            {usage && <UsageRing usage={usage} />}
          </div>
          <Button
            type="submit"
            hover="success"
            className="shrink-0 rounded-lg"
            disabled={loading || !!blockedReason || !value.trim()}
          >
            {loading ? <Spinner aria-hidden="true" role="presentation" /> : <Sparkles />}
            {loading ? "Summarizing…" : "Summarize"}
          </Button>
        </div>
      </div>

      <p
        id={showError ? "url-error" : "url-help"}
        className={cn("min-h-5 text-sm", showError ? "text-destructive" : "text-muted-foreground")}
        aria-live="polite"
      >
        {showError && !check.ok
          ? check.message
          : blockedReason ?? (
              <>
                Works best with articles, blog posts and docs.{" "}
                <span className="hidden sm:inline">
                  Press <kbd className="rounded border bg-muted px-1 font-mono text-xs">Enter</kbd> to summarize.
                </span>
              </>
            )}
      </p>

      {showExamples && examples.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-muted-foreground">Try:</span>
          {examples.map((ex) => (
            <Button
              key={ex.url}
              type="button"
              variant="outline"
              hover="info"
              size="sm"
              className="h-7 rounded-full px-3 text-xs font-normal"
              onClick={() => {
                onChange(ex.url);
                setTouched(false);
                inputRef.current?.focus();
              }}
            >
              {ex.label}
            </Button>
          ))}
        </div>
      )}
    </form>
  );
}
