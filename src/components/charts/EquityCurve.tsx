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
  const color = positive ? "#15a66a" : "#e0413e";

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
        <CartesianGrid stroke="#e3e9f2" vertical={false} />
        <XAxis
          dataKey="i"
          tick={{ fill: "#5b6b82", fontSize: 11 }}
          tickLine={false}
          axisLine={{ stroke: "#e3e9f2" }}
          tickFormatter={(i) => `#${i + 1}`}
          minTickGap={40}
        />
        <YAxis
          tick={{ fill: "#5b6b82", fontSize: 11 }}
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
  background: "#ffffff",
  border: "1px solid #e3e9f2",
  borderRadius: 8,
  fontSize: 12,
  color: "#0f1a2e",
};

function Empty() {
  return (
    <div className="grid h-[240px] place-items-center text-sm text-muted">
      No data for the current filters.
    </div>
  );
}
