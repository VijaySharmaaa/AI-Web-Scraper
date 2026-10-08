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
  disabled?: boolean;
}

export function ModelSelect({ value, onChange, options, disabled }: Props) {
  // never show a model the server doesn't offer (e.g. an old saved choice)
  const current = value === AUTO || options.some((o) => o.model === value) ? value : AUTO;

  // group the models by provider, keeping the server's order
  const groups = new Map<string, string[]>();
  for (const { provider, model } of options) {
    groups.set(provider, [...(groups.get(provider) ?? []), model]);
  }

  return (
    <div className="flex min-w-0 items-center gap-2">
      <label htmlFor="model-select" className="flex shrink-0 items-center gap-1.5 text-sm text-muted-foreground">
        <Bot className="size-4" />
        Model
      </label>
      <Select value={current} onValueChange={onChange} disabled={disabled || options.length === 0}>
        <SelectTrigger id="model-select" size="sm" className="min-w-0 max-w-[16rem]" aria-label="AI model">
          {/* render the label ourselves, radix only knows it once the list has been opened */}
          <SelectValue>
            {current === AUTO ? "Auto" : <span className="truncate font-mono text-xs">{current}</span>}
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
              {models.map((model) => (
                <SelectItem key={model} value={model}>
                  <span className="font-mono text-xs">{model}</span>
                </SelectItem>
              ))}
            </SelectGroup>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
