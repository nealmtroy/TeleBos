"use client";

import { useState } from "react";
import { Activity, Bot, MessageSquare, Send, Smartphone } from "lucide-react";

import { LandingReveal } from "@/components/landing/landing-motion";
import { ProductSurface, type ProductSurfaceVariant } from "@/components/landing/product-surface";
import { PublicCode } from "@/components/public/public-ui";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n";

export function CommandSlabs() {
  const _ = useT();
  const [active, setActive] = useState(0);
  const slabs: Array<{
    description: string;
    icon: typeof Smartphone;
    mode: ProductSurfaceVariant;
    title: string;
  }> = [
    { icon: Smartphone, title: _("landing.slabAccountsTitle"), description: _("landing.slabAccountsDesc"), mode: "accounts" },
    { icon: Send, title: _("landing.slabBroadcastTitle"), description: _("landing.slabBroadcastDesc"), mode: "broadcast" },
    { icon: MessageSquare, title: _("landing.slabChatTitle"), description: _("landing.slabChatDesc"), mode: "chat" },
    { icon: Bot, title: _("landing.slabAutomationTitle"), description: _("landing.slabAutomationDesc"), mode: "automation" },
    { icon: Activity, title: _("landing.slabMonitorTitle"), description: _("landing.slabMonitorDesc"), mode: "monitoring" },
  ];

  return (
    <section id="features" className="border-b border-[var(--public-border)] bg-[var(--public-canvas)]">
      <div className="mx-auto max-w-[1200px] px-4 py-20 sm:px-6 sm:py-28 lg:px-8">
        <div className="grid gap-8 lg:grid-cols-[0.8fr_1.2fr] lg:items-end">
          <LandingReveal>
            <p className="public-mono text-xs text-[var(--public-accent)]">{_("landing.slabKicker")}</p>
            <h2 className="public-display mt-5 text-[clamp(2.75rem,6vw,5rem)] leading-[1.02] text-[var(--public-text)]">{_("landing.slabTitle")}</h2>
          </LandingReveal>
          <LandingReveal delay={0.05}>
            <p className="max-w-2xl text-lg leading-8 text-[var(--public-muted)] lg:justify-self-end">{_("landing.slabSubtitle")}</p>
          </LandingReveal>
        </div>

        <LandingReveal className="mt-14 border-y border-[var(--public-border)]" delay={0.08}>
          {slabs.map((slab, index) => {
            const Icon = slab.icon;
            const expanded = active === index;
            const triggerId = `command-trigger-${slab.mode}`;
            const panelId = `command-panel-${slab.mode}`;
            return (
              <article key={slab.mode} className="border-b border-[var(--public-border)] last:border-b-0">
                <h3>
                  <button
                    id={triggerId}
                    type="button"
                    aria-expanded={expanded}
                    aria-controls={panelId}
                    onClick={() => setActive(index)}
                    className={cn(
                      "public-focus grid w-full grid-cols-[2rem_auto_1fr_auto] items-center gap-4 rounded-[6px] px-1 py-6 text-left transition-colors duration-150 sm:grid-cols-[3rem_auto_1fr_auto]",
                      expanded ? "text-[var(--public-text)]" : "text-[var(--public-muted)] hover:text-[var(--public-body)]"
                    )}
                  >
                    <span className="public-mono text-[10px] text-[var(--public-subtle)]">0{index + 1}</span>
                    <Icon className={cn("h-5 w-5", expanded ? "text-[var(--public-accent)]" : "text-[var(--public-subtle)]")} aria-hidden="true" />
                    <span className="font-medium">{slab.title}</span>
                    <span className="public-mono text-lg text-[var(--public-subtle)]" aria-hidden="true">{expanded ? "−" : "+"}</span>
                  </button>
                </h3>
                {expanded && (
                  <div
                    id={panelId}
                    role="region"
                    aria-labelledby={triggerId}
                    className="grid gap-8 border-t border-[var(--public-border)] px-1 py-8 lg:grid-cols-[minmax(0,0.7fr)_minmax(0,1.3fr)]"
                  >
                    <div>
                      <p className="max-w-lg text-sm leading-7 text-[var(--public-body)]">{slab.description}</p>
                      <PublicCode className="mt-6 rounded-[6px] p-4 text-xs leading-6">
                        <span className="text-[var(--public-subtle)]">$ telebos </span>
                        <span className="text-[var(--public-accent)]">{slab.mode}</span>{"\n"}
                        <span className="text-[var(--public-muted)]">{_("landing.surfaceProgress")}: </span>
                        <span className="text-[var(--public-success)]">{_("landing.surfaceReady")}</span>
                      </PublicCode>
                    </div>
                    <ProductSurface variant={slab.mode} compact />
                  </div>
                )}
              </article>
            );
          })}
        </LandingReveal>
      </div>
    </section>
  );
}
