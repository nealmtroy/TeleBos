"use client";

import { Check, CornerDownRight } from "lucide-react";
import { motion } from "framer-motion";

import { LandingReveal, LandingRevealGroup, landingRevealVariants } from "@/components/landing/landing-motion";
import { ProductSurface } from "@/components/landing/product-surface";
import { useT } from "@/lib/i18n";

export function EditorialStory() {
  const _ = useT();
  const problemPoints = [
    _("landing.storyProblemPoint1"),
    _("landing.storyProblemPoint2"),
    _("landing.storyProblemPoint3"),
  ];

  return (
    <section className="bg-[var(--public-canvas)]">
      <div className="public-shell-width public-section">
        <div className="grid gap-10 lg:grid-cols-[1.2fr_0.8fr] lg:gap-16">
          <LandingReveal>
            <div className="inline-flex items-center gap-1.5 rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
              <span className="h-1.5 w-1.5 rounded-full bg-primary" aria-hidden="true" />
              {_("landing.storyProblemKicker")}
            </div>
            <h2 className="public-display mt-5 max-w-2xl text-[clamp(2.5rem,5.5vw,4.25rem)] leading-[1.05] text-[var(--public-text)]">
              {_("landing.storyProblemTitle")}
            </h2>
          </LandingReveal>
          <LandingRevealGroup className="self-end">
            <motion.p variants={landingRevealVariants} className="text-base sm:text-lg leading-7 sm:leading-8 text-[var(--public-muted)]">
              {_("landing.storyProblemDesc")}
            </motion.p>
            <motion.ul variants={landingRevealVariants} className="mt-6 border-t border-[var(--public-border)]">
              {problemPoints.map((point) => (
                <motion.li variants={landingRevealVariants} key={point} className="flex gap-3 border-b border-[var(--public-border)] py-3.5 text-sm leading-relaxed text-[var(--public-body)]">
                  <CornerDownRight className="mt-1 h-4 w-4 shrink-0 text-[var(--public-subtle)]" aria-hidden="true" />
                  {point}
                </motion.li>
              ))}
            </motion.ul>
          </LandingRevealGroup>
        </div>

        <LandingRevealGroup className="grid gap-px bg-[var(--public-border)] lg:grid-cols-2 mt-12">
          <motion.article variants={landingRevealVariants} className="bg-[var(--public-canvas)] py-12 pr-0 lg:pr-12">
            <span className="public-mono text-xs uppercase font-bold text-[var(--public-subtle)]">
              {_("landing.storyConsequenceKicker")}
            </span>
            <h3 className="mt-4 max-w-lg text-2xl font-bold tracking-tight text-[var(--public-text)] sm:text-3xl">
              {_("landing.storyConsequenceTitle")}
            </h3>
            <p className="mt-4 max-w-xl text-sm leading-relaxed text-[var(--public-muted)] sm:text-base">
              {_("landing.storyConsequenceDesc")}
            </p>
            <div className="public-mono mt-8 grid grid-cols-3 divide-x divide-[var(--public-border)] border-y border-[var(--public-border)] py-4 text-xs">
              <span className="px-3 first:pl-0 font-medium text-[var(--public-subtle)]">01 / {_("landing.flowNodeAccounts")}</span>
              <span className="px-3 font-medium text-[var(--public-subtle)]">02 / {_("landing.flowNodeMessages")}</span>
              <span className="px-3 last:pr-0 font-bold text-[var(--public-danger)]">03 / {_("landing.flowStatusFragmented")}</span>
            </div>
          </motion.article>

          <motion.article variants={landingRevealVariants} className="bg-[var(--public-canvas)] py-12 lg:pl-12">
            <span className="public-mono text-xs uppercase font-bold text-[var(--public-accent)]">
              {_("landing.storySolutionKicker")}
            </span>
            <h3 className="mt-4 max-w-lg text-2xl font-bold tracking-tight text-[var(--public-text)] sm:text-3xl">
              {_("landing.storySolutionTitle")}
            </h3>
            <p className="mt-4 max-w-xl text-sm leading-relaxed text-[var(--public-muted)] sm:text-base">
              {_("landing.storySolutionDesc")}
            </p>
            <div className="mt-8 flex items-center gap-3 text-sm font-semibold text-[var(--public-body)]">
              <span className="flex h-7 w-7 items-center justify-center rounded-md border border-[var(--public-accent)] text-[var(--public-accent)]">
                <Check className="h-4 w-4" aria-hidden="true" />
              </span>
              {_("landing.flowStatusUnified")}
            </div>
          </motion.article>
        </LandingRevealGroup>

        <LandingReveal className="mt-12 lg:ml-auto lg:w-[68%]">
          <ProductSurface variant="accounts" />
        </LandingReveal>
      </div>
    </section>
  );
}
