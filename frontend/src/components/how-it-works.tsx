import { Bot, FileText, Link2, Sparkles } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import type { ModelOption } from "@/types";

const STEPS = [
  { icon: Link2, title: "Paste a link", text: "Any article, blog post, docs or Wikipedia page." },
  { icon: FileText, title: "We read the page", text: "The main text is pulled out, menus and ads are skipped." },
  { icon: Sparkles, title: "AI sums it up", text: "You get a short overview and the key points in a few seconds." },
];

interface Props {
  models?: ModelOption[];
}

export function HowItWorks({ models = [] }: Props) {
  return (
    <Card className="gap-4 py-5">
      <CardHeader className="px-5">
        <CardTitle className="text-sm">How it works</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 px-5">
        <ol className="space-y-3">
          {STEPS.map(({ icon: Icon, title, text }) => (
            <li key={title} className="flex gap-3">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-md border bg-muted/50">
                <Icon className="size-4 text-muted-foreground" />
              </span>
              <div className="min-w-0 text-sm">
                <p className="font-medium">{title}</p>
                <p className="text-muted-foreground">{text}</p>
              </div>
            </li>
          ))}
        </ol>

        {models.length > 0 && (
          <>
            <Separator />
            <div className="space-y-2 text-sm">
              <p className="flex items-center gap-2 font-medium">
                <Bot className="size-4 text-muted-foreground" />
                AI models
              </p>
              <p className="text-xs text-muted-foreground">
                Tried in this order. If one is busy, the next one answers.
              </p>
              <ol className="space-y-1">
                {models.map(({ model, label }, i) => (
                  <li key={model} className="flex items-center gap-2 text-xs" title={model}>
                    <span className="flex size-5 shrink-0 items-center justify-center rounded-full border text-[10px] tabular-nums text-muted-foreground">
                      {i + 1}
                    </span>
                    <span className="truncate">{label || model}</span>
                  </li>
                ))}
              </ol>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
