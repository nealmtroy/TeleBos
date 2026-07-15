import Link from "next/link";
import { ArrowLeft, BookOpen, ExternalLink, KeyRound, ShieldCheck } from "lucide-react";

export const metadata = {
  title: "API Documentation",
  description: "Integrate with the TeleBos API using the official OpenAPI reference.",
};

export default function ApiDocumentationPage() {
  return (
    <div className="min-h-screen bg-gray-50">
      <header className="border-b border-gray-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-4 sm:px-6 lg:px-8">
          <Link href="/help" className="inline-flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900">
            <ArrowLeft className="h-4 w-4" /> Back to Help Center
          </Link>
          <span className="text-sm font-semibold text-gray-900">TeleBos API</span>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="max-w-3xl">
          <p className="text-sm font-semibold uppercase tracking-wide text-primary-600">Developer resources</p>
          <h1 className="mt-3 text-4xl font-bold tracking-tight text-gray-900">Connect your website to TeleBos</h1>
          <p className="mt-4 text-lg leading-8 text-gray-600">
            Use the official OpenAPI reference to discover stable endpoints, request schemas, and response formats.
            External integrations are intentionally limited to safe, scoped capabilities.
          </p>
          <div className="mt-7 flex flex-wrap gap-3">
            <Link href="/api/docs" className="inline-flex items-center gap-2 rounded-xl bg-primary-600 px-5 py-3 text-sm font-semibold text-white hover:bg-primary-700">
              Open interactive docs <ExternalLink className="h-4 w-4" />
            </Link>
            <Link href="/api/openapi.json" className="inline-flex items-center gap-2 rounded-xl border border-gray-300 bg-white px-5 py-3 text-sm font-semibold text-gray-700 hover:border-gray-400">
              Download OpenAPI JSON <BookOpen className="h-4 w-4" />
            </Link>
          </div>
        </div>

        <div className="mt-12 grid gap-5 md:grid-cols-3">
          <InfoCard icon={<ShieldCheck className="h-5 w-5" />} title="Secure by default">
            Never share a TeleBos browser session token with another website. Integration credentials use scoped Bearer API keys.
          </InfoCard>
          <InfoCard icon={<KeyRound className="h-5 w-5" />} title="Scoped access">
            API keys are designed for the minimum access needed. Read-only account and profile capabilities come first.
          </InfoCard>
          <InfoCard icon={<BookOpen className="h-5 w-5" />} title="Versioned contract">
            External endpoints live under <code>/api/public/v1</code> and are separate from the internal dashboard API.
          </InfoCard>
        </div>

        <section className="mt-10 rounded-2xl border border-amber-200 bg-amber-50 p-6">
          <h2 className="text-lg font-semibold text-amber-950">Authentication warning</h2>
          <p className="mt-2 text-sm leading-6 text-amber-900">
            The TeleBos web app uses a Better Auth session header for first-party requests. That token represents your web session and must not be copied into browser scripts, plugins, or third-party services. Use an integration API key instead when API-key management is enabled for your account.
          </p>
        </section>

        <section className="mt-10 rounded-2xl border border-gray-200 bg-white p-6">
          <h2 className="text-lg font-semibold text-gray-900">Quick server-to-server example</h2>
          <pre className="mt-4 overflow-x-auto rounded-xl bg-gray-950 p-5 text-sm leading-6 text-gray-100"><code>{`curl https://your-telebos-domain/api/public/v1/health\n\n# Authenticated requests use a scoped key in the header:\ncurl https://your-telebos-domain/api/public/v1/accounts \\\n  -H "Authorization: Bearer tb_live_..."`}</code></pre>
        </section>
      </main>
    </div>
  );
}

function InfoCard({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <article className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-50 text-primary-600">{icon}</div>
      <h2 className="mt-4 font-semibold text-gray-900">{title}</h2>
      <p className="mt-2 text-sm leading-6 text-gray-600">{children}</p>
    </article>
  );
}
