export function formatXP(n){
  if (n == null || Number.isNaN(n)) return "—";
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `${(n/1_000_000).toFixed(2)} MB`;
  if (abs >= 1_000) return `${Math.round(n/1_000)} kB`;
  return `${Math.round(n)} B`;
}
export function isoDateTiny(ts){
  try{
    const d = new Date(ts);
    return d.toLocaleDateString(undefined, { month:"short", day:"2-digit" });
  }catch{ return String(ts); }
}
export function clamp(v,a,b){ return Math.max(a, Math.min(b,v)); }
