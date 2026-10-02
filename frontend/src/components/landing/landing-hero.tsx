// Landing hero — "Editorial Split" archetype, Ethereal Glass texture.
//
// The design system already ships a public palette (near-black, #292d30
// hairlines, Playfair for display, JetBrains Mono for labels), so this keeps
// that vocabulary rather than inventing a second one. What changes is depth:
// every surface here is a nested shell, motion uses a spring curve instead of
// the default ease, and the layout splits asymmetrically below the fold.

"use client";

import { motion, useReducedMotion } from "framer-motion";

import { HeroSculpture } from "@/components/landing/hero-sculpture";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";

const SPRING = [0.32, 0.72, 0, 1] as const;

const container = {
  hidden: {},
  show: { transition: { staggerChildren: 0.07, delayChildren: 0.05 } },
};

const rise = {
  hidden: { opacity: 0, y: 28, filter: "blur(10px)" },
  show: {
    opacity: 1,
    y: 0,
    filter: "blur(0px)",
    transition: { duration: 0.85, ease: SPRING },
  },
};

// The button-in-button pattern: the arrow lives in its own circular inset so it
// reads as machined hardware rather than a glyph dropped after the label.
function ArrowInset() {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "ml-1 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full",
        "bg-white/10 transition-transform duration-500 ease-[cubic-bezier(0.32,0.72,0,1)]",
        "group-hover:translate-x-0.5 group-hover:-translate-y-px",
      )}
    >
      <svg viewBox="0 0 12 12" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="1.4">
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
    <section className="relative overflow-hidden bg-[#050505]">
      {/* Ambient mesh glow — fixed, pointer-events-none, no scroll repaint. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10"
        style={{
          background:
            "radial-gradient(58rem 34rem at 78% -8%, rgba(42,171,238,0.16), transparent 62%)," +
            "radial-gradient(44rem 30rem at 6% 8%, rgba(58,211,137,0.10), transparent 58%)",
        }}
      />

      <motion.div
        variants={container}
        initial={reducedMotion ? false : "hidden"}
        animate={reducedMotion ? undefined : "show"}
        className={cn(
          "mx-auto grid max-w-[1240px] items-center gap-14 px-4 py-24 sm:px-6 sm:py-32",
          "lg:grid-cols-[minmax(0,1.05fr)_minmax(22rem,0.95fr)] lg:gap-20 lg:px-8 lg:py-40",
        )}
      >
        {/* ── Left: the pitch ─────────────────────────────────────────── */}
        <div className="min-w-0">
          <motion.div
            variants={rise}
            className={cn(
              "inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04]",
              "px-3 py-1.5 backdrop-blur-sm",
            )}
          >
            <span className="h-1.5 w-1.5 rounded-full bg-[#3ad389]" aria-hidden="true" />
            <span className="public-mono text-[10px] uppercase tracking-[0.22em] text-[#a1a4a5]">
              {_("landing.heroOverline")}
            </span>
          </motion.div>

          <motion.h1
            variants={rise}
            className={cn(
              "public-display mt-8 text-[clamp(2.75rem,6.6vw,5.75rem)] font-normal leading-[0.98]",
              "tracking-[-0.02em] text-white",
            )}
          >
            {_("landing.heroTitle")}
          </motion.h1>

          <motion.p
            variants={rise}
            className="mt-7 max-w-xl text-[1.0625rem] leading-[1.75] text-[#a1a4a5]"
          >
            {_("landing.heroSubtitle")}
          </motion.p>

          <motion.div variants={rise} className="mt-10 flex flex-col gap-3 sm:flex-row sm:items-center">
            {/* Double-bezel: p-1.5 shell, inner core carries the fill. */}
            <LinkShell href="#workflow" primary>
              {_("landing.heroCta")}
              <ArrowInset />
            </LinkShell>
            <LinkShell href="/register">{_("landing.heroSecondary")}</LinkShell>
          </motion.div>

          {/* Proof rail — hairline separators, mono numerals. */}
          <motion.dl variants={rise} className="mt-14 grid max-w-lg grid-cols-3 gap-px overflow-hidden rounded-2xl border border-white/10 bg-white/[0.06]">
            {stats.map((stat) => (
              <div key={stat.label} className="bg-[#050505] px-4 py-5">
                <dt className="sr-only">{stat.label}</dt>
                <dd>
                  <span className="public-display block text-2xl text-white">{stat.value}</span>
                  <span className="public-mono mt-2 block text-[10px] uppercase leading-4 tracking-[0.16em] text-[#6e727a]">
                    {stat.label}
                  </span>
                </dd>
              </div>
            ))}
          </motion.dl>
        </div>

        {/* ── Right: the product, framed ─────────────────────────────── */}
        <motion.div variants={rise} className="min-w-0">
          <div
            className={cn(
              "rounded-[2rem] border border-white/10 bg-white/[0.03] p-1.5",
              "shadow-[0_40px_120px_-40px_rgba(0,0,0,0.9)]",
            )}
          >
            <div className="overflow-hidden rounded-[calc(2rem-0.375rem)] border border-white/[0.06] bg-[#0b0e14] shadow-[inset_0_1px_1px_rgba(255,255,255,0.06)]">
              <HeroSculpture />
            </div>
          </div>
        </motion.div>
      </motion.div>
    </section>
  );
}

function LinkShell({
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
        "group inline-flex rounded-full p-1 transition-all duration-500 ease-[cubic-bezier(0.32,0.72,0,1)]",
        "active:scale-[0.98]",
        primary ? "border border-white/10 bg-white/[0.05]" : "border border-white/[0.06] bg-transparent",
      )}
    >
      <a
        href={href}
        className={cn(
          "public-focus inline-flex min-h-11 items-center gap-1 rounded-full px-6 text-sm font-medium",
          "transition-colors duration-500 ease-[cubic-bezier(0.32,0.72,0,1)]",
          primary
            ? "bg-white text-[#050505] hover:bg-[#e8e8e8]"
            : "bg-white/[0.04] text-white hover:bg-white/[0.09]",
        )}
      >
        {children}
      </a>
    </span>
  );
}
