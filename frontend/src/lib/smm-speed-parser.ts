/**
 * Helper utility to parse and format SMM service speed data from TeleBos Gateway.
 *
 * Typically returns speed strings such as:
 * "Jumlah Order Selesai Rata-Rata = 370 .Kecepatan Rata-Rata = 8 Menit."
 * or simpler variants like "Instant", "1-2 Jam", "15 Menit", etc.
 */

export interface SmmSpeedInfo {
  /** Parsed average completed orders count, e.g. "370" */
  avgOrders: string | null;
  /** Parsed average processing speed, e.g. "8 Menit" */
  avgSpeed: string | null;
  /** Primary display text for badges, e.g. "8 Menit" or "Instan" */
  displayText: string;
  /** Whether the service is considered fast (e.g. <= 30 mins or instant) */
  isFast: boolean;
  /** Full raw string returned from API */
  raw: string;
  /** Formatted tooltip text with full transparency */
  tooltip: string;
}

export function parseSmmSpeed(rawSpeed?: string | null): SmmSpeedInfo | null {
  if (!rawSpeed || typeof rawSpeed !== "string") return null;
  const trimmed = rawSpeed.trim();
  if (
    !trimmed ||
    trimmed === "-" ||
    trimmed === "0" ||
    trimmed.toLowerCase() === "null" ||
    trimmed.toLowerCase() === "undefined"
  ) {
    return null;
  }

  // Regex patterns to capture Indonesian format:
  // e.g. "Jumlah Order Selesai Rata-Rata = 370 .Kecepatan Rata-Rata = 8 Menit."
  const orderMatch = trimmed.match(
    /Jumlah\s+Order\s+Selesai\s+Rata-?Rata\s*=\s*([^.]+?)(?:\s*\.|$)/i
  );
  const speedMatch = trimmed.match(
    /Kecepatan\s+Rata-?Rata\s*=\s*([^.]+?)(?:\s*\.|$)/i
  );

  if (orderMatch || speedMatch) {
    const avgOrders = orderMatch ? orderMatch[1].trim() : null;
    const avgSpeed = speedMatch ? speedMatch[1].trim() : null;

    const displayText = avgSpeed || (avgOrders ? `${avgOrders} Order Selesai` : trimmed);

    const speedLower = (avgSpeed || "").toLowerCase();
    const isFast =
      speedLower.includes("menit") ||
      speedLower.includes("detik") ||
      speedLower.includes("instan") ||
      speedLower.includes("instant");

    let tooltip = "";
    if (avgSpeed && avgOrders) {
      tooltip = `Kecepatan Rata-Rata: ${avgSpeed} • Total Order Selesai: ${avgOrders}`;
    } else if (avgSpeed) {
      tooltip = `Kecepatan Rata-Rata: ${avgSpeed}`;
    } else if (avgOrders) {
      tooltip = `Total Order Selesai Rata-Rata: ${avgOrders}`;
    } else {
      tooltip = trimmed;
    }

    return {
      avgOrders,
      avgSpeed,
      displayText,
      isFast,
      raw: trimmed,
      tooltip,
    };
  }

  // Simple string format fallback (e.g. "Instant", "1-2 Jam", "15 Menit")
  const lower = trimmed.toLowerCase();
  const isFast =
    lower.includes("menit") ||
    lower.includes("detik") ||
    lower.includes("instan") ||
    lower.includes("instant");

  return {
    avgOrders: null,
    avgSpeed: trimmed,
    displayText: trimmed,
    isFast,
    raw: trimmed,
    tooltip: `Estimasi Kecepatan: ${trimmed}`,
  };
}

/**
 * Parses any speed string into an exact numeric duration in seconds.
 * Used for accurate ascending sort (Fastest to Slowest).
 * Services with unknown or empty speed return Infinity (sorted to the end).
 */
export function parseDurationToSeconds(rawSpeed?: string | null): number {
  if (!rawSpeed || typeof rawSpeed !== "string") return Infinity;
  const trimmed = rawSpeed.trim().toLowerCase();
  if (
    !trimmed ||
    trimmed === "-" ||
    trimmed === "0" ||
    trimmed === "null" ||
    trimmed === "undefined"
  ) {
    return Infinity;
  }

  // Extract speed portion if wrapped in "Kecepatan Rata-Rata = ..."
  let target = trimmed;
  const speedMatch = trimmed.match(
    /kecepatan\s+rata-?rata\s*=\s*([^.]+?)(?:\s*\.|$)/i
  );
  if (speedMatch) {
    target = speedMatch[1].trim().toLowerCase();
  }

  if (target.includes("instant") || target.includes("instan")) {
    return 0;
  }

  let totalSeconds = 0;
  let matched = false;

  // Days: e.g. "2 hari"
  const dayMatch = target.match(/(\d+)\s*(?:hari|day|days)/);
  if (dayMatch) {
    totalSeconds += parseInt(dayMatch[1], 10) * 86400;
    matched = true;
  }

  // Hours: e.g. "1-2 jam" or "3 jam"
  const rangeHourMatch = target.match(
    /(\d+)\s*-\s*(\d+)\s*(?:jam|hour|hours|hr|hrs)/
  );
  if (rangeHourMatch) {
    const avgH =
      (parseInt(rangeHourMatch[1], 10) + parseInt(rangeHourMatch[2], 10)) / 2;
    totalSeconds += avgH * 3600;
    matched = true;
  } else {
    const hourMatch = target.match(/(\d+)\s*(?:jam|hour|hours|hr|hrs)/);
    if (hourMatch) {
      totalSeconds += parseInt(hourMatch[1], 10) * 3600;
      matched = true;
    }
  }

  // Minutes: e.g. "8 menit" or "10-30 menit"
  const rangeMinuteMatch = target.match(
    /(\d+)\s*-\s*(\d+)\s*(?:menit|minute|minutes|min|mins)/
  );
  if (rangeMinuteMatch) {
    const avgM =
      (parseInt(rangeMinuteMatch[1], 10) + parseInt(rangeMinuteMatch[2], 10)) / 2;
    totalSeconds += avgM * 60;
    matched = true;
  } else {
    const minuteMatch = target.match(
      /(\d+)\s*(?:menit|minute|minutes|min|mins)/
    );
    if (minuteMatch) {
      totalSeconds += parseInt(minuteMatch[1], 10) * 60;
      matched = true;
    }
  }

  // Seconds: e.g. "30 detik"
  const secMatch = target.match(/(\d+)\s*(?:detik|second|seconds|sec|secs)/);
  if (secMatch) {
    totalSeconds += parseInt(secMatch[1], 10);
    matched = true;
  }

  if (matched) return totalSeconds;

  // If pure number like "10"
  const numOnly = parseInt(target, 10);
  if (!isNaN(numOnly) && numOnly > 0) return numOnly * 60;

  return Infinity;
}

/**
 * Finds the fastest average speed among a list of services to showcase in the KPI bar.
 */
export function getFastestSpeedDisplay(speeds: (string | undefined)[]): string {
  const parsedList = speeds
    .map((s) => parseSmmSpeed(s))
    .filter((p): p is SmmSpeedInfo => p !== null && Boolean(p.avgSpeed));

  if (parsedList.length === 0) return "Real-time";

  // Check if any is instant / menit
  const minuteSpeeds = parsedList.filter((p) => {
    const l = (p.avgSpeed || "").toLowerCase();
    return l.includes("menit") || l.includes("detik") || l.includes("instan");
  });

  if (minuteSpeeds.length > 0) {
    return minuteSpeeds[0].avgSpeed || "Instan";
  }

  return parsedList[0].avgSpeed || "Normal";
}
