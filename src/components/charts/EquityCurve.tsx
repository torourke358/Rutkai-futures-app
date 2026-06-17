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
import type { EquityPoint } from "@/lib/analytics/stats";
import { formatCompactUsd, formatSignedUsd } from "@/lib/format";

export default function EquityCurve({ data }: { data: EquityPoint[] }) {
  if (data.length === 0) return <Empty />;
  const last = data[data.length - 1].cumulative;
  const positive = last >= 0;
  const color = positive ? "#34d399" : "#f87171";

  // Index the points so a flat X axis reads as trade sequence, not calendar.
  const series = data.map((p, i) => ({ ...p, i }));

  return (
    <ResponsiveContainer width="100%" height={240}>
      <AreaChart data={series} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
        <defs>
          <linearGradient id="equityFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.35} />
            <stop offset="100%" stopColor={color} stopOpacity={0} />
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
          formatter={(v: number) => [formatSignedUsd(v), "Cumulative"]}
        />
        <Area
          type="monotone"
          dataKey="cumulative"
          stroke={color}
          strokeWidth={2}
          fill="url(#equityFill)"
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

function Empty() {
  return (
    <div className="grid h-[240px] place-items-center text-sm text-slate-500">
      No data for the current filters.
    </div>
  );
}
