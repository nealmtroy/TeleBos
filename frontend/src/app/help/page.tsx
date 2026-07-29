"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight, BookOpen, Bot, Search, Send, Shield, Smartphone, Sparkles, UserPlus } from "lucide-react";

import { PublicFooter } from "@/components/public/public-footer";
import { PublicShell } from "@/components/public/public-shell";
import { PublicInput, publicButtonClass } from "@/components/public/public-ui";
import { Navbar5 } from "@/components/ui/navbar-5";
import { helpSections } from "@/data/help-sections";
import { useT } from "@/lib/i18n";

const iconMap: Record<string, React.ElementType> = {
  "getting-started": BookOpen,
  accounts: Smartphone,
  broadcast: Send,
  "auto-reply": Bot,
  "member-invite": UserPlus,
  troubleshooting: Shield,
  tips: Sparkles,
};

export default function HelpPage() {
  const _ = useT();
  const [searchQuery, setSearchQuery] = useState("");
  const filteredSections = helpSections.filter((section) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return [_(section.titleKey), _(section.descKey), ...section.contentKeys.map((key) => _(key))]
      .join(" ")
      .toLowerCase()
      .includes(q);
  });

  return (
    <PublicShell header={<Navbar5 />} footer={<PublicFooter compact />} mainClassName="pt-16">
      <section className="border-b border-[#292d30]">
        <div className="mx-auto max-w-[1200px] px-4 py-16 sm:px-6 sm:py-24 lg:px-8">
          <p className="public-mono text-xs text-[#2AABEE]">{_("help.apiTitle")}</p>
          <h1 className="public-display mt-5 text-5xl leading-none text-white sm:text-7xl">{_("help.title")}</h1>
          <p className="mt-5 max-w-2xl text-lg leading-8 text-[#a1a4a5]">{_("help.desc")}</p>
          <div className="relative mt-9 max-w-xl">
            <label htmlFor="help-search" className="sr-only">{_("help.searchLabel")}</label>
            <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-[#6e727a]" aria-hidden="true" />
            <PublicInput id="help-search" type="search" value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder={_("help.searchPlaceholder")} className="pl-12" />
          </div>
        </div>
      </section>

      <nav aria-label="Help topics" className="border-b border-[#292d30]">
        <div className="no-scrollbar mx-auto flex max-w-[1200px] gap-2 overflow-x-auto px-4 py-4 sm:px-6 lg:px-8">
          {helpSections.map((section) => {
            const Icon = iconMap[section.key];
            return (
              <Link key={section.key} href={`/help/${section.slug}`} className="public-focus inline-flex min-h-10 shrink-0 items-center gap-2 rounded-[6px] border border-[#292d30] px-3 text-xs text-[#a1a4a5] hover:border-[#f0f0f0] hover:text-white">
                {Icon && <Icon className="h-3.5 w-3.5" aria-hidden="true" />}
                {_(section.titleKey)}
              </Link>
            );
          })}
        </div>
      </nav>

      <div className="mx-auto max-w-[1200px] px-4 py-14 sm:px-6 sm:py-20 lg:px-8">
        <Link href="/help/api" className="public-focus group mb-7 flex items-center justify-between rounded-[16px] border border-[#292d30] p-5 transition-colors duration-150 hover:border-[#2AABEE]">
          <div className="flex items-center gap-4">
            <div className="flex h-11 w-11 items-center justify-center rounded-[6px] border border-[#292d30] text-[#2AABEE]"><BookOpen className="h-5 w-5" aria-hidden="true" /></div>
            <div><h2 className="font-medium text-white">{_("help.apiTitle")}</h2><p className="mt-1 text-sm text-[#a1a4a5]">{_("help.apiDescription")}</p></div>
          </div>
          <ArrowRight className="h-4 w-4 text-[#6e727a] group-hover:text-[#2AABEE]" aria-hidden="true" />
        </Link>

        {filteredSections.length === 0 ? (
          <div className="rounded-[16px] border border-[#292d30] py-20 text-center">
            <Search className="mx-auto mb-4 h-10 w-10 text-[#464a4d]" aria-hidden="true" />
            <p className="text-lg text-[#a1a4a5]">{_("help.noResults", { query: searchQuery })}</p>
            <button type="button" onClick={() => setSearchQuery("")} className="public-focus mt-4 rounded-[6px] text-sm text-[#2AABEE] hover:text-white">{_("help.clearSearch")}</button>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {filteredSections.map((section) => {
              const Icon = iconMap[section.key];
              return (
                <Link key={section.key} href={`/help/${section.slug}`} className="public-focus group rounded-[16px] border border-[#292d30] p-6 transition-colors duration-150 hover:border-[#2AABEE]">
                  <div className="flex h-11 w-11 items-center justify-center rounded-[6px] border border-[#292d30] text-[#2AABEE]">{Icon && <Icon className="h-5 w-5" aria-hidden="true" />}</div>
                  <h2 className="mt-5 text-lg font-medium text-white">{_(section.titleKey)}</h2>
                  <p className="mt-2 line-clamp-2 text-sm leading-6 text-[#a1a4a5]">{_(section.descKey)}</p>
                  <div className="mt-5 flex items-center justify-between"><span className="public-mono text-xs text-[#6e727a]">{_("help.articleCount", { count: section.contentKeys.length })}</span><ArrowRight className="h-4 w-4 text-[#464a4d] group-hover:text-[#2AABEE]" aria-hidden="true" /></div>
                </Link>
              );
            })}
          </div>
        )}

        <section className="mt-12 rounded-[16px] border border-[#292d30] p-7 text-center sm:p-9">
          <h2 className="text-xl font-medium text-white">{_("help.stillStuck")}</h2>
          <p className="mx-auto mt-3 max-w-lg text-sm leading-6 text-[#a1a4a5]">{_("help.stillStuckDesc")}</p>
          <a href="https://github.com/yourusername/telebo/issues" target="_blank" rel="noopener noreferrer" className={`${publicButtonClass} mt-6`}>{_("help.githubIssues")}</a>
        </section>
      </div>
    </PublicShell>
  );
}
