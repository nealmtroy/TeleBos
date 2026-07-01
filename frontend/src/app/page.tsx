"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/store/auth-store";
import { useT } from "@/lib/i18n";
import { LanguageSwitcher } from "@/components/layout/language-switcher";
import { Navbar5 } from "@/components/ui/navbar-5";
import { helpSections } from "@/data/help-sections";
import { motion, AnimatePresence } from "framer-motion";
import {
  Smartphone,
  Send,
  MessageSquare,
  Activity,
  Bot,
  UserPlus,
  ArrowRight,
  ChevronDown,
  Menu,
  X,
  BookOpen,
  Shield,
  Sparkles,
  ExternalLink,
  Globe,
  Zap,
  Layers,
} from "lucide-react";

// ── Animation Variants ─────────────────────────────────────────────────────

const fadeUp = {
  hidden: { opacity: 0, y: 30 },
  visible: (i = 0) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.6, delay: i * 0.15, ease: "easeOut" as const },
  }),
};

const staggerContainer = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.1, delayChildren: 0.2 },
  },
};

const cardAnimation = {
  hidden: { opacity: 0, y: 50 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.5, ease: "easeOut" as const },
  },
};

const stepAnimation = {
  hidden: { opacity: 0, scale: 0.8 },
  visible: {
    opacity: 1,
    scale: 1,
    transition: { duration: 0.5, ease: "easeOut" as const },
  },
};

const sectionTitle = {
  hidden: { opacity: 0, y: 20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.6, ease: "easeOut" as const },
  },
};

// ── Animated Background Orbs ───────────────────────────────────────────────

function AnimatedBackground() {
  return (
    <div className="absolute inset-0 -z-10 overflow-hidden">
      <motion.div
        className="absolute top-1/4 left-1/4 w-[500px] h-[500px] rounded-full bg-gradient-to-br from-primary-200/30 to-primary-400/20 blur-3xl"
        animate={{
          x: [0, 50, -30, 0],
          y: [0, -40, 30, 0],
          scale: [1, 1.1, 0.95, 1],
        }}
        transition={{ duration: 25, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        className="absolute top-1/3 right-1/4 w-[400px] h-[400px] rounded-full bg-gradient-to-br from-blue-200/20 to-indigo-300/20 blur-3xl"
        animate={{
          x: [0, -60, 40, 0],
          y: [0, 50, -40, 0],
          scale: [1, 1.15, 0.9, 1],
        }}
        transition={{ duration: 30, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        className="absolute bottom-1/3 left-1/3 w-[350px] h-[350px] rounded-full bg-gradient-to-br from-primary-300/20 to-primary-500/10 blur-3xl"
        animate={{
          x: [0, 40, -50, 0],
          y: [0, -30, 50, 0],
          scale: [1, 0.9, 1.1, 1],
        }}
        transition={{ duration: 20, repeat: Infinity, ease: "easeInOut" }}
      />
      <div
        className="absolute inset-0 opacity-[0.03]"
        style={{
          backgroundImage:
            "radial-gradient(circle at 1px 1px, #000 1px, transparent 0)",
          backgroundSize: "40px 40px",
        }}
      />
    </div>
  );
}

// ── Floating Particles ─────────────────────────────────────────────────────

function FloatingParticles() {
  const particles = Array.from({ length: 20 }, (_, i) => ({
    id: i,
    x: Math.random() * 100,
    y: Math.random() * 100,
    size: Math.random() * 4 + 2,
    duration: Math.random() * 15 + 10,
    delay: Math.random() * 5,
  }));

  return (
    <div className="absolute inset-0 -z-10 pointer-events-none overflow-hidden">
      {particles.map((p) => (
        <motion.div
          key={p.id}
          className="absolute rounded-full bg-primary-400/20"
          style={{
            left: `${p.x}%`,
            top: `${p.y}%`,
            width: p.size,
            height: p.size,
          }}
          animate={{
            y: [0, -30, 0],
            opacity: [0.2, 0.6, 0.2],
          }}
          transition={{
            duration: p.duration,
            repeat: Infinity,
            ease: "easeInOut",
            delay: p.delay,
          }}
        />
      ))}
    </div>
  );
}

// ── Stats Data ─────────────────────────────────────────────────────────────

const stats = [
  { value: "∞", label: "Akun Telegram" },
  { value: "Real-time", label: "Chat & Updates" },
  { value: "Bulk", label: "Broadcast Pesan" },
  { value: "Auto", label: "Auto Reply" },
];

// ── Highlight Showcase Items ───────────────────────────────────────────────

const highlights = [
  {
    icon: Layers,
    title: "Multi-Account Management",
    desc: "Kelola puluhan akun Telegram dari satu dashboard tanpa login/logout berulang.",
  },
  {
    icon: Zap,
    title: "Broadcast Cerdas",
    desc: "Kirim pesan ke ribuan grup/channel dengan delay otomatis dan anti-flood.",
  },
  {
    icon: Globe,
    title: "Pantau Real-time",
    desc: "Lihat chat masuk, pesan terkirim, dan aktivitas akun secara langsung.",
  },
];

export default function LandingPage() {
  const { isAuthenticated, isLoading } = useAuthStore();
  const router = useRouter();
  const _ = useT();
  const [scrolled, setScrolled] = useState(false);
  const [mobileMenu, setMobileMenu] = useState(false);

  useEffect(() => {
    if (!isLoading && isAuthenticated) {
      router.replace("/dashboard");
    }
  }, [isAuthenticated, isLoading, router]);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-50">
        <motion.div
          className="h-8 w-8 border-4 border-primary border-t-transparent rounded-full"
          animate={{ rotate: 360 }}
          transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
        />
      </div>
    );
  }

  if (isAuthenticated) return null;

  const features = [
    {
      icon: Smartphone,
      title: _("landing.featureMultiAccount"),
      desc: _("landing.featureMultiAccountDesc"),
    },
    {
      icon: Send,
      title: _("landing.featureBroadcast"),
      desc: _("landing.featureBroadcastDesc"),
    },
    {
      icon: MessageSquare,
      title: _("landing.featureChat"),
      desc: _("landing.featureChatDesc"),
    },
    {
      icon: Activity,
      title: _("landing.featureRealtime"),
      desc: _("landing.featureRealtimeDesc"),
    },
    {
      icon: Bot,
      title: _("landing.featureAutoReply"),
      desc: _("landing.featureAutoReplyDesc"),
    },
    {
      icon: UserPlus,
      title: _("landing.featureInvite"),
      desc: _("landing.featureInviteDesc"),
    },
  ];

  const steps = [
    {
      num: "01",
      title: _("landing.step1Title"),
      desc: _("landing.step1Desc"),
    },
    {
      num: "02",
      title: _("landing.step2Title"),
      desc: _("landing.step2Desc"),
    },
    {
      num: "03",
      title: _("landing.step3Title"),
      desc: _("landing.step3Desc"),
    },
    {
      num: "04",
      title: _("landing.step4Title"),
      desc: _("landing.step4Desc"),
    },
  ];

  return (
    <div className="min-h-screen bg-white">
      {/* ── Navbar ─────────────────────────────────────────────────────── */}
      <Navbar5 />

      {/* ── Hero ────────────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden pt-24 pb-20 sm:pt-32 sm:pb-28">
        <AnimatedBackground />
        <FloatingParticles />

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl mx-auto text-center">
            {/* Title */}
            <motion.h1
              className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight text-gray-900 leading-[1.1]"
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.2, ease: "easeOut" }}
            >
              {_("landing.heroTitle")}
            </motion.h1>

            {/* Subtitle */}
            <motion.p
              className="mt-6 text-lg sm:text-xl text-gray-600 leading-relaxed max-w-2xl mx-auto"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.4, ease: "easeOut" }}
            >
              {_("landing.heroSubtitle")}
            </motion.p>

            {/* CTA Buttons */}
            <motion.div
              className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.6, ease: "easeOut" }}
            >
              <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
                <Link
                  href="/register"
                  className="inline-flex items-center gap-2 px-8 py-3.5 rounded-xl bg-primary-600 hover:bg-primary-700 text-white font-semibold text-base shadow-lg shadow-primary-200 hover:shadow-primary-300 transition-all"
                >
                  {_("landing.heroCta")}
                  <motion.span
                    animate={{ x: [0, 5, 0] }}
                    transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
                  >
                    <ArrowRight className="h-5 w-5" />
                  </motion.span>
                </Link>
              </motion.div>
              <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
                <Link
                  href="#features"
                  className="inline-flex items-center gap-2 px-8 py-3.5 rounded-xl border border-gray-300 hover:border-gray-400 text-gray-700 font-medium text-base transition"
                >
                  {_("landing.heroSecondary")}
                  <ChevronDown className="h-4 w-4" />
                </Link>
              </motion.div>
            </motion.div>

            {/* Telegram Channel invite */}
            <motion.div
              className="mt-8"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.6, delay: 0.8 }}
            >
              <a
                href="https://t.me/telebos_official"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 text-sm text-gray-400 hover:text-primary-500 transition-colors group"
              >
                <svg
                  viewBox="0 0 24 24"
                  fill="currentColor"
                  className="w-4 h-4"
                >
                  <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z" />
                </svg>
                <span className="group-hover:underline underline-offset-2">
                  Join TeleBos Official Channel
                </span>
                <ExternalLink className="w-3 h-3 opacity-50 group-hover:opacity-100 transition-opacity" />
              </a>
            </motion.div>
          </div>

          {/* ── Hero Showcase Grid ──────────────────────────────────────── */}
          <motion.div
            className="mt-20 mx-auto max-w-5xl"
            initial={{ opacity: 0, y: 60 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 1, ease: "easeOut" }}
          >
            {/* Stats Bar */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
              {stats.map((stat, i) => (
                <motion.div
                  key={i}
                  className="text-center p-5 rounded-2xl bg-white border border-gray-100 shadow-sm"
                  initial={{ opacity: 0, y: 30 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.5, delay: 1.1 + i * 0.1 }}
                  whileHover={{
                    y: -4,
                    boxShadow: "0 12px 24px rgba(0,0,0,0.08)",
                  }}
                >
                  <div className="text-2xl sm:text-3xl font-bold text-primary-600">
                    {stat.value}
                  </div>
                  <div className="mt-1 text-xs sm:text-sm text-gray-600">
                    {stat.label}
                  </div>
                </motion.div>
              ))}
            </div>

            {/* Highlight Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {highlights.map((item, i) => (
                <motion.div
                  key={i}
                  className="relative p-6 rounded-2xl bg-gradient-to-br from-primary-50 to-white border border-primary-100/50 overflow-hidden group"
                  initial={{ opacity: 0, y: 30 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.5, delay: 1.5 + i * 0.15 }}
                  whileHover={{ y: -6 }}
                >
                  {/* Glow on hover */}
                  <div className="absolute -inset-1 bg-primary-400/5 rounded-2xl blur-xl opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                  <div className="relative z-10">
                    <h2 className="font-semibold text-gray-900 mb-2 text-lg">
                      {item.title}
                    </h2>
                    <div className="w-10 h-10 rounded-xl bg-primary-100 flex items-center justify-center mb-4">
                      <item.icon className="h-5 w-5 text-primary-600" />
                    </div>
                    <p className="text-sm text-gray-600 leading-relaxed">
                      {item.desc}
                    </p>
                  </div>
                </motion.div>
              ))}
            </div>
          </motion.div>
        </div>
      </section>

      {/* ── Features ────────────────────────────────────────────────────── */}
      <motion.section
        id="features"
        className="py-20 sm:py-28 bg-gray-50/50"
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, margin: "-100px" }}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div
            className="text-center max-w-2xl mx-auto mb-16"
            variants={sectionTitle}
          >
            <h2 className="text-3xl sm:text-4xl font-bold text-gray-900">
              {_("landing.featuresTitle")}
            </h2>
            <p className="mt-4 text-lg text-gray-600">
              {_("landing.featuresSubtitle")}
            </p>
          </motion.div>

          <motion.div
            className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 sm:gap-8"
            variants={staggerContainer}
          >
            {features.map((feature, i) => (
              <motion.div
                key={i}
                variants={cardAnimation}
                whileHover={{ y: -8, transition: { duration: 0.25 } }}
                className="group relative bg-white rounded-2xl p-6 sm:p-8 border border-gray-100 hover:border-primary-100 hover:shadow-lg hover:shadow-primary-50 transition-all duration-300"
              >
                <h2 className="text-lg font-semibold text-gray-900 mb-3">
                  {feature.title}
                </h2>
                <motion.div
                  className="w-12 h-12 rounded-xl bg-primary-50 group-hover:bg-primary-100 flex items-center justify-center mb-5 transition-colors"
                  whileHover={{ rotate: [0, -10, 10, -10, 0], transition: { duration: 0.5 } }}
                >
                  <feature.icon className="h-6 w-6 text-primary-600" />
                </motion.div>
                <p className="text-gray-600 text-sm leading-relaxed">
                  {feature.desc}
                </p>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </motion.section>

      {/* ── How It Works ────────────────────────────────────────────────── */}
      <motion.section
        id="how-it-works"
        className="py-20 sm:py-28"
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, margin: "-100px" }}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div
            className="text-center max-w-2xl mx-auto mb-16"
            variants={sectionTitle}
          >
            <h2 className="text-3xl sm:text-4xl font-bold text-gray-900">
              {_("landing.howItWorks")}
            </h2>
            <p className="mt-4 text-lg text-gray-600">
              {_("landing.howItWorksSubtitle")}
            </p>
          </motion.div>

          <motion.div
            className="grid grid-cols-1 md:grid-cols-4 gap-8"
            variants={staggerContainer}
          >
            {steps.map((step, i) => (
              <motion.div
                key={i}
                variants={stepAnimation}
                className="relative text-center"
              >
                {/* Connector line */}
                {i < steps.length - 1 && (
                  <div className="hidden md:block absolute top-8 left-[60%] w-[80%] h-[2px] bg-gradient-to-r from-primary-200 to-transparent" />
                )}

                <h2 className="text-lg font-semibold text-gray-900 mb-3">
                  {step.title}
                </h2>
                <motion.div
                  className="w-16 h-16 rounded-2xl bg-primary-50 flex items-center justify-center mx-auto mb-6"
                  whileHover={{ scale: 1.15, backgroundColor: "rgba(59,130,246,0.1)" }}
                  transition={{ type: "spring", stiffness: 300 }}
                >
                  <motion.span
                    className="text-2xl font-bold text-primary-600"
                    whileHover={{ scale: 1.2 }}
                  >
                    {step.num}
                  </motion.span>
                </motion.div>
                <p className="text-gray-600 text-sm leading-relaxed">
                  {step.desc}
                </p>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </motion.section>

      {/* ── Join Telegram Channel Section ──────────────────────────────── */}
      <motion.section
        className="py-20 sm:py-24 bg-gray-50/30"
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, margin: "-100px" }}
      >
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-primary-600 via-primary-700 to-primary-950 p-8 sm:p-12">
            {/* Background orbs */}
            <motion.div
              className="absolute top-0 right-0 w-64 h-64 rounded-full bg-white/5 blur-3xl"
              animate={{
                x: [0, -30, 20, 0],
                y: [0, 20, -30, 0],
              }}
              transition={{ duration: 15, repeat: Infinity, ease: "easeInOut" }}
            />
            <motion.div
              className="absolute bottom-0 left-0 w-48 h-48 rounded-full bg-primary-400/10 blur-3xl"
              animate={{
                x: [0, 20, -20, 0],
                y: [0, -20, 20, 0],
              }}
              transition={{ duration: 12, repeat: Infinity, ease: "easeInOut" }}
            />

            <div className="relative z-10 text-center">
              <motion.div variants={fadeUp}>
                <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-white/15 backdrop-blur-sm mb-6">
                  <svg
                    viewBox="0 0 24 24"
                    fill="white"
                    className="w-8 h-8"
                  >
                    <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z" />
                  </svg>
                </div>
              </motion.div>

              <motion.h2
                className="text-2xl sm:text-3xl font-bold text-white"
                variants={fadeUp}
                custom={1}
              >
                Gabung TeleBos Official Channel
              </motion.h2>
              <motion.p
                className="mt-3 text-primary-200 text-base sm:text-lg max-w-lg mx-auto"
                variants={fadeUp}
                custom={2}
              >
                Dapatkan informasi terbaru, update fitur, tips & tricks, dan
                pengumuman penting seputar TeleBos.
              </motion.p>
              <motion.div
                className="mt-8"
                variants={fadeUp}
                custom={3}
              >
                <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
                  <a
                    href="https://t.me/telebos_official"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2.5 px-8 py-3.5 rounded-xl bg-white hover:bg-primary-50 text-primary-700 font-semibold text-base shadow-lg shadow-black/10 transition-all"
                  >
                    <svg
                      viewBox="0 0 24 24"
                      fill="currentColor"
                      className="w-5 h-5"
                    >
                      <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z" />
                    </svg>
                    Join @telebos_official
                    <ExternalLink className="w-4 h-4 opacity-60" />
                  </a>
                </motion.div>
              </motion.div>
            </div>
          </div>
        </div>
      </motion.section>

      {/* ── CTA ─────────────────────────────────────────────────────────── */}
      <motion.section
        className="py-20 sm:py-28 bg-gradient-to-br from-primary-900 via-primary-800 to-slate-900 relative overflow-hidden"
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, margin: "-100px" }}
      >
        {/* CTA background orbs */}
        <motion.div
          className="absolute top-0 right-0 w-[400px] h-[400px] rounded-full bg-white/5 blur-3xl"
          animate={{
            x: [0, -50, 30, 0],
            y: [0, 30, -50, 0],
          }}
          transition={{ duration: 20, repeat: Infinity, ease: "easeInOut" }}
        />
        <motion.div
          className="absolute bottom-0 left-0 w-[300px] h-[300px] rounded-full bg-indigo-300/10 blur-3xl"
          animate={{
            x: [0, 40, -30, 0],
            y: [0, -40, 30, 0],
          }}
          transition={{ duration: 18, repeat: Infinity, ease: "easeInOut" }}
        />

        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 text-center relative z-10">
          <motion.h2
            className="text-3xl sm:text-4xl font-bold text-white"
            variants={fadeUp}
          >
            {_("landing.ctaTitle")}
          </motion.h2>
          <motion.p
            className="mt-4 text-lg text-primary-200/80"
            variants={fadeUp}
            custom={1}
          >
            {_("landing.ctaSubtitle")}
          </motion.p>
          <motion.div className="mt-10" variants={fadeUp} custom={2}>
            <motion.div
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
            >
              <Link
                href="/register"
                className="inline-flex items-center gap-2 px-8 py-3.5 rounded-xl bg-white hover:bg-primary-50 text-primary-700 font-semibold text-base shadow-lg shadow-black/10 transition-all"
              >
                {_("landing.ctaButton")}
                <motion.span
                  animate={{ x: [0, 5, 0] }}
                  transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
                >
                  <ArrowRight className="h-5 w-5" />
                </motion.span>
              </Link>
            </motion.div>
          </motion.div>
        </div>
      </motion.section>

      {/* ── Footer ──────────────────────────────────────────────────────── */}
      <motion.footer
        className="bg-gray-900 text-gray-400"
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true }}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-12">
            {/* Brand */}
            <motion.div className="md:col-span-1" variants={fadeUp}>
              <div className="flex items-center mb-4">
                <span className="text-lg font-bold text-white">TeleBos</span>
              </div>
              <p className="text-sm text-gray-400 leading-relaxed max-w-xs">
                {_("login.brandSubtitle")}
              </p>
            </motion.div>

            {/* Product links */}
            <motion.div variants={fadeUp}>
              <h3 className="text-sm font-semibold text-white uppercase tracking-wider mb-4">
                {_("landing.footerProduct")}
              </h3>
              <ul className="space-y-3">
                <li>
                  <Link
                    href="#features"
                    className="text-sm hover:text-white transition"
                  >
                    {_("landing.navFeatures")}
                  </Link>
                </li>
                <li>
                  <Link
                    href="/login"
                    className="text-sm hover:text-white transition"
                  >
                    {_("landing.signIn")}
                  </Link>
                </li>
                <li>
                  <Link
                    href="/register"
                    className="text-sm hover:text-white transition"
                  >
                    {_("landing.getStarted")}
                  </Link>
                </li>
              </ul>
            </motion.div>

            {/* Help */}
            <motion.div variants={fadeUp} custom={1}>
              <h3 className="text-sm font-semibold text-white uppercase tracking-wider mb-4">
                {_("landing.footerHelp")}
              </h3>
              <ul className="space-y-3">
                <li>
                  <Link
                    href="/help/getting-started"
                    className="text-sm hover:text-white transition"
                  >
                    {_("help.gettingStarted")}
                  </Link>
                </li>
                <li>
                  <Link
                    href="/help/account-management"
                    className="text-sm hover:text-white transition"
                  >
                    {_("help.accounts")}
                  </Link>
                </li>
                <li>
                  <Link
                    href="/help/broadcasting"
                    className="text-sm hover:text-white transition"
                  >
                    {_("help.broadcast")}
                  </Link>
                </li>
                <li>
                  <Link
                    href="/help/auto-reply"
                    className="text-sm hover:text-white transition"
                  >
                    {_("help.autoReply")}
                  </Link>
                </li>
                <li>
                  <Link
                    href="/help/member-invite"
                    className="text-sm hover:text-white transition"
                  >
                    {_("help.memberInvite")}
                  </Link>
                </li>
                <li>
                  <Link
                    href="/help/pro-tips"
                    className="text-sm hover:text-white transition"
                  >
                    {_("help.tips")}
                  </Link>
                </li>
              </ul>
            </motion.div>

            {/* Legal */}
            <motion.div variants={fadeUp} custom={2}>
              <h3 className="text-sm font-semibold text-white uppercase tracking-wider mb-4">
                {_("landing.footerLegal")}
              </h3>
              <ul className="space-y-3">
                <li>
                  <Link
                    href="/privacy"
                    className="text-sm hover:text-white transition"
                  >
                    {_("landing.navPrivacy")}
                  </Link>
                </li>
                <li>
                  <Link
                    href="/tos"
                    className="text-sm hover:text-white transition"
                  >
                    {_("landing.navTos")}
                  </Link>
                </li>
              </ul>
            </motion.div>
          </div>

          <motion.div
            className="mt-12 pt-8 border-t border-gray-800 flex flex-col sm:flex-row items-center justify-between gap-4"
            variants={fadeUp}
            custom={3}
          >
            <p className="text-sm text-gray-500">
              {_("landing.footerCopyright")}
            </p>
            <div className="flex items-center gap-4">
              <a
                href="https://t.me/telebos_official"
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-gray-500 hover:text-white transition inline-flex items-center gap-1.5"
              >
                <svg
                  viewBox="0 0 24 24"
                  fill="currentColor"
                  className="w-4 h-4"
                >
                  <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z" />
                </svg>
                @telebos_official
              </a>
            </div>
          </motion.div>
        </div>
      </motion.footer>
    </div>
  );
}
