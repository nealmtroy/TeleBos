"use client";

import { Scale } from "lucide-react";

import { PublicFooter } from "@/components/public/public-footer";
import { PublicShell } from "@/components/public/public-shell";
import { Navbar5 } from "@/components/ui/navbar-5";
import { useT } from "@/lib/i18n";

export default function TosPage() {
  const _ = useT();
  const sections = [
    { title: _("tos.section1Title"), description: _("tos.section1Desc") },
    { title: _("tos.section2Title"), description: _("tos.section2Desc") },
    { title: _("tos.section3Title"), description: _("tos.section3Desc") },
    { title: _("tos.section4Title"), description: _("tos.section4Desc") },
    { title: _("tos.section5Title"), description: _("tos.section5Desc") },
    { title: _("tos.section6Title"), description: _("tos.section6Desc") },
    { title: _("tos.section7Title"), description: _("tos.section7Desc") },
  ];

  return (
    <PublicShell header={<Navbar5 />} footer={<PublicFooter compact />} mainClassName="pt-16">
      <article className="mx-auto max-w-[880px] px-4 py-16 sm:px-6 sm:py-24 lg:px-8">
        <header className="border-b border-[#292d30] pb-12">
          <Scale className="h-8 w-8 text-[#2AABEE]" aria-hidden="true" />
          <h1 className="public-display mt-7 text-5xl leading-none text-white sm:text-7xl">{_("tos.title")}</h1>
          <p className="public-mono mt-5 text-xs text-[#6e727a]">{_("tos.lastUpdated")}</p>
          <p className="mt-8 max-w-3xl text-lg leading-8 text-[#a1a4a5]">{_("tos.intro")}</p>
        </header>
        <ol className="divide-y divide-[#292d30]">
          {sections.map((section, index) => (
            <li key={section.title} className="grid gap-4 py-9 sm:grid-cols-[3rem_1fr]">
              <span className="public-mono text-sm text-[#2AABEE]">{String(index + 1).padStart(2, "0")}</span>
              <div><h2 className="text-xl font-medium text-white">{section.title}</h2><p className="mt-4 leading-8 text-[#a1a4a5]">{section.description}</p></div>
            </li>
          ))}
        </ol>
      </article>
    </PublicShell>
  );
}
