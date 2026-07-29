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
    <section className="border-b border-[#292d30] bg-black">
      <div className="mx-auto max-w-[1200px] px-4 py-20 sm:px-6 sm:py-28 lg:px-8">
        <div className="grid gap-12 border-b border-[#292d30] pb-20 lg:grid-cols-[1.25fr_0.75fr] lg:gap-24">
          <LandingReveal>
            <p className="public-mono text-xs text-[#2AABEE]">{_("landing.storyProblemKicker")}</p>
            <h2 className="public-display mt-6 max-w-3xl text-[clamp(2.75rem,6vw,5rem)] leading-[1.02] text-white">
              {_("landing.storyProblemTitle")}
            </h2>
          </LandingReveal>
          <LandingRevealGroup className="self-end">
            <motion.p variants={landingRevealVariants} className="text-lg leading-8 text-[#a1a4a5]">{_("landing.storyProblemDesc")}</motion.p>
            <motion.ul variants={landingRevealVariants} className="mt-8 border-t border-[#292d30]">
              {problemPoints.map((point) => (
                <motion.li variants={landingRevealVariants} key={point} className="flex gap-3 border-b border-[#292d30] py-4 text-sm leading-6 text-[#f0f0f0]">
                  <CornerDownRight className="mt-1 h-4 w-4 shrink-0 text-[#6e727a]" aria-hidden="true" />
                  {point}
                </motion.li>
              ))}
            </motion.ul>
          </LandingRevealGroup>
        </div>

        <LandingRevealGroup className="grid gap-px bg-[#292d30] lg:grid-cols-2">
          <motion.article variants={landingRevealVariants} className="bg-black py-16 pr-0 lg:pr-14">
            <p className="public-mono text-xs text-[#6e727a]">{_("landing.storyConsequenceKicker")}</p>
            <h3 className="mt-5 max-w-lg text-3xl font-medium tracking-[-0.04em] text-white sm:text-5xl">
              {_("landing.storyConsequenceTitle")}
            </h3>
            <p className="mt-6 max-w-xl text-base leading-7 text-[#a1a4a5]">{_("landing.storyConsequenceDesc")}</p>
            <div className="public-mono mt-10 grid gap-px overflow-hidden rounded-[6px] border border-[#292d30] bg-[#292d30] text-xs sm:grid-cols-3">
              <span className="bg-black px-4 py-5 text-[#6e727a]">01 / {_("landing.flowNodeAccounts")}</span>
              <span className="bg-black px-4 py-5 text-[#6e727a]">02 / {_("landing.flowNodeMessages")}</span>
              <span className="bg-black px-4 py-5 text-[#ff9592]">03 / {_("landing.flowStatusFragmented")}</span>
            </div>
          </motion.article>

          <motion.article variants={landingRevealVariants} className="bg-black py-16 lg:pl-14">
            <p className="public-mono text-xs text-[#2AABEE]">{_("landing.storySolutionKicker")}</p>
            <h3 className="mt-5 max-w-lg text-3xl font-medium tracking-[-0.04em] text-white sm:text-5xl">
              {_("landing.storySolutionTitle")}
            </h3>
            <p className="mt-6 max-w-xl text-base leading-7 text-[#a1a4a5]">{_("landing.storySolutionDesc")}</p>
            <div className="mt-8 flex items-center gap-3 text-sm text-[#f0f0f0]">
              <span className="flex h-7 w-7 items-center justify-center rounded-[6px] border border-[#2AABEE] text-[#2AABEE]">
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
