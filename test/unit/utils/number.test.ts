import { describe, expect, it } from 'vitest'
import { areNumbersEqual } from '@/utils/number'

describe('areNumbersEqual', () => {
  it('returns true for exactly equal numbers', () => {
    expect(areNumbersEqual(1, 1)).toBe(true)
  })

  it('treats floating point drift within epsilon as equal', () => {
    expect(areNumbersEqual(0.1 + 0.2, 0.3)).toBe(true)
  })

  it('returns false for clearly different numbers', () => {
    expect(areNumbersEqual(1, 1.5)).toBe(false)
  })

  it('returns false when either value is undefined', () => {
    expect(areNumbersEqual(undefined, 1)).toBe(false)
    expect(areNumbersEqual(1, undefined)).toBe(false)
  })

  it('scales the threshold relative to the magnitude', () => {
    // threshold defaults to 1e-6 * max(1, |a|, |b|), so ~1 for values near 1e6.
    expect(areNumbersEqual(1_000_000, 1_000_000.5)).toBe(true)
    expect(areNumbersEqual(1_000_000, 1_000_002)).toBe(false)
  })

  it('respects a custom threshold', () => {
    expect(areNumbersEqual(1, 1.1, 0.2)).toBe(true)
  })
})
