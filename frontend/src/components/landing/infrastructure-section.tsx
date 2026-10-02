// Infrastructure section.
//
// This is a real capability, not decoration: the deployment runs on a VPS behind
// PM2 + nginx with the services listed below. Naming them in the marketing page
// is the honest version of a "reliability" claim, so the copy and the numbers
// both have to stay true to what is actually deployed — update this list when
// the stack changes rather than letting it drift.
//
// Data is local rather than fetched: it is static deployment metadata, and a
// client fetch would flash an empty panel on the section people scroll to
// second.

import { Boxes, Server, Terminal } from "lucide-react";

import { PublicCode } from "@/components/public/public-ui";
import { useT } from "@/lib/i18n";

// Hosts this deployment actually serves.
const DOMAINS = ["tele.t-me.site", "t.me.site", "api.t-me.site", "manage.t-me.site"];

// Long-lived services on the same box.
const SERVICES = ["Docker (TeleBos)", "TelegramBot (backend)", "SocialBuzz-Pay", "TBot"];

// The OpenClaw runtime the operator tool runs under.
const RUNTIME = [
  "telebos-ai (313a614c)",
  "npm install -g openclaw@latest",
  "gateway 18789",
  "workspace ~/.openclaw/workspace",
];

export function InfrastructureSection() {
  const _ = useT();

  return (
    <section className="bg-[var(--public-canvas)]">
      <div className="public-shell-width public-section">
        <div className="grid gap-10 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] lg:gap-14">
          {/* Pitch */}
          <div className="min-w-0">
            <p className="public-mono text-[10px] uppercase tracking-[0.2em] text-[var(--public-accent)]">
              {_("landing.infraKicker")}
            </p>
            <h2 className="public-display mt-5 text-[clamp(2rem,6vw,3.5rem)] leading-[1.05] text-[var(--public-text)]">
              {_("landing.infraTitle")}
            </h2>
            <p className="mt-6 max-w-xl text-[0.9375rem] leading-[1.7] text-[var(--public-muted)] sm:text-base">
              {_("landing.infraDesc")}
            </p>
          </div>

          {/* Panels */}
          <div className="min-w-0 space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Panel icon={<Server className="h-4 w-4" />} title={_("landing.infraDomainsTitle")} status={_("landing.infraStatusReverse")}>
                <ul className="space-y-1.5">
                  {DOMAINS.map((host) => (
                    <li key={host} className="public-mono truncate text-[11px] text-[var(--public-muted)]">
                      {host}
                    </li>
                  ))}
                </ul>
              </Panel>

              <Panel icon={<Boxes className="h-4 w-4" />} title={_("landing.infraServicesTitle")} status={_("landing.infraStatusStable")}>
                <ul className="space-y-1.5">
                  {SERVICES.map((name) => (
                    <li key={name} className="public-mono truncate text-[11px] text-[var(--public-muted)]">
                      {name}
                    </li>
                  ))}
                </ul>
              </Panel>
            </div>

            <Panel icon={<Terminal className="h-4 w-4" />} title={_("landing.infraRuntimeTitle")} status={_("landing.infraStatusStable")}>
              <PublicCode className="overflow-x-auto rounded-[0.75rem] text-[11px] leading-6">
                {RUNTIME.map((line, i) => (
                  <span key={line} className="block">
                    <span className="text-[var(--public-subtle)]">{`$ `}</span>
                    <span className={i === 0 ? "text-[var(--public-accent)]" : undefined}>{line}</span>
                    {"\n"}
                  </span>
                ))}
              </PublicCode>
            </Panel>
          </div>
        </div>
      </div>
    </section>
  );
}

function Panel({
  icon,
  title,
  status,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  status: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-w-0 rounded-[var(--public-radius-card)] border border-[var(--public-border)] bg-[var(--public-canvas-warm)] p-5">
      <div className="flex items-start justify-between gap-3">
        <span className="flex min-w-0 items-center gap-2.5">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[0.6rem] border border-[var(--public-border)] bg-[var(--public-canvas)] text-[var(--public-accent)]">
            {icon}
          </span>
          <span className="min-w-0 truncate text-sm font-medium text-[var(--public-text)]">{title}</span>
        </span>
        <span className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap text-[10px] text-[var(--public-success)]">
          <span className="h-1.5 w-1.5 rounded-full bg-[var(--public-success)]" aria-hidden="true" />
          {status}
        </span>
      </div>
      <div className="mt-4 border-t border-[var(--public-border)] pt-4">{children}</div>
    </div>
  );
}