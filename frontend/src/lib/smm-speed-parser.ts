/**
 * Helper utility to parse and format SMM service speed data from BuzzerPanel.
 *
 * BuzzerPanel API typically returns speed strings such as:
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

  // Regex patterns to capture BuzzerPanel Indonesian format:
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
    // Return the shortest speed text or the first minute speed
    return minuteSpeeds[0].avgSpeed || "Instan";
  }

  return parsedList[0].avgSpeed || "Normal";
}
