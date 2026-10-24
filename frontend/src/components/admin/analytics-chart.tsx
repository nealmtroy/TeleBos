"use client";

import React, { useId } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  XAxis,
  YAxis,
} from "recharts";
import {
  ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import { MetricTimePoint } from "@/hooks/use-admin-analytics";
import { cn } from "@/lib/utils";

export interface AnalyticsChartProps {
  data: MetricTimePoint[];
  metricLabel: string;
  secondaryLabel?: string;
  formatValue?: (val: number) => string;
  color?: "blue" | "sky" | "emerald" | "amber" | "rose" | "slate";
  height?: number;
  emptyMessage?: string;
  isLoading?: boolean;
  className?: string;
}

const COLOR_MAP: Record<
  string,
  { stroke: string; fill: string; hex: string }
> = {
  blue: {
    stroke: "var(--color-value, #2563eb)",
    fill: "var(--color-value, #2563eb)",
    hex: "#2563eb",
  },
  sky: {
    stroke: "var(--color-value, #0284c7)",
    fill: "var(--color-value, #0284c7)",
    hex: "#0284c7",
  },
  emerald: {
    stroke: "var(--color-value, #059669)",
    fill: "var(--color-value, #059669)",
    hex: "#059669",
  },
  amber: {
    stroke: "var(--color-value, #d97706)",
    fill: "var(--color-value, #d97706)",
    hex: "#d97706",
  },
  rose: {
    stroke: "var(--color-value, #e11d48)",
    fill: "var(--color-value, #e11d48)",
    hex: "#e11d48",
  },
  slate: {
    stroke: "var(--color-value, #475569)",
    fill: "var(--color-value, #475569)",
    hex: "#475569",
  },
};

/**
 * Modern Area Chart powered by shadcn/ui & Recharts.
 * Fully compatible drop-in replacement for all TeleBos admin analytics pages.
 */
export function AnalyticsAreaChart({
  data = [],
  metricLabel,
  secondaryLabel,
  formatValue = (v) => v.toLocaleString("id-ID"),
  color = "blue",
  height = 240,
  emptyMessage = "Tidak ada data pada rentang waktu ini",
  isLoading = false,
  className,
}: AnalyticsChartProps) {
  const gradientId = useId().replace(/[^a-zA-Z0-9_-]/g, "");

  if (isLoading) {
    return (
      <div
        style={{ height }}
        className="w-full bg-muted/30 rounded-xl animate-pulse flex items-center justify-center text-xs text-muted-foreground border border-border/50"
      >
        <span>Memuat data analitik...</span>
      </div>
    );
  }

  if (!data || data.length === 0) {
    return (
      <div
        style={{ height }}
        className="w-full border border-dashed border-border rounded-xl flex flex-col items-center justify-center text-xs text-muted-foreground gap-2 p-6 bg-card/40"
      >
        <span className="p-2 rounded-full bg-muted text-muted-foreground text-sm font-mono">∅</span>
        <span>{emptyMessage}</span>
      </div>
    );
  }

  const colorConfig = COLOR_MAP[color] || COLOR_MAP.blue;

  const chartConfig = {
    value: {
      label: metricLabel,
      color: colorConfig.hex,
    },
    ...(secondaryLabel
      ? {
          secondary_value: {
            label: secondaryLabel,
            color: "#94a3b8",
          },
        }
      : {}),
  } satisfies ChartConfig;

  return (
    <div className={cn("w-full select-none", className)}>
      <ChartContainer
        config={chartConfig}
        className="w-full aspect-auto"
        style={{ height, minHeight: height }}
      >
        <AreaChart
          data={data}
          margin={{ top: 12, right: 12, left: -16, bottom: 0 }}
        >
          <defs>
            <linearGradient id={`fill-${gradientId}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={colorConfig.hex} stopOpacity={0.4} />
              <stop offset="95%" stopColor={colorConfig.hex} stopOpacity={0.02} />
            </linearGradient>
            {secondaryLabel && (
              <linearGradient id={`fill-sec-${gradientId}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#94a3b8" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#94a3b8" stopOpacity={0.02} />
              </linearGradient>
            )}
          </defs>

          <CartesianGrid
            strokeDasharray="3 3"
            vertical={false}
            className="stroke-border/50"
          />

          <XAxis
            dataKey="date"
            tickLine={false}
            axisLine={false}
            tickMargin={8}
            className="text-[10px] font-mono fill-muted-foreground"
            tickFormatter={(value) => {
              if (typeof value === "string" && value.includes("-")) {
                const parts = value.split("-");
                if (parts.length === 3) return `${parts[2]}/${parts[1]}`;
              }
              return String(value);
            }}
          />

          <YAxis
            tickLine={false}
            axisLine={false}
            tickMargin={8}
            className="text-[10px] font-mono fill-muted-foreground"
            tickFormatter={(val: number) => {
              if (val >= 1_000_000) return `${(val / 1_000_000).toFixed(1)}M`;
              if (val >= 1_000) return `${(val / 1_000).toFixed(0)}k`;
              return String(val);
            }}
          />

          <ChartTooltip
            cursor={{
              stroke: "hsl(var(--muted-foreground))",
              strokeWidth: 1,
              strokeDasharray: "3 3",
            }}
            content={
              <ChartTooltipContent
                indicator="dot"
                formatter={(val, name) => (
                  <div className="flex items-center justify-between gap-3 w-full">
                    <span className="text-muted-foreground text-xs">
                      {name === "value" ? metricLabel : (secondaryLabel || name)}:
                    </span>
                    <span className="font-semibold text-foreground font-mono text-xs">
                      {formatValue(Number(val))}
                    </span>
                  </div>
                )}
              />
            }
          />

          <Area
            type="monotone"
            dataKey="value"
            stroke={colorConfig.hex}
            strokeWidth={2}
            fill={`url(#fill-${gradientId})`}
            dot={false}
            activeDot={{
              r: 5,
              strokeWidth: 2,
              className: "fill-background stroke-primary",
            }}
          />

          {secondaryLabel && (
            <Area
              type="monotone"
              dataKey="secondary_value"
              stroke="#94a3b8"
              strokeWidth={1.5}
              strokeDasharray="4 4"
              fill={`url(#fill-sec-${gradientId})`}
              dot={false}
              activeDot={{
                r: 4,
                strokeWidth: 1.5,
                className: "fill-background stroke-muted-foreground",
              }}
            />
          )}
        </AreaChart>
      </ChartContainer>
    </div>
  );
}

/**
 * Bar Chart powered by shadcn/ui & Recharts.
 */
export function AnalyticsBarChart({
  data = [],
  metricLabel,
  formatValue = (v) => v.toLocaleString("id-ID"),
  color = "blue",
  height = 240,
  emptyMessage = "Tidak ada data pada rentang waktu ini",
  isLoading = false,
  className,
}: Omit<AnalyticsChartProps, "secondaryLabel">) {
  if (isLoading) {
    return (
      <div
        style={{ height }}
        className="w-full bg-muted/30 rounded-xl animate-pulse flex items-center justify-center text-xs text-muted-foreground border border-border/50"
      >
        <span>Memuat data grafik...</span>
      </div>
    );
  }

  if (!data || data.length === 0) {
    return (
      <div
        style={{ height }}
        className="w-full border border-dashed border-border rounded-xl flex flex-col items-center justify-center text-xs text-muted-foreground gap-2 p-6 bg-card/40"
      >
        <span className="p-2 rounded-full bg-muted text-muted-foreground text-sm font-mono">∅</span>
        <span>{emptyMessage}</span>
      </div>
    );
  }

  const colorConfig = COLOR_MAP[color] || COLOR_MAP.blue;

  const chartConfig = {
    value: {
      label: metricLabel,
      color: colorConfig.hex,
    },
  } satisfies ChartConfig;

  return (
    <div className={cn("w-full select-none", className)}>
      <ChartContainer
        config={chartConfig}
        className="w-full aspect-auto"
        style={{ height, minHeight: height }}
      >
        <BarChart
          data={data}
          margin={{ top: 12, right: 12, left: -16, bottom: 0 }}
        >
          <CartesianGrid
            strokeDasharray="3 3"
            vertical={false}
            className="stroke-border/50"
          />

          <XAxis
            dataKey="date"
            tickLine={false}
            axisLine={false}
            tickMargin={8}
            className="text-[10px] font-mono fill-muted-foreground"
            tickFormatter={(value) => {
              if (typeof value === "string" && value.includes("-")) {
                const parts = value.split("-");
                if (parts.length === 3) return `${parts[2]}/${parts[1]}`;
              }
              return String(value);
            }}
          />

          <YAxis
            tickLine={false}
            axisLine={false}
            tickMargin={8}
            className="text-[10px] font-mono fill-muted-foreground"
            tickFormatter={(val: number) => {
              if (val >= 1_000_000) return `${(val / 1_000_000).toFixed(1)}M`;
              if (val >= 1_000) return `${(val / 1_000).toFixed(0)}k`;
              return String(val);
            }}
          />

          <ChartTooltip
            cursor={{ fill: "hsl(var(--muted)/0.4)" }}
            content={
              <ChartTooltipContent
                indicator="line"
                formatter={(val) => (
                  <div className="flex items-center justify-between gap-3 w-full">
                    <span className="text-muted-foreground text-xs">{metricLabel}:</span>
                    <span className="font-semibold text-foreground font-mono text-xs">
                      {formatValue(Number(val))}
                    </span>
                  </div>
                )}
              />
            }
          />

          <Bar
            dataKey="value"
            fill={colorConfig.hex}
            radius={[4, 4, 0, 0]}
          />
        </BarChart>
      </ChartContainer>
    </div>
  );
}
