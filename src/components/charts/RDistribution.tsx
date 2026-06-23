"use client";

import {
  Bar,
  BarChart,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { RBucket } from "@/lib/analytics/stats";

// Histogram of R-multiples. Green for >= 0R buckets, red for losing buckets.
export default function RDistribution({ data }: { data: RBucket[] }) {
  if (data.length === 0)
    return (
      <div className="grid h-[200px] place-items-center text-center text-sm text-muted">
        No R-multiples yet — set up a risk model to see this.
      </div>
    );

  return (
    <ResponsiveContainer width="100%" height={200}>
      <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
        <XAxis
          dataKey="label"
          tick={{ fill: "#5b6b82", fontSize: 11 }}
          tickLine={false}
          axisLine={{ stroke: "#e3e9f2" }}
          interval="preserveStartEnd"
        />
        <YAxis
          allowDecimals={false}
          tick={{ fill: "#5b6b82", fontSize: 11 }}
          tickLine={false}
          axisLine={false}
          width={28}
        />
        <Tooltip
          cursor={{ fill: "#f6f8fc" }}
          contentStyle={tooltipStyle}
          formatter={(v: number) => [`${v} trades`, "Count"]}
        />
        <Bar dataKey="count" radius={[3, 3, 0, 0]}>
          {data.map((b) => (
            <Cell key={b.start} fill={b.start >= 0 ? "#15a66a" : "#e0413e"} />
          ))}
        </Bar>
      </BarChart>
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
