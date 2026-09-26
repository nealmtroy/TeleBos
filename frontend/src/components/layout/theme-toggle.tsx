"use client";

import { useThemeStore, type Theme } from "@/store/theme-store";
import { useT } from "@/lib/i18n";
import { Sun, Moon, Monitor, Check } from "lucide-react";
import { useState, useRef, useEffect } from "react";
import { cn } from "@/lib/utils";

interface ThemeToggleProps {
  className?: string;
  variant?: "navbar" | "compact" | "segmented";
}

export function ThemeToggle({ className, variant = "navbar" }: ThemeToggleProps) {
  const { theme, resolvedTheme, setTheme } = useThemeStore();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const _ = useT();

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const themeOptions: { key: Theme; label: string; icon: typeof Sun }[] = [
    { key: "light", label: _("theme.light") || "Light", icon: Sun },
    { key: "dark", label: _("theme.dark") || "Dark", icon: Moon },
    { key: "system", label: _("theme.system") || "System", icon: Monitor },
  ];

  if (variant === "segmented") {
    return (
      <div className={cn("flex items-center gap-1 p-1 bg-slate-900 border border-slate-800 rounded-xl", className)}>
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
                  ? "bg-slate-800 text-white shadow-sm font-semibold"
                  : "text-slate-400 hover:text-slate-200 hover:bg-slate-850"
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

  // Navbar button with dropdown
  return (
    <div className={cn("relative", className)} ref={ref}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-label={_("theme.toggleTheme") || "Toggle theme"}
        aria-haspopup="menu"
        aria-expanded={open}
        className={cn(
          "relative flex h-9 w-9 items-center justify-center rounded-lg transition-colors cursor-pointer",
          "text-gray-500 hover:bg-gray-100 hover:text-gray-900",
          "dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
        )}
        title={_("theme.title") || "Theme"}
      >
        {resolvedTheme === "dark" ? (
          <Moon className="h-[18px] w-[18px] text-blue-400 transition-transform duration-200" />
        ) : (
          <Sun className="h-[18px] w-[18px] text-amber-500 transition-transform duration-200" />
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div
            role="menu"
            className="absolute right-0 top-full z-50 mt-1.5 w-36 rounded-xl border border-gray-200 bg-white p-1 shadow-lg dark:border-slate-800 dark:bg-slate-900 animate-in fade-in-50 zoom-in-95 duration-100"
          >
            {themeOptions.map(({ key, label, icon: Icon }) => {
              const isSelected = theme === key;
              return (
                <button
                  key={key}
                  type="button"
                  role="menuitemradio"
                  aria-checked={isSelected}
                  onClick={() => {
                    setTheme(key);
                    setOpen(false);
                  }}
                  className={cn(
                    "flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-left text-xs font-medium transition-colors cursor-pointer",
                    isSelected
                      ? "bg-primary-50 text-primary-600 dark:bg-primary-950/40 dark:text-primary-400 font-semibold"
                      : "text-gray-700 hover:bg-gray-50 dark:text-slate-300 dark:hover:bg-slate-800/80"
                  )}
                >
                  <div className="flex items-center gap-2">
                    <Icon className="h-4 w-4 shrink-0" />
                    <span>{label}</span>
                  </div>
                  {isSelected && <Check className="h-3.5 w-3.5 shrink-0" />}
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
