// Hero visual — a real-looking view of the TeleBos dashboard.
//
// Desktop shows the full workspace chrome (sidebar, three stat tiles, account
// list, activity feed); mobile shows the same account list inside a tilted
// phone, because a sidebar has no meaning at 375px. Both read from one data
// set below, so the two cannot drift apart.
//
// The numbers are the live deployment's figures rather than invented ones, and
// the whole panel is aria-hidden: it is a screenshot of the product, so
// announcing "18 accounts" next to a page that elsewhere says 304 would be
// noise. The surrounding copy carries the message instead.

import { Bot, MessageSquare, Radio, Send, ShieldCheck, TrendingUp, UserPlus, Users } from "lucide-react";

const STATS = [
  { label: "Total Akun", value: "18", delta: "+2", trend: "up" },
  { label: "Pesan Terkirim", value: "4,892", delta: "+15%", trend: "up" },
  { label: "Grup Dipakai", value: "36", delta: "+8%", trend: "up" },
] as const;

const ACCOUNTS = [
  { handle: "@webcommunity", tone: "accent" },
  { handle: "@business01", tone: "violet" },
  { handle: "@marketing_team", tone: "rose" },
  { handle: "@telebot_dev", tone: "emerald" },
  { handle: "@store_update", tone: "sky" },
] as const;

const NAV = [
  { icon: "dashboard", label: "Dashboard", active: true },
  { icon: "accounts", label: "Accounts", active: false },
  { icon: "messages", label: "Messages", active: false },
  { icon: "groups", label: "Groups", active: false },
  { icon: "broadcast", label: "Broadcast", active: false },
  { icon: "automation", label: "Automation", active: false },
] as const;

const ACTIVITY = [
  { icon: Send, label: "Pesan terkirim", meta: "2 menit lalu" },
  { icon: Users, label: "Grup bergabung", meta: "6 menit lalu" },
  { icon: ShieldCheck, label: "Akun login", meta: "12 menit lalu" },
  { icon: Bot, label: "Grup baru", meta: "1 jam lalu" },
] as const;

// Telegram brand mark. Inline so the mockup carries no network request and
// cannot shift layout when the asset loads.
function TelegramMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden="true">
      <path d="M21.7 3.3 2.9 10.6c-1.1.4-1.1 1.1-.2 1.4l4.7 1.5 1.8 5.5c.2.7.1 1 .7 1 .5 0 .7-.2 1-.5l2.4-2.3 4.7 3.5c.9.5 1.5.2 1.7-.8l3.1-14.6c.3-1.3-.5-1.9-1.4-1.5z" />
      <path d="M8.2 13.4 19 6.5c.5-.3 1-.1.6.2l-9 8.1-.4 3.3c0 .5-.2.7-.6.7l-.5-3.4z" fill="#fff" opacity=".9" />
    </svg>
  );
}

const NAV_ICON: Record<string, typeof Send> = {
  dashboard: TrendingUp,
  accounts: Users,
  messages: MessageSquare,
  groups: Users,
  broadcast: Send,
  automation: Bot,
};

const AVATAR_TONE: Record<string, string> = {
  accent: "bg-[#2d8fff]",
  violet: "bg-[#7c5cff]",
  rose: "bg-[#f0568a]",
  emerald: "bg-[#22c55e]",
  sky: "bg-[#38bdf8]",
};

export function HeroDashboardMockup() {
  return (
    <div className="relative mx-auto w-full max-w-[34rem] lg:max-w-none">
      {/* Blue bloom behind the frame so the panel lifts off the canvas without
          a heavy border. Fixed and pointer-events-none: it never repaints. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -inset-8 -z-10 rounded-[3rem]"
        style={{
          background:
            "radial-gradient(24rem 18rem at 60% 40%, rgba(45,143,255,0.22), transparent 70%)",
        }}
      />

      {/* Desktop: the full workspace. */}
      <div className="hidden overflow-hidden rounded-[1.25rem] border border-[var(--public-border)] bg-[var(--public-canvas-warm)] shadow-[0_40px_100px_-40px_rgba(45,143,255,0.35)] lg:block">
        <div className="grid grid-cols-[11rem_minmax(0,1fr)]">
          <Sidebar />
          <div className="min-w-0 border-l border-[var(--public-border)] p-5">
            <header className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <h3 className="public-display text-[1.375rem] leading-tight text-[var(--public-text)]">
                  Dashboard
                </h3>
                <p className="mt-1 text-[11px] text-[var(--public-muted)]">
                  Akses semua akun Telegram Anda dari satu tempat.
                </p>
              </div>
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--public-accent)] text-sm font-semibold text-white">
                U
              </span>
            </header>

            <div className="mt-5 grid grid-cols-3 gap-3">
              {STATS.map((stat) => (
                <div key={stat.label} className="min-w-0 rounded-[0.75rem] border border-[var(--public-border)] bg-[var(--public-canvas)] p-3.5">
                  <p className="truncate text-[10px] text-[var(--public-subtle)]">{stat.label}</p>
                  <p className="public-display mt-1.5 text-[1.25rem] leading-none text-[var(--public-text)]">
                    {stat.value}
                  </p>
                  <p className="mt-1.5 inline-flex items-center gap-0.5 text-[10px] text-[var(--public-success)]">
                    <TrendingUp className="h-2.5 w-2.5" aria-hidden="true" />
                    {stat.delta}
                  </p>
                </div>
              ))}
            </div>

            <div className="mt-4 grid gap-4 lg:grid-cols-[1.35fr_1fr]">
              <AccountList />
              <ActivityFeed />
            </div>
          </div>
        </div>
      </div>

      {/* Mobile: the same accounts inside a tilted phone. */}
      <div className="relative mx-auto w-[15.5rem] sm:w-[17rem] lg:hidden">
        <FloatingCards />
        {/* Body. A 3px titanium rail on a near-black screen: the rail's own
            gradient is the bezel, so the device reads as metal rather than a
            rounded box. rotate happens on an inner wrapper so the rail stays
            uniform instead of shading differently per corner. */}
        <div
          className="relative origin-[50%_45%] rotate-[6deg]"
          style={{
            background: "linear-gradient(148deg,#9aa4b2 0%,#39424f 12%,#1a212c 46%,#4a5666 84%,#8a94a3 100%)",
            borderRadius: "3.2rem",
            padding: "3px",
            boxShadow:
              "0 0 0 1px rgba(255,255,255,0.07), 0 40px 90px -30px rgba(45,143,255,0.55), 0 10px 26px -12px rgba(0,0,0,0.8)",
          }}
        >
          {/* Screen. The 2px near-black inset separates the glass from the rail,
              which is what makes the bezel look like a frame. */}
          <div
            className="relative overflow-hidden rounded-[2.95rem] bg-[#04070d]"
            style={{ padding: "2.5px" }}
          >
            <div className="relative overflow-hidden rounded-[2.75rem] bg-[#070b14]">
              {/* Status bar: time, then the Dynamic Island, then indicators. */}
              <div className="flex items-center justify-between px-5 pt-3.5 pb-1" aria-hidden="true">
                <span className="text-[9px] font-semibold tracking-tight text-[var(--public-text)]">9:41</span>
                {/* Dynamic Island. The near-black pill on a near-black screen
                    still reads because of the 1px rim, same trick as the
                    camera notch on a real device. */}
                <span
                  className="relative h-[1.15rem] w-[4.2rem] rounded-full bg-[#000] shadow-[inset_0_0_0_1px_rgba(255,255,255,0.07)]"
                >
                  <span className="absolute right-1.5 top-1/2 h-1 w-1 -translate-y-1/2 rounded-full bg-[#101a2c] shadow-[inset_0_0_0_1px_rgba(120,170,255,0.25)]" />
                </span>
                <span className="flex items-center gap-1 text-[9px] text-[var(--public-text)]">
                  <span className="h-1.5 w-3 rounded-[1px] bg-[var(--public-text)]" />
                  <span className="h-1.5 w-1.5 rounded-full border border-[var(--public-text)]" />
                </span>
              </div>

              {/* App header */}
              <div className="flex items-center gap-2 border-b border-[var(--public-border)] px-4 pb-3 pt-2.5">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--public-accent)]/15 text-[var(--public-accent)]">
                  <TelegramMark className="h-3.5 w-3.5" />
                </span>
                <span className="text-[11px] font-medium text-[var(--public-text)]">TeleBos</span>
                <Radio className="ml-auto h-3.5 w-3.5 text-[var(--public-success)]" aria-hidden="true" />
              </div>

              <div className="px-2 py-2">
                <AccountList bare />
              </div>

              {/* Home indicator */}
              <div className="flex justify-center pb-2 pt-1" aria-hidden="true">
                <span className="h-[3px] w-24 rounded-full bg-[var(--public-border)]" />
              </div>
            </div>
          </div>

          {/* Side buttons. Drawn as siblings of the screen so they sit on the
              rail, not on the glass. */}
          <span
            aria-hidden="true"
            className="absolute left-[-2px] top-[30%] h-12 w-[3px] rounded-l-sm bg-gradient-to-b from-[#6b7686] to-[#2b333f]"
            style={{ boxShadow: "-1px 0 0 rgba(0,0,0,0.5)" }}
          />
          <span
            aria-hidden="true"
            className="absolute left-[-2px] top-[46%] h-16 w-[3px] rounded-l-sm bg-gradient-to-b from-[#6b7686] to-[#2b333f]"
          />
          <span
            aria-hidden="true"
            className="absolute right-[-2px] top-[38%] h-20 w-[3px] rounded-r-sm bg-gradient-to-b from-[#6b7686] to-[#2b333f]"
          />
        </div>
      </div>
    </div>
  );
}

function Sidebar() {
  return (
    <div className="bg-[var(--public-canvas)] p-4">
      <div className="flex items-center gap-2">
        <TelegramMark className="h-4 w-4 text-[var(--public-accent)]" />
        <span className="text-[13px] font-semibold tracking-tight text-[var(--public-text)]">
          <span className="text-[var(--public-accent)]">Tele</span>Bos
        </span>
      </div>
      <nav className="mt-5 space-y-0.5" aria-hidden="true">
        {NAV.map((item) => {
          const Icon = NAV_ICON[item.icon];
          return (
            <div
              key={item.label}
              className={
                item.active
                  ? "flex items-center gap-2 rounded-[0.4rem] bg-[var(--public-accent)]/15 px-2.5 py-1.5 text-[11px] font-medium text-[var(--public-accent)]"
                  : "flex items-center gap-2 px-2.5 py-1.5 text-[11px] text-[var(--public-muted)]"
              }
            >
              <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              {item.label}
            </div>
          );
        })}
      </nav>
    </div>
  );
}

function AccountList({ bare = false }: { bare?: boolean }) {
  return (
    <div className={bare ? undefined : "rounded-[0.75rem] border border-[var(--public-border)] bg-[var(--public-canvas)] p-3.5"}>
      {!bare && (
        <p className="mb-3 text-[11px] font-medium text-[var(--public-text)]">Akun Telegram</p>
      )}
      <ul>
        {ACCOUNTS.map((account) => (
          <li key={account.handle} className="flex items-center gap-2.5 border-b border-[var(--public-border)] py-2 last:border-b-0">
            <span className={`h-6 w-6 shrink-0 rounded-full ${AVATAR_TONE[account.tone]}`} aria-hidden="true" />
            <span className="min-w-0 flex-1 truncate text-[11px] text-[var(--public-body)]">
              {account.handle}
            </span>
            <span className="shrink-0 text-[9px] text-[var(--public-success)]">Online</span>
            <span className="shrink-0 text-[var(--public-subtle)]" aria-hidden="true">
              ⋮
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ActivityFeed() {
  return (
    <div className="rounded-[0.75rem] border border-[var(--public-border)] bg-[var(--public-canvas)] p-3.5">
      <p className="mb-3 text-[11px] font-medium text-[var(--public-text)]">Aktivitas Terbaru</p>
      <ul className="space-y-2.5">
        {ACTIVITY.map((item) => (
          <li key={item.label} className="flex items-start gap-2.5">
            <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-[0.3rem] border border-[var(--public-border)] text-[var(--public-accent)]">
              <item.icon className="h-2.5 w-2.5" aria-hidden="true" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[10px] text-[var(--public-body)]">{item.label}</span>
              <span className="block text-[9px] text-[var(--public-subtle)]">{item.meta}</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// Message cards drifting behind the phone. Purely decorative and aria-hidden.
function FloatingCards() {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0">
      {[
        { pos: "left-0 top-6 -rotate-6", delay: "0ms" },
        { pos: "right-0 top-24 rotate-6", delay: "180ms" },
        { pos: "left-2 bottom-14 rotate-3", delay: "360ms" },
      ].map((card) => (
        <div
          key={card.pos}
          className={`public-float absolute ${card.pos} flex w-[5.5rem] items-center gap-1.5 rounded-[0.6rem] border border-[var(--public-border)] bg-[var(--public-canvas-warm)]/90 px-2 py-1.5 backdrop-blur-sm`}
          style={{ animationDelay: card.delay }}
        >
          <TelegramMark className="h-3 w-3 shrink-0 text-[var(--public-accent)]" />
          <span className="h-1 w-6 rounded-full bg-[var(--public-border)]" aria-hidden="true" />
        </div>
      ))}
    </div>
  );
}