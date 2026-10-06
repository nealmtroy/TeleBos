"use client";

import * as React from "react";
import * as Sentry from "@sentry/nextjs";
import { ErrorView } from "@/components/ui/error-view";

export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  React.useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <ErrorView
      statusCode={500}
      error={error}
      reset={reset}
    />
  );
}
