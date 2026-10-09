"use client";

import Link from "next/link";

import { BrandLogo } from "@/components/ui/brand-logo";
import { useT } from "@/lib/i18n";

function TelegramIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      className={className}
      aria-hidden="true"
    >
      <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.894 8.221-1.97 9.28c-.145.658-.537.818-1.084.508l-3-2.21-1.446 1.394c-.16.16-.295.295-.605.295l.213-3.053 5.56-5.023c.242-.213-.054-.333-.373-.121l-6.871 4.326-2.962-.924c-.643-.204-.657-.643.136-.953l11.57-4.458c.538-.196 1.006.128.832.943z" />
    </svg>
  );
}

export function PublicFooter({ compact = false }: { compact?: boolean }) {
  const _ = useT();
  const links = [
    [_("landing.navHome"), "/"],
    [_("help.apiTitle"), "/help/api"],
    [_("nav.help"), "/help"],
    [_("landing.navPrivacy"), "/privacy-policy"],
    [_("landing.navTos"), "/terms-of-service"],
  ] as const;

  return (
    <footer className="border-t border-[var(--public-border)] bg-[var(--public-canvas)]">
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
              className="public-focus group inline-flex items-center gap-2 rounded-[6px] text-xs font-medium text-[var(--public-muted)] transition-colors duration-150 hover:text-[var(--public-text)]"
            >
              <TelegramIcon className="h-4 w-4 text-[#229ED9] transition-transform duration-150 group-hover:scale-110" />
              <span>{_("landing.footerTelegram")}</span>
            </a>
          </div>
        )}
        <div className="flex flex-col gap-5 border-t border-[var(--public-border)] pt-6 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-[var(--public-subtle)]">{_("landing.footerCopyright")}</p>
          <nav aria-label="Footer" className="flex flex-wrap gap-x-5 gap-y-3">
            {links.map(([label, href]) => (
              <Link
                key={href}
                href={href}
                className="public-focus rounded-[6px] text-sm text-[var(--public-muted)] transition-colors duration-150 hover:text-[var(--public-text)]"
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
