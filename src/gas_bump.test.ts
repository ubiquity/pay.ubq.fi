import { describe, it, expect } from 'vitest';
import { calculateSpeedupGasPrice } from './gas_bump';

describe('Speedup Gas Price Calculator', () => {
  it('calculates 15% bump accurately', () => {
    expect(calculateSpeedupGasPrice(100n, 15)).toBe(115n);
    expect(calculateSpeedupGasPrice(200n, 20)).toBe(240n);
  });
});
