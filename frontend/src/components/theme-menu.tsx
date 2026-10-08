import { Check, Monitor, Moon, Palette, RotateCcw, Sun } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
import { useTheme, type Theme } from "@/hooks/use-theme";
import { BASE_COLORS, DEFAULT_COLOR, type ThemeColor } from "@/lib/themes";
import { cn } from "@/lib/utils";

const MODES: { value: Theme; label: string; icon: typeof Sun }[] = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "system", label: "System", icon: Monitor },
];

interface ColorOption {
  name: ThemeColor;
  label: string;
  swatch: string;
  swatchDark: string;
}

function ColorButton({ name, label, swatch, swatchDark }: ColorOption) {
  const { color, setColor, resolvedTheme } = useTheme();
  const active = color === name;
  const dot = resolvedTheme === "dark" ? swatchDark : swatch;

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={() => setColor(name)}
      aria-pressed={active}
      className={cn("justify-start gap-2 px-2 font-normal", active && "border-primary ring-1 ring-primary")}
    >
      <span
        className="flex size-4 shrink-0 items-center justify-center rounded-full ring-1 ring-foreground/15"
        style={{ backgroundColor: dot }}
        aria-hidden="true"
      >
        {active && <Check className="size-2.5! text-primary-foreground" />}
      </span>
      {label}
    </Button>
  );
}

export function ThemeMenu() {
  const { theme, setTheme, color, setColor } = useTheme();

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Theme settings">
          <Palette />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[20.5rem] max-w-[calc(100vw-2rem)] space-y-4">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="text-sm font-medium">Theme</p>
            <p className="text-xs text-muted-foreground">Pick a mode and a color.</p>
          </div>
          {(color !== DEFAULT_COLOR || theme !== "system") && (
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Reset theme"
              onClick={() => {
                setColor(DEFAULT_COLOR);
                setTheme("system");
              }}
            >
              <RotateCcw />
            </Button>
          )}
        </div>

        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground">Mode</p>
          <div className="grid grid-cols-3 gap-2" role="group" aria-label="Color mode">
            {MODES.map(({ value, label, icon: Icon }) => (
              <Button
                key={value}
                variant="outline"
                size="sm"
                onClick={() => setTheme(value)}
                aria-pressed={theme === value}
                className={cn("font-normal", theme === value && "border-primary ring-1 ring-primary")}
              >
                <Icon />
                {label}
              </Button>
            ))}
          </div>
        </div>

        <Separator />

        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground">Color</p>
          <div className="grid grid-cols-3 gap-2" role="group" aria-label="Color">
            {BASE_COLORS.map((c) => (
              <ColorButton key={c.name} {...c} />
            ))}
          </div>
        </div>

      </PopoverContent>
    </Popover>
  );
}
