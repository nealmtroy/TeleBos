import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

  dataCollection: {
    // To disable sending user data and HTTP bodies, uncomment the lines below:
    // userInfo: false,
    // httpBodies: [],
  },

  // Filter error dari script eksternal browser (XBrowser, autofill, Chrome extensions)
  ignoreErrors: [
    /xbrowser/i,
    /execute_auto_fill/i,
    /ResizeObserver loop/i,
    /Cannot read properties of undefined \(reading 'M_ID'\)/i,
    /null is not an object \(evaluating '.*\.M_ID'\)/i,
    /NotFoundError.*removeChild/i,
    /NotFoundError.*insertBefore/i,
    /The object can not be found here/i,
    /Non-Error promise rejection captured/i,
  ],
  denyUrls: [
    /executors\//i,
    /^chrome-extension:\/\//i,
    /^moz-extension:\/\//i,
    /^safari-extension:\/\//i,
  ],

  // 100% in development, 10% in production
  tracesSampleRate: process.env.NODE_ENV === "development" ? 1.0 : 0.1,

  // Session Replay: 10% of all sessions, 100% of sessions with errors
  replaysSessionSampleRate: 0.1,
  replaysOnErrorSampleRate: 1.0,

  integrations: [
    Sentry.replayIntegration({
      maskAllText: true,
      blockAllMedia: true,
    }),
  ],
});

// Hook into App Router navigation transitions (App Router only)
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
