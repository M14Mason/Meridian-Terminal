import { describe, expect, it } from 'vitest';
import { changeRatio, wordDiff } from './diff';

describe('wordDiff', () => {
  it('marks added and removed words', () => {
    const d = wordDiff('the committee decided to maintain the target range', 'the committee decided to lower the target range');
    expect(d).toEqual([
      { kind: 'same', text: 'the committee decided to' },
      { kind: 'del', text: 'maintain' },
      { kind: 'add', text: 'lower' },
      { kind: 'same', text: 'the target range' },
    ]);
    expect(changeRatio(d)).toBeCloseTo(2 / 9, 10);
  });
  it('handles identical and empty text', () => {
    expect(wordDiff('a b', 'a b')).toEqual([{ kind: 'same', text: 'a b' }]);
    expect(wordDiff('', 'x')).toEqual([{ kind: 'add', text: 'x' }]);
  });
});
