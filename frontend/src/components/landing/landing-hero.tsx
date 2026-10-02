// Landing hero — "Editorial Split" archetype, Editorial Luxury texture.
//
// Palette is warm paper (--public-canvas) with espresso ink, not a dark
// console: the display serif is the point, so the surface has to be quiet
// enough to let it read. Every colour below comes from the theme tokens rather
// than being written inline, so the palette can move in one place.
//
// Sizing is fluid via clamp() rather than breakpoint jumps — a 5rem headline at
// 375px either overflows or shrinks in ugly steps, and clamp avoids both.
//
// Layout: the pitch sits in a left column and the product frame in a right
// column on desktop. Below lg the two stack, and the pitch stays first in the
// DOM so a phone user reads the headline before the screenshot.

"use client";

import Link from "next/link";

import { motion, useReducedMotion } from "framer-motion";

import { HeroSculpture } from "@/components/landing/hero-sculpture";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";

const SPRING = [0.32, 0.72, 0, 1] as const;

const container = {
  hidden: {},
  show: { transition: { staggerChildren: 0.06, delayChildren: 0.04 } },
};

const rise = {
  hidden: { opacity: 0, y: 24, filter: "blur(8px)" },
  show: {
    opacity: 1,
    y: 0,
    filter: "blur(0px)",
    transition: { duration: 0.8, ease: SPRING },
  },
};

// The arrow lives in its own circular inset so it reads as a machined part
// rather than a glyph dropped after the label.
function ArrowInset() {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "ml-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full",
        "bg-[var(--public-accent)]/[0.07] transition-transform duration-500 ease-[cubic-bezier(0.32,0.72,0,1)]",
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
      {/* Warm daylight wash — fixed and pointer-events-none so scrolling never
          repaints it. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10"
        style={{
          background:
            "radial-gradient(46rem 28rem at 82% -10%, rgba(107,127,106,0.16), transparent 62%)," +
            "radial-gradient(34rem 24rem at 2% 6%, rgba(176,125,43,0.10), transparent 58%)",
        }}
      />

      <motion.div
        variants={container}
        initial={reducedMotion ? false : "hidden"}
        animate={reducedMotion ? undefined : "show"}
        className="public-shell-width grid items-center gap-14 py-20 sm:py-24 lg:grid-cols-[minmax(0,1.04fr)_minmax(0,0.96fr)] lg:gap-16 lg:py-36"
      >
        <div className="min-w-0">
          <motion.div
            variants={rise}
            className="inline-flex max-w-full items-center gap-2 rounded-full border border-[var(--public-border)] bg-[var(--public-canvas-warm)] px-3 py-1.5"
          >
            <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[#6b7f6a]" aria-hidden="true" />
            <span className="public-mono text-[9px] uppercase tracking-[0.2em] text-[#6b6255] sm:text-[10px]">
              {_("landing.heroOverline")}
            </span>
          </motion.div>

          <motion.h1
            variants={rise}
            className="public-display mt-7 text-[clamp(2.375rem,10.5vw,5.5rem)] leading-[0.96] text-[var(--public-text)]"
          >
            {_("landing.heroTitle")}
          </motion.h1>

          <motion.p
            variants={rise}
            className="mt-6 max-w-xl text-[0.9375rem] leading-[1.7] text-[#6b6255] sm:text-base sm:leading-[1.75]"
          >
            {_("landing.heroSubtitle")}
          </motion.p>

          <motion.div
            variants={rise}
            className="mt-9 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center"
          >
            <Cta href="#workflow" primary>
              {_("landing.heroCta")}
              <ArrowInset />
            </Cta>
            <Cta href="/register">{_("landing.heroSecondary")}</Cta>
          </motion.div>

          <motion.dl
            variants={rise}
            className="mt-12 grid grid-cols-3 gap-px overflow-hidden rounded-[1.5rem] border border-[var(--public-border)] bg-[var(--public-border)]"
          >
            {stats.map((stat) => (
              <div key={stat.label} className="min-w-0 bg-[var(--public-canvas)] px-3 py-4 sm:px-5 sm:py-5">
                <dt className="sr-only">{stat.label}</dt>
                <dd className="min-w-0">
                  <span className="public-display block text-[1.375rem] leading-none text-[var(--public-text)] sm:text-2xl">
                    {stat.value}
                  </span>
                  <span className="public-mono mt-2 block text-[9px] uppercase leading-[1.45] tracking-[0.12em] text-[#9a9084] sm:text-[10px] sm:tracking-[0.16em]">
                    {stat.label}
                  </span>
                </dd>
              </div>
            ))}
          </motion.dl>
        </div>

        {/* Double-bezel: outer shell plus inner core with an inset highlight,
            so the frame reads as a printed plate rather than a flat panel. */}
        <motion.div variants={rise} className="min-w-0 lg:pl-4">
          <div className="rounded-[1.75rem] border border-[var(--public-border)] bg-[var(--public-canvas-warm)] p-1.5 shadow-[0_30px_80px_-30px_rgba(45,143,255,0.35)] sm:rounded-[2rem]">
            <div className="overflow-hidden rounded-[calc(1.75rem-0.375rem)] border border-[var(--public-border)] bg-white shadow-[inset_0_1px_1px_rgba(255,255,255,0.9)] sm:rounded-[calc(2rem-0.375rem)]">
              <HeroSculpture />
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
        "group inline-flex w-full rounded-full p-1 transition-all duration-500 ease-[cubic-bezier(0.32,0.72,0,1)]",
        "active:scale-[0.98] sm:w-auto",
        primary ? "border border-[var(--public-border)] bg-[var(--public-canvas-warm)]" : "border border-[var(--public-border)]/60",
      )}
    >
      <Link
        href={href}
        className={cn(
          "public-focus inline-flex min-h-11 w-full items-center justify-center gap-1 rounded-full px-5 text-sm font-medium",
          "transition-colors duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] sm:px-6",
          primary
            ? "bg-[var(--public-accent)] text-white hover:bg-[var(--public-accent-strong)]"
            : "bg-[var(--public-canvas-warm)] text-[var(--public-text)] hover:bg-[var(--public-accent-strong)]",
        )}
      >
        {children}
      </Link>
    </span>
  );
}