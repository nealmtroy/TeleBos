"use client";

import React, { useState, useId } from "react";
import { MetricTimePoint } from "@/hooks/use-admin-analytics";
import { cn } from "@/lib/utils";

interface AnalyticsChartProps {
  data: MetricTimePoint[];
  metricLabel: string;
  secondaryLabel?: string;
  formatValue?: (val: number) => string;
  color?: "blue" | "sky" | "emerald" | "amber" | "rose" | "slate";
  height?: number;
  emptyMessage?: string;
  isLoading?: boolean;
}

export function AnalyticsAreaChart({
  data = [],
  metricLabel,
  secondaryLabel,
  formatValue = (v) => v.toLocaleString(),
  color = "blue",
  height = 240,
  emptyMessage = "No data available in this time range",
  isLoading = false,
}: AnalyticsChartProps) {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const gradientId = useId();

  if (isLoading) {
    return (
      <div
        style={{ height }}
        className="w-full bg-muted/40 rounded-xl animate-pulse flex items-center justify-center text-xs text-muted-foreground"
      >
        Loading analytics trend...
      </div>
    );
  }

  if (!data || data.length === 0) {
    return (
      <div
        style={{ height }}
        className="w-full border border-dashed border-border rounded-xl flex flex-col items-center justify-center text-xs text-muted-foreground gap-2 p-6"
      >
        <span className="p-2 rounded-full bg-muted text-muted-foreground">∅</span>
        <span>{emptyMessage}</span>
      </div>
    );
  }

  const values = data.map((d) => d.value);
  const maxValue = Math.max(...values, 1);
  const minValue = 0;
  const paddingX = 40;
  const paddingY = 24;
  const chartWidth = 700;
  const chartHeight = height;

  const points = data.map((d, i) => {
    const x =
      data.length === 1
        ? chartWidth / 2
        : paddingX + (i / (data.length - 1)) * (chartWidth - paddingX * 2);
    const normalizedY = (d.value - minValue) / (maxValue - minValue);
    const y = chartHeight - paddingY - normalizedY * (chartHeight - paddingY * 2);
    return { x, y, ...d };
  });

  // Construct SVG cubic path
  const linePath = points.reduce((acc, curr, i, arr) => {
    if (i === 0) return `M ${curr.x} ${curr.y}`;
    const prev = arr[i - 1];
    const cp1x = prev.x + (curr.x - prev.x) / 2;
    const cp1y = prev.y;
    const cp2x = prev.x + (curr.x - prev.x) / 2;
    const cp2y = curr.y;
    return `${acc} C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${curr.x} ${curr.y}`;
  }, "");

  const areaPath = `
    ${linePath}
    L ${points[points.length - 1].x} ${chartHeight - paddingY}
    L ${points[0].x} ${chartHeight - paddingY}
    Z
  `;

  const colorStyles = {
    blue: {
      stroke: "#3b82f6",
      fillStart: "rgba(59, 130, 246, 0.35)",
      fillEnd: "rgba(59, 130, 246, 0.0)",
      dot: "bg-blue-500",
      text: "text-blue-500",
    },
    emerald: {
      stroke: "#10b981",
      fillStart: "rgba(16, 185, 129, 0.35)",
      fillEnd: "rgba(16, 185, 129, 0.0)",
      dot: "bg-emerald-500",
      text: "text-emerald-500",
    },
    amber: {
      stroke: "#f59e0b",
      fillStart: "rgba(245, 158, 11, 0.35)",
      fillEnd: "rgba(245, 158, 11, 0.0)",
      dot: "bg-amber-500",
      text: "text-amber-500",
    },
    sky: {
      stroke: "#0ea5e9",
      fillStart: "rgba(14, 165, 233, 0.35)",
      fillEnd: "rgba(14, 165, 233, 0.0)",
      dot: "bg-sky-500",
      text: "text-sky-500",
    },
    slate: {
      stroke: "#64748b",
      fillStart: "rgba(100, 116, 139, 0.35)",
      fillEnd: "rgba(100, 116, 139, 0.0)",
      dot: "bg-slate-500",
      text: "text-slate-500",
    },
    rose: {
      stroke: "#f43f5e",
      fillStart: "rgba(244, 63, 94, 0.35)",
      fillEnd: "rgba(244, 63, 94, 0.0)",
      dot: "bg-rose-500",
      text: "text-rose-500",
    },
  }[color as string] || {
    stroke: "#3b82f6",
    fillStart: "rgba(59, 130, 246, 0.35)",
    fillEnd: "rgba(59, 130, 246, 0.0)",
    dot: "bg-blue-500",
    text: "text-blue-500",
  };

  const activePoint = hoverIndex !== null ? points[hoverIndex] : null;

  return (
    <div className="relative w-full overflow-hidden select-none">
      {/* Tooltip Overlay */}
      {activePoint && (
        <div
          className="absolute z-20 pointer-events-none -translate-x-1/2 bg-popover/95 border border-border shadow-md rounded-lg px-3 py-1.5 text-xs backdrop-blur-xs transition-transform duration-75"
          style={{
            left: `${(activePoint.x / chartWidth) * 100}%`,
            top: Math.max(10, activePoint.y - 48),
          }}
        >
          <div className="font-medium text-foreground">{activePoint.date}</div>
          <div className="flex items-center gap-1.5 mt-0.5 font-semibold text-primary">
            <span className={cn("h-2 w-2 rounded-full", colorStyles.dot)} />
            <span>
              {metricLabel}: {formatValue(Number(activePoint.value))}
            </span>
          </div>
          {secondaryLabel && activePoint.secondary_value !== undefined && (
            <div className="text-[11px] text-muted-foreground mt-0.5">
              {secondaryLabel}: {formatValue(Number(activePoint.secondary_value))}
            </div>
          )}
        </div>
      )}

      {/* SVG Canvas */}
      <svg
        viewBox={`0 0 ${chartWidth} ${chartHeight}`}
        className="w-full h-auto overflow-visible"
        onMouseLeave={() => setHoverIndex(null)}
      >
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={colorStyles.fillStart} />
            <stop offset="100%" stopColor={colorStyles.fillEnd} />
          </linearGradient>
        </defs>

        {/* Horizontal grid lines */}
        {[0, 0.33, 0.66, 1].map((pct, idx) => {
          const y = chartHeight - paddingY - pct * (chartHeight - paddingY * 2);
          const val = Math.round(minValue + pct * (maxValue - minValue));
          return (
            <g key={idx}>
              <line
                x1={paddingX}
                y1={y}
                x2={chartWidth - paddingX}
                y2={y}
                stroke="currentColor"
                strokeDasharray="4 4"
                className="text-border/60"
              />
              <text
                x={paddingX - 8}
                y={y + 3}
                textAnchor="end"
                className="text-[10px] fill-muted-foreground font-mono"
              >
                {val >= 1000 ? `${(val / 1000).toFixed(0)}k` : val}
              </text>
            </g>
          );
        })}

        {/* Area fill */}
        <path d={areaPath} fill={`url(#${gradientId})`} />

        {/* Main curve stroke */}
        <path
          d={linePath}
          fill="none"
          stroke={colorStyles.stroke}
          strokeWidth={2.5}
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* Vertical hover indicator */}
        {activePoint && (
          <line
            x1={activePoint.x}
            y1={paddingY}
            x2={activePoint.x}
            y2={chartHeight - paddingY}
            stroke="currentColor"
            strokeWidth={1}
            strokeDasharray="3 3"
            className="text-muted-foreground/80"
          />
        )}

        {/* Hover hit targets & dots */}
        {points.map((p, i) => (
          <g key={i}>
            <circle
              cx={p.x}
              cy={p.y}
              r={hoverIndex === i ? 5.5 : 3}
              fill={hoverIndex === i ? "#ffffff" : colorStyles.stroke}
              stroke={colorStyles.stroke}
              strokeWidth={hoverIndex === i ? 3 : 1}
              className="transition-all duration-150 pointer-events-none"
            />
            {/* Transparent touch/mouse hitbox */}
            <rect
              x={p.x - 15}
              y={0}
              width={30}
              height={chartHeight}
              fill="transparent"
              className="cursor-pointer"
              onMouseEnter={() => setHoverIndex(i)}
            />
          </g>
        ))}

        {/* X-axis labels (first, middle, last) */}
        {points.length > 0 && (
          <g className="text-[10px] fill-muted-foreground font-mono">
            <text x={points[0].x} y={chartHeight - 6} textAnchor="start">
              {points[0].date}
            </text>
            {points.length > 2 && (
              <text
                x={points[Math.floor(points.length / 2)].x}
                y={chartHeight - 6}
                textAnchor="middle"
              >
                {points[Math.floor(points.length / 2)].date}
              </text>
            )}
            <text x={points[points.length - 1].x} y={chartHeight - 6} textAnchor="end">
              {points[points.length - 1].date}
            </text>
          </g>
        )}
      </svg>
    </div>
  );
}
