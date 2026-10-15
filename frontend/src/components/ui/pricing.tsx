"use client";

import * as React from "react";
import { useState } from "react";
import Link from "next/link";
import { motion, type Transition } from "framer-motion";
import { Check, Info, Sparkles, ArrowRight, Loader2 } from "lucide-react";

import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

// ── 1. BorderTrail Component ──────────────────────────────────────────────────

export interface BorderTrailProps {
  className?: string;
  size?: number;
  transition?: Transition;
  delay?: number;
  onAnimationComplete?: () => void;
  style?: React.CSSProperties;
}

export function BorderTrail({
  className,
  size = 80,
  transition,
  delay = 0,
  onAnimationComplete,
  style,
}: BorderTrailProps) {
  const BASE_TRANSITION: Transition = {
    repeat: Infinity,
    repeatType: "loop",
    duration: 6,
    ease: "linear",
  };

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 rounded-[inherit] overflow-hidden p-px [mask-clip:padding-box,border-box] [mask-composite:intersect] [mask-image:linear-gradient(transparent,transparent),linear-gradient(#000,#000)]"
    >
      <motion.div
        className={cn(
          "absolute aspect-square bg-gradient-to-r from-transparent via-primary to-transparent opacity-90 blur-[1px]",
          className
        )}
        style={{
          width: size,
          offsetPath: "rect(0 auto auto 0 round inherit)",
          ...style,
        }}
        animate={{
          offsetDistance: ["0%", "100%"],
        }}
        transition={{
          ...(transition || BASE_TRANSITION),
          delay,
        }}
        onAnimationComplete={onAnimationComplete}
      />
    </div>
  );
}

// ── 2. PricingFrequencyToggle Component ───────────────────────────────────────

export interface PricingFrequencyOption {
  id: string;
  label: string;
  discountBadge?: string;
}

export interface PricingFrequencyToggleProps {
  frequencies?: PricingFrequencyOption[];
  selectedFrequency: string;
  onFrequencyChange: (frequency: string) => void;
  className?: string;
  variant?: "public" | "dashboard";
}

export function PricingFrequencyToggle({
  frequencies,
  selectedFrequency,
  onFrequencyChange,
  className,
  variant = "public",
}: PricingFrequencyToggleProps) {
  const isPublic = variant === "public";
  const _ = useT();

  const activeFrequencies = frequencies || [
    { id: "monthly", label: _("pricing.monthly") || "Bulanan" },
    {
      id: "yearly",
      label: _("pricing.yearly") || "Tahunan",
      discountBadge: _("pricing.saveDiscount", { discount: "17%" }) || "Hemat 17%",
    },
  ];

  return (
    <div
      role="radiogroup"
      aria-label="Pilihan periode pembayaran"
      className={cn(
        "inline-flex items-center rounded-full p-1 border",
        isPublic
          ? "bg-[var(--public-canvas-warm,#0c1320)] border-[var(--public-border,#1b2740)]"
          : "bg-muted/80 border-border/80 dark:bg-slate-900/80 dark:border-slate-800",
        className
      )}
    >
      {activeFrequencies.map((freq) => {
        const isSelected = selectedFrequency === freq.id;
        return (
          <button
            key={freq.id}
            type="button"
            role="radio"
            aria-checked={isSelected}
            onClick={() => onFrequencyChange(freq.id)}
            className={cn(
              "relative z-10 flex items-center gap-1.5 rounded-full px-4 py-1.5 text-xs font-semibold transition-colors duration-200 cursor-pointer outline-none focus-visible:ring-2",
              isPublic
                ? isSelected
                  ? "text-white focus-visible:ring-[var(--public-accent,#2563eb)]"
                  : "text-[var(--public-muted,#cbd5e1)] hover:text-white"
                : isSelected
                ? "text-foreground dark:text-slate-100 focus-visible:ring-primary"
                : "text-muted-foreground hover:text-foreground dark:text-slate-400 dark:hover:text-slate-200"
            )}
          >
            {isSelected && (
              <motion.span
                layoutId={`pricing-toggle-pill-${variant}`}
                className={cn(
                  "absolute inset-0 rounded-full shadow-sm",
                  isPublic
                    ? "bg-[var(--public-accent,#2563eb)]"
                    : "bg-background dark:bg-slate-800 border border-border/60 dark:border-slate-700"
                )}
                transition={{ type: "spring", stiffness: 400, damping: 30 }}
              />
            )}
            <span className="relative z-10">{freq.label}</span>
            {freq.discountBadge && (
              <span
                className={cn(
                  "relative z-10 inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider",
                  isPublic
                    ? isSelected
                      ? "bg-white/20 text-white"
                      : "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                    : isSelected
                    ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800"
                    : "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400 border border-emerald-200/60 dark:border-emerald-800/60"
                )}
              >
                {freq.discountBadge}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

// ── 3. PricingCard Component ──────────────────────────────────────────────────

export interface PricingFeatureItem {
  text: string;
  tooltip?: string;
  included?: boolean;
}

export interface PricingCardProps {
  id: string;
  name: string;
  tagline?: string;
  description: string;
  price: string;
  period?: string;
  yearlyEquivalent?: string;
  discountBadge?: string;
  features: (string | PricingFeatureItem)[];
  isPopular?: boolean;
  popularBadgeText?: string;
  isCurrentPlan?: boolean;
  currentPlanText?: string;
  ctaText?: string;
  ctaHref?: string;
  onCtaClick?: () => void;
  ctaDisabled?: boolean;
  ctaLoading?: boolean;
  ctaIcon?: React.ElementType;
  balanceSufficientNote?: string;
  footnote?: React.ReactNode;
  variant?: "public" | "dashboard";
  className?: string;
}

export function PricingCard({
  id,
  name,
  tagline,
  description,
  price,
  period = "/bulan",
  yearlyEquivalent,
  discountBadge,
  features,
  isPopular = false,
  popularBadgeText = "Paling Populer",
  isCurrentPlan = false,
  currentPlanText = "Paket Anda Saat Ini",
  ctaText = "Pilih Paket",
  ctaHref,
  onCtaClick,
  ctaDisabled = false,
  ctaLoading = false,
  ctaIcon: CtaIcon = ArrowRight,
  balanceSufficientNote,
  footnote,
  variant = "public",
  className,
}: PricingCardProps) {
  const isPublic = variant === "public";

  const cardContent = (
    <article
      className={cn(
        "relative flex h-full flex-col justify-between rounded-2xl pt-8 px-6 pb-6 sm:px-7 sm:pb-7 transition-all duration-200",
        isPublic
          ? [
              "bg-[var(--public-canvas-warm,#0c1320)] text-[var(--public-text,#ffffff)]",
              isPopular
                ? "border-2 border-[var(--public-accent,#2563eb)] shadow-[0_0_50px_rgba(37,99,235,0.18)]"
                : "border border-[var(--public-border,#1b2740)] hover:border-[var(--public-accent,#2563eb)]/60 shadow-xs",
            ]
          : [
              "bg-card text-card-foreground",
              isPopular
                ? "border-2 border-primary shadow-md dark:shadow-primary/5"
                : "border border-border hover:border-border-strong dark:border-slate-700/80 dark:hover:border-slate-600 shadow-xs",
              isCurrentPlan && !isPopular && "border-emerald-500/70 dark:border-emerald-500/70",
            ],
        className
      )}
    >
      {/* Border trail for popular card */}
      {isPopular && (
        <BorderTrail
          className={
            isPublic
              ? "via-[var(--public-accent,#2563eb)]"
              : "via-primary dark:via-blue-400"
          }
          size={100}
        />
      )}

      {/* Floating Top Badge (Centered on top border edge, does not push card content down) */}
      {isPopular ? (
        <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 z-20">
          <span
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full px-3.5 py-1 text-[11px] font-bold uppercase tracking-wider shadow-md whitespace-nowrap",
              isPublic
                ? "bg-[var(--public-accent,#2563eb)] text-white shadow-blue-500/20"
                : "bg-primary text-primary-foreground shadow-primary/20"
            )}
          >
            <Sparkles className="h-3 w-3" />
            {popularBadgeText}
          </span>
        </div>
      ) : isCurrentPlan ? (
        <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 z-20">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/40 bg-emerald-600 px-3.5 py-1 text-[11px] font-bold text-white uppercase tracking-wider shadow-md whitespace-nowrap shadow-emerald-500/20">
            <Check className="h-3 w-3" />
            {currentPlanText}
          </span>
        </div>
      ) : null}

      {/* TOP: Header info (Title, Tagline, Description, Price) - Exact vertical alignment */}
      <div className="flex flex-col">
        {/* Row 1: Title (Free Trial, Starter, Pro, Business) & Discount Badge */}
        <div className="flex items-center justify-between gap-2 h-8">
          <h3
            className={cn(
              "text-xl sm:text-2xl font-bold tracking-tight",
              isPublic
                ? "text-[var(--public-text,#ffffff)]"
                : "text-foreground dark:text-slate-100"
            )}
          >
            {name}
          </h3>

          {discountBadge && (
            <span
              className={cn(
                "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap",
                isPublic
                  ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30"
                  : "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400 border border-emerald-600/20"
              )}
            >
              {discountBadge}
            </span>
          )}
        </div>

        {/* Row 2: Tagline slot - 40px uniform height prevents wrapping push-down */}
        <div className="h-10 mt-1 flex items-center">
          {tagline ? (
            <p
              className={cn(
                "text-xs font-medium leading-snug line-clamp-2",
                isPublic
                  ? "text-[var(--public-accent,#2563eb)]"
                  : "text-primary dark:text-blue-400"
              )}
            >
              {tagline}
            </p>
          ) : (
            <span className="block h-10" aria-hidden="true" />
          )}
        </div>

        {/* Row 3: Description slot - 48px uniform height locks price position */}
        <div className="h-12 mt-2 flex items-start">
          <p
            className={cn(
              "text-xs leading-relaxed line-clamp-2",
              isPublic
                ? "text-[var(--public-muted,#cbd5e1)]"
                : "text-muted-foreground dark:text-slate-400"
            )}
          >
            {description}
          </p>
        </div>

        {/* Row 4: Price Display - Uniform height, centered baseline, aligned borders */}
        <div className="mt-4 flex flex-col justify-center min-h-[82px] py-3 border-y border-border/50">
          <div className="flex items-baseline gap-1.5 h-10">
            <span
              className={cn(
                "font-extrabold tracking-tight text-3xl tabular-nums leading-none whitespace-nowrap",
                isPublic
                  ? "public-display text-[var(--public-text,#ffffff)]"
                  : "text-foreground dark:text-slate-100"
              )}
            >
              {price}
            </span>
            {period && period.trim() !== "" ? (
              <span
                className={cn(
                  "text-xs font-medium whitespace-nowrap",
                  isPublic
                    ? "text-[var(--public-subtle,#94a3b8)]"
                    : "text-muted-foreground dark:text-slate-400"
                )}
              >
                {period}
              </span>
            ) : null}
          </div>

          <div className="h-5 mt-1 flex items-center">
            {yearlyEquivalent ? (
              <p
                className={cn(
                  "text-[11px] font-medium leading-none truncate",
                  isPublic
                    ? "text-[var(--public-subtle,#94a3b8)]"
                    : "text-muted-foreground dark:text-slate-400"
                )}
              >
                Setara {yearlyEquivalent}/bulan, ditagih tahunan
              </p>
            ) : (
              <span className="h-5 block" aria-hidden="true" />
            )}
          </div>
        </div>
      </div>

      {/* MIDDLE: Feature List (flex-1 so it stretches uniformly across cards) */}
      <div className="flex-1 mt-6 flex flex-col">
        <p
          className={cn(
            "text-xs font-bold uppercase tracking-wider mb-3",
            isPublic
              ? "text-[var(--public-subtle,#94a3b8)]"
              : "text-muted-foreground dark:text-slate-400"
          )}
        >
          Fitur yang disertakan:
        </p>

        <TooltipProvider delayDuration={150}>
          <ul className="space-y-2.5 flex-1">
            {features.map((feat, idx) => {
              const text = typeof feat === "string" ? feat : feat.text;
              const tooltip = typeof feat === "object" ? feat.tooltip : undefined;
              const included = typeof feat === "object" ? feat.included ?? true : true;

              return (
                <li
                  key={idx}
                  className={cn(
                    "flex items-start gap-2.5 text-xs leading-relaxed",
                    isPublic
                      ? included
                        ? "text-[var(--public-body,#e8edf7)]"
                        : "text-[var(--public-subtle,#94a3b8)] line-through opacity-60"
                      : included
                      ? "text-foreground dark:text-slate-200"
                      : "text-muted-foreground line-through opacity-60"
                  )}
                >
                  <span
                    className={cn(
                      "mt-0.5 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full",
                      isPublic
                        ? "bg-[var(--public-success,#22c55e)]/15 text-[var(--public-success,#22c55e)]"
                        : "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                    )}
                  >
                    <Check className="h-2.5 w-2.5 stroke-[3]" />
                  </span>
                  <span className="flex-1">{text}</span>
                  {tooltip && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          type="button"
                          className="inline-flex text-muted-foreground hover:text-foreground cursor-pointer focus:outline-none"
                          aria-label={`Info detail: ${text}`}
                        >
                          <Info className="h-3.5 w-3.5 shrink-0" />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent side="top" className="max-w-xs text-xs">
                        {tooltip}
                      </TooltipContent>
                    </Tooltip>
                  )}
                </li>
              );
            })}
          </ul>
        </TooltipProvider>
      </div>

      {/* BOTTOM: CTA Action & Footnote (Anchored at very bottom) */}
      <div className="mt-auto pt-5 border-t border-border/40 flex flex-col gap-2">
        {ctaHref ? (
          <Link
            href={ctaHref}
            className={cn(
              "group inline-flex w-full h-11 items-center justify-center gap-2 rounded-xl px-4 text-xs font-bold transition-all shadow-xs outline-none focus-visible:ring-2",
              isPopular
                ? isPublic
                  ? "bg-[var(--public-accent,#2563eb)] text-white hover:bg-[var(--public-accent-strong,#1d4ed8)] focus-visible:ring-primary"
                  : "bg-primary text-primary-foreground hover:bg-primary-hover focus-visible:ring-ring"
                : isPublic
                ? "border border-[var(--public-border,#1b2740)] bg-[var(--public-canvas,#070b14)] text-white hover:border-[var(--public-accent,#2563eb)] hover:bg-[var(--public-canvas-warm,#0c1320)]"
                : "border border-border-strong bg-card text-foreground hover:bg-muted dark:bg-slate-800 dark:border-slate-600 dark:hover:bg-slate-700"
            )}
          >
            <span>{ctaText}</span>
            <CtaIcon className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
          </Link>
        ) : (
          <Button
            type="button"
            disabled={ctaDisabled || ctaLoading}
            onClick={onCtaClick}
            className={cn(
              "w-full h-11 rounded-xl text-xs font-bold transition-all cursor-pointer",
              isPopular
                ? "bg-primary text-primary-foreground hover:bg-primary-hover shadow-sm"
                : isCurrentPlan
                ? "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 hover:bg-emerald-100 cursor-default"
                : "border border-border-strong bg-slate-900 text-white hover:bg-slate-800 dark:bg-slate-800 dark:hover:bg-slate-700 dark:border-slate-600"
            )}
          >
            {ctaLoading ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                <span>Memproses...</span>
              </>
            ) : (
              <div className="flex items-center justify-center gap-1.5 flex-wrap">
                <span>{ctaText}</span>
                {balanceSufficientNote && (
                  <span className="text-[10px] font-normal text-emerald-400">
                    ({balanceSufficientNote})
                  </span>
                )}
                {!isCurrentPlan && <CtaIcon className="h-3.5 w-3.5" />}
              </div>
            )}
          </Button>
        )}

        <div className="h-10 flex items-center justify-center">
          {footnote ? (
            <p
              className={cn(
                "text-[11px] leading-tight text-center line-clamp-2",
                isPublic
                  ? "text-[var(--public-subtle,#94a3b8)]"
                  : "text-muted-foreground dark:text-slate-400"
              )}
            >
              {footnote}
            </p>
          ) : (
            <span className="block h-10" aria-hidden="true" />
          )}
        </div>
      </div>
    </article>
  );

  return cardContent;
}

// ── 4. PricingSection Component ───────────────────────────────────────────────

export interface PricingSectionProps {
  id?: string;
  kicker?: string;
  title: string;
  subtitle: string;
  frequency: "monthly" | "yearly";
  onFrequencyChange: (freq: "monthly" | "yearly") => void;
  frequencies?: PricingFrequencyOption[];
  children: React.ReactNode;
  variant?: "public" | "dashboard";
  className?: string;
}

export function PricingSection({
  id = "pricing",
  kicker = "PAKET & BIAYA",
  title,
  subtitle,
  frequency,
  onFrequencyChange,
  frequencies,
  children,
  variant = "public",
  className,
}: PricingSectionProps) {
  const isPublic = variant === "public";

  return (
    <section
      id={id}
      className={cn(
        "relative py-16 sm:py-20 lg:py-24",
        isPublic
          ? "bg-[var(--public-canvas,#070b14)] text-[var(--public-body,#e8edf7)]"
          : "bg-background text-foreground",
        className
      )}
    >
      <div className="mx-auto max-w-[1240px] px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <div className="mx-auto max-w-3xl text-center">
          {kicker && (
            <div
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wider border",
                isPublic
                  ? "bg-primary/10 border-primary/20 text-primary"
                  : "bg-primary/10 border-primary/20 text-primary"
              )}
            >
              <span className="h-1.5 w-1.5 rounded-full bg-primary" aria-hidden="true" />
              {kicker}
            </div>
          )}

          <h2
            className={cn(
              "mt-4 text-[clamp(2rem,5vw,3.25rem)] font-extrabold leading-[1.08] tracking-tight",
              isPublic
                ? "public-display text-[var(--public-text,#ffffff)]"
                : "text-foreground dark:text-slate-100"
            )}
          >
            {title}
          </h2>

          <p
            className={cn(
              "mt-4 text-base leading-relaxed sm:text-lg max-w-2xl mx-auto",
              isPublic
                ? "text-[var(--public-muted,#cbd5e1)]"
                : "text-muted-foreground dark:text-slate-400"
            )}
          >
            {subtitle}
          </p>

          {/* Frequency Toggle */}
          <div className="mt-8 flex justify-center">
            <PricingFrequencyToggle
              frequencies={frequencies}
              selectedFrequency={frequency}
              onFrequencyChange={(val) => onFrequencyChange(val as "monthly" | "yearly")}
              variant={variant}
            />
          </div>
        </div>

        {/* Pricing Cards Grid */}
        <div className="mt-12 sm:mt-16 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 items-stretch">
          {children}
        </div>
      </div>
    </section>
  );
}
