"use client";

import { useRef, useState, type KeyboardEvent } from "react";

import { LandingReveal } from "@/components/landing/landing-motion";
import { ProductSurface, type ProductSurfaceVariant } from "@/components/landing/product-surface";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n";

type FlowStep = {
  description: string;
  id: string;
  status: string;
  surface: ProductSurfaceVariant;
  title: string;
};

export function OperationalFlow() {
  const _ = useT();
  const [activeStep, setActiveStep] = useState(0);
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const steps: FlowStep[] = [
    { id: "overload", title: _("landing.flowOverloadTitle"), description: _("landing.flowOverloadDesc"), status: _("landing.flowStatusIncoming"), surface: "chat" },
    { id: "fragmented", title: _("landing.flowFragmentedTitle"), description: _("landing.flowFragmentedDesc"), status: _("landing.flowStatusFragmented"), surface: "accounts" },
    { id: "control", title: _("landing.flowControlTitle"), description: _("landing.flowControlDesc"), status: _("landing.flowStatusUnified"), surface: "broadcast" },
    { id: "automated", title: _("landing.flowAutomatedTitle"), description: _("landing.flowAutomatedDesc"), status: _("landing.flowStatusRunning"), surface: "automation" },
    { id: "action", title: _("landing.flowActionTitle"), description: _("landing.flowActionDesc"), status: _("landing.flowStatusComplete"), surface: "monitoring" },
  ];

  function selectStep(index: number) {
    setActiveStep(index);
    tabRefs.current[index]?.focus();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    let nextIndex: number | null = null;
    if (["ArrowDown", "ArrowRight"].includes(event.key)) nextIndex = (index + 1) % steps.length;
    if (["ArrowLeft", "ArrowUp"].includes(event.key)) nextIndex = (index - 1 + steps.length) % steps.length;
    if (event.key === "Home") nextIndex = 0;
    if (event.key === "End") nextIndex = steps.length - 1;
    if (nextIndex === null) return;
    event.preventDefault();
    selectStep(nextIndex);
  }

  return (
    <section id="workflow" className="border-b border-[#292d30] bg-black">
      <div className="mx-auto max-w-[1200px] px-4 py-20 sm:px-6 sm:py-28 lg:px-8">
        <div className="grid gap-10 border-b border-[#292d30] pb-12 lg:grid-cols-[0.8fr_1.2fr] lg:items-end">
          <LandingReveal>
            <p className="public-mono text-xs text-[#2AABEE]">{_("landing.flowKicker")}</p>
            <h2 className="public-display mt-5 max-w-xl text-[clamp(2.75rem,6vw,5rem)] leading-[1.02] text-white">{_("landing.flowTitle")}</h2>
          </LandingReveal>
          <LandingReveal delay={0.05}>
            <p className="max-w-2xl text-lg leading-8 text-[#a1a4a5] lg:justify-self-end">{_("landing.flowSubtitle")}</p>
          </LandingReveal>
        </div>

        <LandingReveal className="mt-12 grid gap-8 lg:grid-cols-[minmax(15rem,0.62fr)_minmax(0,1.38fr)] lg:gap-12" delay={0.08}>
          <div>
            <div className="border-y border-[#292d30]" role="tablist" aria-label={_("landing.flowTitle")} aria-orientation="vertical">
              {steps.map((step, index) => (
                <button
                  key={step.id}
                  ref={(node) => { tabRefs.current[index] = node; }}
                  id={`flow-tab-${step.id}`}
                  type="button"
                  role="tab"
                  tabIndex={activeStep === index ? 0 : -1}
                  aria-selected={activeStep === index}
                  aria-controls={`flow-panel-${step.id}`}
                  onClick={() => setActiveStep(index)}
                  onKeyDown={(event) => handleKeyDown(event, index)}
                  className={cn(
                    "public-focus grid w-full grid-cols-[2rem_1fr_auto] items-center gap-3 border-b border-[#292d30] px-1 py-4 text-left text-sm transition-colors duration-150 last:border-b-0",
                    activeStep === index ? "text-white" : "text-[#6e727a] hover:text-[#f0f0f0]"
                  )}
                >
                  <span className="public-mono text-[10px] text-[#464a4d]">0{index + 1}</span>
                  <span>{step.title}</span>
                  <span className={cn("h-1.5 w-1.5 rounded-full", activeStep === index ? "bg-[#2AABEE]" : "bg-[#464a4d]")} aria-hidden="true" />
                </button>
              ))}
            </div>
            <div className="mt-8 border-l border-[#292d30] pl-5">
              <p className="public-mono text-xs text-[#2AABEE]">{steps[activeStep].status}</p>
              <h3 className="mt-3 text-2xl font-medium text-white">{steps[activeStep].title}</h3>
              <p className="mt-4 text-base leading-7 text-[#a1a4a5]">{steps[activeStep].description}</p>
            </div>
          </div>

          <div>
            {steps.map((step, index) => (
              <div
                key={step.id}
                id={`flow-panel-${step.id}`}
                role="tabpanel"
                aria-labelledby={`flow-tab-${step.id}`}
                tabIndex={0}
                hidden={activeStep !== index}
                className="public-focus rounded-[16px]"
              >
                <ProductSurface variant={step.surface} />
              </div>
            ))}
          </div>
        </LandingReveal>
      </div>
    </section>
  );
}
