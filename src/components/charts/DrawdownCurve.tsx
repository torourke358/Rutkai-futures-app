"use client";

import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { DrawdownPoint } from "@/lib/analytics/stats";
import { formatCompactUsd, formatUsd } from "@/lib/format";

// Underwater curve: how far below the running equity peak we are (<= 0).
export default function DrawdownCurve({ data }: { data: DrawdownPoint[] }) {
  if (data.length === 0)
    return (
      <div className="grid h-[180px] place-items-center text-sm text-slate-500">
        No data for the current filters.
      </div>
    );
  const series = data.map((p, i) => ({ ...p, i }));

  return (
    <ResponsiveContainer width="100%" height={180}>
      <AreaChart data={series} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
        <defs>
          <linearGradient id="ddFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#f87171" stopOpacity={0} />
            <stop offset="100%" stopColor="#f87171" stopOpacity={0.4} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke="#1e2a44" vertical={false} />
        <XAxis
          dataKey="i"
          tick={{ fill: "#64748b", fontSize: 11 }}
          tickLine={false}
          axisLine={{ stroke: "#1e2a44" }}
          tickFormatter={(i) => `#${i + 1}`}
          minTickGap={40}
        />
        <YAxis
          tick={{ fill: "#64748b", fontSize: 11 }}
          tickLine={false}
          axisLine={false}
          width={56}
          tickFormatter={(v) => formatCompactUsd(v)}
        />
        <Tooltip
          contentStyle={tooltipStyle}
          labelFormatter={(i) => `Trade #${Number(i) + 1}`}
          formatter={(v: number) => [formatUsd(v), "Drawdown"]}
        />
        <Area
          type="monotone"
          dataKey="drawdown"
          stroke="#f87171"
          strokeWidth={1.5}
          fill="url(#ddFill)"
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

const tooltipStyle = {
  background: "#111a2e",
  border: "1px solid #1e2a44",
  borderRadius: 8,
  fontSize: 12,
  color: "#e2e8f0",
};
