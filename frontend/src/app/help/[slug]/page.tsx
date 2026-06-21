"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useT } from "@/lib/i18n";
import { LanguageSwitcher } from "@/components/layout/language-switcher";
import { getHelpSectionBySlug, getAdjacentSections } from "@/data/help-sections";
import {
  ArrowLeft,
  ArrowRight,
  ChevronLeft,
  BookOpen,
  Smartphone,
  Send,
  Bot,
  UserPlus,
  Shield,
  Sparkles,
} from "lucide-react";

const iconMap: Record<string, React.ElementType> = {
  "getting-started": BookOpen,
  accounts: Smartphone,
  broadcast: Send,
  "auto-reply": Bot,
  "member-invite": UserPlus,
  troubleshooting: Shield,
  tips: Sparkles,
};

export default function HelpDetailPage() {
  const params = useParams();
  const slug = params?.slug as string;
  const _ = useT();

  const section = getHelpSectionBySlug(slug);
  const { prev, next } = section ? getAdjacentSections(section.key) : { prev: null, next: null };
  const Icon = section ? iconMap[section.key] : null;

  // Invalid slug
  if (!section) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center px-4">
          <div className="w-16 h-16 rounded-2xl bg-gray-100 flex items-center justify-center mx-auto mb-4">
            <BookOpen className="h-8 w-8 text-gray-400" />
          </div>
          <h1 className="text-xl font-semibold text-gray-900 mb-2">
            Help topic not found
          </h1>
          <p className="text-gray-500 text-sm mb-6">
            The page you&apos;re looking for doesn&apos;t exist.
          </p>
          <Link
            href="/help"
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-primary-600 hover:bg-primary-700 text-white text-sm font-medium transition"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Help
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Sticky header */}
      <header className="sticky top-0 z-50 bg-white/90 backdrop-blur-md border-b border-gray-200">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <Link
              href="/"
              className="flex items-center gap-2 text-gray-900 font-bold"
            >
              <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-primary-600 to-primary-900 flex items-center justify-center text-white font-bold text-xs">
                TB
              </div>
              <span className="hidden sm:inline">{_("help.title")}</span>
            </Link>
            <div className="flex items-center gap-3">
              <LanguageSwitcher />
              <Link
                href="/help"
                className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-900 transition"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                {_("landing.navHome")}
              </Link>
            </div>
          </div>
        </div>
      </header>

      {/* Breadcrumb */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center gap-2 text-sm text-gray-400">
            <Link href="/help" className="hover:text-gray-700 transition">
              {_("help.title")}
            </Link>
            <ChevronLeft className="h-3.5 w-3.5 rotate-180" />
            <span className="text-gray-700 font-medium">
              {_(section.titleKey)}
            </span>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-10 sm:py-14">
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
          {/* Section header */}
          <div className="p-6 sm:p-8 border-b border-gray-100">
            <div className="flex items-center gap-4 mb-4">
              {Icon && (
                <div className="w-12 h-12 rounded-xl bg-primary-50 flex items-center justify-center flex-shrink-0">
                  <Icon className="h-6 w-6 text-primary-600" />
                </div>
              )}
              <div>
                <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">
                  {_(section.titleKey)}
                </h1>
                <p className="mt-1.5 text-gray-500">{_(section.descKey)}</p>
              </div>
            </div>
          </div>

          {/* Content items */}
          <div className="p-6 sm:p-8">
            <div className="space-y-6">
              {section.contentKeys.map((key, i) => (
                <div key={key} className="flex gap-4">
                  <span className="flex-shrink-0 w-8 h-8 rounded-full bg-primary-50 text-primary-600 text-sm font-bold flex items-center justify-center mt-0.5">
                    {i + 1}
                  </span>
                  <div>
                    <p className="text-gray-600 leading-relaxed">{_(key)}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Prev / Next navigation */}
        <div className="mt-8 flex items-center justify-between gap-4">
          {prev ? (
            <Link
              href={`/help/${prev.slug}`}
              className="flex items-center gap-2 px-4 py-3 rounded-xl bg-white border border-gray-200 hover:border-primary-200 hover:shadow-sm transition text-left group flex-1 max-w-xs"
            >
              <ArrowLeft className="h-4 w-4 text-gray-400 group-hover:text-primary-600 transition flex-shrink-0" />
              <div className="min-w-0">
                <p className="text-xs text-gray-400">Previous</p>
                <p className="text-sm font-medium text-gray-700 group-hover:text-primary-700 transition truncate">
                  {_(prev.titleKey)}
                </p>
              </div>
            </Link>
          ) : (
            <div className="flex-1" />
          )}

          {next ? (
            <Link
              href={`/help/${next.slug}`}
              className="flex items-center gap-2 px-4 py-3 rounded-xl bg-white border border-gray-200 hover:border-primary-200 hover:shadow-sm transition text-right group flex-1 max-w-xs"
            >
              <div className="min-w-0 flex-1">
                <p className="text-xs text-gray-400">Next</p>
                <p className="text-sm font-medium text-gray-700 group-hover:text-primary-700 transition truncate">
                  {_(next.titleKey)}
                </p>
              </div>
              <ArrowRight className="h-4 w-4 text-gray-400 group-hover:text-primary-600 transition flex-shrink-0" />
            </Link>
          ) : (
            <div className="flex-1" />
          )}
        </div>

        {/* Still stuck */}
        <div className="mt-10 bg-gradient-to-br from-primary-50 to-indigo-50 rounded-2xl border border-primary-100 p-6 sm:p-8 text-center">
          <h3 className="text-lg font-semibold text-gray-900">
            {_("help.stillStuck")}
          </h3>
          <p className="mt-2 text-gray-500 text-sm max-w-lg mx-auto">
            {_("help.stillStuckDesc")}
          </p>
          <Link
            href="https://github.com/yourusername/telebo/issues"
            target="_blank"
            className="inline-flex items-center gap-2 mt-5 px-5 py-2.5 rounded-xl bg-primary-600 hover:bg-primary-700 text-white text-sm font-medium transition shadow-sm"
          >
            GitHub Issues
          </Link>
        </div>
      </div>

      {/* Footer */}
      <footer className="border-t border-gray-200 bg-white">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8 flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-sm text-gray-400">{_("landing.footerCopyright")}</p>
          <div className="flex items-center gap-4 text-sm">
            <Link
              href="/"
              className="text-gray-500 hover:text-gray-700 transition"
            >
              {_("landing.navHome")}
            </Link>
            <Link
              href="/privacy"
              className="text-gray-500 hover:text-gray-700 transition"
            >
              {_("landing.navPrivacy")}
            </Link>
            <Link
              href="/tos"
              className="text-gray-500 hover:text-gray-700 transition"
            >
              {_("landing.navTos")}
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
