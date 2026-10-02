"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check } from "lucide-react";

import { motion } from "framer-motion";

import { CommandSlabs } from "@/components/landing/command-slabs";
import { EditorialStory } from "@/components/landing/editorial-story";
import { LandingReveal, LandingRevealGroup, landingRevealVariants } from "@/components/landing/landing-motion";
import { InfrastructureSection } from "@/components/landing/infrastructure-section";
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

      {/* Proof ticker */}
      <section className="bg-[var(--public-canvas-warm)] border-y border-[var(--public-border)]/60">
        <div className="public-shell-width flex flex-wrap items-center justify-center gap-x-8 gap-y-3 py-6 sm:gap-x-12">
          {proofItems.map((item) => (
            <span key={item} className="public-mono text-xs uppercase font-bold tracking-[0.14em] text-[var(--public-subtle)]">
              {item}
            </span>
          ))}
        </div>
      </section>

      <EditorialStory />
      <InfrastructureSection />
      <OperationalFlow />
      <CommandSlabs />

      {/* Capabilities */}
      <section className="bg-[var(--public-canvas-warm)]">
        <div className="public-shell-width public-section">
          <div className="grid gap-8 lg:grid-cols-[0.85fr_1.15fr] lg:items-end lg:gap-14">
            <LandingReveal>
              <div className="inline-flex items-center gap-1.5 rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
                <span className="h-1.5 w-1.5 rounded-full bg-primary" aria-hidden="true" />
                {_("landing.slabKicker")}
              </div>
              <h2 className="public-display mt-5 text-[clamp(2.25rem,6vw,4rem)] leading-[1.05] text-[var(--public-text)]">
                {_("landing.capabilitiesTitle")}
              </h2>
            </LandingReveal>
            <LandingReveal delay={0.05}>
              <p className="max-w-xl text-base leading-relaxed text-[var(--public-muted)] lg:justify-self-end">
                {_("landing.capabilitiesSubtitle")}
              </p>
            </LandingReveal>
          </div>

          <LandingRevealGroup className="mt-12 grid gap-4 sm:mt-16 lg:grid-cols-6">
            {outcomes.map(([title, description, state, span]) => (
              <motion.article
                variants={landingRevealVariants}
                key={title}
                className={cn(
                  "flex min-w-0 flex-col justify-between rounded-2xl border border-[var(--public-border)] bg-[var(--public-canvas)] p-6 sm:p-8 shadow-xs",
                  span,
                )}
              >
                <div className="min-w-0">
                  <h3 className="public-display text-xl font-bold leading-tight text-[var(--public-text)] sm:text-2xl">{title}</h3>
                  <p className="mt-3 text-sm leading-relaxed text-[var(--public-muted)]">{description}</p>
                </div>
                <span className="public-mono mt-6 inline-flex w-fit items-center gap-2 rounded-full border border-[var(--public-border)] bg-[var(--public-canvas-warm)] px-3 py-1 text-xs font-semibold uppercase tracking-[0.12em] text-[var(--public-success)]">
                  <span className="h-1.5 w-1.5 rounded-full bg-[var(--public-success)]" aria-hidden="true" />
                  {state}
                </span>
              </motion.article>
            ))}
          </LandingRevealGroup>
        </div>
      </section>

      {/* Workflow */}
      <section className="bg-[var(--public-canvas)]">
        <div className="public-shell-width public-section">
          <LandingReveal className="max-w-2xl">
            <h2 className="public-display text-[clamp(2.25rem,6vw,4rem)] leading-[1.05] text-[var(--public-text)]">
              {_("landing.workflowTitle")}
            </h2>
            <p className="mt-5 max-w-xl text-base leading-relaxed text-[var(--public-muted)] sm:text-lg">
              {_("landing.workflowSubtitle")}
            </p>
          </LandingReveal>
          <ol className="mt-12 sm:mt-16 divide-y divide-[var(--public-border)]">
            {workflow.map(([title, description], index) => (
              <li key={title} className="py-6 sm:py-7">
                <LandingReveal className="grid gap-3 sm:grid-cols-[3.5rem_minmax(0,0.9fr)_minmax(0,1.1fr)] sm:items-baseline sm:gap-6" delay={index * 0.04}>
                  <span className="public-display text-xl font-bold leading-none text-[var(--public-subtle)] sm:text-2xl">{String(index + 1).padStart(2, "0")}</span>
                  <h3 className="text-base sm:text-lg font-semibold text-[var(--public-text)]">{title}</h3>
                  <p className="text-sm leading-relaxed text-[var(--public-muted)]">{description}</p>
                </LandingReveal>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* Trust */}
      <section className="bg-[var(--public-canvas-warm)]">
        <div className="public-shell-width public-section">
          <div className="grid gap-10 lg:grid-cols-[0.85fr_1.15fr] lg:gap-16">
            <LandingReveal>
              <div className="inline-flex items-center gap-1.5 rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
                <span className="h-1.5 w-1.5 rounded-full bg-primary" aria-hidden="true" />
                {_("landing.trustKicker")}
              </div>
              <h2 className="public-display mt-5 text-[clamp(2.25rem,6vw,4rem)] leading-[1.05] text-[var(--public-text)]">{_("landing.trustTitle")}</h2>
            </LandingReveal>
            <LandingRevealGroup>
              <motion.p variants={landingRevealVariants} className="text-base leading-relaxed text-[var(--public-muted)] sm:text-lg">{_("landing.trustDesc")}</motion.p>
              <motion.ul variants={landingRevealVariants} className="mt-6 divide-y divide-[var(--public-border)]">
                {[_("landing.trustPoint1"), _("landing.trustPoint2"), _("landing.trustPoint3"), _("landing.trustPoint4")].map((point) => (
                  <motion.li variants={landingRevealVariants} key={point} className="flex gap-3 py-3.5 text-sm leading-relaxed text-[var(--public-body)]">
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
          <LandingRevealGroup className="grid gap-8 lg:grid-cols-[1fr_auto] lg:items-end">
            <div className="min-w-0">
              <div className="inline-flex items-center gap-1.5 rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
                <span className="h-1.5 w-1.5 rounded-full bg-primary" aria-hidden="true" />
                {_("landing.ctaKicker")}
              </div>
              <motion.h2 variants={landingRevealVariants} className="public-display mt-5 max-w-3xl text-[clamp(2.25rem,6.5vw,4.5rem)] leading-[1.02] text-[var(--public-text)]">{_("landing.ctaTitle")}</motion.h2>
              <motion.p variants={landingRevealVariants} className="mt-5 max-w-xl text-base leading-relaxed text-[var(--public-muted)] sm:text-lg">{_("landing.ctaSubtitle")}</motion.p>
            </div>
            <LandingReveal delay={0.1}>
              <Link
                href="/register"
                className={cn(
                  "group inline-flex items-center gap-1 rounded-full border border-[var(--public-border)] bg-[var(--public-canvas-warm)] p-1",
                  "transition-all duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] active:scale-[0.98]",
                )}
              >
                <span className="public-focus inline-flex min-h-11 items-center gap-2 rounded-full bg-[var(--public-accent)] px-6 py-2.5 text-sm font-semibold text-white transition-colors duration-300 hover:bg-[var(--public-accent-strong)] shadow-xs">
                  {_("landing.ctaButton")}
                  <span aria-hidden="true" className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-white/20 transition-transform duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] group-hover:translate-x-0.5 group-hover:-translate-y-px">
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