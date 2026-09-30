"use client";

import * as React from "react";
import {
  DayPicker,
  getDefaultClassNames,
  type DayButton,
  type Locale,
} from "react-day-picker";

import { cn } from "@/lib/utils";
import { Button, buttonVariants } from "@/components/ui/button";
import { ChevronLeftIcon, ChevronRightIcon, ChevronDownIcon } from "lucide-react";

function Calendar({
  className,
  classNames,
  showOutsideDays = true,
  captionLayout = "label",
  buttonVariant = "ghost",
  locale,
  formatters,
  components,
  ...props
}: React.ComponentProps<typeof DayPicker> & {
  buttonVariant?: React.ComponentProps<typeof Button>["variant"];
}) {
  const defaultClassNames = getDefaultClassNames();

  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      className={cn(
        "group/calendar bg-background p-3 text-slate-800 dark:text-slate-200 select-none",
        String.raw`rtl:**:[.rdp-button\_next>svg]:rotate-180`,
        String.raw`rtl:**:[.rdp-button\_previous>svg]:rotate-180`,
        className
      )}
      captionLayout={captionLayout}
      locale={locale}
      formatters={{
        formatMonthDropdown: (date) =>
          date.toLocaleString(locale?.code, { month: "short" }),
        ...formatters,
      }}
      classNames={{
        root: cn("w-full min-w-0", defaultClassNames.root),
        months: cn(
          "relative flex flex-col gap-6 sm:flex-row sm:justify-center",
          defaultClassNames.months
        ),
        month: cn("flex w-full min-w-0 flex-col gap-3", defaultClassNames.month),
        nav: cn(
          "absolute inset-x-0 top-0 flex w-full items-center justify-between pointer-events-none z-10 px-1",
          defaultClassNames.nav
        ),
        button_previous: cn(
          buttonVariants({ variant: buttonVariant }),
          "h-7 w-7 p-0 select-none opacity-80 hover:opacity-100 pointer-events-auto rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 shadow-xs",
          defaultClassNames.button_previous
        ),
        button_next: cn(
          buttonVariants({ variant: buttonVariant }),
          "h-7 w-7 p-0 select-none opacity-80 hover:opacity-100 pointer-events-auto rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 shadow-xs",
          defaultClassNames.button_next
        ),
        month_caption: cn(
          "flex h-7 w-full items-center justify-center px-8 text-sm font-semibold text-slate-900 dark:text-slate-100",
          defaultClassNames.month_caption
        ),
        dropdowns: cn(
          "flex h-7 w-full items-center justify-center gap-1.5 text-sm font-medium",
          defaultClassNames.dropdowns
        ),
        dropdown_root: cn(
          "relative rounded-md",
          defaultClassNames.dropdown_root
        ),
        dropdown: cn(
          "absolute inset-0 bg-popover opacity-0",
          defaultClassNames.dropdown
        ),
        caption_label: cn(
          "font-semibold text-sm select-none text-slate-900 dark:text-slate-100",
          captionLayout === "label"
            ? "text-sm"
            : "flex items-center gap-1 rounded-md text-sm [&>svg]:size-3.5 [&>svg]:text-muted-foreground",
          defaultClassNames.caption_label
        ),
        month_grid: cn("w-full border-collapse", defaultClassNames.month_grid),
        weekdays: cn("flex w-full justify-between mb-1.5", defaultClassNames.weekdays),
        weekday: cn(
          "h-8 sm:h-9 flex-1 min-w-0 flex items-center justify-center text-[0.8rem] font-medium text-slate-400 dark:text-slate-500 select-none",
          defaultClassNames.weekday
        ),
        week: cn("mt-1 flex w-full justify-between", defaultClassNames.week),
        week_number_header: cn(
          "w-6 select-none shrink-0",
          defaultClassNames.week_number_header
        ),
        week_number: cn(
          "w-6 text-[0.8rem] text-muted-foreground select-none",
          defaultClassNames.week_number
        ),
        day: cn(
          "group/day relative h-8 sm:h-9 w-full min-w-0 p-0 text-center select-none flex items-center justify-center",
          defaultClassNames.day
        ),
        range_start: cn(
          "relative isolate z-0 rounded-l-lg bg-primary/10 text-primary dark:bg-primary/20",
          defaultClassNames.range_start
        ),
        range_middle: cn(
          "rounded-none bg-primary/5 dark:bg-primary/15",
          defaultClassNames.range_middle
        ),
        range_end: cn(
          "relative isolate z-0 rounded-r-lg bg-primary/10 text-primary dark:bg-primary/20",
          defaultClassNames.range_end
        ),
        today: cn(
          "font-bold text-primary",
          defaultClassNames.today
        ),
        outside: cn(
          "text-muted-foreground/30 opacity-40 aria-selected:text-muted-foreground/40",
          defaultClassNames.outside
        ),
        disabled: cn(
          "text-muted-foreground/20 opacity-30 pointer-events-none",
          defaultClassNames.disabled
        ),
        hidden: cn("invisible", defaultClassNames.hidden),
        ...classNames,
      }}
      components={{
        Root: ({ className, rootRef, ...props }) => {
          return (
            <div
              data-slot="calendar"
              ref={rootRef}
              className={cn(className)}
              {...props}
            />
          );
        },
        Chevron: ({ className, orientation, ...props }) => {
          if (orientation === "left") {
            return (
              <ChevronLeftIcon className={cn("h-4 w-4", className)} {...props} />
            );
          }

          if (orientation === "right") {
            return (
              <ChevronRightIcon className={cn("h-4 w-4", className)} {...props} />
            );
          }

          return (
            <ChevronDownIcon className={cn("h-4 w-4", className)} {...props} />
          );
        },
        DayButton: ({ ...props }) => (
          <CalendarDayButton locale={locale} {...props} />
        ),
        WeekNumber: ({ children, ...props }) => {
          return (
            <td {...props}>
              <div className="flex h-8 sm:h-9 w-6 items-center justify-center text-center text-xs text-muted-foreground">
                {children}
              </div>
            </td>
          );
        },
        ...components,
      }}
      {...props}
    />
  );
}

function CalendarDayButton({
  className,
  day,
  modifiers,
  locale,
  ...props
}: React.ComponentProps<typeof DayButton> & { locale?: Partial<Locale> }) {
  const defaultClassNames = getDefaultClassNames();

  const ref = React.useRef<HTMLButtonElement>(null);
  React.useEffect(() => {
    if (modifiers.focused) ref.current?.focus();
  }, [modifiers.focused]);

  const isSelected = modifiers.selected;
  const isRangeStart = modifiers.range_start;
  const isRangeEnd = modifiers.range_end;
  const isRangeMiddle = modifiers.range_middle;
  const isSingle = isSelected && !isRangeStart && !isRangeEnd && !isRangeMiddle;

  return (
    <Button
      ref={ref}
      variant="ghost"
      data-day={day.date.toLocaleDateString(locale?.code)}
      data-selected-single={isSingle}
      data-range-start={isRangeStart}
      data-range-end={isRangeEnd}
      data-range-middle={isRangeMiddle}
      className={cn(
        "relative isolate z-10 h-8 sm:h-9 w-full min-w-0 p-0 font-medium text-xs transition-colors rounded-lg flex items-center justify-center",
        // Hover state
        "hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white",
        // Single selection
        "data-[selected-single=true]:bg-primary data-[selected-single=true]:text-white data-[selected-single=true]:font-bold data-[selected-single=true]:hover:bg-primary data-[selected-single=true]:hover:text-white data-[selected-single=true]:shadow-xs",
        // Range start
        "data-[range-start=true]:bg-primary data-[range-start=true]:text-white data-[range-start=true]:font-bold data-[range-start=true]:rounded-l-lg data-[range-start=true]:rounded-r-none",
        // Range middle
        "data-[range-middle=true]:bg-primary/10 dark:data-[range-middle=true]:bg-primary/20 data-[range-middle=true]:text-primary dark:data-[range-middle=true]:text-white data-[range-middle=true]:rounded-none data-[range-middle=true]:hover:bg-primary/20",
        // Range end
        "data-[range-end=true]:bg-primary data-[range-end=true]:text-white data-[range-end=true]:font-bold data-[range-end=true]:rounded-r-lg data-[range-end=true]:rounded-l-none",
        // Today indicator
        modifiers.today && !isSelected && !isRangeStart && !isRangeEnd && !isRangeMiddle && "border border-primary/50 font-bold text-primary",
        // Outside days
        modifiers.outside && "text-muted-foreground/30 opacity-40",
        // Disabled
        modifiers.disabled && "text-muted-foreground/20 opacity-30 pointer-events-none",
        defaultClassNames.day,
        className
      )}
      {...props}
    />
  );
}

export { Calendar, CalendarDayButton };
