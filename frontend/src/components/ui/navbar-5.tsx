"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { MenuIcon, X } from "lucide-react";
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
  SheetClose,
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
          <Link href="/" className="flex items-center">
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
              <Button variant="outline" size="icon" className="h-8 w-8">
                <MenuIcon className="h-4 w-4" />
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-full sm:max-w-full h-full border-none px-4 pt-2 pb-4 max-h-screen overflow-auto [&>button]:hidden">
              <SheetHeader className="text-left flex flex-row items-center justify-between pb-0">
                <SheetTitle asChild>
                  <Link href="/" className="flex items-center">
                    <span className="text-xl font-bold tracking-tight text-gray-900">
                      TeleBos
                    </span>
                  </Link>
                </SheetTitle>
                <SheetClose asChild>
                  <Button variant="outline" size="icon" className="h-8 w-8">
                    <X className="h-4 w-4" />
                  </Button>
                </SheetClose>
              </SheetHeader>
              <div className="flex flex-col py-2">
                <Accordion type="single" collapsible className="w-full mt-4">
                  <AccordionItem value="solutions" className="border-none">
                    <AccordionTrigger className="text-base font-medium text-gray-700 hover:text-primary py-3 hover:no-underline transition-colors">
                      {_("landing.navFeatures")}
                    </AccordionTrigger>
                    <AccordionContent className="pb-2">
                      <div className="grid gap-1 pl-4 pt-1">
                        {features.map((feature, index) => (
                          <Link
                            href={feature.href}
                            key={index}
                            className="block rounded-lg p-2.5 transition-colors hover:bg-muted/70"
                          >
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
                <div className="flex flex-col">
                  <Link
                    href="#how-it-works"
                    className="text-base font-medium text-gray-700 hover:text-primary py-3 transition-colors"
                  >
                    {_("landing.howItWorks")}
                  </Link>
                  <Link
                    href="/help"
                    className="text-base font-medium text-gray-700 hover:text-primary py-3 transition-colors"
                  >
                    {_("nav.help")}
                  </Link>
                  <Link
                    href="/privacy"
                    className="text-base font-medium text-gray-700 hover:text-primary py-3 transition-colors"
                  >
                    {_("landing.navPrivacy")}
                  </Link>
                  <Link
                    href="/tos"
                    className="text-base font-medium text-gray-700 hover:text-primary py-3 transition-colors"
                  >
                    {_("landing.navTos")}
                  </Link>
                </div>
                <div className="mt-6 flex flex-col gap-4 border-t pt-6">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-gray-500">
                      {_("common.language")}
                    </span>
                    <LanguageSwitcher />
                  </div>
                  <div className="flex flex-col gap-2 mt-2">
                    <Link href="/login" className="w-full">
                      <Button variant="outline" className="w-full">
                        {_("landing.signIn")}
                      </Button>
                    </Link>
                    <Link href="/register" className="w-full">
                      <Button className="w-full">
                        {_("landing.getStarted")}
                      </Button>
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
