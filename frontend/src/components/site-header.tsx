import { ThemeMenu } from "@/components/theme-menu";
import { config } from "@/config";
import { Button } from "@/components/ui/button";

export function Logo({ className = "size-8" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true">
      <rect width="32" height="32" rx="8" className="fill-primary" />
      <path d="M9 11h14M9 16h10M9 21h7" className="stroke-primary-foreground" strokeWidth="2.5" strokeLinecap="round" />
      <circle cx="23" cy="21" r="2.5" className="fill-primary-foreground/60" />
    </svg>
  );
}

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <a href="/" className="flex items-center gap-2.5 font-semibold tracking-tight" aria-label={`${config.appName} home`}>
          <Logo className="size-7" />
          <span>{config.appName}</span>
        </a>
        <div className="flex items-center gap-1">
          {config.sourceUrl && (
            <Button variant="ghost" size="icon" asChild>
              <a
                href={config.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Source code on GitHub"
              >
                <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <path d="M12 .5a11.5 11.5 0 0 0-3.64 22.41c.58.1.79-.25.79-.56v-2c-3.2.7-3.88-1.37-3.88-1.37-.52-1.33-1.28-1.69-1.28-1.69-1.05-.71.08-.7.08-.7 1.16.08 1.77 1.19 1.77 1.19 1.03 1.77 2.7 1.26 3.36.96.1-.75.4-1.26.73-1.55-2.55-.29-5.24-1.28-5.24-5.68 0-1.25.45-2.28 1.19-3.08-.12-.29-.52-1.46.11-3.04 0 0 .97-.31 3.17 1.18a11 11 0 0 1 5.77 0c2.2-1.49 3.17-1.18 3.17-1.18.63 1.58.23 2.75.11 3.04.74.8 1.19 1.83 1.19 3.08 0 4.41-2.69 5.38-5.26 5.67.41.36.78 1.06.78 2.14v3.17c0 .31.21.67.8.56A11.5 11.5 0 0 0 12 .5Z" />
                </svg>
              </a>
            </Button>
          )}
          <ThemeMenu />
        </div>
      </div>
    </header>
  );
}
