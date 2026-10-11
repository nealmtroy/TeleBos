"use client";

import * as React from "react";
import * as CheckboxPrimitive from "@radix-ui/react-checkbox";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

export interface PublicCheckboxProps
  extends Omit<React.ComponentPropsWithoutRef<typeof CheckboxPrimitive.Root>, "onChange"> {
  onChange?: (e: React.ChangeEvent<HTMLInputElement> | { target: { checked: boolean; name?: string; id?: string } }) => void;
  readOnly?: boolean;
}

export const PublicCheckbox = React.forwardRef<
  HTMLButtonElement,
  PublicCheckboxProps
>(function PublicCheckbox(
  { className, onChange, onCheckedChange, checked, defaultChecked, id, name, disabled, readOnly, ...props },
  ref
) {
  const [internalChecked, setInternalChecked] = React.useState<boolean>(
    Boolean(checked ?? defaultChecked ?? false)
  );

  const isControlled = checked !== undefined;
  const isChecked = isControlled ? Boolean(checked) : internalChecked;

  const handleCheckedChange = (val: CheckboxPrimitive.CheckedState) => {
    if (readOnly || disabled) return;
    const next = val === true;
    if (!isControlled) {
      setInternalChecked(next);
    }
    onCheckedChange?.(val);
    if (onChange) {
      onChange({
        target: { checked: next, name, id },
      } as any);
    }
  };

  return (
    <CheckboxPrimitive.Root
      asChild
      checked={isChecked}
      onCheckedChange={handleCheckedChange}
      disabled={disabled}
      {...props}
    >
      <button
        ref={ref}
        type="button"
        id={id}
        name={name}
        className={cn(
          "peer h-5 w-5 shrink-0 rounded-[5px] border border-[var(--public-subtle)] bg-[var(--public-canvas)] text-[var(--public-canvas)] transition-[background-color,border-color,color,box-shadow] duration-150 hover:border-[var(--public-muted)] focus-visible:outline-none focus-visible:shadow-[0_0_0_2px_var(--public-canvas),0_0_0_4px_var(--public-accent-strong)] disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:border-[var(--public-accent)] data-[state=checked]:bg-[var(--public-accent)] data-[state=checked]:text-[var(--public-canvas)] aria-invalid:border-[var(--public-danger)] flex items-center justify-center cursor-pointer",
          className
        )}
      >
        <CheckboxPrimitive.Indicator className="flex items-center justify-center text-current">
          <Check className="h-3.5 w-3.5 stroke-[3]" />
        </CheckboxPrimitive.Indicator>
      </button>
    </CheckboxPrimitive.Root>
  );
});
PublicCheckbox.displayName = "PublicCheckbox";
