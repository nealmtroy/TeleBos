"use client";

import { useThemeStore, type Theme } from "@/store/theme-store";
import { useT } from "@/lib/i18n";
import { Sun, Moon, Monitor, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";

interface ThemeToggleProps {
  className?: string;
  variant?: "navbar" | "compact" | "segmented";
}

export function ThemeToggle({ className, variant = "navbar" }: ThemeToggleProps) {
  const { theme, resolvedTheme, setTheme } = useThemeStore();
  const _ = useT();

  const themeOptions: { key: Theme; label: string; icon: typeof Sun }[] = [
    { key: "light", label: _("theme.light") || "Light", icon: Sun },
    { key: "dark", label: _("theme.dark") || "Dark", icon: Moon },
    { key: "system", label: _("theme.system") || "System", icon: Monitor },
  ];

  if (variant === "segmented") {
    return (
      <div className={cn("flex items-center gap-1 p-1 bg-muted border border-border rounded-xl", className)}>
        {themeOptions.map(({ key, label, icon: Icon }) => {
          const isActive = theme === key;
          return (
            <button
              key={key}
              type="button"
              onClick={() => setTheme(key)}
              className={cn(
                "flex-1 flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-lg text-xs font-medium transition-all duration-150 cursor-pointer",
                isActive
                  ? "bg-background text-foreground shadow-xs font-semibold"
                  : "text-muted-foreground hover:text-foreground hover:bg-background/50"
              )}
            >
              <Icon className="h-3.5 w-3.5 shrink-0" />
              <span>{label}</span>
            </button>
          );
        })}
      </div>
    );
  }

  return (
    <div className={className}>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label={_("theme.toggleTheme") || "Toggle theme"}
            className={cn(
              "relative flex h-9 w-9 items-center justify-center rounded-lg transition-colors cursor-pointer",
              "text-muted-foreground hover:bg-muted hover:text-foreground",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            )}
            title={_("theme.title") || "Theme"}
          >
            {resolvedTheme === "dark" ? (
              <Moon className="h-[18px] w-[18px] text-blue-400 transition-transform duration-200" />
            ) : (
              <Sun className="h-[18px] w-[18px] text-amber-500 transition-transform duration-200" />
            )}
          </button>
        </DropdownMenuTrigger>

        <DropdownMenuContent align="end" className="w-36">
          {themeOptions.map(({ key, label, icon: Icon }) => {
            const isSelected = theme === key;
            return (
              <DropdownMenuItem
                key={key}
                onClick={() => setTheme(key)}
                className={cn(
                  "flex items-center justify-between gap-2 cursor-pointer",
                  isSelected && "bg-primary/10 text-primary font-semibold"
                )}
              >
                <div className="flex items-center gap-2">
                  <Icon className="h-4 w-4 shrink-0" />
                  <span>{label}</span>
                </div>
                {isSelected && <Check className="h-3.5 w-3.5 shrink-0" />}
              </DropdownMenuItem>
            );
          })}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
