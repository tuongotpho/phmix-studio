import { describe, it } from 'node:test';
import assert from 'node:assert';
import { mulberry32, shuffleArray } from '../src/shuffler/rng.js';

describe('RNG and Shuffler Engine', () => {
  it('mulberry32 should generate deterministic sequence', () => {
    const rng = mulberry32(12345);
    const v1 = rng();
    const v2 = rng();
    const rng2 = mulberry32(12345);
    assert.strictEqual(v1, rng2());
    assert.strictEqual(v2, rng2());
  });

  it('shuffleArray should be deterministic based on seed', () => {
    const arr1 = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const arr2 = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    
    const rng1 = mulberry32(101);
    const rng2 = mulberry32(101);

    const shuffled1 = shuffleArray([...arr1], rng1);
    const shuffled2 = shuffleArray([...arr2], rng2);

    assert.deepStrictEqual(shuffled1, shuffled2);
  });
});
