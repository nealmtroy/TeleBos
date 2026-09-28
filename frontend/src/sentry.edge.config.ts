import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN,

  dataCollection: {
    // To disable sending user data and HTTP bodies, uncomment the lines below:
    // userInfo: false,
    // httpBodies: [],
  },

  tracesSampleRate: process.env.NODE_ENV === "development" ? 1.0 : 0.1,
});
