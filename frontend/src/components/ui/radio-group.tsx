"use client";

import * as React from "react";
import { Circle } from "lucide-react";

import { cn } from "@/lib/utils";

interface RadioGroupContextValue {
  value?: string;
  name?: string;
  disabled?: boolean;
  onValueChange?: (value: string) => void;
}

const RadioGroupContext = React.createContext<RadioGroupContextValue | null>(null);

export interface RadioGroupProps extends React.HTMLAttributes<HTMLDivElement> {
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  name?: string;
  disabled?: boolean;
  orientation?: "horizontal" | "vertical";
}

const RadioGroup = React.forwardRef<HTMLDivElement, RadioGroupProps>(
  (
    {
      className,
      value: controlledValue,
      defaultValue,
      onValueChange,
      name,
      disabled = false,
      orientation = "vertical",
      children,
      ...props
    },
    ref
  ) => {
    const [uncontrolledValue, setUncontrolledValue] = React.useState(defaultValue);
    const isControlled = controlledValue !== undefined;
    const value = isControlled ? controlledValue : uncontrolledValue;

    const handleValueChange = React.useCallback(
      (val: string) => {
        if (!isControlled) {
          setUncontrolledValue(val);
        }
        onValueChange?.(val);
      },
      [isControlled, onValueChange]
    );

    return (
      <RadioGroupContext.Provider
        value={{
          value,
          name,
          disabled,
          onValueChange: handleValueChange,
        }}
      >
        <div
          ref={ref}
          role="radiogroup"
          aria-orientation={orientation}
          aria-disabled={disabled || undefined}
          data-slot="radio-group"
          className={cn(
            "grid gap-2",
            orientation === "horizontal" && "grid-flow-col auto-cols-max gap-4",
            className
          )}
          {...props}
        >
          {children}
        </div>
      </RadioGroupContext.Provider>
    );
  }
);
RadioGroup.displayName = "RadioGroup";

export interface RadioGroupItemProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  value: string;
}

const RadioGroupItem = React.forwardRef<HTMLButtonElement, RadioGroupItemProps>(
  ({ className, value, disabled: itemDisabled, id, onClick, onKeyDown, ...props }, ref) => {
    const context = React.useContext(RadioGroupContext);
    const isChecked = context?.value === value;
    const isDisabled = context?.disabled || itemDisabled;

    const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
      if (isDisabled) return;
      context?.onValueChange?.(value);
      onClick?.(e);
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>) => {
      if (isDisabled) return;
      if (e.key === " " || e.key === "Enter") {
        e.preventDefault();
        context?.onValueChange?.(value);
      }
      onKeyDown?.(e);
    };

    return (
      <button
        ref={ref}
        type="button"
        role="radio"
        id={id}
        name={context?.name}
        value={value}
        aria-checked={isChecked}
        aria-disabled={isDisabled || undefined}
        disabled={isDisabled}
        data-slot="radio-group-item"
        data-state={isChecked ? "checked" : "unchecked"}
        onClick={handleClick}
        onKeyDown={handleKeyDown}
        className={cn(
          "aspect-square h-[18px] w-[18px] shrink-0 rounded-full border border-slate-300 dark:border-slate-700 text-primary shadow-xs transition-colors ring-offset-background hover:border-primary/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:border-primary flex items-center justify-center",
          className
        )}
        {...props}
      >
        {isChecked && (
          <Circle className="h-2 w-2 fill-primary text-primary" data-slot="radio-group-indicator" />
        )}
      </button>
    );
  }
);
RadioGroupItem.displayName = "RadioGroupItem";

export { RadioGroup, RadioGroupItem };
