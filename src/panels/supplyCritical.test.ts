import { describe, expect, it } from 'vitest';
import { criticalReason } from './supplyCritical';

describe('criticalReason', () => {
  it('flags dependency language and big shares only', () => {
    expect(criticalReason({ k: 'supplier', ev: 'We rely on Taiwan Semiconductor Manufacturing Company Limited (TSMC) for the production' })).toBe('company says it depends on it');
    expect(criticalReason({ k: 'supplier', ev: 'approximately 95% of the wafers manufactured by our CMs', share: 95 })).toBe('95% of purchases');
    expect(criticalReason({ k: 'supplier', ev: 'relies on single-source partners in the U.S.' })).toBe('sole or single source');
    expect(criticalReason({ k: 'customer', share: 22 })).toBe('22% of revenue');
    expect(criticalReason({ k: 'supplier', ev: 'We purchase memory from SK Hynix Inc.' })).toBeNull();
    expect(criticalReason({ k: 'partner', ev: 'we depend on this partnership' })).toBeNull();
  });
});
