// Workflow section — "Z-Axis Cascade" archetype, Editorial Luxury texture.
//
// This replaces a tabbed list that was structurally identical to CommandSlabs
// (rail of rows on the left, product surface on the right), which made the two
// sections read as the same layout twice. The cascade instead stacks the steps
// as overlapping cards whose depth shifts with position, so the section has its
// own silhouette and stays legible as a vertical scroll on a phone.
//
// Accessibility note: the steps are an ordered list of <details>-free
// disclosure buttons, so the whole sequence is reachable in DOM order and each
// panel is associated with its trigger via aria-controls — the same contract
// CommandSlabs already uses, minus the duplicate tablist semantics.

"use client";

import { useState, type KeyboardEvent } from "react";

import { motion, useReducedMotion } from "framer-motion";

import { ProductSurface, type ProductSurfaceVariant } from "@/components/landing/product-surface";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n";

type FlowStep = {
  description: string;
  id: string;
  status: string;
  surface: ProductSurfaceVariant;
  title: string;
};

const SPRING = [0.32, 0.72, 0, 1] as const;

// Each card sits slightly further right and casts a deeper shadow than the one
// before it, so the stack reads as physical depth rather than a flat list.
const CASCADE = [
  { inset: "lg:ml-0", lift: "shadow-[0_18px_40px_-24px_rgba(58,48,32,0.35)]" },
  { inset: "lg:ml-8", lift: "shadow-[0_22px_52px_-24px_rgba(58,48,32,0.4)]" },
  { inset: "lg:ml-16", lift: "shadow-[0_26px_62px_-24px_rgba(58,48,32,0.45)]" },
  { inset: "lg:ml-24", lift: "shadow-[0_30px_72px_-24px_rgba(58,48,32,0.5)]" },
  { inset: "lg:ml-32", lift: "shadow-[0_34px_84px_-24px_rgba(58,48,32,0.55)]" },
];

export function OperationalFlow() {
  const _ = useT();
  const reducedMotion = useReducedMotion();
  const [activeStep, setActiveStep] = useState(0);

  const steps: FlowStep[] = [
    { id: "overload", title: _("landing.flowOverloadTitle"), description: _("landing.flowOverloadDesc"), status: _("landing.flowStatusIncoming"), surface: "chat" },
    { id: "fragmented", title: _("landing.flowFragmentedTitle"), description: _("landing.flowFragmentedDesc"), status: _("landing.flowStatusFragmented"), surface: "accounts" },
    { id: "control", title: _("landing.flowControlTitle"), description: _("landing.flowControlDesc"), status: _("landing.flowStatusUnified"), surface: "broadcast" },
    { id: "automated", title: _("landing.flowAutomatedTitle"), description: _("landing.flowAutomatedDesc"), status: _("landing.flowStatusRunning"), surface: "automation" },
    { id: "action", title: _("landing.flowActionTitle"), description: _("landing.flowActionDesc"), status: _("landing.flowStatusComplete"), surface: "monitoring" },
  ];

  function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    if (event.key === "Home") return setActiveStep(0);
    if (event.key === "End") return setActiveStep(steps.length - 1);
    const delta = event.key === "ArrowDown" ? 1 : -1;
    setActiveStep((index + delta + steps.length) % steps.length);
  }

  return (
    <section id="workflow" className="bg-[var(--public-canvas)]">
      <div className="public-shell-width public-section">
        {/* Header: kicker, then a headline that runs into the deck rather than
            sitting beside it, so the two read as one block on mobile. */}
        <motion.div
          initial={reducedMotion ? false : { opacity: 0, y: 24 }}
          whileInView={reducedMotion ? undefined : { opacity: 1, y: 0 }}
          viewport={reducedMotion ? undefined : { once: true, margin: "-80px" }}
          transition={reducedMotion ? undefined : { duration: 0.8, ease: SPRING }}
          className="max-w-3xl"
        >
          <p className="public-mono text-[10px] uppercase tracking-[0.2em] text-[var(--public-accent)]">
            {_("landing.flowKicker")}
          </p>
          <h2 className="public-display mt-5 text-[clamp(2.25rem,7vw,4.25rem)] leading-[1.02] text-[var(--public-text)]">
            {_("landing.flowTitle")}
          </h2>
          <p className="mt-6 max-w-2xl text-base leading-[1.75] text-[var(--public-muted)] sm:text-lg sm:leading-[1.7]">
            {_("landing.flowSubtitle")}
          </p>
        </motion.div>

        {/* The cascade. Cards alternate sides of the surface on wide screens so
            the stack zig-zags instead of forming one column. */}
        <ol className="mt-14 space-y-4 sm:mt-20 sm:space-y-6">
          {steps.map((step, index) => {
            const expanded = activeStep === index;
            const panelId = `flow-panel-${step.id}`;
            const triggerId = `flow-trigger-${step.id}`;
            const flip = index % 2 === 1;
            return (
              <motion.li
                key={step.id}
                initial={reducedMotion ? false : { opacity: 0, y: 32, filter: "blur(6px)" }}
                whileInView={reducedMotion ? undefined : { opacity: 1, y: 0, filter: "blur(0px)" }}
                viewport={reducedMotion ? undefined : { once: true, margin: "-60px" }}
                transition={reducedMotion ? undefined : { duration: 0.75, ease: SPRING, delay: index * 0.05 }}
                className={cn("min-w-0", CASCADE[index].inset)}
              >
                {/* Double-bezel: outer shell holds the shadow, inner core the
                    surface, so the card reads as inset into the page. */}
                <div className={cn("rounded-[1.5rem] border border-[var(--public-border)] bg-[var(--public-canvas-warm)] p-1.5 sm:rounded-[2rem]", CASCADE[index].lift)}>
                  <div className="overflow-hidden rounded-[calc(1.5rem-0.375rem)] border border-[var(--public-border)] bg-white sm:rounded-[calc(2rem-0.375rem)]">
                    <div className={cn("grid gap-0", flip ? "lg:grid-cols-[1.05fr_1fr]" : "lg:grid-cols-[1fr_1.05fr]")}>
                      <div className="flex min-w-0 flex-col justify-between gap-6 p-6 sm:p-8 lg:p-10">
                        <div className="min-w-0">
                          <div className="flex items-center gap-3">
                            <span className="public-display text-[2rem] leading-none text-[var(--public-subtle)] sm:text-[2.5rem]">
                              {String(index + 1).padStart(2, "0")}
                            </span>
                            <span className="public-mono inline-flex items-center gap-1.5 rounded-full border border-[var(--public-border)] bg-[var(--public-canvas)] px-2.5 py-1 text-[9px] uppercase tracking-[0.16em] text-[var(--public-accent)]">
                              <span className="h-1.5 w-1.5 rounded-full bg-[var(--public-accent)]" aria-hidden="true" />
                              {step.status}
                            </span>
                          </div>
                          <h3 className="public-display mt-5 text-[1.5rem] leading-tight text-[var(--public-text)] sm:text-[1.875rem]">
                            {step.title}
                          </h3>
                          <p className="mt-4 text-[0.9375rem] leading-[1.7] text-[var(--public-muted)]">
                            {step.description}
                          </p>
                        </div>
                        <button
                          id={triggerId}
                          type="button"
                          aria-expanded={expanded}
                          aria-controls={panelId}
                          // Clicking the open step closes it; -1 means nothing is
                          // expanded. Arrow keys always land on a real step.
                          onClick={() => setActiveStep(expanded ? -1 : index)}
                          onKeyDown={(event) => handleKeyDown(event, index)}
                          className={cn(
                            "public-focus group inline-flex w-fit items-center gap-2 rounded-full border border-[var(--public-border)]",
                            "px-4 py-2 text-xs font-medium text-[var(--public-body)]",
                            "transition-colors duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] hover:bg-[var(--public-canvas)]",
                          )}
                        >
                          <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-[var(--public-canvas)] text-[var(--public-subtle)] transition-transform duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] group-hover:text-[var(--public-accent)]">
                            <svg viewBox="0 0 10 10" className={cn("h-2.5 w-2.5 transition-transform duration-500 ease-[cubic-bezier(0.32,0.72,0,1)]", expanded && "rotate-45")} fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
                              <path d="M5 1.5v7M1.5 5h7" strokeLinecap="round" />
                            </svg>
                          </span>
                          {expanded ? _("landing.flowCollapseLabel") : _("landing.flowExpandLabel")}
                        </button>
                      </div>

                      <div id={panelId} role="region" aria-labelledby={triggerId} hidden={!expanded} className="min-w-0 border-t border-[var(--public-border)] bg-[var(--public-canvas)] lg:border-l lg:border-t-0">
                        <ProductSurface variant={step.surface} />
                      </div>
                    </div>
                  </div>
                </div>
              </motion.li>
            );
          })}
        </ol>
      </div>
    </section>
  );
}