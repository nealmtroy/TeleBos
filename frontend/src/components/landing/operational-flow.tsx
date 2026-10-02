// Workflow section — "Z-Axis Cascade" archetype.
//
// Stacks the steps as clear, accessible cards. Depth is communicated through
// tonal layering and clean borders rather than wide artificial drop shadows.

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

const CASCADE_INSETS = [
  "lg:ml-0",
  "lg:ml-6",
  "lg:ml-12",
  "lg:ml-18",
  "lg:ml-24",
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
        <motion.div
          initial={reducedMotion ? false : { opacity: 0, y: 20 }}
          whileInView={reducedMotion ? undefined : { opacity: 1, y: 0 }}
          viewport={reducedMotion ? undefined : { once: true, margin: "-60px" }}
          transition={reducedMotion ? undefined : { duration: 0.6, ease: SPRING }}
          className="max-w-3xl"
        >
          <div className="inline-flex items-center gap-1.5 rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
            <span className="h-1.5 w-1.5 rounded-full bg-primary" aria-hidden="true" />
            {_("landing.flowKicker")}
          </div>
          <h2 className="public-display mt-5 text-[clamp(2.25rem,6.5vw,3.75rem)] leading-[1.05] text-[var(--public-text)]">
            {_("landing.flowTitle")}
          </h2>
          <p className="mt-5 max-w-2xl text-base leading-[1.7] text-[var(--public-muted)] sm:text-lg">
            {_("landing.flowSubtitle")}
          </p>
        </motion.div>

        {/* The cascade */}
        <ol className="mt-12 space-y-4 sm:mt-16 sm:space-y-5">
          {steps.map((step, index) => {
            const expanded = activeStep === index;
            const panelId = `flow-panel-${step.id}`;
            const triggerId = `flow-trigger-${step.id}`;
            const flip = index % 2 === 1;
            return (
              <motion.li
                key={step.id}
                initial={reducedMotion ? false : { opacity: 0, y: 24 }}
                whileInView={reducedMotion ? undefined : { opacity: 1, y: 0 }}
                viewport={reducedMotion ? undefined : { once: true, margin: "-50px" }}
                transition={reducedMotion ? undefined : { duration: 0.6, ease: SPRING, delay: index * 0.04 }}
                className={cn("min-w-0", CASCADE_INSETS[index] || "lg:ml-0")}
              >
                <div className="rounded-2xl border border-[var(--public-border)] bg-[var(--public-canvas-warm)] p-1.5 shadow-xs">
                  <div className="overflow-hidden rounded-xl border border-[var(--public-border)]/80 bg-[var(--public-canvas)]">
                    <div className={cn("grid gap-0", flip ? "lg:grid-cols-[1.05fr_1fr]" : "lg:grid-cols-[1fr_1.05fr]")}>
                      <div className="flex min-w-0 flex-col justify-between gap-6 p-6 sm:p-8">
                        <div className="min-w-0">
                          <div className="flex items-center gap-3">
                            <span className="public-display text-2xl font-bold leading-none text-[var(--public-subtle)] sm:text-3xl">
                              {String(index + 1).padStart(2, "0")}
                            </span>
                            <span className="public-mono inline-flex items-center gap-1.5 rounded-full border border-[var(--public-border)] bg-[var(--public-canvas-warm)] px-3 py-1 text-xs font-semibold uppercase tracking-[0.12em] text-[var(--public-accent)]">
                              <span className="h-1.5 w-1.5 rounded-full bg-[var(--public-accent)]" aria-hidden="true" />
                              {step.status}
                            </span>
                          </div>
                          <h3 className="public-display mt-4 text-xl font-bold leading-tight text-[var(--public-text)] sm:text-2xl">
                            {step.title}
                          </h3>
                          <p className="mt-3 text-sm leading-[1.7] text-[var(--public-muted)] sm:text-base">
                            {step.description}
                          </p>
                        </div>
                        <button
                          id={triggerId}
                          type="button"
                          aria-expanded={expanded}
                          aria-controls={panelId}
                          onClick={() => setActiveStep(expanded ? -1 : index)}
                          onKeyDown={(event) => handleKeyDown(event, index)}
                          className={cn(
                            "public-focus group inline-flex w-fit items-center gap-2 rounded-full border border-[var(--public-border)]",
                            "px-4 py-2 text-xs font-semibold text-[var(--public-body)]",
                            "transition-colors duration-200 hover:bg-[var(--public-canvas-warm)]",
                          )}
                        >
                          <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-[var(--public-canvas-warm)] text-[var(--public-subtle)] transition-transform duration-200 group-hover:text-[var(--public-accent)]">
                            <svg viewBox="0 0 10 10" className={cn("h-2.5 w-2.5 transition-transform duration-200", expanded && "rotate-45")} fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
                              <path d="M5 1.5v7M1.5 5h7" strokeLinecap="round" />
                            </svg>
                          </span>
                          {expanded ? _("landing.flowCollapseLabel") : _("landing.flowExpandLabel")}
                        </button>
                      </div>

                      <div id={panelId} role="region" aria-labelledby={triggerId} hidden={!expanded} className="min-w-0 border-t border-[var(--public-border)] bg-[var(--public-canvas-warm)] lg:border-l lg:border-t-0">
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