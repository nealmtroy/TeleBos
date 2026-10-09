"use client";

import Link from "next/link";
import { BookOpen, ExternalLink, KeyRound, ShieldCheck } from "lucide-react";

import { PublicFooter } from "@/components/public/public-footer";
import { PublicShell } from "@/components/public/public-shell";
import { PublicCard, PublicCode, publicButtonClass } from "@/components/public/public-ui";
import { Navbar5 } from "@/components/ui/navbar-5";
import { useT } from "@/lib/i18n";

export default function ApiDocumentationPage() {
  const _ = useT();
  const cards = [
    { icon: ShieldCheck, title: _("help.secureTitle"), description: _("help.secureDesc") },
    { icon: KeyRound, title: _("help.scopedTitle"), description: _("help.scopedDesc") },
    { icon: BookOpen, title: _("help.versionedTitle"), description: _("help.versionedDesc") },
  ];

  return (
    <PublicShell header={<Navbar5 />} footer={<PublicFooter compact />} mainClassName="pt-16">
      <div className="mx-auto max-w-[1200px] px-4 py-16 sm:px-6 sm:py-24 lg:px-8">
        <div className="max-w-3xl">
          <p className="public-mono text-xs text-[var(--public-accent)]">{_("help.developerResources")}</p>
          <h1 className="public-display mt-5 text-5xl leading-none text-[var(--public-text)] sm:text-7xl">{_("help.apiHeroTitle")}</h1>
          <p className="mt-6 text-lg leading-8 text-[var(--public-muted)]">{_("help.apiHeroDesc")}</p>
          <div className="mt-8 flex flex-wrap gap-3">
            <a href="/api/docs" target="_blank" rel="noopener noreferrer" className={`${publicButtonClass} border-white`}>
              {_("help.openDocs")}
              <ExternalLink className="h-4 w-4" aria-hidden="true" />
            </a>
            <a href="/api/openapi.json" target="_blank" rel="noopener noreferrer" className={publicButtonClass}>
              {_("help.downloadOpenApi")}
              <BookOpen className="h-4 w-4" aria-hidden="true" />
            </a>
          </div>
        </div>

        <div className="mt-14 grid gap-5 md:grid-cols-3">
          {cards.map(({ icon: Icon, title, description }) => (
            <PublicCard key={title} className="p-6">
              <div className="flex h-10 w-10 items-center justify-center rounded-[6px] border border-[var(--public-border)] text-[var(--public-accent)]"><Icon className="h-5 w-5" aria-hidden="true" /></div>
              <h2 className="mt-5 font-medium text-white">{title}</h2>
              <p className="mt-3 text-sm leading-6 text-[var(--public-muted)]">{description}</p>
            </PublicCard>
          ))}
        </div>

        <section className="mt-10 rounded-[16px] border border-[var(--public-border)] p-6">
          <h2 className="text-lg font-medium text-[#ffca16]">{_("help.authWarningTitle")}</h2>
          <p className="mt-3 text-sm leading-6 text-[var(--public-body)]">{_("help.authWarningDesc")}</p>
        </section>

        <section className="mt-10">
          <h2 className="text-lg font-medium text-white">{_("help.serverExample")}</h2>
          <PublicCode className="mt-4">{`curl https://your-telebos-domain/api/public/v1/health

# Authenticated requests use a scoped key in the header:
curl https://your-telebos-domain/api/public/v1/accounts \\
  -H "Authorization: Bearer tb_live_..."`}</PublicCode>
        </section>
      </div>
    </PublicShell>
  );
}
