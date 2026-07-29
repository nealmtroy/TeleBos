import Image from "next/image";

import { cn } from "@/lib/utils";

type BrandLogoProps = {
  size?: "sm" | "md" | "lg";
  className?: string;
  priority?: boolean;
};

const sizeClasses = {
  sm: "h-7 w-14",
  md: "h-10 w-20",
  lg: "h-16 w-32",
};

/** Renders the supplied 2:1 TeleBos wordmark at a consistent aspect ratio. */
export function BrandLogo({
  size = "md",
  className,
  priority = false,
}: BrandLogoProps) {
  return (
    <span
      className={cn(
        "relative inline-block shrink-0 overflow-hidden rounded-sm",
        sizeClasses[size],
        className
      )}
    >
      <Image
        src="/telebos_logo.PNG"
        alt="TeleBos"
        width={1152}
        height={576}
        priority={priority}
        sizes={size === "sm" ? "56px" : size === "md" ? "80px" : "128px"}
        className="absolute inset-x-0 top-1/2 h-auto w-full max-w-none -translate-y-1/2"
      />
    </span>
  );
}
