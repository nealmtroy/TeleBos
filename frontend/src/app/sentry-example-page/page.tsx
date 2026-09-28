"use client";

import { useState } from "react";
import * as Sentry from "@sentry/nextjs";

export default function SentryExamplePage() {
  const [serverStatus, setServerStatus] = useState<string | null>(null);

  const triggerClientError = () => {
    throw new Error("Sentry Example Client Error — TeleBos Verification");
  };

  const triggerUndefinedFunction = () => {
    // Intentionally calls undefined function to verify error capture
    (window as unknown as { myUndefinedFunction: () => void }).myUndefinedFunction();
  };

  const triggerServerError = async () => {
    setServerStatus("Sending request to /api/sentry-example-api...");
    try {
      const res = await fetch("/api/sentry-example-api");
      const data = await res.json();
      setServerStatus(`Success: ${data.message || "Captured"}`);
    } catch (err) {
      setServerStatus(`Error triggering server error: ${(err as Error).message}`);
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-lg p-8 rounded-2xl border border-border bg-card shadow-lg space-y-6">
        <div className="space-y-2 text-center">
          <div className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-primary/10 text-primary border border-primary/20">
            Sentry Next.js Verification
          </div>
          <h1 className="text-2xl font-bold tracking-tight">Sentry Test Lab</h1>
          <p className="text-sm text-muted-foreground">
            Test and verify that client and server errors are captured and transmitted to Sentry.
          </p>
        </div>

        <div className="space-y-3 pt-2">
          <button
            type="button"
            onClick={triggerClientError}
            className="w-full py-2.5 px-4 rounded-xl font-medium bg-red-600 hover:bg-red-700 text-white transition-colors duration-200 shadow-sm"
          >
            Trigger Client Exception (throw Error)
          </button>

          <button
            type="button"
            onClick={triggerUndefinedFunction}
            className="w-full py-2.5 px-4 rounded-xl font-medium bg-amber-600 hover:bg-amber-700 text-white transition-colors duration-200 shadow-sm"
          >
            Trigger myUndefinedFunction()
          </button>

          <button
            type="button"
            onClick={triggerServerError}
            className="w-full py-2.5 px-4 rounded-xl font-medium bg-indigo-600 hover:bg-indigo-700 text-white transition-colors duration-200 shadow-sm"
          >
            Trigger Server Error (/api/sentry-example-api)
          </button>
        </div>

        {serverStatus && (
          <div className="p-3 rounded-lg bg-muted text-xs font-mono text-muted-foreground break-all">
            {serverStatus}
          </div>
        )}

        <div className="pt-4 border-t border-border text-center text-xs text-muted-foreground">
          Check your Sentry project dashboard (<span className="font-semibold text-foreground">telebos / javascript-nextjs</span>) to see the incoming issues.
        </div>
      </div>
    </div>
  );
}
