import { NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    throw new Error("Sentry test error — TeleBos Next.js verification");
  } catch (error) {
    Sentry.captureException(error);
    return NextResponse.json({
      success: true,
      message: "Sentry verification test error captured and sent.",
    });
  }
}
