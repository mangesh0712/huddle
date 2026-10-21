import { beforeEach, describe, expect, it } from 'vitest'
import { load, save, getIdentity } from './storage'

beforeEach(() => localStorage.clear())

describe('storage', () => {
  it('round-trips json and falls back to default', () => {
    expect(load('x', 5)).toBe(5)
    save('x', { a: 1 })
    expect(load('x', null)).toEqual({ a: 1 })
  })
  it('survives corrupt values', () => {
    localStorage.setItem('huddle:x', '{nope')
    expect(load('x', 7)).toBe(7)
  })
  it('creates a stable identity once', () => {
    const a = getIdentity()
    expect(a.length).toBeGreaterThanOrEqual(8)
    expect(getIdentity()).toBe(a)
  })
})
