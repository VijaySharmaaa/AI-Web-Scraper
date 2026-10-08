import { Bot } from "lucide-react";

import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AUTO } from "@/lib/model-choice";
import type { ModelOption } from "@/types";

interface Props {
  value: string;
  onChange: (model: string) => void;
  options: ModelOption[];
  hidden?: string[];
  disabled?: boolean;
}

export function ModelSelect({ value, onChange, options, hidden = [], disabled }: Props) {
  const current = value === AUTO || options.some((o) => o.model === value) ? value : AUTO;

  const groups = new Map<string, ModelOption[]>();
  for (const option of options) {
    groups.set(option.provider, [...(groups.get(option.provider) ?? []), option]);
  }
  const labelOf = (model: string) => options.find((o) => o.model === model)?.label || model;

  return (
    <Select value={current} onValueChange={onChange} disabled={disabled || options.length === 0}>
      <SelectTrigger
        size="sm"
        aria-label="AI model"
        className="h-8 max-w-[11rem] gap-1.5 border-0 bg-transparent px-2 shadow-none hover:bg-accent focus-visible:ring-[3px] data-[state=open]:bg-accent sm:max-w-[16rem] dark:bg-transparent dark:hover:bg-accent"
      >
        <Bot className="size-4 text-muted-foreground" />
        <SelectValue>
          {current === AUTO ? "Auto" : <span className="truncate">{labelOf(current)}</span>}
        </SelectValue>
      </SelectTrigger>
      <SelectContent align="start">
        <SelectItem value={AUTO}>
          Auto <span className="text-muted-foreground">· best available</span>
        </SelectItem>
        {[...groups.entries()].map(([provider, models]) => (
          <SelectGroup key={provider}>
            <SelectSeparator />
            <SelectLabel>{provider}</SelectLabel>
            {models.map((option) => (
              <SelectItem key={option.model} value={option.model} title={option.model}>
                {option.label || option.model}
              </SelectItem>
            ))}
          </SelectGroup>
        ))}
        {hidden.length > 0 && (
          <>
            <SelectSeparator />
            <p className="max-w-64 px-2 py-1.5 text-xs text-muted-foreground">
              Not available for this API key: {hidden.join(", ")}
            </p>
          </>
        )}
      </SelectContent>
    </Select>
  );
}
