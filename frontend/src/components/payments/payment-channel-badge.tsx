"use client";

import React from "react";
import { cn } from "@/lib/utils";

export interface PaymentChannel {
  name: string;
  logo: string;
  alt: string;
}

export const PAYMENT_CHANNELS_DATA: Record<string, PaymentChannel> = {
  BCA: { name: "BCA", logo: "/payments/bca.svg", alt: "BCA" },
  Mandiri: { name: "Mandiri", logo: "/payments/mandiri.svg", alt: "Bank Mandiri" },
  BRI: { name: "BRI", logo: "/payments/bri.svg", alt: "BRI" },
  BNI: { name: "BNI", logo: "/payments/bni.svg", alt: "BNI" },
  GoPay: { name: "GoPay", logo: "/payments/gopay.svg", alt: "GoPay" },
  OVO: { name: "OVO", logo: "/payments/ovo.svg", alt: "OVO" },
  DANA: { name: "DANA", logo: "/payments/dana.svg", alt: "DANA" },
  ShopeePay: { name: "ShopeePay", logo: "/payments/shopeepay.svg", alt: "ShopeePay" },
  BSI: { name: "BSI", logo: "/payments/bsi.svg", alt: "BSI" },
  CIMB: { name: "CIMB", logo: "/payments/cimb.svg", alt: "CIMB Niaga" },
};

export const QRIS_SUPPORTED_CHANNELS = [
  "BCA",
  "Mandiri",
  "BRI",
  "BNI",
  "GoPay",
  "OVO",
  "DANA",
  "ShopeePay",
];

interface PaymentChannelBadgeProps {
  channel: string;
  showText?: boolean;
  size?: "sm" | "md" | "lg";
  className?: string;
}

export function PaymentChannelBadge({
  channel,
  showText = true,
  size = "md",
  className,
}: PaymentChannelBadgeProps) {
  const data = PAYMENT_CHANNELS_DATA[channel];

  if (!data) {
    return (
      <span
        className={cn(
          "inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-semibold bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 shadow-2xs",
          className
        )}
      >
        {channel}
      </span>
    );
  }

  const sizeClasses = {
    sm: "px-1.5 py-0.5 text-[9px] gap-1",
    md: "px-2 py-1 text-[10px] gap-1.5",
    lg: "px-2.5 py-1.5 text-xs gap-2",
  }[size];

  const logoClasses = {
    sm: "h-2.5 max-w-[34px]",
    md: "h-3.5 max-w-[44px]",
    lg: "h-4.5 max-w-[56px]",
  }[size];

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md bg-white text-slate-800 border border-slate-200/90 shadow-2xs transition-transform hover:scale-105 select-none",
        sizeClasses,
        className
      )}
      title={data.alt}
    >
      <img
        src={data.logo}
        alt={data.alt}
        className={cn("w-auto object-contain shrink-0", logoClasses)}
        loading="lazy"
      />
      {showText && (
        <span className="font-semibold text-slate-700 tracking-tight">
          {data.name}
        </span>
      )}
    </span>
  );
}

