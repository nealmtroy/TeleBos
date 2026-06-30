"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { MenuIcon } from "lucide-react";
import { useT } from "@/lib/i18n";
import { LanguageSwitcher } from "@/components/layout/language-switcher";

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import {
  NavigationMenu,
  NavigationMenuContent,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
  NavigationMenuTrigger,
  navigationMenuTriggerStyle,
} from "@/components/ui/navigation-menu";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

export const Navbar5 = () => {
  const _ = useT();
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const features = [
    {
      title: _("landing.featureMultiAccount"),
      description: _("landing.featureMultiAccountDesc"),
      href: "#features",
    },
    {
      title: _("landing.featureBroadcast"),
      description: _("landing.featureBroadcastDesc"),
      href: "#features",
    },
    {
      title: _("landing.featureChat"),
      description: _("landing.featureChatDesc"),
      href: "#features",
    },
    {
      title: _("landing.featureRealtime"),
      description: _("landing.featureRealtimeDesc"),
      href: "#features",
    },
    {
      title: _("landing.featureAutoReply"),
      description: _("landing.featureAutoReplyDesc"),
      href: "#features",
    },
    {
      title: _("landing.featureInvite"),
      description: _("landing.featureInviteDesc"),
      href: "#features",
    },
  ];

  return (
    <section
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 py-3 ${
        scrolled
          ? "bg-white/90 backdrop-blur-md shadow-sm border-b border-gray-100"
          : "bg-transparent"
      }`}
    >
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <nav className="flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary-600 to-primary-900 flex items-center justify-center text-white font-bold text-sm">
              TB
            </div>
            <span className="text-xl font-bold tracking-tight text-gray-900">
              TeleBos
            </span>
          </Link>
          
          <NavigationMenu className="hidden lg:block">
            <NavigationMenuList>
              <NavigationMenuItem>
                <NavigationMenuTrigger>{_("landing.navFeatures")}</NavigationMenuTrigger>
                <NavigationMenuContent>
                  <div className="grid w-[600px] grid-cols-2 p-3">
                    {features.map((feature, index) => (
                      <Link
                        href={feature.href}
                        key={index}
                        passHref
                        legacyBehavior
                      >
                        <NavigationMenuLink className="block rounded-md p-3 transition-colors hover:bg-muted/70">
                          <div>
                            <p className="mb-1 font-semibold text-foreground text-sm">
                              {feature.title}
                            </p>
                            <p className="text-xs text-muted-foreground leading-normal">
                              {feature.description}
                            </p>
                          </div>
                        </NavigationMenuLink>
                      </Link>
                    ))}
                  </div>
                </NavigationMenuContent>
              </NavigationMenuItem>
              <NavigationMenuItem>
                <Link href="#how-it-works" passHref legacyBehavior>
                  <NavigationMenuLink className={navigationMenuTriggerStyle()}>
                    {_("landing.howItWorks")}
                  </NavigationMenuLink>
                </Link>
              </NavigationMenuItem>
              <NavigationMenuItem>
                <Link href="/help" passHref legacyBehavior>
                  <NavigationMenuLink className={navigationMenuTriggerStyle()}>
                    {_("nav.help")}
                  </NavigationMenuLink>
                </Link>
              </NavigationMenuItem>
              <NavigationMenuItem>
                <Link href="/privacy" passHref legacyBehavior>
                  <NavigationMenuLink className={navigationMenuTriggerStyle()}>
                    {_("landing.navPrivacy")}
                  </NavigationMenuLink>
                </Link>
              </NavigationMenuItem>
            </NavigationMenuList>
          </NavigationMenu>

          <div className="hidden items-center gap-4 lg:flex">
            <LanguageSwitcher />
            <Link href="/login">
              <Button variant="outline">{_("landing.signIn")}</Button>
            </Link>
            <Link href="/register">
              <Button>{_("landing.getStarted")}</Button>
            </Link>
          </div>

          <Sheet>
            <SheetTrigger asChild className="lg:hidden">
              <Button variant="outline" size="icon">
                <MenuIcon className="h-4 w-4" />
              </Button>
            </SheetTrigger>
            <SheetContent side="top" className="max-h-screen overflow-auto">
              <SheetHeader>
                <SheetTitle>
                  <Link href="/" className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary-600 to-primary-900 flex items-center justify-center text-white font-bold text-sm">
                      TB
                    </div>
                    <span className="text-xl font-bold tracking-tight text-gray-900">
                      TeleBos
                    </span>
                  </Link>
                </SheetTitle>
              </SheetHeader>
              <div className="flex flex-col p-4">
                <Accordion type="single" collapsible className="mt-4 mb-2">
                  <AccordionItem value="solutions" className="border-none">
                    <AccordionTrigger className="text-base hover:no-underline">
                      {_("landing.navFeatures")}
                    </AccordionTrigger>
                    <AccordionContent>
                      <div className="grid md:grid-cols-2">
                        {features.map((feature, index) => (
                          <Link href={feature.href} key={index} className="block rounded-md p-3 transition-colors hover:bg-muted/70">
                            <div>
                              <p className="mb-1 font-semibold text-foreground text-sm">
                                {feature.title}
                              </p>
                              <p className="text-xs text-muted-foreground leading-normal">
                                {feature.description}
                              </p>
                            </div>
                          </Link>
                        ))}
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                </Accordion>
                <div className="flex flex-col gap-6">
                  <Link href="#how-it-works" className="font-medium text-sm text-gray-700 hover:text-gray-900">
                    {_("landing.howItWorks")}
                  </Link>
                  <Link href="/help" className="font-medium text-sm text-gray-700 hover:text-gray-900">
                    {_("nav.help")}
                  </Link>
                  <Link href="/privacy" className="font-medium text-sm text-gray-700 hover:text-gray-900">
                    {_("landing.navPrivacy")}
                  </Link>
                  <Link href="/tos" className="font-medium text-sm text-gray-700 hover:text-gray-900">
                    {_("landing.navTos")}
                  </Link>
                </div>
                <div className="mt-8 flex items-center justify-between gap-3 border-t pt-6">
                  <LanguageSwitcher />
                  <div className="flex items-center gap-2">
                    <Link href="/login">
                      <Button variant="outline" size="sm">{_("landing.signIn")}</Button>
                    </Link>
                    <Link href="/register">
                      <Button size="sm">{_("landing.getStarted")}</Button>
                    </Link>
                  </div>
                </div>
              </div>
            </SheetContent>
          </Sheet>
        </nav>
      </div>
    </section>
  );
};
