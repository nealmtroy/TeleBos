"use client";

import Link from "next/link";
import { useT } from "@/lib/i18n";
import { LanguageSwitcher } from "@/components/layout/language-switcher";
import { ArrowLeft, Shield } from "lucide-react";

export default function PrivacyPage() {
  const _ = useT();

  const sections = [
    {
      title: _("privacy.section1Title"),
      desc: _("privacy.section1Desc"),
    },
    {
      title: _("privacy.section2Title"),
      desc: _("privacy.section2Desc"),
    },
    {
      title: _("privacy.section3Title"),
      desc: _("privacy.section3Desc"),
    },
    {
      title: _("privacy.section4Title"),
      desc: _("privacy.section4Desc"),
    },
    {
      title: _("privacy.section5Title"),
      desc: _("privacy.section5Desc"),
    },
    {
      title: _("privacy.section6Title"),
      desc: _("privacy.section6Desc"),
    },
  ];

  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <header className="border-b border-gray-100 bg-white/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <Link
              href="/"
              className="flex items-center gap-2 text-gray-600 hover:text-gray-900 transition"
            >
              <ArrowLeft className="h-4 w-4" />
              <span className="text-sm font-medium">TeleBos</span>
            </Link>
            <LanguageSwitcher />
          </div>
        </div>
      </header>

      {/* Content */}
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-16 sm:py-24">
        {/* Hero */}
        <div className="mb-12">
          <div className="w-12 h-12 rounded-xl bg-primary-50 flex items-center justify-center mb-6">
            <Shield className="h-6 w-6 text-primary-600" />
          </div>
          <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-3">
            {_("privacy.title")}
          </h1>
          <p className="text-sm text-gray-400">{_("privacy.lastUpdated")}</p>
        </div>

        {/* Intro */}
        <p className="text-gray-600 leading-relaxed mb-12 text-lg">
          {_("privacy.intro")}
        </p>

        {/* Sections */}
        <div className="space-y-10">
          {sections.map((section, i) => (
            <div key={i}>
              <h2 className="text-xl font-semibold text-gray-900 mb-3">
                {i + 1}. {section.title}
              </h2>
              <p className="text-gray-600 leading-relaxed">{section.desc}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Footer */}
      <footer className="border-t border-gray-100">
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
