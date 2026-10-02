// Landing hero — "Editorial Split" archetype, clean precision.
//
// Palette is dark canvas (--public-canvas) with accessible high-contrast text.
// Every colour comes from the theme tokens rather than hardcoded muddy hexes.
//
// Sizing is fluid via clamp() and capped at comfortable readable heights,
// avoiding oversized 88px/105vh text overflows.

"use client";

import Link from "next/link";
import { motion, useReducedMotion } from "framer-motion";

import { HeroDashboardMockup } from "@/components/landing/hero-dashboard-mockup";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";

const SPRING = [0.32, 0.72, 0, 1] as const;

const container = {
  hidden: {},
  show: { transition: { staggerChildren: 0.06, delayChildren: 0.04 } },
};

const rise = {
  hidden: { opacity: 0, y: 20, filter: "blur(4px)" },
  show: {
    opacity: 1,
    y: 0,
    filter: "blur(0px)",
    transition: { duration: 0.65, ease: SPRING },
  },
};

function ArrowInset() {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "ml-1 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full",
        "bg-white/20 transition-transform duration-500 ease-[cubic-bezier(0.32,0.72,0,1)]",
        "group-hover:translate-x-0.5 group-hover:-translate-y-px",
      )}
    >
      <svg viewBox="0 0 12 12" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="M2.5 9.5 9.5 2.5M4 2.5h5.5V8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  );
}

export function LandingHero() {
  const _ = useT();
  const reducedMotion = useReducedMotion();

  const stats = [
    { value: "304", label: _("landing.statAccounts") },
    { value: "75K+", label: _("landing.statServices") },
    { value: "7", label: _("landing.statPillars") },
  ];

  return (
    <section className="relative isolate overflow-hidden bg-[var(--public-canvas)]">
      <motion.div
        variants={container}
        initial={reducedMotion ? false : "hidden"}
        animate={reducedMotion ? undefined : "show"}
        className="public-shell-width grid items-center gap-12 py-16 sm:py-20 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)] lg:gap-14 lg:py-28"
      >
        <div className="min-w-0">
          <motion.div
            variants={rise}
            className="inline-flex max-w-full items-center gap-2 rounded-full border border-[var(--public-border)] bg-[var(--public-canvas-warm)] px-3.5 py-1.5"
          >
            <span className="h-2 w-2 shrink-0 rounded-full bg-[var(--public-success)]" aria-hidden="true" />
            <span className="public-mono text-xs uppercase tracking-[0.16em] text-[var(--public-body)]">
              {_("landing.heroOverline")}
            </span>
          </motion.div>

          <motion.h1
            variants={rise}
            className="public-display mt-6 max-w-2xl text-[clamp(2.125rem,5.5vw,3.75rem)] leading-[1.08] tracking-[-0.035em] text-[var(--public-text)]"
          >
            {_("landing.heroTitle")}
          </motion.h1>

          <motion.p
            variants={rise}
            className="mt-5 max-w-xl text-base leading-[1.7] text-[var(--public-muted)] sm:text-lg sm:leading-[1.75]"
          >
            {_("landing.heroSubtitle")}
          </motion.p>

          <motion.div
            variants={rise}
            className="mt-8 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center"
          >
            <Cta href="#workflow" primary>
              {_("landing.heroCta")}
              <ArrowInset />
            </Cta>
            <Cta href="/register">{_("landing.heroSecondary")}</Cta>
          </motion.div>

          <motion.dl
            variants={rise}
            className="mt-10 grid grid-cols-3 gap-px overflow-hidden rounded-[1.25rem] border border-[var(--public-border)] bg-[var(--public-border)]"
          >
            {stats.map((stat) => (
              <div key={stat.label} className="min-w-0 bg-[var(--public-canvas)] px-3 py-4 sm:px-5 sm:py-5">
                <dt className="sr-only">{stat.label}</dt>
                <dd className="min-w-0">
                  <span className="public-display block text-[1.375rem] leading-none text-[var(--public-text)] sm:text-2xl">
                    {stat.value}
                  </span>
                  <span className="public-mono mt-2 block text-xs uppercase leading-[1.45] tracking-[0.14em] text-[var(--public-subtle)]">
                    {stat.label}
                  </span>
                </dd>
              </div>
            ))}
          </motion.dl>
        </div>

        {/* Double-bezel: clean outer shell without wide glowing blur */}
        <motion.div variants={rise} className="min-w-0 lg:pl-4">
          <div className="rounded-[1.75rem] border border-[var(--public-border)] bg-[var(--public-canvas-warm)] p-1.5 sm:rounded-[2rem]">
            <div className="overflow-hidden rounded-[calc(1.75rem-0.375rem)] border border-[var(--public-border)] bg-[var(--public-canvas)] sm:rounded-[calc(2rem-0.375rem)]">
              <HeroDashboardMockup />
            </div>
          </div>
        </motion.div>
      </motion.div>
    </section>
  );
}

function Cta({
  href,
  children,
  primary = false,
}: {
  href: string;
  children: React.ReactNode;
  primary?: boolean;
}) {
  return (
    <span
      className={cn(
        "group inline-flex w-full rounded-full p-1 transition-all duration-300 ease-[cubic-bezier(0.32,0.72,0,1)]",
        "active:scale-[0.98] sm:w-auto",
        primary
          ? "border border-[var(--public-border)] bg-[var(--public-canvas-warm)]"
          : "border border-[var(--public-border)]/70",
      )}
    >
      <Link
        href={href}
        className={cn(
          "public-focus inline-flex min-h-11 w-full items-center justify-center gap-1.5 rounded-full px-6 py-2.5 text-sm font-semibold",
          "transition-colors duration-300 ease-[cubic-bezier(0.32,0.72,0,1)]",
          primary
            ? "bg-[var(--public-accent)] text-white hover:bg-[var(--public-accent-strong)] shadow-xs"
            : "bg-[var(--public-canvas-warm)] text-[var(--public-text)] hover:bg-[var(--public-border)]/60",
        )}
      >
        {children}
      </Link>
    </span>
  );
}