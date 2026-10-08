"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  Send,
  Users,
  ShieldCheck,
  Zap,
  Smartphone,
  Globe,
  Radio,
  MessageSquare,
  Bot,
  BellRing,
  Wallet,
  ArrowRight,
  ArrowLeft,
  CheckCircle2,
  Sparkles,
  HelpCircle,
  LayoutDashboard,
  Check,
} from "lucide-react";

import { BrandLogo } from "@/components/ui/brand-logo";
import { LanguageSwitcher } from "@/components/layout/language-switcher";
import { useT } from "@/lib/i18n";
import { useAuthStore } from "@/store/auth-store";
import { cn } from "@/lib/utils";

const TOTAL_STEPS = 4;

export default function OnboardingPage() {
  const router = useRouter();
  const _ = useT();
  const { user, isAuthenticated, isLoading } = useAuthStore();

  const [currentStep, setCurrentStep] = useState(1);
  const [workspaceName, setWorkspaceName] = useState("");
  const [selectedGoals, setSelectedGoals] = useState<string[]>(["broadcast"]);

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.replace("/login?redirect=/onboarding");
    }
  }, [isAuthenticated, isLoading, router]);

  useEffect(() => {
    if (user?.full_name && !workspaceName) {
      setWorkspaceName(`${user.full_name}'s Workspace`);
    }
  }, [user, workspaceName]);

  if (isLoading || !isAuthenticated) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background text-foreground">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  const markOnboardingComplete = () => {
    try {
      if (user?.id) {
        localStorage.setItem(`telebos_onboarding_completed_${user.id}`, "true");
      }
    } catch {
      // Ignore localStorage errors
    }
  };

  const handleSkip = () => {
    markOnboardingComplete();
    router.push("/dashboard");
  };

  const handleNext = () => {
    if (currentStep < TOTAL_STEPS) {
      setCurrentStep((prev) => prev + 1);
    } else {
      markOnboardingComplete();
      router.push("/dashboard");
    }
  };

  const handleBack = () => {
    if (currentStep > 1) {
      setCurrentStep((prev) => prev - 1);
    }
  };

  const toggleGoal = (goalId: string) => {
    setSelectedGoals((prev) =>
      prev.includes(goalId)
        ? prev.filter((id) => id !== goalId)
        : [...prev, goalId]
    );
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-background via-background/95 to-muted/20 text-foreground flex flex-col justify-between selection:bg-primary/20 selection:text-primary">
      {/* ── Top Header ────────────────────────────────────────────── */}
      <header className="w-full border-b border-border/40 backdrop-blur-md bg-background/80 sticky top-0 z-50">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/" aria-label="TeleBos Home" className="flex items-center gap-2">
              <BrandLogo size="sm" priority />
            </Link>
            <span className="hidden sm:inline-block text-xs font-medium px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20">
              Onboarding
            </span>
          </div>

          <div className="flex items-center gap-3">
            <LanguageSwitcher />
            <button
              type="button"
              onClick={handleSkip}
              className="text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors px-3 py-1.5 rounded-lg hover:bg-muted/50"
            >
              {_("onboarding.skip")}
            </button>
          </div>
        </div>
      </header>

      {/* ── Main Content Area ────────────────────────────────────── */}
      <main className="flex-1 flex flex-col items-center justify-center px-4 py-8 sm:py-12">
        <div className="w-full max-w-3xl">
          {/* Stepper Progress Bar */}
          <div className="mb-8">
            <div className="flex items-center justify-between text-xs font-medium text-muted-foreground mb-3">
              <span className="font-semibold text-primary">
                {_("onboarding.stepIndicator")
                  .replace("{current}", String(currentStep))
                  .replace("{total}", String(TOTAL_STEPS))}
              </span>
              <span>
                {currentStep === 1 && _("onboarding.step1Badge")}
                {currentStep === 2 && _("onboarding.step2Badge")}
                {currentStep === 3 && _("onboarding.step3Badge")}
                {currentStep === 4 && _("onboarding.step4Badge")}
              </span>
            </div>

            {/* Visual progress bar */}
            <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden">
              <motion.div
                className="h-full bg-primary"
                initial={false}
                animate={{ width: `${(currentStep / TOTAL_STEPS) * 100}%` }}
                transition={{ duration: 0.35, ease: "easeInOut" }}
              />
            </div>
          </div>

          {/* Step Card with Motion */}
          <div className="relative rounded-2xl border border-border/80 bg-card/80 backdrop-blur-xl p-6 sm:p-10 shadow-2xl transition-all">
            <AnimatePresence mode="wait">
              {/* STEP 1: Profil & Fokus Tujuan */}
              {currentStep === 1 && (
                <motion.div
                  key="step-1"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  transition={{ duration: 0.25 }}
                  className="space-y-6"
                >
                  <div>
                    <div className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full bg-primary/10 text-primary border border-primary/20 mb-3">
                      <Sparkles className="w-3.5 h-3.5" />
                      {_("onboarding.step1Badge")}
                    </div>
                    <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
                      {_("onboarding.step1Title")}
                    </h1>
                    <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
                      {_("onboarding.step1Subtitle")}
                    </p>
                  </div>

                  <div className="space-y-2">
                    <label
                      htmlFor="workspace-name"
                      className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground"
                    >
                      {_("onboarding.workspaceNameLabel")}
                    </label>
                    <input
                      id="workspace-name"
                      type="text"
                      value={workspaceName}
                      onChange={(e) => setWorkspaceName(e.target.value)}
                      placeholder={_("onboarding.workspaceNamePlaceholder")}
                      className="w-full rounded-xl border border-border bg-background/50 px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/60 focus:border-primary focus:outline-hidden focus:ring-2 focus:ring-primary/20 transition"
                    />
                  </div>

                  <div className="space-y-3">
                    <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      {_("onboarding.selectGoalLabel")}
                    </label>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {[
                        {
                          id: "broadcast",
                          icon: Send,
                          title: _("onboarding.goalBroadcastTitle"),
                          desc: _("onboarding.goalBroadcastDesc"),
                        },
                        {
                          id: "scraping",
                          icon: Users,
                          title: _("onboarding.goalScrapeTitle"),
                          desc: _("onboarding.goalScrapeDesc"),
                        },
                        {
                          id: "multi-account",
                          icon: ShieldCheck,
                          title: _("onboarding.goalMultiAccountTitle"),
                          desc: _("onboarding.goalMultiAccountDesc"),
                        },
                        {
                          id: "smm",
                          icon: Zap,
                          title: _("onboarding.goalSmmTitle"),
                          desc: _("onboarding.goalSmmDesc"),
                        },
                      ].map((item) => {
                        const isSelected = selectedGoals.includes(item.id);
                        return (
                          <button
                            key={item.id}
                            type="button"
                            onClick={() => toggleGoal(item.id)}
                            className={cn(
                              "relative flex flex-col items-start p-4 rounded-xl border text-left transition-all duration-200 cursor-pointer group",
                              isSelected
                                ? "border-primary bg-primary/5 shadow-xs ring-1 ring-primary/40"
                                : "border-border/70 hover:border-border hover:bg-muted/40"
                            )}
                          >
                            <div className="flex items-center justify-between w-full mb-2">
                              <div
                                className={cn(
                                  "p-2 rounded-lg transition-colors",
                                  isSelected
                                    ? "bg-primary text-primary-foreground"
                                    : "bg-muted text-muted-foreground group-hover:text-foreground"
                                )}
                              >
                                <item.icon className="w-4 h-4" />
                              </div>
                              <div
                                className={cn(
                                  "w-5 h-5 rounded-full border flex items-center justify-center transition-colors",
                                  isSelected
                                    ? "bg-primary border-primary text-primary-foreground"
                                    : "border-border/80 bg-background"
                                )}
                              >
                                {isSelected && <Check className="w-3 h-3 stroke-[3]" />}
                              </div>
                            </div>
                            <h3 className="font-semibold text-sm text-foreground mb-1">
                              {item.title}
                            </h3>
                            <p className="text-xs text-muted-foreground leading-normal">
                              {item.desc}
                            </p>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </motion.div>
              )}

              {/* STEP 2: Cara Kerja & Setup Akun */}
              {currentStep === 2 && (
                <motion.div
                  key="step-2"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  transition={{ duration: 0.25 }}
                  className="space-y-6"
                >
                  <div>
                    <div className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full bg-primary/10 text-primary border border-primary/20 mb-3">
                      <Radio className="w-3.5 h-3.5" />
                      {_("onboarding.step2Badge")}
                    </div>
                    <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
                      {_("onboarding.step2Title")}
                    </h1>
                    <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
                      {_("onboarding.step2Subtitle")}
                    </p>
                  </div>

                  {/* 3 Pillar Cards */}
                  <div className="space-y-3.5">
                    {[
                      {
                        num: "01",
                        icon: Smartphone,
                        title: _("onboarding.step1ConnectTitle"),
                        desc: _("onboarding.step1ConnectDesc"),
                      },
                      {
                        num: "02",
                        icon: Globe,
                        title: _("onboarding.step2ProxyTitle"),
                        desc: _("onboarding.step2ProxyDesc"),
                      },
                      {
                        num: "03",
                        icon: Send,
                        title: _("onboarding.step3TaskTitle"),
                        desc: _("onboarding.step3TaskDesc"),
                      },
                    ].map((stepItem) => (
                      <div
                        key={stepItem.num}
                        className="flex items-start gap-4 p-4 rounded-xl border border-border/80 bg-background/50 hover:bg-muted/30 transition-colors"
                      >
                        <div className="flex-shrink-0 w-10 h-10 rounded-xl bg-primary/10 text-primary font-bold text-sm flex items-center justify-center border border-primary/20">
                          {stepItem.num}
                        </div>
                        <div className="flex-1 min-w-0">
                          <h3 className="font-semibold text-sm text-foreground">
                            {stepItem.title}
                          </h3>
                          <p className="text-xs text-muted-foreground leading-relaxed mt-1">
                            {stepItem.desc}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Anti-Ban Callout */}
                  <div className="p-4 rounded-xl border border-amber-500/30 bg-amber-500/5 dark:bg-amber-500/10 text-amber-600 dark:text-amber-400">
                    <div className="flex items-center gap-2 font-semibold text-xs mb-1">
                      <ShieldCheck className="w-4 h-4" />
                      {_("onboarding.antiBanTipsTitle")}
                    </div>
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      {_("onboarding.antiBanTipsDesc")}
                    </p>
                  </div>
                </motion.div>
              )}

              {/* STEP 3: Fitur Unggulan Platform */}
              {currentStep === 3 && (
                <motion.div
                  key="step-3"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  transition={{ duration: 0.25 }}
                  className="space-y-6"
                >
                  <div>
                    <div className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full bg-primary/10 text-primary border border-primary/20 mb-3">
                      <Zap className="w-3.5 h-3.5" />
                      {_("onboarding.step3Badge")}
                    </div>
                    <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
                      {_("onboarding.step3Title")}
                    </h1>
                    <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
                      {_("onboarding.step3Subtitle")}
                    </p>
                  </div>

                  {/* Feature Bento Grid */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                    {[
                      {
                        icon: MessageSquare,
                        title: _("onboarding.featureChatTitle"),
                        desc: _("onboarding.featureChatDesc"),
                        accent: "bg-blue-500/10 text-blue-500 border-blue-500/20",
                      },
                      {
                        icon: Bot,
                        title: _("onboarding.featureAutoReplyTitle"),
                        desc: _("onboarding.featureAutoReplyDesc"),
                        accent: "bg-emerald-500/10 text-emerald-500 border-emerald-500/20",
                      },
                      {
                        icon: BellRing,
                        title: _("onboarding.featureLogBotTitle"),
                        desc: _("onboarding.featureLogBotDesc"),
                        accent: "bg-purple-500/10 text-purple-500 border-purple-500/20",
                      },
                      {
                        icon: Wallet,
                        title: _("onboarding.featureWalletTitle"),
                        desc: _("onboarding.featureWalletDesc"),
                        accent: "bg-amber-500/10 text-amber-500 border-amber-500/20",
                      },
                    ].map((feature) => (
                      <div
                        key={feature.title}
                        className="p-4 rounded-xl border border-border/80 bg-background/50 hover:bg-muted/30 transition-all flex flex-col justify-between"
                      >
                        <div>
                          <div
                            className={cn(
                              "w-8 h-8 rounded-lg flex items-center justify-center border mb-3",
                              feature.accent
                            )}
                          >
                            <feature.icon className="w-4 h-4" />
                          </div>
                          <h3 className="font-semibold text-sm text-foreground mb-1">
                            {feature.title}
                          </h3>
                          <p className="text-xs text-muted-foreground leading-relaxed">
                            {feature.desc}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </motion.div>
              )}

              {/* STEP 4: Selesai & Meluncur! */}
              {currentStep === 4 && (
                <motion.div
                  key="step-4"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  transition={{ duration: 0.25 }}
                  className="space-y-6"
                >
                  <div className="text-center py-2">
                    <div className="w-14 h-14 rounded-2xl bg-primary/10 text-primary border border-primary/20 flex items-center justify-center mx-auto mb-4">
                      <CheckCircle2 className="w-7 h-7" />
                    </div>
                    <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
                      {_("onboarding.step4Title")}
                    </h1>
                    <p className="mt-2 text-sm text-muted-foreground max-w-md mx-auto leading-relaxed">
                      {_("onboarding.step4Subtitle")}
                    </p>
                  </div>

                  {/* Quick Action Pathways */}
                  <div className="space-y-3">
                    <button
                      type="button"
                      onClick={() => {
                        markOnboardingComplete();
                        router.push("/accounts/add");
                      }}
                      className="w-full flex items-center justify-between p-4 rounded-xl border border-primary/30 bg-primary/5 hover:bg-primary/10 hover:border-primary/50 transition-all text-left cursor-pointer group"
                    >
                      <div className="flex items-center gap-3.5">
                        <div className="w-10 h-10 rounded-xl bg-primary text-primary-foreground flex items-center justify-center">
                          <Smartphone className="w-5 h-5" />
                        </div>
                        <div>
                          <h3 className="font-semibold text-sm text-foreground group-hover:text-primary transition-colors">
                            {_("onboarding.addAccountCta")}
                          </h3>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {_("onboarding.addAccountCtaDesc")}
                          </p>
                        </div>
                      </div>
                      <ArrowRight className="w-4 h-4 text-primary group-hover:translate-x-1 transition-transform" />
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        markOnboardingComplete();
                        router.push("/dashboard");
                      }}
                      className="w-full flex items-center justify-between p-4 rounded-xl border border-border/80 bg-background/50 hover:bg-muted/40 transition-all text-left cursor-pointer group"
                    >
                      <div className="flex items-center gap-3.5">
                        <div className="w-10 h-10 rounded-xl bg-muted text-foreground flex items-center justify-center">
                          <LayoutDashboard className="w-5 h-5" />
                        </div>
                        <div>
                          <h3 className="font-semibold text-sm text-foreground group-hover:text-primary transition-colors">
                            {_("onboarding.goToDashboardCta")}
                          </h3>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {_("onboarding.goToDashboardCtaDesc")}
                          </p>
                        </div>
                      </div>
                      <ArrowRight className="w-4 h-4 text-muted-foreground group-hover:translate-x-1 group-hover:text-foreground transition-all" />
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        markOnboardingComplete();
                        router.push("/help");
                      }}
                      className="w-full flex items-center justify-between p-4 rounded-xl border border-border/80 bg-background/50 hover:bg-muted/40 transition-all text-left cursor-pointer group"
                    >
                      <div className="flex items-center gap-3.5">
                        <div className="w-10 h-10 rounded-xl bg-muted text-foreground flex items-center justify-center">
                          <HelpCircle className="w-5 h-5" />
                        </div>
                        <div>
                          <h3 className="font-semibold text-sm text-foreground group-hover:text-primary transition-colors">
                            {_("onboarding.helpCta")}
                          </h3>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {_("onboarding.helpCtaDesc")}
                          </p>
                        </div>
                      </div>
                      <ArrowRight className="w-4 h-4 text-muted-foreground group-hover:translate-x-1 group-hover:text-foreground transition-all" />
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* ── Footer Navigation Buttons ────────────────────────── */}
            <div className="mt-8 pt-6 border-t border-border/60 flex items-center justify-between">
              {currentStep > 1 ? (
                <button
                  type="button"
                  onClick={handleBack}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold text-muted-foreground hover:text-foreground hover:bg-muted/60 transition cursor-pointer"
                >
                  <ArrowLeft className="w-4 h-4" />
                  {_("onboarding.back")}
                </button>
              ) : (
                <div />
              )}

              <button
                type="button"
                onClick={handleNext}
                className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl bg-primary text-primary-foreground font-semibold text-xs sm:text-sm shadow-md hover:bg-primary/90 hover:shadow-lg transition cursor-pointer"
              >
                {currentStep === TOTAL_STEPS
                  ? _("onboarding.finish")
                  : _("onboarding.next")}
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </main>

      {/* ── Subtle Bottom Watermark ───────────────────────────────── */}
      <footer className="w-full py-4 text-center text-xs text-muted-foreground/60">
        © {new Date().getFullYear()} TeleBos • Multi-Account Telegram Power Engine
      </footer>
    </div>
  );
}
