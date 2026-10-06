"use client"

import * as React from "react"
import * as PopoverPrimitive from "@radix-ui/react-popover"

import { cn } from "@/lib/utils"

const Popover = PopoverPrimitive.Root

interface PopoverTriggerProps extends React.ComponentPropsWithoutRef<typeof PopoverPrimitive.Trigger> {
  render?: React.ReactNode
}

const PopoverTrigger = React.forwardRef<
  React.ElementRef<typeof PopoverPrimitive.Trigger>,
  PopoverTriggerProps
>(({ render, children, asChild, ...props }, ref) => {
  if (React.isValidElement(render)) {
    return (
      <PopoverPrimitive.Trigger ref={ref} asChild {...props}>
        {React.cloneElement(render as React.ReactElement<{ children?: React.ReactNode }>, {}, children)}
      </PopoverPrimitive.Trigger>
    )
  }
  return (
    <PopoverPrimitive.Trigger ref={ref} asChild={asChild} {...props}>
      {children}
    </PopoverPrimitive.Trigger>
  )
})
PopoverTrigger.displayName = PopoverPrimitive.Trigger.displayName

const PopoverAnchor = PopoverPrimitive.Anchor

interface PopoverContentProps extends React.ComponentPropsWithoutRef<typeof PopoverPrimitive.Content> {
  positionerClassName?: string
}

const PopoverContent = React.forwardRef<
  React.ElementRef<typeof PopoverPrimitive.Content>,
  PopoverContentProps
>(({ className, align = "center", sideOffset = 4, positionerClassName, ...props }, ref) => (
  <PopoverPrimitive.Portal>
    <PopoverPrimitive.Content
      ref={ref}
      align={align}
      sideOffset={sideOffset}
      className={cn(
        "z-50 w-72 rounded-xl border border-gray-200 dark:border-slate-800 bg-popover p-4 text-popover-foreground shadow-md outline-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 dark:bg-slate-900 dark:text-slate-100",
        positionerClassName,
        className
      )}
      {...props}
    />
  </PopoverPrimitive.Portal>
))
PopoverContent.displayName = PopoverPrimitive.Content.displayName

function PopoverHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn("flex flex-col gap-0.5 text-sm", className)}
      {...props}
    />
  )
}

function PopoverTitle({ className, ...props }: React.ComponentProps<"h4">) {
  return (
    <h4
      className={cn("font-medium text-gray-900 dark:text-slate-100", className)}
      {...props}
    />
  )
}

function PopoverDescription({
  className,
  ...props
}: React.ComponentProps<"p">) {
  return (
    <p
      className={cn("text-xs text-muted-foreground dark:text-slate-400", className)}
      {...props}
    />
  )
}

export {
  Popover,
  PopoverTrigger,
  PopoverContent,
  PopoverAnchor,
  PopoverHeader,
  PopoverTitle,
  PopoverDescription,
}
