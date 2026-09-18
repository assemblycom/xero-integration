import { describe, expect, it } from 'vitest'
import { datetimeToDate, timeAgo } from '@/utils/date'

describe('datetimeToDate', () => {
  it('returns the date part of an ISO datetime', () => {
    expect(datetimeToDate('2026-09-18T10:30:00.000Z')).toBe('2026-09-18')
  })
})

describe('timeAgo', () => {
  const secondsAgo = (seconds: number) => new Date(Date.now() - seconds * 1000)

  it('returns "just now" under a minute', () => {
    expect(timeAgo(secondsAgo(30))).toBe('just now')
  })

  it('uses the singular unit for one', () => {
    expect(timeAgo(secondsAgo(60))).toBe('1 minute ago')
    expect(timeAgo(secondsAgo(3600))).toBe('1 hour ago')
    expect(timeAgo(secondsAgo(86400))).toBe('1 day ago')
  })

  it('pluralizes larger counts', () => {
    expect(timeAgo(secondsAgo(120))).toBe('2 minutes ago')
    expect(timeAgo(secondsAgo(2 * 86400))).toBe('2 days ago')
    expect(timeAgo(secondsAgo(2 * 31536000))).toBe('2 years ago')
  })
})
