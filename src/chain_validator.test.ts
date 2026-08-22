import { describe, it, expect } from 'vitest';
import { isSupportedL2Chain } from './chain_validator';

describe('Chain ID Validator', () => {
  it('identifies supported chains', () => {
    expect(isSupportedL2Chain(42161)).toBe(true);
    expect(isSupportedL2Chain(8453)).toBe(true);
    expect(isSupportedL2Chain(999999)).toBe(false);
  });
});
