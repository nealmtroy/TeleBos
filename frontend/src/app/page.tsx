"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, ShieldCheck, Zap, Radio, Bot, ShoppingCart } from "lucide-react";

import { motion } from "framer-motion";

import { FeatureOutcomes } from "@/components/landing/feature-outcomes";
import { LandingReveal, LandingRevealGroup, landingRevealVariants } from "@/components/landing/landing-motion";
import { LandingHero } from "@/components/landing/landing-hero";
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
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    if (!isLoading && isAuthenticated) router.replace("/dashboard");
  }, [isAuthenticated, isLoading, router]);

  if (mounted && isAuthenticated) return null;

  const proofItems = [
    _("landing.proofAccounts"),
    _("landing.proofBroadcast"),
    _("landing.proofChat"),
    _("landing.proofAutomation"),
    _("landing.proofMonitoring"),
  ];

  const capabilities = [
    {
      badge: "KIRIM PROMOSI MASSAL",
      icon: Zap,
      title: _("landing.outcomeAccountsTitle"),
      description: _("landing.outcomeAccountsDesc"),
      state: _("landing.surfacePacing"),
      span: "lg:col-span-3",
    },
    {
      badge: "GROWTH KOMUNITAS",
      icon: Radio,
      title: _("landing.outcomeBroadcastTitle"),
      description: _("landing.outcomeBroadcastDesc"),
      state: _("landing.surfaceRunning"),
      span: "lg:col-span-3",
    },
    {
      badge: "CHAT & AUTO-REPLY",
      icon: Bot,
      title: _("landing.outcomeVisibilityTitle"),
      description: _("landing.outcomeVisibilityDesc"),
      state: _("landing.surfaceDelivered"),
      span: "lg:col-span-2",
    },
    {
      badge: "MARKETPLACE & SMM",
      icon: ShoppingCart,
      title: _("landing.capabilityAccountsTitle"),
      description: _("landing.capabilityAccountsDesc"),
      state: _("landing.surfaceReady"),
      span: "lg:col-span-2",
    },
    {
      badge: "PENGAMAN AKUN",
      icon: ShieldCheck,
      title: _("landing.capabilityBroadcastTitle"),
      description: _("landing.capabilityBroadcastDesc"),
      state: _("landing.surfaceEnabled"),
      span: "lg:col-span-2",
    },
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
        <div className="public-shell-width flex flex-wrap items-center justify-center gap-x-8 gap-y-3 py-4 sm:gap-x-12">
          {proofItems.map((item) => (
            <span key={item} className="public-mono text-xs uppercase font-bold tracking-[0.14em] text-[var(--public-subtle)]">
              {item}
            </span>
          ))}
        </div>
      </section>

      {/* What You Can Do (Capabilities / Benefits) */}
      <section className="bg-[var(--public-canvas)]">
        <div className="public-shell-width public-section">
          <div className="grid gap-8 lg:grid-cols-[0.85fr_1.15fr] lg:items-end lg:gap-14">
            <LandingReveal>
              <div className="inline-flex items-center gap-1.5 rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
                <span className="h-1.5 w-1.5 rounded-full bg-primary" aria-hidden="true" />
                {_("landing.slabKicker")}
              </div>
              <h2 className="public-display mt-5 text-[clamp(2.25rem,6vw,3.75rem)] leading-[1.08] text-[var(--public-text)]">
                {_("landing.capabilitiesTitle")}
              </h2>
            </LandingReveal>
            <LandingReveal delay={0.05}>
              <p className="max-w-xl text-base leading-relaxed text-[var(--public-muted)] lg:justify-self-end">
                {_("landing.capabilitiesSubtitle")}
              </p>
            </LandingReveal>
          </div>

          <LandingRevealGroup className="mt-10 grid gap-4 sm:mt-12 lg:grid-cols-6">
            {capabilities.map((cap) => {
              const Icon = cap.icon;
              return (
                <motion.article
                  variants={landingRevealVariants}
                  key={cap.title}
                  className={cn(
                    "flex min-w-0 flex-col justify-between rounded-2xl border border-[var(--public-border)] bg-[var(--public-canvas-warm)] p-6 sm:p-7 shadow-xs",
                    cap.span,
                  )}
                >
                  <div className="min-w-0">
                    <div className="flex items-center justify-between gap-3">
                      <span className="inline-flex items-center gap-2 rounded-md border border-[var(--public-border)] bg-[var(--public-canvas)] px-2.5 py-1 text-xs font-semibold text-[var(--public-accent)]">
                        <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                        {cap.badge}
                      </span>
                      <span className="public-mono inline-flex w-fit items-center gap-1.5 rounded-full border border-[var(--public-border)] bg-[var(--public-canvas)] px-2.5 py-0.5 text-xs font-semibold uppercase tracking-[0.1em] text-[var(--public-success)]">
                        <span className="h-1.5 w-1.5 rounded-full bg-[var(--public-success)]" aria-hidden="true" />
                        {cap.state}
                      </span>
                    </div>
                    <h3 className="public-display mt-4 text-lg font-bold leading-snug text-[var(--public-text)] sm:text-xl">{cap.title}</h3>
                    <p className="mt-2.5 text-sm leading-relaxed text-[var(--public-muted)]">{cap.description}</p>
                  </div>
                </motion.article>
              );
            })}
          </LandingRevealGroup>
        </div>
      </section>

      {/* Interactive Feature Showcase */}
      <FeatureOutcomes />

      {/* How It Works (3 Steps) */}
      <section id="workflow" className="bg-[var(--public-canvas-warm)]">
        <div className="public-shell-width public-section">
          <LandingReveal className="max-w-2xl">
            <div className="inline-flex items-center gap-1.5 rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
              <span className="h-1.5 w-1.5 rounded-full bg-primary" aria-hidden="true" />
              {_("landing.navWorkflow")}
            </div>
            <h2 className="public-display mt-5 text-[clamp(2.25rem,6vw,3.75rem)] leading-[1.08] text-[var(--public-text)]">
              {_("landing.workflowTitle")}
            </h2>
            <p className="mt-4 max-w-xl text-base leading-relaxed text-[var(--public-muted)] sm:text-lg">
              {_("landing.workflowSubtitle")}
            </p>
          </LandingReveal>
          <ol className="mt-10 sm:mt-12 divide-y divide-[var(--public-border)]">
            {workflow.map(([title, description], index) => (
              <li key={title} className="py-5 sm:py-6">
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

      {/* Trust & Security */}
      <section className="bg-[var(--public-canvas)]">
        <div className="public-shell-width public-section">
          <div className="grid gap-10 lg:grid-cols-[0.85fr_1.15fr] lg:gap-16">
            <LandingReveal>
              <div className="inline-flex items-center gap-1.5 rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
                <span className="h-1.5 w-1.5 rounded-full bg-primary" aria-hidden="true" />
                {_("landing.trustKicker")}
              </div>
              <h2 className="public-display mt-5 text-[clamp(2.25rem,6vw,3.75rem)] leading-[1.08] text-[var(--public-text)]">{_("landing.trustTitle")}</h2>
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
      <section className="bg-[var(--public-canvas-warm)]">
        <div className="public-shell-width public-section">
          <LandingRevealGroup className="grid gap-8 lg:grid-cols-[1fr_auto] lg:items-end">
            <div className="min-w-0">
              <div className="inline-flex items-center gap-1.5 rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
                <span className="h-1.5 w-1.5 rounded-full bg-primary" aria-hidden="true" />
                {_("landing.ctaKicker")}
              </div>
              <motion.h2 variants={landingRevealVariants} className="public-display mt-5 max-w-3xl text-[clamp(2.25rem,6.5vw,4.25rem)] leading-[1.02] text-[var(--public-text)]">{_("landing.ctaTitle")}</motion.h2>
              <motion.p variants={landingRevealVariants} className="mt-4 max-w-xl text-base leading-relaxed text-[var(--public-muted)] sm:text-lg">{_("landing.ctaSubtitle")}</motion.p>
            </div>
            <LandingReveal delay={0.1}>
              <Link
                href="/register"
                className={cn(
                  "group inline-flex items-center gap-1 rounded-full border border-[var(--public-border)] bg-[var(--public-canvas)] p-1",
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