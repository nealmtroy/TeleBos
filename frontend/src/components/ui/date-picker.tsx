"use client";

import * as React from "react";
import { format } from "date-fns";
import { Calendar as CalendarIcon, X } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

export interface DatePickerProps {
  className?: string;
  triggerClassName?: string;
  positionerClassName?: string;
  date: Date | undefined;
  setDate: (date: Date | undefined) => void;
  placeholder?: string;
  clearable?: boolean;
  disabled?: boolean;
  minDate?: Date;
  maxDate?: Date;
  formatStr?: string;
}

export function DatePicker({
  className,
  triggerClassName,
  positionerClassName = "z-[110]",
  date,
  setDate,
  placeholder = "Pick a date",
  clearable = true,
  disabled = false,
  minDate,
  maxDate,
  formatStr = "PPP",
}: DatePickerProps) {
  const [open, setOpen] = React.useState(false);

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    setDate(undefined);
  };

  return (
    <div className={cn("relative inline-block", className)}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          disabled={disabled}
          render={
            <Button
              variant="outline"
              data-empty={!date}
              disabled={disabled}
              className={cn(
                "w-[220px] justify-between text-left font-normal flex items-center gap-2 rounded-xl border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-gray-800 dark:text-slate-200 hover:bg-gray-50 dark:hover:bg-slate-750",
                !date && "text-muted-foreground dark:text-slate-400",
                triggerClassName
              )}
            />
          }
        >
          <div className="flex items-center gap-2 min-w-0 truncate">
            <CalendarIcon className="size-4 shrink-0 text-slate-500 dark:text-slate-400" />
            <span className="truncate">
              {date ? format(date, formatStr) : placeholder}
            </span>
          </div>
          {clearable && date && (
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
          className="w-auto p-0 border border-gray-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xl rounded-2xl overflow-hidden"
          align="start"
        >
          <Calendar
            mode="single"
            defaultMonth={date}
            selected={date}
            onSelect={(d) => {
              setDate(d);
              setOpen(false);
            }}
            disabled={(d) => {
              if (minDate && d < minDate) return true;
              if (maxDate && d > maxDate) return true;
              return false;
            }}
            numberOfMonths={1}
          />
        </PopoverContent>
      </Popover>
    </div>
  );
}
