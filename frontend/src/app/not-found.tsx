"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useT } from "@/lib/i18n";
import { useAuthStore } from "@/store/auth-store";
import {
  Home,
  LayoutDashboard,
  Search,
  ArrowLeft,
  Bot,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";

export default function NotFoundPage() {
  const _ = useT();
  const authUser = useAuthStore((s) => s.user);
  const authLoading = useAuthStore((s) => s.isLoading);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const isAuthenticated = mounted && !authLoading && !!authUser;

  return (
    <div className="min-h-screen bg-white flex flex-col">
      {/* ── Subtle Header ─────────────────────────────────────────────── */}
      <header className="border-b border-gray-100 bg-white/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center h-16">
            <Link
              href="/"
              className="flex items-center gap-2 text-gray-600 hover:text-gray-900 transition"
            >
              <Bot className="h-5 w-5" />
              <span className="text-sm font-semibold tracking-tight">
                TeleBos
              </span>
            </Link>
          </div>
        </div>
      </header>

      {/* ── Main Content ──────────────────────────────────────────────── */}
      <div className="flex-1 flex items-center justify-center px-4 sm:px-6 lg:px-8">
        <div className="max-w-lg w-full text-center py-16 sm:py-24">
          {/* 404 Number */}
          <div className="relative mb-8">
            <div className="text-[10rem] sm:text-[12rem] font-black text-gray-50 select-none leading-none tracking-tighter">
              {_("notFound.pageNotFound")}
            </div>
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="bg-gradient-to-br from-indigo-500 via-violet-500 to-purple-600 bg-clip-text text-transparent">
                <span className="text-[6rem] sm:text-[7rem] font-black leading-none tracking-tighter">
                  {_("notFound.pageNotFound")}
                </span>
              </div>
            </div>
          </div>

          {/* Icon */}
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-amber-50 to-orange-100 flex items-center justify-center mx-auto mb-6 shadow-sm">
            <Search className="h-7 w-7 text-amber-500" />
          </div>

          {/* Text */}
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-3 tracking-tight">
            {_("notFound.title")}
          </h1>
          <p className="text-gray-500 text-sm sm:text-base leading-relaxed max-w-md mx-auto mb-10">
            {_("notFound.description")}
          </p>

          {/* Actions */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <Link
              href="/"
              className={cn(
                buttonVariants({ variant: "outline", size: "lg" }),
                "w-full sm:w-auto gap-2 text-sm"
              )}
            >
              <ArrowLeft className="h-4 w-4" />
              {_("notFound.backHome")}
            </Link>

            {isAuthenticated && (
              <Link
                href="/dashboard"
                className={cn(
                  buttonVariants({ variant: "default", size: "lg" }),
                  "w-full sm:w-auto gap-2 text-sm shadow-sm"
                )}
              >
                <LayoutDashboard className="h-4 w-4" />
                {_("notFound.viewDashboard")}
              </Link>
            )}
          </div>
        </div>
      </div>

      {/* ── Footer ────────────────────────────────────────────────────── */}
      <footer className="border-t border-gray-100 py-6">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 flex items-center justify-center gap-4 text-xs text-gray-400">
          <Link href="/" className="hover:text-gray-600 transition">
            Home
          </Link>
          <span className="text-gray-200">•</span>
          <Link href="/privacy" className="hover:text-gray-600 transition">
            Privacy
          </Link>
          <span className="text-gray-200">•</span>
          <Link href="/tos" className="hover:text-gray-600 transition">
            Terms
          </Link>
        </div>
      </footer>
    </div>
  );
}
