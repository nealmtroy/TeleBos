"use client";

import Link from "next/link";

import { BrandLogo } from "@/components/ui/brand-logo";
import { useT } from "@/lib/i18n";

export function PublicFooter({ compact = false }: { compact?: boolean }) {
  const _ = useT();
  const links = [
    [_("landing.navHome"), "/"],
    [_("nav.help"), "/help"],
    [_("landing.navPrivacy"), "/privacy"],
    [_("landing.navTos"), "/tos"],
  ] as const;

  return (
    <footer className="border-t border-[#292d30] bg-black">
      <div
        className={`mx-auto flex max-w-[1200px] flex-col gap-6 px-4 sm:px-6 lg:px-8 ${
          compact ? "py-8" : "py-12"
        }`}
      >
        {!compact && (
          <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
            <BrandLogo size="sm" />
            <a
              href="https://t.me/telebos_official"
              target="_blank"
              rel="noopener noreferrer"
              className="public-focus public-mono rounded-[6px] text-xs text-[#a1a4a5] transition-colors duration-150 hover:text-white"
            >
              {_("landing.footerTelegram")}
            </a>
          </div>
        )}
        <div className="flex flex-col gap-5 border-t border-[#292d30] pt-6 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-[#6e727a]">{_("landing.footerCopyright")}</p>
          <nav aria-label="Footer" className="flex flex-wrap gap-x-5 gap-y-3">
            {links.map(([label, href]) => (
              <Link
                key={href}
                href={href}
                className="public-focus rounded-[6px] text-sm text-[#a1a4a5] transition-colors duration-150 hover:text-white"
              >
                {label}
              </Link>
            ))}
          </nav>
        </div>
      </div>
    </footer>
  );
}
