// Hero visual — a real-looking view of the TeleBos dashboard.
//
// Desktop shows the workspace chrome (sidebar, stats, accounts, activity);
// mobile shows the same accounts inside a handset mockup.
// Marked with aria-hidden="true" as an illustrative visual preview.

import { Bot, MessageSquare, Send, ShieldCheck, TrendingUp, Users } from "lucide-react";

import { cn } from "@/lib/utils";

const STATS = [
  { label: "Total Akun", value: "18", delta: "+2" },
  { label: "Pesan Terkirim", value: "4,892", delta: "+15%" },
  { label: "Grup Dipakai", value: "36", delta: "+8%" },
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
  { icon: Send, label: "Pesan terkirim", meta: "2m lalu" },
  { icon: Users, label: "Grup bergabung", meta: "6m lalu" },
  { icon: ShieldCheck, label: "Akun login", meta: "12m lalu" },
  { icon: Bot, label: "Grup baru", meta: "1j lalu" },
] as const;

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
  accent: "bg-[#2563eb]",
  violet: "bg-[#7c5cff]",
  rose: "bg-[#f0568a]",
  emerald: "bg-[#22c55e]",
  sky: "bg-[#38bdf8]",
};

export function HeroDashboardMockup() {
  return (
    <div className="relative mx-auto w-full max-w-[34rem] lg:max-w-none" aria-hidden="true">
      {/* Desktop: the full workspace */}
      <div className="hidden overflow-hidden rounded-[1.25rem] border border-[var(--public-border)] bg-[var(--public-canvas-warm)] lg:block">
        <div className="grid grid-cols-[11.5rem_minmax(0,1fr)]">
          <Sidebar />
          <div className="min-w-0 border-l border-[var(--public-border)] p-5 space-y-4">
            <header className="flex items-start justify-between gap-4 border-b border-[var(--public-border)]/60 pb-3">
              <div className="min-w-0">
                <p className="public-display text-base font-bold leading-tight text-[var(--public-text)]">
                  Dashboard
                </p>
                <p className="mt-0.5 text-xs text-[var(--public-muted)]">
                  Akses semua akun Telegram Anda dari satu tempat.
                </p>
              </div>
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--public-accent)] text-xs font-bold text-white">
                U
              </span>
            </header>

            {/* Flat Stat Metrics Bar */}
            <div className="grid grid-cols-3 divide-x divide-[var(--public-border)] border-y border-[var(--public-border)]/60 py-3">
              {STATS.map((stat, i) => (
                <div
                  key={stat.label}
                  className={cn("min-w-0", i === 0 ? "pr-4" : i === 2 ? "pl-4" : "px-4")}
                >
                  <p className="truncate text-xs font-medium text-[var(--public-subtle)]">
                    {stat.label}
                  </p>
                  <p className="public-display mt-1 text-lg font-bold leading-none text-[var(--public-text)]">
                    {stat.value}
                  </p>
                  <p className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-[var(--public-success)]">
                    <TrendingUp className="h-3 w-3" aria-hidden="true" />
                    {stat.delta}
                  </p>
                </div>
              ))}
            </div>

            {/* Split Data View */}
            <div className="grid gap-6 pt-1 lg:grid-cols-[1.3fr_1fr]">
              <AccountList />
              <ActivityFeed />
            </div>
          </div>
        </div>
      </div>

      {/* Mobile: tilted handset mockup.
          No aspect-ratio on purpose. Declaring 9/19.5 pinned the frame height
          while the screen content came out shorter, and the leftover exposed
          the titanium rail as a wide grey bar under the home indicator. Letting
          the content define the height keeps the rail exactly 3px all the way
          round. Width stays narrow so the tilted handset clears the fold. */}
      <div className="relative mx-auto w-[14rem] sm:w-[15rem] lg:hidden">
        <div
          className="relative origin-[50%_45%] rotate-[4deg]"
          style={{
            background: "linear-gradient(148deg,#9aa4b2 0%,#39424f 12%,#1a212c 46%,#4a5666 84%,#8a94a3 100%)",
            borderRadius: "2.75rem",
            padding: "3px",
            boxShadow: "0 10px 25px -8px rgba(0,0,0,0.6)",
          }}
        >
          <div className="relative overflow-hidden rounded-[2.6rem] bg-[#04070d] p-[2.5px]">
            <div className="relative overflow-hidden rounded-[2.4rem] bg-[#070b14] px-1">
              {/* Status bar */}
              <div className="flex items-center justify-between px-5 pt-3.5 pb-1">
                <span className="text-xs font-semibold tracking-tight text-[var(--public-text)]">9:41</span>
                <span className="relative h-4 w-16 rounded-full bg-black shadow-[inset_0_0_0_1px_rgba(255,255,255,0.1)]" />
                <span className="flex items-center gap-1 text-xs text-[var(--public-text)]">
                  <span className="h-2 w-3 rounded-xs bg-[var(--public-text)]" />
                </span>
              </div>

              {/* App header */}
              <div className="flex items-center gap-2 border-b border-[var(--public-border)] px-4 pb-2.5 pt-2">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--public-accent)]/15 text-[var(--public-accent)]">
                  <TelegramMark className="h-3 w-3" />
                </span>
                <span className="text-xs font-semibold text-[var(--public-text)]">TeleBos</span>
                <span className="ml-auto text-[11px] font-semibold text-[var(--public-success)]">Online</span>
              </div>

              {/* Stat row. */}
              <div className="grid grid-cols-3 gap-1.5 px-3 py-2">
                {STATS.map((stat) => (
                  <div
                    key={stat.label}
                    className="min-w-0 rounded-md border border-[var(--public-border)]/60 bg-[var(--public-canvas)] px-2 py-1.5"
                  >
                    <p className="truncate text-[11px] font-medium leading-tight text-[var(--public-subtle)]">
                      {stat.label}
                    </p>
                    <p className="public-mono mt-0.5 truncate text-xs font-bold leading-none text-[var(--public-text)]">
                      {stat.value}
                    </p>
                  </div>
                ))}
              </div>

              {/* Account list */}
              <div className="px-2 pb-1">
                <AccountList bare />
              </div>

              {/* Activity list */}
              <div className="px-3 pt-1 pb-2">
                <p className="mb-1 text-xs font-semibold text-[var(--public-muted)]">
                  Aktivitas Terbaru
                </p>
                <ul className="space-y-1">
                  {ACTIVITY.slice(0, 3).map((item) => (
                    <li key={item.label} className="flex items-center gap-2 text-xs">
                      <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-xs border border-[var(--public-border)] text-[var(--public-accent)]">
                        <item.icon className="h-2.5 w-2.5" />
                      </span>
                      <span className="min-w-0 flex-1 truncate text-xs text-[var(--public-body)]">
                        {item.label}
                      </span>
                      <span className="shrink-0 text-[11px] text-[var(--public-subtle)]">
                        {item.meta}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>

              {/* Home indicator */}
              <div className="flex justify-center pb-2 pt-1">
                <span className="h-[3px] w-20 rounded-full bg-[var(--public-border)]" />
              </div>
            </div>
          </div>
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
        <span className="text-xs font-bold tracking-tight text-[var(--public-text)]">
          <span className="text-[var(--public-accent)]">Tele</span>Bos
        </span>
      </div>
      <nav className="mt-4 space-y-0.5">
        {NAV.map((item) => {
          const Icon = NAV_ICON[item.icon];
          return (
            <div
              key={item.label}
              className={
                item.active
                  ? "flex items-center gap-2 rounded-md bg-blue-500/15 px-2.5 py-1.5 text-xs font-semibold text-blue-400"
                  : "flex items-center gap-2 px-2.5 py-1.5 text-xs text-[var(--public-muted)]"
              }
            >
              <Icon className="h-3.5 w-3.5 shrink-0" />
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
    <div className="min-w-0">
      {!bare && (
        <p className="mb-2.5 text-xs font-semibold text-[var(--public-text)]">Akun Telegram</p>
      )}
      <ul className="divide-y divide-[var(--public-border)]/60">
        {ACCOUNTS.map((account) => (
          <li key={account.handle} className="flex items-center gap-2 py-2 first:pt-0 last:pb-0">
            <span className={`h-5 w-5 shrink-0 rounded-full ${AVATAR_TONE[account.tone]}`} />
            <span className="min-w-0 flex-1 truncate text-xs text-[var(--public-body)]">
              {account.handle}
            </span>
            <span className="shrink-0 text-xs font-semibold text-[var(--public-success)]">Online</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ActivityFeed() {
  return (
    <div className="min-w-0 border-l border-[var(--public-border)]/60 pl-6">
      <p className="mb-2.5 text-xs font-semibold text-[var(--public-text)]">Aktivitas Terbaru</p>
      <ul className="space-y-2.5">
        {ACTIVITY.map((item) => (
          <li key={item.label} className="flex items-start gap-2">
            <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-xs border border-[var(--public-border)] text-blue-400">
              <item.icon className="h-2.5 w-2.5" />
            </span>
            <div className="min-w-0 flex-1">
              <span className="block truncate text-xs text-[var(--public-body)]">{item.label}</span>
              <span className="block text-[11px] text-[var(--public-subtle)]">{item.meta}</span>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}