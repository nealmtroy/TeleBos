"use client";

// Public pricing page.
//
// Follows the shape visitors already recognise from other SaaS pricing pages:
// a headline, three plan cards side by side, a comparison table for the limits
// that matter, then the questions people ask before paying.
//
// Two things are deliberate here:
//
//  1. Prices come from src/data/plans.ts, not from this file. That module holds
//     the same figures the in-app subscription screen charges, so the public
//     page cannot drift away from what a customer is actually billed.
//
//  2. The comparison is a table, not a grid of cards. On a phone a wide grid
//     forces either horizontal scrolling or tiny columns; a real table with a
//     sticky first column stays readable, and the plan columns are the only
//     thing that needs to scroll.

import { ArrowRight, Check, Minus } from "lucide-react";

import { PublicFooter } from "@/components/public/public-footer";
import { PublicShell } from "@/components/public/public-shell";
import { publicButtonClass } from "@/components/public/public-ui";
import { LandingReveal } from "@/components/landing/landing-motion";
import { Navbar5 } from "@/components/ui/navbar-5";
import { PLANS, type PlanId } from "@/data/plans";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n";

type FeatureLine = { text: string };

// Feature bullets per tier, in the order the subscription screen lists them.
const FEATURES: Record<PlanId, FeatureLine[]> = {
  basic: [
    { text: "Text chats & direct chat management" },
    { text: "1 connected Telegram account" },
    { text: "Public channel & group catalogue search" },
    { text: "Telegram number and ID age estimate" },
    { text: "Standard proxy support & encrypted sessions" },
  ],
  pro: [
    { text: "Mass broadcast & scheduled sends" },
    { text: "Automatic auto-reply for incoming messages" },
    { text: "Up to 10 connected Telegram accounts" },
    { text: "Account folders & category filters" },
    { text: "Custom anti flood-wait delays" },
    { text: "Contact sync & log history" },
  ],
  premium: [
    { text: "Unlimited Telegram account connections" },
    { text: "Scrape target members & auto-invite to your group" },
    { text: "Fastest server queue & high priority" },
    { text: "Post reaction automation & view booster" },
    { text: "Automatic Telegram SpamBot appeals" },
    { text: "Proxy rotation filters & multi-session protection" },
    { text: "Every future feature & priority 24/7 support" },
  ],
};

/** One row of the comparison table. `cells` is keyed by plan id. */
const COMPARE_ROWS: Array<{ cells: Record<PlanId, string>; labelKey: string }> = [
  { labelKey: "accounts", cells: { basic: "free", pro: "upTo10", premium: "unlimited" } },
  { labelKey: "broadcast", cells: { basic: "no", pro: "yes", premium: "yes" } },
  { labelKey: "autoReply", cells: { basic: "no", pro: "yes", premium: "yes" } },
  { labelKey: "scheduling", cells: { basic: "no", pro: "yes", premium: "yes" } },
  { labelKey: "scrape", cells: { basic: "no", pro: "no", premium: "yes" } },
  { labelKey: "autoJoin", cells: { basic: "no", pro: "no", premium: "yes" } },
  { labelKey: "proxy", cells: { basic: "standard", pro: "standard", premium: "best" } },
  { labelKey: "appeals", cells: { basic: "no", pro: "no", premium: "yes" } },
  { labelKey: "queue", cells: { basic: "no", pro: "standard", premium: "best" } },
  { labelKey: "support", cells: { basic: "no", pro: "no", premium: "hours" } },
];

const FAQ_KEYS = ["payment", "upgrade", "cancel", "spam"] as const;

export default function PricingPage() {
  const _ = useT();

  return (
    <PublicShell header={<Navbar5 />} footer={<PublicFooter />}>
      {/* ── Headline ─────────────────────────────────────────────────────── */}
      <section className="mx-auto max-w-[1200px] px-4 pb-12 pt-16 sm:px-6 sm:pt-24 lg:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <LandingReveal>
            <p className="public-mono text-[10px] uppercase tracking-[0.2em] text-[var(--public-accent)]">
              {_("pricing.kicker")}
            </p>
            <h1 className="public-display mt-5 text-[clamp(2.1rem,5.4vw,3.6rem)] leading-[1.07] text-[var(--public-text)]">
              {_("pricing.title")}
            </h1>
            <p className="mt-6 text-base leading-7 text-[var(--public-muted)]">
              {_("pricing.subtitle")}
            </p>
          </LandingReveal>
        </div>

        {/* ── Plan cards ─────────────────────────────────────────────────── */}
        <div className="mt-14 grid gap-5 md:grid-cols-3 md:items-start">
          {PLANS.map((plan, index) => (
            <LandingReveal key={plan.id} delay={0.06 * index}>
              <article
                className={[
                  "relative flex h-full flex-col rounded-[var(--public-radius-card)] border bg-[var(--public-canvas-warm)] p-6 transition-colors duration-200",
                  plan.isPopular
                    ? "border-[var(--public-accent)] shadow-[0_0_60px_rgba(45,143,255,0.14)]"
                    : "border-[var(--public-border)] hover:border-[var(--public-accent)]",
                ].join(" ")}
              >
                {plan.isPopular && (
                  <span className="public-mono absolute -top-3 left-6 rounded-full bg-[var(--public-accent)] px-3 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--public-canvas)]">
                    {_("pricing.popular")}
                  </span>
                )}

                <h2 className="text-lg font-bold text-[var(--public-text)]">
                  {_(`pricing.headers.${plan.id}`)}
                </h2>
                <p className="mt-2.5 min-h-[3.5rem] text-sm leading-6 text-[var(--public-muted)]">
                  {_(`pricing.desc.${plan.id}`)}
                </p>

                <div className="mt-6 flex items-baseline gap-1.5">
                  <span className="public-display text-[2.4rem] font-bold leading-none text-[var(--public-text)]">
                    {plan.price}
                  </span>
                  <span className="text-sm text-[var(--public-subtle)]">
                    {_("pricing.perMonth")}
                  </span>
                </div>

                <a
                  href={plan.id === "basic" ? "/register" : "/login"}
                  className={cn(
                    publicButtonClass,
                    "mt-6 w-full justify-center",
                    plan.isPopular &&
                      "border-[var(--public-accent)] bg-[var(--public-accent)] font-semibold text-[var(--public-canvas)] hover:bg-[var(--public-accent-strong)] hover:text-[var(--public-canvas)]",
                  )}
                >
                  {_(`pricing.cta.${plan.id}`)}
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </a>

                <ul className="mt-7 space-y-3 border-t border-[var(--public-border)] pt-6">
                  {FEATURES[plan.id].map((f) => (
                    <li key={f.text} className="flex gap-2.5 text-sm leading-6 text-[var(--public-body)]">
                      <Check
                        className="mt-1 h-3.5 w-3.5 shrink-0 text-[var(--public-success)]"
                        aria-hidden="true"
                      />
                      <span>{f.text}</span>
                    </li>
                  ))}
                </ul>

                <p className="mt-6 text-xs leading-5 text-[var(--public-subtle)]">
                  {_(`pricing.footnote.${plan.id}`)}
                </p>
              </article>
            </LandingReveal>
          ))}
        </div>
      </section>

      {/* ── Comparison ───────────────────────────────────────────────────── */}
      <section
        id="compare"
        className="border-t border-[var(--public-border)] bg-[var(--public-canvas)]"
      >
        <div className="mx-auto max-w-[1200px] px-4 py-16 sm:px-6 sm:py-20 lg:px-8">
          <LandingReveal>
            <h2 className="public-display text-[clamp(1.6rem,3.4vw,2.4rem)] leading-[1.1] text-[var(--public-text)]">
              {_("pricing.compare.title")}
            </h2>
            <p className="mt-4 max-w-xl text-sm leading-6 text-[var(--public-muted)]">
              {_("pricing.compare.subtitle")}
            </p>
          </LandingReveal>

          {/* Horizontal scroll is expected and contained here: the label column
              stays put and only the three plan columns move. */}
          <div className="mt-10 -mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
            <table className="w-full min-w-[560px] border-collapse text-sm">
              <caption className="sr-only">{_("pricing.compare.limits")}</caption>
              <thead>
                <tr className="border-b border-[var(--public-border)]">
                  <th scope="col" className="w-[40%] py-3 pr-4 text-left text-xs font-semibold uppercase tracking-[0.12em] text-[var(--public-subtle)]">
                    {_("pricing.compare.limits")}
                  </th>
                  {PLANS.map((plan) => (
                    <th
                      key={plan.id}
                      scope="col"
                      className="py-3 pr-4 text-left text-sm font-bold text-[var(--public-text)] last:pr-0"
                    >
                      {_(`pricing.headers.${plan.id}`)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {COMPARE_ROWS.map((row) => (
                  <tr key={row.labelKey} className="border-b border-[var(--public-border)] last:border-b-0">
                    <th scope="row" className="py-3.5 pr-4 text-left font-normal text-[var(--public-body)]">
                      {_(`pricing.compare.rows.${row.labelKey}`)}
                    </th>
                    {PLANS.map((plan) => {
                      const raw = row.cells[plan.id];
                      const value = raw === "no" ? _("pricing.compare.values.no") : _(`pricing.compare.values.${raw}`);
                      const absent = raw === "no";
                      return (
                        <td
                          key={plan.id}
                          className="py-3.5 pr-4 text-[var(--public-body)] last:pr-0"
                        >
                          <span className={absent ? "text-[var(--public-subtle)]" : "text-[var(--public-text)]"}>
                            {value}
                          </span>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* ── FAQ ──────────────────────────────────────────────────────────── */}
      <section className="border-t border-[var(--public-border)] bg-[var(--public-canvas-warm)]">
        <div className="mx-auto max-w-[1200px] px-4 py-16 sm:px-6 sm:py-20 lg:px-8">
          <LandingReveal>
            <h2 className="public-display text-[clamp(1.6rem,3.4vw,2.4rem)] leading-[1.1] text-[var(--public-text)]">
              {_("pricing.faq.title")}
            </h2>
          </LandingReveal>

          <dl className="mt-10 grid gap-x-8 gap-y-8 md:grid-cols-2">
            {FAQ_KEYS.map((key, index) => (
              <LandingReveal key={key} delay={0.04 * index}>
                <div>
                  <dt className="flex gap-2.5 text-base font-semibold leading-6 text-[var(--public-text)]">
                    <Minus className="mt-1 h-4 w-4 shrink-0 text-[var(--public-accent)]" aria-hidden="true" />
                    {_(`pricing.faq.items.${key}.q`)}
                  </dt>
                  <dd className="mt-2.5 pl-[1.625rem] text-sm leading-6 text-[var(--public-muted)]">
                    {_(`pricing.faq.items.${key}.a`)}
                  </dd>
                </div>
              </LandingReveal>
            ))}
          </dl>
        </div>
      </section>

      {/* ── Closing band ─────────────────────────────────────────────────── */}
      <section className="border-t border-[var(--public-border)] bg-[var(--public-canvas)]">
        <div className="mx-auto max-w-[1200px] px-4 py-16 sm:px-6 sm:py-20 lg:px-8">
          <LandingReveal>
            <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="public-display text-[clamp(1.4rem,3vw,2rem)] leading-[1.12] text-[var(--public-text)]">
                  {_("pricing.ctaBand.title")}
                </h2>
                <p className="mt-3 max-w-md text-sm leading-6 text-[var(--public-muted)]">
                  {_("pricing.ctaBand.body")}
                </p>
              </div>
              <a href="/register" className={cn(
                publicButtonClass,
                "shrink-0 border-[var(--public-accent)] bg-[var(--public-accent)] font-semibold text-[var(--public-canvas)] hover:bg-[var(--public-accent-strong)] hover:text-[var(--public-canvas)]",
              )}>
                {_("pricing.ctaBand.action")}
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </a>
            </div>
          </LandingReveal>
        </div>
      </section>
    </PublicShell>
  );
}