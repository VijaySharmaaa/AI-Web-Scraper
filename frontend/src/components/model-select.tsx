import { Bot, Lock } from "lucide-react";

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
import type { ModelOption, UnavailableModel } from "@/types";

interface Props {
  value: string;
  onChange: (model: string) => void;
  options: ModelOption[];
  unavailable?: UnavailableModel[];
  disabled?: boolean;
}

export function ModelSelect({ value, onChange, options, unavailable = [], disabled }: Props) {
  const current = value === AUTO || options.some((o) => o.model === value) ? value : AUTO;

  const groups = new Map<string, { usable: ModelOption[]; locked: UnavailableModel[] }>();
  const groupFor = (provider: string) => {
    if (!groups.has(provider)) groups.set(provider, { usable: [], locked: [] });
    return groups.get(provider)!;
  };
  for (const option of options) groupFor(option.provider).usable.push(option);
  for (const option of unavailable) groupFor(option.provider).locked.push(option);
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
        {[...groups.entries()].map(([provider, { usable, locked }]) => (
          <SelectGroup key={provider}>
            <SelectSeparator />
            <SelectLabel>{provider}</SelectLabel>
            {usable.map((option) => (
              <SelectItem key={option.model} value={option.model} title={option.model}>
                {option.label || option.model}
              </SelectItem>
            ))}
            {locked.map((option) => (
              <SelectItem
                key={option.model}
                value={`unavailable:${option.model}`}
                disabled
                title={`${option.model}: ${option.reason}`}
              >
                <Lock className="size-3.5" />
                {option.label || option.model}
                <span className="text-xs text-muted-foreground">· {option.reason}</span>
              </SelectItem>
            ))}
          </SelectGroup>
        ))}
      </SelectContent>
    </Select>
  );
}
