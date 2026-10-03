"use client";

import { useState } from "react";
import Link from "next/link";
import { MenuIcon, X } from "lucide-react";

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
    <header className="fixed inset-x-0 top-0 z-50 border-b border-[var(--public-border)] bg-[var(--public-canvas)]/85 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-[1200px] items-center justify-between px-4 sm:px-6 lg:px-8">
        <Link href="/" className="public-focus rounded-[6px]" aria-label="TeleBos home">
          <BrandLogo size="md" priority />
        </Link>

        <nav className="hidden items-center gap-7 lg:flex" aria-label="Primary navigation">
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

        <div className="hidden items-center gap-3 lg:flex">
          <Link href="/login" className="public-focus rounded-full px-3 py-2 text-sm text-[var(--public-body)] hover:text-[var(--public-text)]">
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
                className="border-[var(--public-border)] bg-[var(--public-canvas)] text-[var(--public-text)] hover:border-[var(--public-accent-strong)] hover:bg-[var(--public-canvas-warm)]"
                aria-label="Open navigation"
              />
            }
          >
            <MenuIcon className="h-4 w-4" aria-hidden="true" />
          </SheetTrigger>
          <SheetContent
                      side="right"
                      className="public-theme w-[86%] max-w-sm border-[var(--public-border)] bg-[var(--public-canvas)] text-[var(--public-text)] shadow-[0_0_80px_rgba(45,143,255,0.12)] sm:w-3/4 [&>button]:hidden"
                    >
                      {/* The close button has to land exactly where the hamburger was,
                                      otherwise the control appears to jump the moment the sheet opens.
                                      The site header is h-16 with px-4 and centres its 32px control,
                                      so this row repeats that geometry verbatim.

                                      flex-row is explicit because SheetHeader defaults to flex-col;
                                      without it the two children stack and the row height collapses
                                      in a way that throws the button down the panel. Padding moved off
                                      the panel and onto the content below, because a sheet-wide px-5
                                      would have pushed the button 4px further from the edge. */}
                                  <SheetHeader className="flex h-16 flex-row items-center justify-between border-b border-[var(--public-border)] px-4 pb-0">
                        <SheetTitle render={<Link href="/" className="public-focus rounded-[6px]" aria-label="TeleBos home" />}>
                          <BrandLogo size="md" />
                        </SheetTitle>
                        <SheetClose
                          render={
                            <Button
                              variant="outline"
                              size="icon"
                              // Styled to match the hamburger trigger exactly. The two sit
                              // in the same slot, so a filled close button next to an
                              // outlined hamburger read as a different control.
                              className="border-[var(--public-border)] bg-[var(--public-canvas)] text-[var(--public-text)] hover:border-[var(--public-accent-strong)] hover:bg-[var(--public-canvas-warm)]"
                              aria-label="Close navigation"
                            />
                          }
                        >
                          <X className="h-4 w-4" aria-hidden="true" />
                        </SheetClose>
                      </SheetHeader>
                      {/* Links fade up in sequence rather than all landing at once, which
                          is what made the panel feel abrupt. Delays are short so the menu
                          still feels instant to tap. */}
                      <nav className="mt-8 flex flex-col px-5" aria-label="Mobile navigation">
                        {links.map(([label, href], index) => (
                          <Link
                            key={href}
                            href={href}
                            onClick={() => setOpen(false)}
                            className="public-focus border-b border-[var(--public-border)] py-4 text-base text-[var(--public-body)] transition-colors duration-200 hover:text-[var(--public-text)] public-nav-in"
                            style={{ animationDelay: `${index * 45}ms`, animationFillMode: "both" }}
                          >
                            {label}
                          </Link>
                        ))}
                      </nav>
                      <div className="mt-8 flex flex-col gap-3 px-5 pb-2 public-nav-in" style={{ animationDelay: `${links.length * 45}ms`, animationFillMode: "both" }}>
                        <Link href="/login" onClick={() => setOpen(false)} className={cn(publicButtonClass, "w-full")}>
                          {_("landing.signIn")}
                        </Link>
                        <Link href="/register" onClick={() => setOpen(false)} className={cn(publicButtonClass, "w-full border-white bg-[var(--public-accent)] text-white hover:bg-[var(--public-accent-strong)]")}>
                          {_("landing.getStarted")}
                        </Link>
                      </div>
                    </SheetContent>
        </Sheet>
      </div>
    </header>
  );
};
