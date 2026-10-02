"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check } from "lucide-react";

import { motion } from "framer-motion";

import { CommandSlabs } from "@/components/landing/command-slabs";
import { EditorialStory } from "@/components/landing/editorial-story";
import { LandingReveal, LandingRevealGroup, landingRevealVariants } from "@/components/landing/landing-motion";
import { LandingHero } from "@/components/landing/landing-hero";
import { OperationalFlow } from "@/components/landing/operational-flow";
import { PublicFooter } from "@/components/public/public-footer";
import { PublicShell } from "@/components/public/public-shell";
import { Navbar5 } from "@/components/ui/navbar-5";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/store/auth-store";

export default function LandingPage() {
  const { isAuthenticated, isLoading } = useAuthStore();
  const router = useRouter();
  const _ = useT();

  useEffect(() => {
    if (!isLoading && isAuthenticated) router.replace("/dashboard");
  }, [isAuthenticated, isLoading, router]);

  if (isAuthenticated) return null;

  const proofItems = [
    _("landing.proofAccounts"),
    _("landing.proofBroadcast"),
    _("landing.proofChat"),
    _("landing.proofAutomation"),
    _("landing.proofMonitoring"),
  ];
  // Bento spans: the first capability takes two columns and two rows so the grid
  // has an anchor instead of five equal cards.
  const outcomes: Array<[string, string, string, string]> = [
    [_("landing.outcomeAccountsTitle"), _("landing.outcomeAccountsDesc"), _("landing.surfaceConnected"), "lg:col-span-3 lg:row-span-2"],
    [_("landing.outcomeBroadcastTitle"), _("landing.outcomeBroadcastDesc"), _("landing.surfacePacing"), "lg:col-span-3"],
    [_("landing.outcomeVisibilityTitle"), _("landing.outcomeVisibilityDesc"), _("landing.surfaceRunning"), "lg:col-span-3"],
  ];
  const workflow = [
    [_("landing.workflowConnectTitle"), _("landing.workflowConnectDesc")],
    [_("landing.workflowConfigureTitle"), _("landing.workflowConfigureDesc")],
    [_("landing.workflowOperateTitle"), _("landing.workflowOperateDesc")],
    [_("landing.workflowReviewTitle"), _("landing.workflowReviewDesc")],
  ];

  return (
    <PublicShell header={<Navbar5 />} footer={<PublicFooter />} mainClassName="pt-16">
      <LandingHero />

      <section className="bg-[var(--public-canvas-warm)]">
        <div className="public-shell-width flex flex-wrap items-center justify-center gap-x-8 gap-y-3 py-8 sm:gap-x-12">
          {proofItems.map((item) => (
            <span key={item} className="public-mono text-[9px] uppercase tracking-[0.18em] text-[var(--public-subtle)] sm:text-[10px]">
              {item}
            </span>
          ))}
        </div>
      </section>

      <EditorialStory />
      <OperationalFlow />
      <CommandSlabs />

      {/* Capabilities — asymmetric bento. */}
      <section className="bg-[var(--public-canvas-warm)]">
        <div className="public-shell-width public-section">
          <div className="grid gap-10 lg:grid-cols-[0.85fr_1.15fr] lg:items-end lg:gap-16">
            <LandingReveal>
              <p className="public-mono text-[10px] uppercase tracking-[0.2em] text-[var(--public-accent)]">{_("landing.slabKicker")}</p>
              <h2 className="public-display mt-5 text-[clamp(2.25rem,7vw,4.25rem)] leading-[1.02] text-[var(--public-text)]">{_("landing.capabilitiesTitle")}</h2>
            </LandingReveal>
            <LandingReveal delay={0.05}>
              <p className="max-w-xl text-base leading-[1.75] text-[var(--public-muted)] lg:justify-self-end">{_("landing.capabilitiesSubtitle")}</p>
            </LandingReveal>
          </div>

          <LandingRevealGroup className="mt-14 grid gap-4 sm:mt-20 lg:grid-cols-6">
            {outcomes.map(([title, description, state, span]) => (
              <motion.article
                variants={landingRevealVariants}
                key={title}
                className={cn(
                  "flex min-w-0 flex-col justify-between rounded-[1.5rem] border border-[var(--public-border)] bg-[var(--public-canvas)] p-6 sm:p-8",
                  span,
                )}
              >
                <div className="min-w-0">
                  <h3 className="public-display text-[1.375rem] leading-tight text-[var(--public-text)] sm:text-[1.75rem]">{title}</h3>
                  <p className="mt-4 text-[0.9375rem] leading-[1.7] text-[var(--public-muted)]">{description}</p>
                </div>
                <span className="public-mono mt-8 inline-flex w-fit items-center gap-2 rounded-full border border-[var(--public-border)] px-3 py-1 text-[9px] uppercase tracking-[0.14em] text-[var(--public-success)]">
                  <span className="h-1.5 w-1.5 rounded-full bg-[var(--public-success)]" aria-hidden="true" />
                  {state}
                </span>
              </motion.article>
            ))}
          </LandingRevealGroup>
        </div>
      </section>

      {/* Workflow — four numbered rules as a printed list, not a card grid. */}
      <section className="bg-[var(--public-canvas)]">
        <div className="public-shell-width public-section">
          <LandingReveal className="max-w-3xl">
            <h2 className="public-display text-[clamp(2.25rem,7vw,4.25rem)] leading-[1.02] text-[var(--public-text)]">{_("landing.workflowTitle")}</h2>
            <p className="mt-6 text-base leading-[1.75] text-[var(--public-muted)] sm:text-lg">{_("landing.workflowSubtitle")}</p>
          </LandingReveal>
          <ol className="mt-14 sm:mt-20">
            {workflow.map(([title, description], index) => (
              <li key={title} className="public-rule">
                <LandingReveal className="grid gap-3 py-7 sm:grid-cols-[3rem_minmax(0,0.9fr)_minmax(0,1.1fr)] sm:items-baseline sm:gap-6" delay={index * 0.04}>
                  <span className="public-display text-[1.5rem] leading-none text-[var(--public-subtle)]">{String(index + 1).padStart(2, "0")}</span>
                  <h3 className="text-lg font-medium text-[var(--public-text)] sm:text-xl">{title}</h3>
                  <p className="text-[0.9375rem] leading-[1.7] text-[var(--public-muted)]">{description}</p>
                </LandingReveal>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* Trust */}
      <section className="bg-[var(--public-canvas-warm)]">
        <div className="public-shell-width public-section">
          <div className="grid gap-12 lg:grid-cols-[0.85fr_1.15fr] lg:gap-20">
            <LandingReveal>
              <p className="public-mono text-[10px] uppercase tracking-[0.2em] text-[var(--public-accent)]">{_("landing.trustKicker")}</p>
              <h2 className="public-display mt-5 text-[clamp(2.25rem,7vw,4.25rem)] leading-[1.02] text-[var(--public-text)]">{_("landing.trustTitle")}</h2>
            </LandingReveal>
            <LandingRevealGroup>
              <motion.p variants={landingRevealVariants} className="text-base leading-[1.75] text-[var(--public-muted)] sm:text-lg">{_("landing.trustDesc")}</motion.p>
              <motion.ul variants={landingRevealVariants} className="mt-8">
                {[_("landing.trustPoint1"), _("landing.trustPoint2"), _("landing.trustPoint3"), _("landing.trustPoint4")].map((point) => (
                  <motion.li variants={landingRevealVariants} key={point} className="public-rule flex gap-3 py-4 text-[0.9375rem] leading-[1.7] text-[var(--public-body)]">
                    <Check className="mt-1 h-4 w-4 shrink-0 text-[var(--public-accent)]" aria-hidden="true" />
                    {point}
                  </motion.li>
                ))}
              </motion.ul>
            </LandingRevealGroup>
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="bg-[var(--public-canvas)]">
        <div className="public-shell-width public-section">
          <LandingRevealGroup className="grid gap-10 lg:grid-cols-[1fr_auto] lg:items-end">
            <div className="min-w-0">
              <motion.p variants={landingRevealVariants} className="public-mono text-[10px] uppercase tracking-[0.2em] text-[var(--public-accent)]">{_("landing.ctaKicker")}</motion.p>
              <motion.h2 variants={landingRevealVariants} className="public-display mt-6 max-w-4xl text-[clamp(2.5rem,8vw,5rem)] leading-[0.98] text-[var(--public-text)]">{_("landing.ctaTitle")}</motion.h2>
              <motion.p variants={landingRevealVariants} className="mt-6 max-w-2xl text-base leading-[1.75] text-[var(--public-muted)] sm:text-lg">{_("landing.ctaSubtitle")}</motion.p>
            </div>
            <LandingReveal delay={0.1}>
              <Link
                href="/register"
                className={cn(
                  "group inline-flex items-center gap-1 rounded-full border border-[var(--public-border)] bg-[var(--public-canvas)] p-1",
                  "transition-all duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] active:scale-[0.98]",
                )}
              >
                <span className="public-focus inline-flex min-h-11 items-center gap-1 rounded-full bg-[#1a1714] px-6 text-sm font-medium text-[#fdfbf7] transition-colors duration-500 hover:bg-[#3d372f]">
                  {_("landing.ctaButton")}
                  <span aria-hidden="true" className="ml-0.5 inline-flex h-6 w-6 items-center justify-center rounded-full bg-[#fdfbf7]/15 transition-transform duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] group-hover:translate-x-0.5 group-hover:-translate-y-px">
                    <svg viewBox="0 0 12 12" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="1.5">
                      <path d="M2.5 9.5 9.5 2.5M4 2.5h5.5V8" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </span>
                </span>
              </Link>
            </LandingReveal>
          </LandingRevealGroup>
        </div>
      </section>
    </PublicShell>
  );
}