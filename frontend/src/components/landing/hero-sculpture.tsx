"use client";

import { ProductSurface } from "@/components/landing/product-surface";
import { useT } from "@/lib/i18n";

export function HeroSculpture() {
  const _ = useT();

  return (
    <div className="relative mx-auto w-full max-w-[34rem]">
      <div className="public-sculpture-stage" aria-hidden="true">
        <div className="public-sculpture">
          <div className="public-sculpture-face public-sculpture-front">
            <span>{_("landing.sculptureAccounts")}</span>
            <span>{_("landing.sculptureQueue")}</span>
          </div>
          <div className="public-sculpture-face public-sculpture-back" />
          <div className="public-sculpture-face public-sculpture-right">
            <span>{_("landing.sculptureChats")}</span>
          </div>
          <div className="public-sculpture-face public-sculpture-left">
            <span>{_("landing.sculptureRules")}</span>
          </div>
          <div className="public-sculpture-face public-sculpture-top" />
          <div className="public-sculpture-face public-sculpture-bottom" />
          <span className="public-sculpture-axis" />
        </div>
      </div>
      <ProductSurface variant="monitoring" compact className="relative z-10 -mt-16 ml-auto w-[min(94%,29rem)]" />
    </div>
  );
}
