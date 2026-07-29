import { Check } from "lucide-react";
import { forwardRef, type InputHTMLAttributes } from "react";

import { cn } from "@/lib/utils";

export const PublicCheckbox = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  function PublicCheckbox({ className, ...props }, ref) {
    return (
      <span className="relative inline-flex h-5 w-5 shrink-0">
        <input
          ref={ref}
          type="checkbox"
          className={cn("peer absolute inset-0 z-10 m-0 h-5 w-5 cursor-pointer opacity-0 disabled:cursor-not-allowed", className)}
          {...props}
        />
        <span
          aria-hidden="true"
          className="flex h-5 w-5 items-center justify-center rounded-[5px] border border-[#464a4d] bg-black text-transparent transition-[background-color,border-color,color,box-shadow] duration-150 peer-hover:border-[#a1a4a5] peer-checked:border-[#2AABEE] peer-checked:bg-[#2AABEE] peer-checked:text-black peer-focus-visible:shadow-[0_0_0_2px_#000000,0_0_0_4px_#2AABEE] peer-disabled:opacity-50 peer-aria-[invalid=true]:border-[#ff9592]"
        >
          <Check className="h-3.5 w-3.5 stroke-[3]" />
        </span>
      </span>
    );
  }
);
