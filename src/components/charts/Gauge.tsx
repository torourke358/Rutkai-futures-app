// A circular donut gauge (CrossTrade-style) — an arc filled to `value` (0..1)
// over a light track, with a value + label in the center. Pure SVG.
export default function Gauge({
  value,
  size = 128,
  stroke = 12,
  arcColor = "var(--accent)",
  trackColor = "var(--line)",
  center,
  sub,
}: {
  value: number;
  size?: number;
  stroke?: number;
  arcColor?: string;
  trackColor?: string;
  center: string;
  sub?: string;
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const clamped = Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
  const arc = clamped * c;

  return (
    <div className="relative grid shrink-0 place-items-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={trackColor} strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={arcColor}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${arc} ${c - arc}`}
        />
      </svg>
      <div className="absolute text-center">
        <div className="font-display text-2xl font-semibold tabular-nums text-ink">{center}</div>
        {sub && <div className="text-[10px] font-medium uppercase tracking-wide text-muted">{sub}</div>}
      </div>
    </div>
  );
}
