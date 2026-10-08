"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  User,
  Building2,
  TrendingUp,
  Terminal,
  Compass,
  Users,
  Send,
  Share2,
  Search,
  Code2,
  Megaphone,
  Smartphone,
  Zap,
  Rocket,
  Crown,
  MessageSquare,
  ShieldCheck,
  Bot,
  ArrowRight,
  ArrowLeft,
  CheckCircle2,
  Check,
  Sparkles,
  LayoutDashboard,
} from "lucide-react";

import { BrandLogo } from "@/components/ui/brand-logo";
import { LanguageSwitcher } from "@/components/layout/language-switcher";
import { useT } from "@/lib/i18n";
import { useAuthStore } from "@/store/auth-store";
import { cn } from "@/lib/utils";

const TOTAL_STEPS = 5;

export default function OnboardingPage() {
  const router = useRouter();
  const _ = useT();
  const { user, isAuthenticated, isLoading } = useAuthStore();

  const [currentStep, setCurrentStep] = useState(1);
  const [selectedRole, setSelectedRole] = useState("solo");
  const [selectedReferral, setSelectedReferral] = useState("friend");
  const [selectedVolume, setSelectedVolume] = useState("6-20");
  const [selectedFeatures, setSelectedFeatures] = useState<string[]>([
    "broadcast",
    "webchat",
  ]);

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.replace("/login?redirect=/onboarding");
    }
  }, [isAuthenticated, isLoading, router]);

  if (isLoading || !isAuthenticated) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background text-foreground">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  const saveSurveyAndComplete = () => {
    try {
      if (user?.id) {
        localStorage.setItem(
          `telebos_onboarding_survey_${user.id}`,
          JSON.stringify({
            role: selectedRole,
            referral: selectedReferral,
            volume: selectedVolume,
            features: selectedFeatures,
            completedAt: new Date().toISOString(),
          })
        );
        localStorage.setItem(`telebos_onboarding_completed_${user.id}`, "true");
      }
    } catch {
      // Ignore localStorage write failures
    }
  };

  const handleSkip = () => {
    saveSurveyAndComplete();
    router.push("/dashboard");
  };

  const handleNext = () => {
    if (currentStep < TOTAL_STEPS) {
      setCurrentStep((prev) => prev + 1);
    } else {
      saveSurveyAndComplete();
      router.push("/dashboard");
    }
  };

  const handleBack = () => {
    if (currentStep > 1) {
      setCurrentStep((prev) => prev - 1);
    }
  };

  const toggleFeature = (featureId: string) => {
    setSelectedFeatures((prev) =>
      prev.includes(featureId)
        ? prev.length > 1
          ? prev.filter((id) => id !== featureId)
          : prev
        : [...prev, featureId]
    );
  };

  // Helper label maps for the summary screen
  const roleLabels: Record<string, string> = {
    solo: _("onboarding.roleSoloTitle"),
    agency: _("onboarding.roleAgencyTitle"),
    community: _("onboarding.roleCommunityTitle"),
    developer: _("onboarding.roleDeveloperTitle"),
    explore: _("onboarding.roleExploreTitle"),
  };

  const referralLabels: Record<string, string> = {
    friend: _("onboarding.refFriendTitle"),
    telegram: _("onboarding.refTelegramTitle"),
    social: _("onboarding.refSocialTitle"),
    search: _("onboarding.refSearchTitle"),
    forum: _("onboarding.refForumTitle"),
    ads: _("onboarding.refAdsTitle"),
  };

  const volumeLabels: Record<string, string> = {
    "1-5": _("onboarding.vol1to5Title"),
    "6-20": _("onboarding.vol6to20Title"),
    "21-50": _("onboarding.vol21to50Title"),
    "50+": _("onboarding.vol50PlusTitle"),
  };

  const featureLabels: Record<string, string> = {
    broadcast: _("onboarding.featBroadcastTitle"),
    scrape: _("onboarding.featScrapeTitle"),
    webchat: _("onboarding.featWebChatTitle"),
    proxy: _("onboarding.featProxyTitle"),
    autoreply: _("onboarding.featAutoReplyTitle"),
    smm: _("onboarding.featSmmTitle"),
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-background via-background/95 to-muted/20 text-foreground flex flex-col justify-between selection:bg-primary/20 selection:text-primary">
      {/* ── Top Header ────────────────────────────────────────────── */}
      <header className="w-full border-b border-border/40 backdrop-blur-md bg-background/80 sticky top-0 z-50">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/" aria-label="TeleBos Home" className="flex items-center gap-2">
              <BrandLogo size="sm" priority />
            </Link>
            <span className="hidden sm:inline-block text-xs font-medium px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20">
              Onboarding Survey
            </span>
          </div>

          <div className="flex items-center gap-3">
            <LanguageSwitcher />
            <button
              type="button"
              onClick={handleSkip}
              className="text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors px-3 py-1.5 rounded-lg hover:bg-muted/50 cursor-pointer"
            >
              {_("onboarding.skip")}
            </button>
          </div>
        </div>
      </header>

      {/* ── Main Survey Body ──────────────────────────────────────── */}
      <main className="flex-1 flex flex-col items-center justify-center px-4 py-8 sm:py-12">
        <div className="w-full max-w-3xl">
          {/* Progress Indicator */}
          <div className="mb-6">
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
                {currentStep === 5 && _("onboarding.step5Badge")}
              </span>
            </div>

            {/* Visual Animated Progress Bar */}
            <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden">
              <motion.div
                className="h-full bg-primary"
                initial={false}
                animate={{ width: `${(currentStep / TOTAL_STEPS) * 100}%` }}
                transition={{ duration: 0.35, ease: "easeInOut" }}
              />
            </div>
          </div>

          {/* Survey Card */}
          <div className="relative rounded-2xl border border-border/80 bg-card/80 backdrop-blur-xl p-6 sm:p-9 shadow-2xl transition-all">
            <AnimatePresence mode="wait">
              {/* PERTANYAAN 1: Peran / Rencana Penggunaan */}
              {currentStep === 1 && (
                <motion.div
                  key="step-1"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  transition={{ duration: 0.2 }}
                  className="space-y-6"
                >
                  <div>
                    <div className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full bg-primary/10 text-primary border border-primary/20 mb-2.5">
                      <Sparkles className="w-3.5 h-3.5" />
                      {_("onboarding.step1Badge")}
                    </div>
                    <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">
                      {_("onboarding.step1Title")}
                    </h1>
                    <p className="mt-1.5 text-xs sm:text-sm text-muted-foreground leading-relaxed">
                      {_("onboarding.step1Subtitle")}
                    </p>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {[
                      {
                        id: "solo",
                        icon: User,
                        title: _("onboarding.roleSoloTitle"),
                        desc: _("onboarding.roleSoloDesc"),
                      },
                      {
                        id: "agency",
                        icon: Building2,
                        title: _("onboarding.roleAgencyTitle"),
                        desc: _("onboarding.roleAgencyDesc"),
                      },
                      {
                        id: "community",
                        icon: TrendingUp,
                        title: _("onboarding.roleCommunityTitle"),
                        desc: _("onboarding.roleCommunityDesc"),
                      },
                      {
                        id: "developer",
                        icon: Terminal,
                        title: _("onboarding.roleDeveloperTitle"),
                        desc: _("onboarding.roleDeveloperDesc"),
                      },
                      {
                        id: "explore",
                        icon: Compass,
                        title: _("onboarding.roleExploreTitle"),
                        desc: _("onboarding.roleExploreDesc"),
                      },
                    ].map((item) => {
                      const isSelected = selectedRole === item.id;
                      return (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => setSelectedRole(item.id)}
                          className={cn(
                            "flex items-start gap-3.5 p-3.5 rounded-xl border text-left transition-all duration-200 cursor-pointer group",
                            item.id === "explore" && "sm:col-span-2",
                            isSelected
                              ? "border-primary bg-primary/5 ring-1 ring-primary/40 shadow-xs"
                              : "border-border/70 hover:border-border hover:bg-muted/40"
                          )}
                        >
                          <div
                            className={cn(
                              "p-2 rounded-lg flex-shrink-0 transition-colors",
                              isSelected
                                ? "bg-primary text-primary-foreground"
                                : "bg-muted text-muted-foreground group-hover:text-foreground"
                            )}
                          >
                            <item.icon className="w-4 h-4" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between">
                              <h3 className="font-semibold text-xs sm:text-sm text-foreground">
                                {item.title}
                              </h3>
                              <div
                                className={cn(
                                  "w-4 h-4 rounded-full border flex items-center justify-center transition-colors ml-2",
                                  isSelected
                                    ? "bg-primary border-primary text-primary-foreground"
                                    : "border-border/80 bg-background"
                                )}
                              >
                                {isSelected && <Check className="w-2.5 h-2.5 stroke-[3]" />}
                              </div>
                            </div>
                            <p className="text-xs text-muted-foreground mt-0.5 leading-normal">
                              {item.desc}
                            </p>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </motion.div>
              )}

              {/* PERTANYAAN 2: Tau TeleBos dari Mana? */}
              {currentStep === 2 && (
                <motion.div
                  key="step-2"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  transition={{ duration: 0.2 }}
                  className="space-y-6"
                >
                  <div>
                    <div className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full bg-primary/10 text-primary border border-primary/20 mb-2.5">
                      <Share2 className="w-3.5 h-3.5" />
                      {_("onboarding.step2Badge")}
                    </div>
                    <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">
                      {_("onboarding.step2Title")}
                    </h1>
                    <p className="mt-1.5 text-xs sm:text-sm text-muted-foreground leading-relaxed">
                      {_("onboarding.step2Subtitle")}
                    </p>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {[
                      {
                        id: "friend",
                        icon: Users,
                        title: _("onboarding.refFriendTitle"),
                        desc: _("onboarding.refFriendDesc"),
                      },
                      {
                        id: "telegram",
                        icon: Send,
                        title: _("onboarding.refTelegramTitle"),
                        desc: _("onboarding.refTelegramDesc"),
                      },
                      {
                        id: "social",
                        icon: Share2,
                        title: _("onboarding.refSocialTitle"),
                        desc: _("onboarding.refSocialDesc"),
                      },
                      {
                        id: "search",
                        icon: Search,
                        title: _("onboarding.refSearchTitle"),
                        desc: _("onboarding.refSearchDesc"),
                      },
                      {
                        id: "forum",
                        icon: Code2,
                        title: _("onboarding.refForumTitle"),
                        desc: _("onboarding.refForumDesc"),
                      },
                      {
                        id: "ads",
                        icon: Megaphone,
                        title: _("onboarding.refAdsTitle"),
                        desc: _("onboarding.refAdsDesc"),
                      },
                    ].map((item) => {
                      const isSelected = selectedReferral === item.id;
                      return (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => setSelectedReferral(item.id)}
                          className={cn(
                            "flex items-start gap-3.5 p-3.5 rounded-xl border text-left transition-all duration-200 cursor-pointer group",
                            isSelected
                              ? "border-primary bg-primary/5 ring-1 ring-primary/40 shadow-xs"
                              : "border-border/70 hover:border-border hover:bg-muted/40"
                          )}
                        >
                          <div
                            className={cn(
                              "p-2 rounded-lg flex-shrink-0 transition-colors",
                              isSelected
                                ? "bg-primary text-primary-foreground"
                                : "bg-muted text-muted-foreground group-hover:text-foreground"
                            )}
                          >
                            <item.icon className="w-4 h-4" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between">
                              <h3 className="font-semibold text-xs sm:text-sm text-foreground">
                                {item.title}
                              </h3>
                              <div
                                className={cn(
                                  "w-4 h-4 rounded-full border flex items-center justify-center transition-colors ml-2",
                                  isSelected
                                    ? "bg-primary border-primary text-primary-foreground"
                                    : "border-border/80 bg-background"
                                )}
                              >
                                {isSelected && <Check className="w-2.5 h-2.5 stroke-[3]" />}
                              </div>
                            </div>
                            <p className="text-xs text-muted-foreground mt-0.5 leading-normal">
                              {item.desc}
                            </p>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </motion.div>
              )}

              {/* PERTANYAAN 3: Berapa Banyak Akun yang Dikelola? */}
              {currentStep === 3 && (
                <motion.div
                  key="step-3"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  transition={{ duration: 0.2 }}
                  className="space-y-6"
                >
                  <div>
                    <div className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full bg-primary/10 text-primary border border-primary/20 mb-2.5">
                      <Smartphone className="w-3.5 h-3.5" />
                      {_("onboarding.step3Badge")}
                    </div>
                    <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">
                      {_("onboarding.step3Title")}
                    </h1>
                    <p className="mt-1.5 text-xs sm:text-sm text-muted-foreground leading-relaxed">
                      {_("onboarding.step3Subtitle")}
                    </p>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                    {[
                      {
                        id: "1-5",
                        icon: Smartphone,
                        title: _("onboarding.vol1to5Title"),
                        desc: _("onboarding.vol1to5Desc"),
                      },
                      {
                        id: "6-20",
                        icon: Zap,
                        title: _("onboarding.vol6to20Title"),
                        desc: _("onboarding.vol6to20Desc"),
                      },
                      {
                        id: "21-50",
                        icon: Rocket,
                        title: _("onboarding.vol21to50Title"),
                        desc: _("onboarding.vol21to50Desc"),
                      },
                      {
                        id: "50+",
                        icon: Crown,
                        title: _("onboarding.vol50PlusTitle"),
                        desc: _("onboarding.vol50PlusDesc"),
                      },
                    ].map((item) => {
                      const isSelected = selectedVolume === item.id;
                      return (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => setSelectedVolume(item.id)}
                          className={cn(
                            "flex items-start gap-3.5 p-4 rounded-xl border text-left transition-all duration-200 cursor-pointer group",
                            isSelected
                              ? "border-primary bg-primary/5 ring-1 ring-primary/40 shadow-xs"
                              : "border-border/70 hover:border-border hover:bg-muted/40"
                          )}
                        >
                          <div
                            className={cn(
                              "p-2.5 rounded-lg flex-shrink-0 transition-colors",
                              isSelected
                                ? "bg-primary text-primary-foreground"
                                : "bg-muted text-muted-foreground group-hover:text-foreground"
                            )}
                          >
                            <item.icon className="w-5 h-5" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between">
                              <h3 className="font-semibold text-sm text-foreground">
                                {item.title}
                              </h3>
                              <div
                                className={cn(
                                  "w-4 h-4 rounded-full border flex items-center justify-center transition-colors ml-2",
                                  isSelected
                                    ? "bg-primary border-primary text-primary-foreground"
                                    : "border-border/80 bg-background"
                                )}
                              >
                                {isSelected && <Check className="w-2.5 h-2.5 stroke-[3]" />}
                              </div>
                            </div>
                            <p className="text-xs text-muted-foreground mt-1 leading-normal">
                              {item.desc}
                            </p>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </motion.div>
              )}

              {/* PERTANYAAN 4: Fitur Apa yang Paling Dicari? (Multi-select) */}
              {currentStep === 4 && (
                <motion.div
                  key="step-4"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  transition={{ duration: 0.2 }}
                  className="space-y-6"
                >
                  <div>
                    <div className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full bg-primary/10 text-primary border border-primary/20 mb-2.5">
                      <Zap className="w-3.5 h-3.5" />
                      {_("onboarding.step4Badge")}
                    </div>
                    <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">
                      {_("onboarding.step4Title")}
                    </h1>
                    <p className="mt-1.5 text-xs sm:text-sm text-muted-foreground leading-relaxed">
                      {_("onboarding.step4Subtitle")}
                    </p>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {[
                      {
                        id: "broadcast",
                        icon: Send,
                        title: _("onboarding.featBroadcastTitle"),
                        desc: _("onboarding.featBroadcastDesc"),
                      },
                      {
                        id: "scrape",
                        icon: Users,
                        title: _("onboarding.featScrapeTitle"),
                        desc: _("onboarding.featScrapeDesc"),
                      },
                      {
                        id: "webchat",
                        icon: MessageSquare,
                        title: _("onboarding.featWebChatTitle"),
                        desc: _("onboarding.featWebChatDesc"),
                      },
                      {
                        id: "proxy",
                        icon: ShieldCheck,
                        title: _("onboarding.featProxyTitle"),
                        desc: _("onboarding.featProxyDesc"),
                      },
                      {
                        id: "autoreply",
                        icon: Bot,
                        title: _("onboarding.featAutoReplyTitle"),
                        desc: _("onboarding.featAutoReplyDesc"),
                      },
                      {
                        id: "smm",
                        icon: Zap,
                        title: _("onboarding.featSmmTitle"),
                        desc: _("onboarding.featSmmDesc"),
                      },
                    ].map((item) => {
                      const isSelected = selectedFeatures.includes(item.id);
                      return (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => toggleFeature(item.id)}
                          className={cn(
                            "flex items-start gap-3 p-3.5 rounded-xl border text-left transition-all duration-200 cursor-pointer group",
                            isSelected
                              ? "border-primary bg-primary/5 ring-1 ring-primary/40 shadow-xs"
                              : "border-border/70 hover:border-border hover:bg-muted/40"
                          )}
                        >
                          <div
                            className={cn(
                              "p-2 rounded-lg flex-shrink-0 transition-colors",
                              isSelected
                                ? "bg-primary text-primary-foreground"
                                : "bg-muted text-muted-foreground group-hover:text-foreground"
                            )}
                          >
                            <item.icon className="w-4 h-4" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between">
                              <h3 className="font-semibold text-xs sm:text-sm text-foreground">
                                {item.title}
                              </h3>
                              <div
                                className={cn(
                                  "w-4 h-4 rounded-md border flex items-center justify-center transition-colors ml-2",
                                  isSelected
                                    ? "bg-primary border-primary text-primary-foreground"
                                    : "border-border/80 bg-background"
                                )}
                              >
                                {isSelected && <Check className="w-3 h-3 stroke-[3]" />}
                              </div>
                            </div>
                            <p className="text-xs text-muted-foreground mt-0.5 leading-normal">
                              {item.desc}
                            </p>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </motion.div>
              )}

              {/* LANGKAH 5: Personalisasi Selesai! */}
              {currentStep === 5 && (
                <motion.div
                  key="step-5"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  transition={{ duration: 0.2 }}
                  className="space-y-6"
                >
                  <div className="text-center py-2">
                    <div className="w-14 h-14 rounded-2xl bg-primary/10 text-primary border border-primary/20 flex items-center justify-center mx-auto mb-3.5">
                      <CheckCircle2 className="w-7 h-7" />
                    </div>
                    <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">
                      {_("onboarding.step5Title")}
                    </h1>
                    <p className="mt-1 text-xs sm:text-sm text-muted-foreground max-w-md mx-auto leading-relaxed">
                      {_("onboarding.step5Subtitle")}
                    </p>
                  </div>

                  {/* Summary of Choices */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 p-3.5 rounded-xl border border-border/80 bg-background/50 text-xs">
                    <div>
                      <span className="text-[10px] uppercase font-bold text-muted-foreground">
                        {_("onboarding.summaryRoleLabel")}
                      </span>
                      <p className="font-semibold text-foreground truncate mt-0.5">
                        {roleLabels[selectedRole] || selectedRole}
                      </p>
                    </div>
                    <div>
                      <span className="text-[10px] uppercase font-bold text-muted-foreground">
                        {_("onboarding.summaryRefLabel")}
                      </span>
                      <p className="font-semibold text-foreground truncate mt-0.5">
                        {referralLabels[selectedReferral] || selectedReferral}
                      </p>
                    </div>
                    <div>
                      <span className="text-[10px] uppercase font-bold text-muted-foreground">
                        {_("onboarding.summaryVolLabel")}
                      </span>
                      <p className="font-semibold text-foreground truncate mt-0.5">
                        {volumeLabels[selectedVolume] || selectedVolume}
                      </p>
                    </div>
                    <div>
                      <span className="text-[10px] uppercase font-bold text-muted-foreground">
                        {_("onboarding.summaryFeatLabel")}
                      </span>
                      <p className="font-semibold text-foreground truncate mt-0.5">
                        {selectedFeatures.length} {_("onboarding.featBroadcastTitle") ? "Dipilih" : "Selected"}
                      </p>
                    </div>
                  </div>

                  {/* Quick Action Pathways */}
                  <div className="space-y-3">
                    <button
                      type="button"
                      onClick={() => {
                        saveSurveyAndComplete();
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
                        saveSurveyAndComplete();
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
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* ── Footer Navigation Buttons ────────────────────────── */}
            <div className="mt-8 pt-5 border-t border-border/60 flex items-center justify-between">
              {currentStep > 1 ? (
                <button
                  type="button"
                  onClick={handleBack}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs sm:text-sm font-semibold text-muted-foreground hover:text-foreground hover:bg-muted/60 transition cursor-pointer"
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
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary text-primary-foreground font-semibold text-xs sm:text-sm shadow-md hover:bg-primary/90 hover:shadow-lg transition cursor-pointer"
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

      {/* ── Bottom Watermark ──────────────────────────────────────── */}
      <footer className="w-full py-4 text-center text-xs text-muted-foreground/60">
        © {new Date().getFullYear()} TeleBos • Multi-Account Telegram Power Engine
      </footer>
    </div>
  );
}
