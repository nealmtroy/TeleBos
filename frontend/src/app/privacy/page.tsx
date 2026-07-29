"use client";

import { Shield } from "lucide-react";

import { PublicFooter } from "@/components/public/public-footer";
import { PublicShell } from "@/components/public/public-shell";
import { Navbar5 } from "@/components/ui/navbar-5";
import { useT } from "@/lib/i18n";

export default function PrivacyPage() {
  const _ = useT();
  const sections = [
    { title: _("privacy.section1Title"), description: _("privacy.section1Desc") },
    { title: _("privacy.section2Title"), description: _("privacy.section2Desc") },
    { title: _("privacy.section3Title"), description: _("privacy.section3Desc") },
    { title: _("privacy.section4Title"), description: _("privacy.section4Desc") },
    { title: _("privacy.section5Title"), description: _("privacy.section5Desc") },
    { title: _("privacy.section6Title"), description: _("privacy.section6Desc") },
  ];

  return (
    <PublicShell header={<Navbar5 />} footer={<PublicFooter compact />} mainClassName="pt-16">
      <article className="mx-auto max-w-[880px] px-4 py-16 sm:px-6 sm:py-24 lg:px-8">
        <header className="border-b border-[#292d30] pb-12">
          <Shield className="h-8 w-8 text-[#2AABEE]" aria-hidden="true" />
          <h1 className="public-display mt-7 text-5xl leading-none text-white sm:text-7xl">{_("privacy.title")}</h1>
          <p className="public-mono mt-5 text-xs text-[#6e727a]">{_("privacy.lastUpdated")}</p>
          <p className="mt-8 max-w-3xl text-lg leading-8 text-[#a1a4a5]">{_("privacy.intro")}</p>
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
