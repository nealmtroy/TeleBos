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
            <div className="grid gap-12 lg:grid-cols-[1.25fr_0.75fr] lg:gap-20">
          <LandingReveal>
            <p className="public-mono text-xs text-[var(--public-accent)]">{_("landing.storyProblemKicker")}</p>
            <h2 className="public-display mt-6 max-w-3xl text-[clamp(2.75rem,6vw,5rem)] leading-[1.02] text-[var(--public-text)]">
              {_("landing.storyProblemTitle")}
            </h2>
          </LandingReveal>
          <LandingRevealGroup className="self-end">
            <motion.p variants={landingRevealVariants} className="text-lg leading-8 text-[var(--public-muted)]">{_("landing.storyProblemDesc")}</motion.p>
            <motion.ul variants={landingRevealVariants} className="mt-8 border-t border-[var(--public-border)]">
              {problemPoints.map((point) => (
                <motion.li variants={landingRevealVariants} key={point} className="flex gap-3 border-b border-[var(--public-border)] py-4 text-sm leading-6 text-[var(--public-body)]">
                  <CornerDownRight className="mt-1 h-4 w-4 shrink-0 text-[var(--public-subtle)]" aria-hidden="true" />
                  {point}
                </motion.li>
              ))}
            </motion.ul>
          </LandingRevealGroup>
        </div>

        <LandingRevealGroup className="grid gap-px bg-[var(--public-border)] lg:grid-cols-2">
          <motion.article variants={landingRevealVariants} className="bg-[var(--public-canvas)] py-16 pr-0 lg:pr-14">
            <p className="public-mono text-xs text-[var(--public-subtle)]">{_("landing.storyConsequenceKicker")}</p>
            <h3 className="mt-5 max-w-lg text-3xl font-medium tracking-[-0.04em] text-[var(--public-text)] sm:text-5xl">
              {_("landing.storyConsequenceTitle")}
            </h3>
            <p className="mt-6 max-w-xl text-base leading-7 text-[var(--public-muted)]">{_("landing.storyConsequenceDesc")}</p>
            <div className="public-mono mt-10 grid gap-px overflow-hidden rounded-[6px] border border-[var(--public-border)] bg-[var(--public-border)] text-xs sm:grid-cols-3">
              <span className="bg-[var(--public-canvas)] px-4 py-5 text-[var(--public-subtle)]">01 / {_("landing.flowNodeAccounts")}</span>
              <span className="bg-[var(--public-canvas)] px-4 py-5 text-[var(--public-subtle)]">02 / {_("landing.flowNodeMessages")}</span>
              <span className="bg-[var(--public-canvas)] px-4 py-5 text-[var(--public-danger)]">03 / {_("landing.flowStatusFragmented")}</span>
            </div>
          </motion.article>

          <motion.article variants={landingRevealVariants} className="bg-[var(--public-canvas)] py-16 lg:pl-14">
            <p className="public-mono text-xs text-[var(--public-accent)]">{_("landing.storySolutionKicker")}</p>
            <h3 className="mt-5 max-w-lg text-3xl font-medium tracking-[-0.04em] text-[var(--public-text)] sm:text-5xl">
              {_("landing.storySolutionTitle")}
            </h3>
            <p className="mt-6 max-w-xl text-base leading-7 text-[var(--public-muted)]">{_("landing.storySolutionDesc")}</p>
            <div className="mt-8 flex items-center gap-3 text-sm text-[var(--public-body)]">
              <span className="flex h-7 w-7 items-center justify-center rounded-[6px] border border-[var(--public-accent)] text-[var(--public-accent)]">
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
