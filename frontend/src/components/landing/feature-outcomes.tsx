// Feature section, written as outcomes rather than capabilities.
//
// The previous version was a disclosure list: numbered 01-05 in mono, a plus
// glyph, a `telebos <mode>` shell line, and a terminal screenshot per row. That
// read as developer documentation. Nothing here does that any more.
//
// Each card leads with what changes for the operator, then names the mechanism
// underneath. The mechanism still matters - it is what separates TeleBos from a
// generic "Telegram tool" - but it is supporting evidence, not the headline.
//
// No numbers are invented. Where a figure appears it is the deployment's own
// (304 accounts, 75K+ SMM services), and the per-card proof points are drawn
// from the i18n strings that already existed, so the copy cannot drift out of
// sync with the rest of the page.

import { Bot, MessageSquare, Send, ShieldCheck, Smartphone, TrendingUp } from "lucide-react";

import { LandingReveal } from "@/components/landing/landing-motion";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";

type Outcome = {
  /** Short label for the mechanism, kept small on purpose. */
  capability: string;
  /** What the operator is trying to do. */
  goal: string;
  icon: typeof Send;
  /** The concrete blocker this removes. */
  proof: string;
  /** What it does, in the operator's own terms. */
  outcome: string;
  stat: string;
  statLabel: string;
};

export function FeatureOutcomes() {
  const _ = useT();

  const outcomes: Outcome[] = [
    {
      icon: Smartphone,
      goal: _("landing.slabAccountsTitle"),
      outcome: _("landing.slabAccountsDesc"),
      capability: _("landing.slabVisualControl"),
      proof: _("landing.slabAccountsDesc"),
      stat: "304",
      statLabel: _("landing.proofAccounts"),
    },
    {
      icon: Send,
      goal: _("landing.slabBroadcastTitle"),
      outcome: _("landing.slabBroadcastDesc"),
      capability: _("landing.slabVisualDeliver"),
      proof: _("landing.slabVisualDelay"),
      stat: "75K+",
      statLabel: _("landing.proofBroadcast"),
    },
    {
      icon: MessageSquare,
      goal: _("landing.slabChatTitle"),
      outcome: _("landing.slabChatDesc"),
      capability: _("landing.slabVisualQueue"),
      proof: _("landing.slabChatDesc"),
      stat: "1",
      statLabel: _("landing.slabChatTitle"),
    },
    {
      icon: Bot,
      goal: _("landing.slabAutomationTitle"),
      outcome: _("landing.slabAutomationDesc"),
      capability: _("landing.slabVisualRule"),
      proof: _("landing.slabVisualSignal"),
      stat: "7",
      statLabel: _("landing.proofAutomation"),
    },
    {
      icon: ShieldCheck,
      goal: _("landing.slabMonitorTitle"),
      outcome: _("landing.slabMonitorDesc"),
      capability: _("landing.slabVisualVisible"),
      proof: _("landing.slabVisualAction"),
      stat: "24/7",
      statLabel: _("landing.slabVisualVisible"),
    },
  ];

  return (
    <section id="features" className="border-b border-[var(--public-border)] bg-[var(--public-canvas)]">
      <div className="public-shell-width public-section">
        {/* Headline. Lighter than the rest of the page on purpose: this section
            is persuasion, so it reads as a claim rather than a specification. */}
        <LandingReveal>
          <p className="public-mono text-[10px] uppercase tracking-[0.2em] text-[var(--public-accent)]">
            {_("landing.slabKicker")}
          </p>
          <h2 className="public-display mt-5 text-[clamp(2rem,5vw,3.5rem)] leading-[1.06] text-[var(--public-text)]">
            {_("landing.slabTitle")}
          </h2>
          <p className="mt-6 max-w-2xl text-base leading-7 text-[var(--public-muted)]">
            {_("landing.slabSubtitle")}
          </p>
        </LandingReveal>

        {/* Cards. Two columns on a phone, 3 equal columns in row 1 (2 cols each in 6-col grid)
            and 2 wider columns in row 2 (3 cols each) on desktop to fill the grid proportionally without dead space. */}
        <div className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-6">
          {outcomes.map((item, index) => (
            <LandingReveal
              key={item.goal}
              delay={0.04 * index}
              className={cn(
                "h-full",
                index < 3 ? "lg:col-span-2" : "lg:col-span-3",
                index === 4 && "sm:col-span-2 lg:col-span-3"
              )}
            >
              <article className="group flex h-full flex-col justify-between rounded-[var(--public-radius-card)] border border-[var(--public-border)] bg-[var(--public-canvas-warm)] p-5 sm:p-6 transition-all duration-200 hover:border-[var(--public-accent)] hover:shadow-[0_0_30px_rgba(37,99,235,0.08)]">
                <div>
                  <div className="flex items-start justify-between gap-3">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[0.7rem] border border-[var(--public-border)] bg-[var(--public-canvas)] text-[var(--public-accent)] transition-colors group-hover:border-[var(--public-accent)] group-hover:bg-[var(--public-accent)]/10">
                      <item.icon className="h-[1.15rem] w-[1.15rem]" aria-hidden="true" />
                    </span>
                    {/* The one number per card. Real figures only. */}
                    <span className="shrink-0 text-right">
                      <span className="public-display block text-[1.5rem] font-bold leading-none text-[var(--public-text)]">
                        {item.stat}
                      </span>
                      <span className="public-mono mt-1 block text-[9px] uppercase tracking-[0.12em] text-[var(--public-subtle)]">
                        {item.statLabel}
                      </span>
                    </span>
                  </div>

                  <h3 className="mt-5 text-base font-semibold leading-snug text-[var(--public-text)]">
                    {item.goal}
                  </h3>
                  <p className="mt-2.5 text-sm leading-6 text-[var(--public-muted)]">
                    {item.outcome}
                  </p>
                </div>

                {/* Mechanism as supporting evidence rather than the headline. */}
                <p className="mt-6 border-t border-[var(--public-border)] pt-4 text-xs leading-5 text-[var(--public-subtle)]">
                  <span className="text-[var(--public-body)] font-medium">{item.capability}</span>
                  <span className="mx-1.5" aria-hidden="true">
                    ·
                  </span>
                  <span>{item.proof}</span>
                </p>
              </article>
            </LandingReveal>
          ))}
        </div>
      </div>
    </section>
  );
}