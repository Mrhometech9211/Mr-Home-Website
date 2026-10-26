export function TrendChart({ data, days }: { data: { day: string; count: number }[]; days: number }) {
  // `data` arrives zero-filled and ascending from the database (generate_series),
  // so this component stays a pure function of its props — no Date.now() during render.
  const series = data.slice(-days);
  if (series.length === 0) return null;
  const max = Math.max(1, ...series.map((s) => s.count));
  const w = 600, h = 140, pad = 8;
  const pts = series.map((s, i) => [pad + (i / Math.max(1, series.length - 1)) * (w - pad * 2), h - pad - (s.count / max) * (h - pad * 2)] as const);
  const path = pts.map((p, i) => `${i === 0 ? "M" : "L"}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" ");
  const last = pts[pts.length - 1];
  const area = `${path} L${last[0]},${h - pad} L${pts[0][0]},${h - pad} Z`;
  const mid = series[Math.floor(series.length / 2)];
  return (
    <div className="mt-4">
      <svg viewBox={`0 0 ${w} ${h}`} className="h-36 w-full" role="img" aria-label={`Leads over the last ${days} days`}>
        <defs><linearGradient id="tg" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="#1f8f3a" stopOpacity="0.25" /><stop offset="100%" stopColor="#1f8f3a" stopOpacity="0" /></linearGradient></defs>
        <path d={area} fill="url(#tg)" />
        <path d={path} fill="none" stroke="#1f8f3a" strokeWidth="2" strokeLinejoin="round" />
        {pts.map((p, i) => series[i].count > 0 && <circle key={i} cx={p[0]} cy={p[1]} r="3" fill="#1f8f3a"><title>{`${series[i].day}: ${series[i].count}`}</title></circle>)}
      </svg>
      <div className="flex justify-between text-[10.5px] text-mist"><span>{series[0].day}</span><span>{mid.day}</span><span>{series[series.length - 1].day}</span></div>
    </div>
  );
}
