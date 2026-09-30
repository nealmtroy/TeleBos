"use client";

import * as React from "react";
import { format, setHours, setMinutes, setSeconds } from "date-fns";
import { Calendar as CalendarIcon, Clock, X } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

export interface DateTimePickerProps {
  className?: string;
  triggerClassName?: string;
  positionerClassName?: string;
  date: Date | undefined;
  setDate: (date: Date | undefined) => void;
  placeholder?: string;
  clearable?: boolean;
  disabled?: boolean;
  minDate?: Date;
  formatStr?: string;
}

export function DateTimePicker({
  className,
  triggerClassName,
  positionerClassName = "z-[110]",
  date,
  setDate,
  placeholder = "Pick date & time",
  clearable = true,
  disabled = false,
  minDate,
  formatStr = "yyyy-MM-dd HH:mm",
}: DateTimePickerProps) {
  const [open, setOpen] = React.useState(false);

  // Local hours & minutes for easy adjustment
  const hours = date ? date.getHours() : 12;
  const minutes = date ? date.getMinutes() : 0;

  const handleDateSelect = (selectedDay: Date | undefined) => {
    if (!selectedDay) {
      setDate(undefined);
      return;
    }
    const withTime = setSeconds(setMinutes(setHours(selectedDay, hours), minutes), 0);
    setDate(withTime);
  };

  const handleTimeChange = (newHours: number, newMinutes: number) => {
    const base = date || new Date();
    const updated = setSeconds(setMinutes(setHours(base, newHours), newMinutes), 0);
    setDate(updated);
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    setDate(undefined);
  };

  const handleSetNow = () => {
    setDate(new Date());
  };

  return (
    <div className={cn("relative inline-block w-full", className)}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          disabled={disabled}
          render={
            <Button
              variant="outline"
              data-empty={!date}
              disabled={disabled}
              className={cn(
                "w-full justify-between text-left font-normal flex items-center gap-2 rounded-xl border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-gray-800 dark:text-slate-200 hover:bg-gray-50 dark:hover:bg-slate-750",
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
              title="Clear"
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
            onSelect={handleDateSelect}
            disabled={(d) => (minDate ? d < new Date(new Date(minDate).setHours(0, 0, 0, 0)) : false)}
            numberOfMonths={1}
          />
          {/* Time Picker Controls */}
          <div className="p-3 border-t border-gray-100 dark:border-slate-800 bg-gray-50/50 dark:bg-slate-800/40 flex items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-1.5 text-slate-600 dark:text-slate-300">
              <Clock className="size-3.5 text-primary shrink-0" />
              <span className="font-semibold">Waktu:</span>
              <select
                aria-label="Jam"
                value={hours}
                onChange={(e) => handleTimeChange(parseInt(e.target.value, 10), minutes)}
                className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg px-2 py-1 font-mono font-medium focus:outline-none focus:ring-1 focus:ring-primary"
              >
                {Array.from({ length: 24 }, (_, i) => (
                  <option key={i} value={i}>
                    {String(i).padStart(2, "0")}
                  </option>
                ))}
              </select>
              <span>:</span>
              <select
                aria-label="Menit"
                value={minutes}
                onChange={(e) => handleTimeChange(hours, parseInt(e.target.value, 10))}
                className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg px-2 py-1 font-mono font-medium focus:outline-none focus:ring-1 focus:ring-primary"
              >
                {Array.from({ length: 60 }, (_, i) => (
                  <option key={i} value={i}>
                    {String(i).padStart(2, "0")}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex items-center gap-1.5">
              <Button
                variant="ghost"
                size="sm"
                onClick={handleSetNow}
                className="text-xs h-7 px-2 text-primary hover:bg-primary/10"
              >
                Sekarang
              </Button>
              <Button
                variant="default"
                size="sm"
                onClick={() => setOpen(false)}
                className="text-xs h-7 px-2.5"
              >
                Selesai
              </Button>
            </div>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
