"use client";

import { useState } from "react";
import Link from "next/link";
import { useT } from "@/lib/i18n";
import { LanguageSwitcher } from "@/components/layout/language-switcher";
import { helpSections } from "@/data/help-sections";
import {
  Search,
  ArrowRight,
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

export default function HelpPage() {
  const _ = useT();
  const [searchQuery, setSearchQuery] = useState("");

  const filteredSections = helpSections.filter((section) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    const title = _(section.titleKey).toLowerCase();
    const desc = _(section.descKey).toLowerCase();
    const content = section.contentKeys
      .map((k) => _(k).toLowerCase())
      .join(" ");
    return title.includes(q) || desc.includes(q) || content.includes(q);
  });

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Sticky header */}
      <header className="sticky top-0 z-50 bg-white/90 backdrop-blur-md border-b border-gray-200">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
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
                href="/login"
                className="text-sm text-gray-500 hover:text-gray-900 transition"
              >
                {_("landing.signIn")}
              </Link>
            </div>
          </div>
        </div>
      </header>

      {/* Hero */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-16">
          <h1 className="text-3xl sm:text-4xl font-bold text-gray-900">
            {_("help.title")}
          </h1>
          <p className="mt-3 text-lg text-gray-500">{_("help.desc")}</p>

          {/* Search */}
          <div className="mt-8 relative max-w-xl">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search help articles..."
              className="w-full pl-12 pr-4 py-3 rounded-xl border border-gray-300 focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none text-sm transition bg-white"
            />
          </div>
        </div>
      </div>

      {/* Quick nav pills */}
      <div className="bg-white border-b border-gray-200 sticky top-16 z-40 overflow-x-auto">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 flex gap-2 py-3">
          {helpSections.map((section) => {
            const Icon = iconMap[section.key];
            return (
              <Link
                key={section.key}
                href={`/help/${section.slug}`}
                className="inline-flex items-center gap-1.5 whitespace-nowrap px-3 py-1.5 rounded-lg text-xs font-medium bg-gray-100 text-gray-600 hover:bg-primary-100 hover:text-primary-700 transition shrink-0"
              >
                {Icon && <Icon className="h-3.5 w-3.5" />}
                {_(section.titleKey)}
              </Link>
            );
          })}
        </div>
      </div>

      {/* Card grid */}
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-10 sm:py-14">
        {filteredSections.length === 0 ? (
          <div className="text-center py-20">
            <Search className="h-12 w-12 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-500 text-lg">
              No results found for &ldquo;{searchQuery}&rdquo;
            </p>
            <button
              onClick={() => setSearchQuery("")}
              className="mt-2 text-sm text-primary-600 hover:underline"
            >
              Clear search
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {filteredSections.map((section) => {
              const Icon = iconMap[section.key];
              return (
                <Link
                  key={section.key}
                  href={`/help/${section.slug}`}
                  className="group bg-white rounded-2xl border border-gray-200 shadow-sm hover:border-primary-100 hover:shadow-lg hover:shadow-primary-50 transition-all duration-300 p-6"
                >
                  <div className="w-11 h-11 rounded-xl bg-primary-50 group-hover:bg-primary-100 flex items-center justify-center mb-4 transition-colors">
                    {Icon && <Icon className="h-5.5 w-5.5 text-primary-600" />}
                  </div>
                  <h2 className="text-lg font-semibold text-gray-900 group-hover:text-primary-700 transition-colors">
                    {_(section.titleKey)}
                  </h2>
                  <p className="mt-1.5 text-sm text-gray-500 leading-relaxed line-clamp-2">
                    {_(section.descKey)}
                  </p>
                  <div className="mt-4 flex items-center justify-between">
                    <span className="text-xs text-gray-400">
                      {section.contentKeys.length} articles
                    </span>
                    <ArrowRight className="h-4 w-4 text-gray-300 group-hover:text-primary-500 group-hover:translate-x-1 transition-all" />
                  </div>
                </Link>
              );
            })}
          </div>
        )}

        {/* Still stuck */}
        <div className="mt-12 bg-gradient-to-br from-primary-50 to-indigo-50 rounded-2xl border border-primary-100 p-6 sm:p-8 text-center">
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
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 flex flex-col sm:flex-row items-center justify-between gap-4">
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
