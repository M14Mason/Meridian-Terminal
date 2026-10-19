// Word-level diff (longest common subsequence) for FOMC statements and 10-K sections (items 107, 108).
export type Op = { kind: 'same' | 'add' | 'del'; text: string };

export function wordDiff(a: string, b: string, maxWords = 3000): Op[] {
  const A = a.split(/\s+/).filter(Boolean).slice(0, maxWords);
  const B = b.split(/\s+/).filter(Boolean).slice(0, maxWords);
  const n = A.length;
  const m = B.length;
  // LCS lengths, rolling by row would lose the path, so keep the full table (fine for statements).
  const L: Uint16Array[] = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) L[i]![j] = A[i] === B[j] ? L[i + 1]![j + 1]! + 1 : Math.max(L[i + 1]![j]!, L[i]![j + 1]!);
  const out: Op[] = [];
  const push = (kind: Op['kind'], w: string) => {
    const last = out.at(-1);
    if (last && last.kind === kind) last.text += ` ${w}`;
    else out.push({ kind, text: w });
  };
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (A[i] === B[j]) {
      push('same', A[i]!);
      i++;
      j++;
    } else if (L[i + 1]![j]! >= L[i]![j + 1]!) push('del', A[i++]!);
    else push('add', B[j++]!);
  }
  while (i < n) push('del', A[i++]!);
  while (j < m) push('add', B[j++]!);
  return out;
}

/** Share of words changed (0 to 1). */
export const changeRatio = (ops: Op[]) => {
  const words = (t: string) => t.split(' ').length;
  const total = ops.reduce((s, o) => s + words(o.text), 0) || 1;
  return ops.filter((o) => o.kind !== 'same').reduce((s, o) => s + words(o.text), 0) / total;
};
