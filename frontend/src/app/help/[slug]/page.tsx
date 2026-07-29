"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, ArrowRight, BookOpen, ChevronRight } from "lucide-react";

import { PublicFooter } from "@/components/public/public-footer";
import { PublicShell } from "@/components/public/public-shell";
import { publicButtonClass } from "@/components/public/public-ui";
import { Navbar5 } from "@/components/ui/navbar-5";
import { getAdjacentSections, getHelpSectionBySlug } from "@/data/help-sections";
import { useT } from "@/lib/i18n";

export default function HelpDetailPage() {
  const params = useParams();
  const slug = params?.slug as string;
  const _ = useT();
  const section = getHelpSectionBySlug(slug);
  const { prev, next } = section ? getAdjacentSections(section.key) : { prev: null, next: null };

  if (!section) {
    return (
      <PublicShell mainClassName="flex min-h-screen items-center justify-center px-4">
        <div className="max-w-md text-center">
          <BookOpen className="mx-auto h-10 w-10 text-[#6e727a]" aria-hidden="true" />
          <h1 className="public-display mt-6 text-4xl text-white">{_("help.topicNotFound")}</h1>
          <p className="mt-4 text-[#a1a4a5]">{_("help.topicNotFoundDesc")}</p>
          <Link href="/help" className={`${publicButtonClass} mt-8`}><ArrowLeft className="h-4 w-4" aria-hidden="true" />{_("help.backToHelp")}</Link>
        </div>
      </PublicShell>
    );
  }

  return (
    <PublicShell header={<Navbar5 />} footer={<PublicFooter compact />} mainClassName="pt-16">
      <div className="border-b border-[#292d30]">
        <nav aria-label="Breadcrumb" className="mx-auto flex max-w-[960px] items-center gap-2 px-4 py-4 text-sm sm:px-6 lg:px-8">
          <Link href="/help" className="public-focus rounded-[6px] text-[#a1a4a5] hover:text-white">{_("help.title")}</Link>
          <ChevronRight className="h-3.5 w-3.5 text-[#464a4d]" aria-hidden="true" />
          <span className="text-[#f0f0f0]">{_(section.titleKey)}</span>
        </nav>
      </div>

      <article className="mx-auto max-w-[960px] px-4 py-14 sm:px-6 sm:py-20 lg:px-8">
        <header className="border-b border-[#292d30] pb-10">
          <p className="public-mono text-xs text-[#2AABEE]">{_("help.title")}</p>
          <h1 className="public-display mt-5 text-5xl leading-none text-white sm:text-7xl">{_(section.titleKey)}</h1>
          <p className="mt-6 max-w-2xl text-lg leading-8 text-[#a1a4a5]">{_(section.descKey)}</p>
        </header>

        <ol className="divide-y divide-[#292d30]">
          {section.contentKeys.map((key, index) => (
            <li key={key} className="grid gap-4 py-8 sm:grid-cols-[3rem_1fr]">
              <span className="public-mono text-sm text-[#2AABEE]">{String(index + 1).padStart(2, "0")}</span>
              <p className="max-w-3xl leading-8 text-[#f0f0f0]">{_(key)}</p>
            </li>
          ))}
        </ol>

        <nav aria-label="Adjacent help topics" className="mt-10 grid gap-4 sm:grid-cols-2">
          {prev ? (
            <Link href={`/help/${prev.slug}`} className="public-focus rounded-[16px] border border-[#292d30] p-5 hover:border-[#2AABEE]">
              <p className="public-mono text-xs text-[#6e727a]">{_("help.previous")}</p>
              <p className="mt-2 flex items-center gap-2 text-sm text-white"><ArrowLeft className="h-4 w-4" aria-hidden="true" />{_(prev.titleKey)}</p>
            </Link>
          ) : <span />}
          {next && (
            <Link href={`/help/${next.slug}`} className="public-focus rounded-[16px] border border-[#292d30] p-5 text-right hover:border-[#2AABEE]">
              <p className="public-mono text-xs text-[#6e727a]">{_("help.next")}</p>
              <p className="mt-2 flex items-center justify-end gap-2 text-sm text-white">{_(next.titleKey)}<ArrowRight className="h-4 w-4" aria-hidden="true" /></p>
            </Link>
          )}
        </nav>

        <section className="mt-10 rounded-[16px] border border-[#292d30] p-7 text-center">
          <h2 className="text-xl font-medium text-white">{_("help.stillStuck")}</h2>
          <p className="mx-auto mt-3 max-w-lg text-sm leading-6 text-[#a1a4a5]">{_("help.stillStuckDesc")}</p>
          <a href="https://github.com/yourusername/telebo/issues" target="_blank" rel="noopener noreferrer" className={`${publicButtonClass} mt-6`}>{_("help.githubIssues")}</a>
        </section>
      </article>
    </PublicShell>
  );
}
