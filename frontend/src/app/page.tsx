"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, CheckCircle2 } from "lucide-react";

import { motion } from "framer-motion";

import { CommandSlabs } from "@/components/landing/command-slabs";
import { EditorialStory } from "@/components/landing/editorial-story";
import { LandingReveal, LandingRevealGroup, landingRevealVariants } from "@/components/landing/landing-motion";
import { HeroSculpture } from "@/components/landing/hero-sculpture";
import { OperationalFlow } from "@/components/landing/operational-flow";
import { PublicFooter } from "@/components/public/public-footer";
import { PublicShell } from "@/components/public/public-shell";
import { publicButtonClass } from "@/components/public/public-ui";
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
  const outcomes = [
    [_("landing.outcomeAccountsTitle"), _("landing.outcomeAccountsDesc"), _("landing.surfaceConnected")],
    [_("landing.outcomeBroadcastTitle"), _("landing.outcomeBroadcastDesc"), _("landing.surfacePacing")],
    [_("landing.outcomeVisibilityTitle"), _("landing.outcomeVisibilityDesc"), _("landing.surfaceRunning")],
  ];
  const workflow = [
    [_("landing.workflowConnectTitle"), _("landing.workflowConnectDesc")],
    [_("landing.workflowConfigureTitle"), _("landing.workflowConfigureDesc")],
    [_("landing.workflowOperateTitle"), _("landing.workflowOperateDesc")],
    [_("landing.workflowReviewTitle"), _("landing.workflowReviewDesc")],
  ];

  return (
    <PublicShell header={<Navbar5 />} footer={<PublicFooter />} mainClassName="pt-16">
      <section className="border-b border-[#292d30] bg-black">
        <div className="mx-auto grid min-h-[calc(100svh-4rem)] max-w-[1200px] items-center gap-10 px-4 py-16 sm:px-6 sm:py-24 lg:grid-cols-[minmax(0,0.92fr)_minmax(24rem,1.08fr)] lg:gap-14 lg:px-8">
          <LandingRevealGroup className="relative z-10" immediate>
            <motion.p variants={landingRevealVariants} className="public-mono text-xs text-[#2AABEE]">{_("landing.heroOverline")}</motion.p>
            <motion.h1 variants={landingRevealVariants} className="public-display mt-7 max-w-3xl text-[clamp(3.5rem,8vw,6.5rem)] leading-[0.94] text-white">
              {_("landing.heroTitle")}
            </motion.h1>
            <motion.p variants={landingRevealVariants} className="mt-7 max-w-xl text-lg leading-8 text-[#a1a4a5]">{_("landing.heroSubtitle")}</motion.p>
            <motion.div variants={landingRevealVariants} className="mt-10 flex flex-col gap-3 sm:flex-row">
              <Link href="#workflow" className={cn(publicButtonClass, "border-white")}>
                {_("landing.heroCta")} <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
              <Link href="/register" className={publicButtonClass}>
                {_("landing.heroSecondary")}
              </Link>
            </motion.div>
            <motion.p variants={landingRevealVariants} className="public-mono mt-8 max-w-lg border-l border-[#292d30] pl-4 text-xs leading-5 text-[#6e727a]">
              {_("landing.heroProof")}
            </motion.p>
          </LandingRevealGroup>
          <LandingReveal immediate delay={0.14}>
            <HeroSculpture />
          </LandingReveal>
        </div>
      </section>

      <section className="border-b border-[#292d30] bg-black" aria-label={_("landing.heroProof")}>
        <LandingRevealGroup className="no-scrollbar mx-auto flex max-w-[1200px] overflow-x-auto px-4 sm:px-6 lg:px-8">
          {proofItems.map((item, index) => (
            <motion.div key={item} variants={landingRevealVariants} className="flex min-w-[13rem] flex-1 items-center gap-3 border-r border-[#292d30] px-5 py-5 first:border-l">
              <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[#2AABEE]" aria-hidden="true" />
              <span className="public-mono text-[11px] text-[#a1a4a5]">0{index + 1} / {item}</span>
            </motion.div>
          ))}
        </LandingRevealGroup>
      </section>

      <EditorialStory />
      <OperationalFlow />
      <CommandSlabs />

      <section className="border-b border-[#292d30] bg-black">
        <div className="mx-auto max-w-[1200px] px-4 py-20 sm:px-6 sm:py-28 lg:px-8">
          <LandingReveal className="grid gap-8 lg:grid-cols-[0.72fr_1.28fr] lg:items-end">
            <h2 className="public-display text-[clamp(2.75rem,6vw,5rem)] leading-[1.02] text-white">{_("landing.capabilitiesTitle")}</h2>
            <p className="max-w-2xl text-lg leading-8 text-[#a1a4a5] lg:justify-self-end">{_("landing.capabilitiesSubtitle")}</p>
          </LandingReveal>
          <LandingRevealGroup className="mt-14 border-y border-[#292d30]">
            {outcomes.map(([title, description, state], index) => (
              <motion.article variants={landingRevealVariants} key={title} className="grid gap-5 border-b border-[#292d30] py-8 last:border-b-0 md:grid-cols-[3rem_0.8fr_1.2fr_auto] md:items-center md:gap-8">
                <span className="public-mono text-[10px] text-[#464a4d]">0{index + 1}</span>
                <h3 className="text-xl font-medium text-white">{title}</h3>
                <p className="text-sm leading-7 text-[#a1a4a5]">{description}</p>
                <span className="public-mono flex items-center gap-2 text-xs text-[#2AABEE]">
                  <span className="h-1.5 w-1.5 rounded-full bg-[#3ad389]" aria-hidden="true" />
                  {state}
                </span>
              </motion.article>
            ))}
          </LandingRevealGroup>
        </div>
      </section>

      <section className="border-b border-[#292d30] bg-black">
        <div className="mx-auto max-w-[1200px] px-4 py-20 sm:px-6 sm:py-28 lg:px-8">
          <LandingReveal className="max-w-3xl">
            <h2 className="public-display text-[clamp(2.75rem,6vw,5rem)] leading-[1.02] text-white">{_("landing.workflowTitle")}</h2>
            <p className="mt-6 text-lg leading-8 text-[#a1a4a5]">{_("landing.workflowSubtitle")}</p>
          </LandingReveal>
          <ol className="mt-14 grid border-l border-t border-[#292d30] sm:grid-cols-2 lg:grid-cols-4">
            {workflow.map(([title, description], index) => (
              <li key={title} className="min-h-52 border-b border-r border-[#292d30]">
                <LandingReveal className="h-full p-6" delay={index * 0.045}>
                  <span className="public-mono text-[10px] text-[#2AABEE]">0{index + 1}</span>
                  <h3 className="mt-10 text-xl font-medium text-white">{title}</h3>
                  <p className="mt-4 text-sm leading-7 text-[#a1a4a5]">{description}</p>
                </LandingReveal>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="border-b border-[#292d30] bg-black">
        <div className="mx-auto grid max-w-[1200px] gap-12 px-4 py-20 sm:px-6 sm:py-28 lg:grid-cols-[0.8fr_1.2fr] lg:px-8">
          <LandingReveal>
            <p className="public-mono text-xs text-[#2AABEE]">{_("landing.trustKicker")}</p>
            <h2 className="public-display mt-5 text-[clamp(2.75rem,6vw,5rem)] leading-[1.02] text-white">{_("landing.trustTitle")}</h2>
          </LandingReveal>
          <LandingRevealGroup>
            <motion.p variants={landingRevealVariants} className="text-lg leading-8 text-[#a1a4a5]">{_("landing.trustDesc")}</motion.p>
            <motion.ul variants={landingRevealVariants} className="mt-8 border-t border-[#292d30]">
              {[_('landing.trustPoint1'), _('landing.trustPoint2'), _('landing.trustPoint3'), _('landing.trustPoint4')].map((point) => (
                <motion.li variants={landingRevealVariants} key={point} className="flex gap-3 border-b border-[#292d30] py-4 text-sm leading-6 text-[#f0f0f0]">
                  <CheckCircle2 className="mt-1 h-4 w-4 shrink-0 text-[#2AABEE]" aria-hidden="true" />
                  {point}
                </motion.li>
              ))}
            </motion.ul>
          </LandingRevealGroup>
        </div>
      </section>

      <section className="bg-black">
        <div className="mx-auto grid max-w-[1200px] gap-10 px-4 py-24 sm:px-6 sm:py-32 lg:grid-cols-[1fr_auto] lg:items-end lg:px-8">
          <LandingRevealGroup>
            <motion.p variants={landingRevealVariants} className="public-mono text-xs text-[#2AABEE]">{_("landing.ctaKicker")}</motion.p>
            <motion.h2 variants={landingRevealVariants} className="public-display mt-6 max-w-4xl text-[clamp(3rem,7vw,6rem)] leading-[0.98] text-white">{_("landing.ctaTitle")}</motion.h2>
            <motion.p variants={landingRevealVariants} className="mt-6 max-w-2xl text-lg leading-8 text-[#a1a4a5]">{_("landing.ctaSubtitle")}</motion.p>
          </LandingRevealGroup>
          <LandingReveal delay={0.1} className="lg:mb-2">
            <Link href="/register" className={cn(publicButtonClass, "border-white")}>
              {_("landing.ctaButton")} <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </LandingReveal>
        </div>
      </section>
    </PublicShell>
  );
}
