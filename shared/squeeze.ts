// SQZ: short squeeze radar score (pure, tested). Higher = more squeeze fuel, not a prediction.
export interface SqzInput { sym: string; dtc: number; siChg: number; shortQty: number; adv: number; fee: number | null; avail: number | null }
export interface SqzRow extends SqzInput { score: number }

const rank = (xs: number[]) => {
  const sorted = [...xs].sort((a, b) => a - b);
  return (v: number) => {
    let lo = 0, hi = sorted.length;
    while (lo < hi) { const m = (lo + hi) >> 1; if (sorted[m]! < v) lo = m + 1; else hi = m; }
    return sorted.length > 1 ? lo / (sorted.length - 1) : 0.5;
  };
};

/** Average percentile of days to cover, short interest growth and borrow fee (fee counts double when known). */
export function squeeze(rows: SqzInput[]): SqzRow[] {
  const rd = rank(rows.map((r) => r.dtc));
  const rc = rank(rows.map((r) => r.siChg));
  const fees = rows.map((r) => r.fee).filter((x): x is number => x != null);
  const rf = rank(fees);
  return rows
    .map((r) => {
      const parts = [rd(r.dtc), rc(r.siChg)];
      if (r.fee != null && fees.length) parts.push(rf(r.fee), rf(r.fee));
      return { ...r, score: parts.reduce((a, b) => a + b, 0) / parts.length };
    })
    .sort((a, b) => b.score - a.score);
}
