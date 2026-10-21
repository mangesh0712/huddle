import { describe, expect, it } from 'vitest'
import { linkify } from './linkify'

describe('linkify', () => {
  it('splits text and urls without ever producing html', () => {
    expect(linkify('hi https://a.com/x?y=1 there')).toEqual([
      { type: 'text', value: 'hi ' },
      { type: 'link', value: 'https://a.com/x?y=1' },
      { type: 'text', value: ' there' },
    ])
  })
  it('leaves tags as plain text', () => {
    expect(linkify('<script>alert(1)</script>')).toEqual([{ type: 'text', value: '<script>alert(1)</script>' }])
  })
  it('ignores javascript: and other schemes', () => {
    expect(linkify('javascript:alert(1)')).toEqual([{ type: 'text', value: 'javascript:alert(1)' }])
  })
  it('keeps trailing punctuation out of the link', () => {
    expect(linkify('see https://a.com.')).toEqual([
      { type: 'text', value: 'see ' },
      { type: 'link', value: 'https://a.com' },
      { type: 'text', value: '.' },
    ])
  })
})
