"use client";

import * as React from "react";
import { format, subDays, startOfMonth, endOfMonth } from "date-fns";
import { Calendar as CalendarIcon, X } from "lucide-react";
import { DateRange } from "react-day-picker";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

/** True below Tailwind's `sm` breakpoint, where two months cannot fit. */
function useIsNarrowViewport(): boolean {
  const [isNarrow, setIsNarrow] = React.useState(false);

  React.useEffect(() => {
    const query = window.matchMedia("(max-width: 639px)");
    const sync = () => setIsNarrow(query.matches);
    sync();
    query.addEventListener("change", sync);
    return () => query.removeEventListener("change", sync);
  }, []);

  return isNarrow;
}

export interface DatePickerWithRangeProps {
  id?: string;
  className?: string;
  triggerClassName?: string;
  positionerClassName?: string;
  date: DateRange | undefined;
  setDate: (date: DateRange | undefined) => void;
  placeholder?: string;
  clearable?: boolean;
  numberOfMonths?: number;
  presets?: boolean;
  disabled?: boolean;
}

export function DatePickerWithRange({
  id,
  className,
  triggerClassName,
  positionerClassName = "z-[110]",
  date,
  setDate,
  placeholder = "Pick a date",
  clearable = true,
  numberOfMonths = 2,
  presets = false,
  disabled = false,
}: DatePickerWithRangeProps) {
  const [open, setOpen] = React.useState(false);
  const isNarrow = useIsNarrowViewport();
  // Two months side by side overflow a phone viewport, so narrow screens get
  // one month and the caller keeps its own preference.
  const monthsToShow = isNarrow ? 1 : numberOfMonths;

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    setDate(undefined);
  };

  const handlePreset = (days: number) => {
    const today = new Date();
    if (days === 0) {
      setDate({ from: today, to: today });
    } else if (days === -1) {
      setDate({ from: startOfMonth(today), to: endOfMonth(today) });
    } else {
      setDate({ from: subDays(today, days), to: today });
    }
  };

  return (
    <div className={cn("relative inline-block w-full sm:w-auto", className)}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          disabled={disabled}
          render={
            <Button
              id={id || "date-range-picker"}
              variant="outline"
              data-empty={!date?.from}
              disabled={disabled}
              className={cn(
                "w-full sm:w-[260px] justify-between text-left font-normal flex items-center gap-2 rounded-xl border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-gray-800 dark:text-slate-200 hover:bg-gray-50 dark:hover:bg-slate-750",
                !date?.from && "text-muted-foreground dark:text-slate-400",
                triggerClassName
              )}
            />
          }
        >
          <div className="flex items-center gap-2 min-w-0 truncate">
            <CalendarIcon className="size-4 shrink-0 text-slate-500 dark:text-slate-400" />
            <span className="truncate">
              {date?.from ? (
                date.to ? (
                  <>
                    {format(date.from, "LLL dd, y")} - {format(date.to, "LLL dd, y")}
                  </>
                ) : (
                  format(date.from, "LLL dd, y")
                )
              ) : (
                placeholder
              )}
            </span>
          </div>
          {clearable && date?.from && (
            <span
              role="button"
              tabIndex={0}
              onClick={handleClear}
              className="p-0.5 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-full text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors ml-1 shrink-0"
              title="Clear date"
            >
              <X className="size-3.5" />
            </span>
          )}
        </PopoverTrigger>
        <PopoverContent
          positionerClassName={positionerClassName}
          className="w-auto max-w-[95vw] sm:max-w-none p-0 border border-gray-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xl rounded-2xl overflow-hidden"
          align="start"
        >
          {presets && (
            <div className="flex flex-wrap items-center gap-1.5 p-2.5 border-b border-gray-100 dark:border-slate-800 bg-gray-50/50 dark:bg-slate-800/40 text-xs">
              <span className="text-[11px] font-semibold text-slate-400 dark:text-slate-500 uppercase px-1">
                Preset:
              </span>
              <button
                type="button"
                onClick={() => handlePreset(0)}
                className="px-2 py-1 rounded-md bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-gray-100 dark:hover:bg-slate-700 transition"
              >
                Hari Ini
              </button>
              <button
                type="button"
                onClick={() => handlePreset(7)}
                className="px-2 py-1 rounded-md bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-gray-100 dark:hover:bg-slate-700 transition"
              >
                7 Hari
              </button>
              <button
                type="button"
                onClick={() => handlePreset(30)}
                className="px-2 py-1 rounded-md bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-gray-100 dark:hover:bg-slate-700 transition"
              >
                30 Hari
              </button>
              <button
                type="button"
                onClick={() => handlePreset(-1)}
                className="px-2 py-1 rounded-md bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-gray-100 dark:hover:bg-slate-700 transition"
              >
                Bulan Ini
              </button>
            </div>
          )}
          <Calendar
            mode="range"
            defaultMonth={date?.from}
            selected={date}
            onSelect={setDate}
            numberOfMonths={monthsToShow}
          />
          {clearable && date?.from && (
            <div className="p-2 border-t border-gray-100 dark:border-slate-800 flex justify-end">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setDate(undefined);
                  setOpen(false);
                }}
                className="text-xs text-slate-500 hover:text-rose-600 dark:hover:text-rose-400"
              >
                Reset Filter
              </Button>
            </div>
          )}
        </PopoverContent>
      </Popover>
    </div>
  );
}
