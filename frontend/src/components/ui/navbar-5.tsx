"use client";

import { useState } from "react";
import Link from "next/link";
import { MenuIcon, X } from "lucide-react";

import { LanguageSwitcher } from "@/components/layout/language-switcher";
import { publicButtonClass } from "@/components/public/public-ui";
import { BrandLogo } from "@/components/ui/brand-logo";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";

export const Navbar5 = () => {
  const _ = useT();
  const [open, setOpen] = useState(false);
  const links = [
    [_("landing.navFeatures"), "/#features"],
    [_("landing.navWorkflow"), "/#workflow"],
    [_("nav.help"), "/help"],
    [_("landing.navPrivacy"), "/privacy"],
  ] as const;

  return (
    <header className="fixed inset-x-0 top-0 z-50 border-b border-[#292d30] bg-black">
      <div className="mx-auto flex h-16 max-w-[1200px] items-center justify-between px-4 sm:px-6 lg:px-8">
        <Link href="/" className="public-focus rounded-[6px]" aria-label="TeleBos home">
          <BrandLogo size="md" priority />
        </Link>

        <nav className="hidden items-center gap-7 lg:flex" aria-label="Primary navigation">
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

        <div className="hidden items-center gap-3 lg:flex">
          <LanguageSwitcher variant="public" />
          <Link href="/login" className="public-focus rounded-[6px] px-2 py-2 text-sm text-[#f0f0f0] hover:text-white">
            {_("landing.signIn")}
          </Link>
          <Link href="/register" className={publicButtonClass}>
            {_("landing.getStarted")}
          </Link>
        </div>

        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger
            className="lg:hidden"
            render={
              <Button
                variant="outline"
                size="icon"
                className="border-[#292d30] bg-black text-white hover:border-white hover:bg-[#0b0e14]"
                aria-label="Open navigation"
              />
            }
          >
            <MenuIcon className="h-4 w-4" aria-hidden="true" />
          </SheetTrigger>
          <SheetContent
            side="right"
            className="public-theme w-full border-[#292d30] bg-black px-5 text-white sm:max-w-sm [&>button]:hidden"
          >
            <SheetHeader className="flex flex-row items-center justify-between border-b border-[#292d30] pb-5">
              <SheetTitle render={<Link href="/" className="public-focus rounded-[6px]" aria-label="TeleBos home" />}>
                <BrandLogo size="md" />
              </SheetTitle>
              <SheetClose
                render={
                  <Button
                    variant="outline"
                    size="icon"
                    className="border-[#292d30] bg-black text-white hover:border-white hover:bg-[#0b0e14]"
                    aria-label="Close navigation"
                  />
                }
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </SheetClose>
            </SheetHeader>
            <nav className="mt-8 flex flex-col" aria-label="Mobile navigation">
              {links.map(([label, href]) => (
                <Link
                  key={href}
                  href={href}
                  onClick={() => setOpen(false)}
                  className="public-focus border-b border-[#292d30] py-4 text-base text-[#f0f0f0] hover:text-white"
                >
                  {label}
                </Link>
              ))}
            </nav>
            <div className="mt-8 flex flex-col gap-3">
              <LanguageSwitcher variant="public" />
              <Link href="/login" onClick={() => setOpen(false)} className={cn(publicButtonClass, "w-full")}>
                {_("landing.signIn")}
              </Link>
              <Link href="/register" onClick={() => setOpen(false)} className={cn(publicButtonClass, "w-full border-white")}>
                {_("landing.getStarted")}
              </Link>
            </div>
          </SheetContent>
        </Sheet>
      </div>
    </header>
  );
};
