import { describe, expect, it } from 'vitest'

import { capturePseudoElementRules } from './capture-pseudo-elements'

const P = capturePseudoElementRules()

describe('capturePseudoElementRules', () => {
  it('normalizes only quoted pseudo-element text content', () => {
    expect(P.normalizePseudoElementContentForCapture('"New"')).toBe('New')
    expect(P.normalizePseudoElementContentForCapture('\'Hybrid\'')).toBe('Hybrid')
    expect(P.normalizePseudoElementContentForCapture('"Line\\A Two"')).toBe('Line\nTwo')
    expect(P.normalizePseudoElementContentForCapture('"EV \\\\"badge\\\\""')).toBe('EV "badge"')
    expect(P.normalizePseudoElementContentForCapture('"Smile \\1F600"')).toBe('Smile 😀')
  })

  it('rejects non-text and empty pseudo content', () => {
    expect(P.normalizePseudoElementContentForCapture('none')).toBe('')
    expect(P.normalizePseudoElementContentForCapture('normal')).toBe('')
    expect(P.normalizePseudoElementContentForCapture('open-quote')).toBe('')
    expect(P.normalizePseudoElementContentForCapture('close-quote')).toBe('')
    expect(P.normalizePseudoElementContentForCapture('no-open-quote')).toBe('')
    expect(P.normalizePseudoElementContentForCapture('no-close-quote')).toBe('')
    expect(P.normalizePseudoElementContentForCapture('url("badge.svg")')).toBe('')
    expect(P.normalizePseudoElementContentForCapture('counter(section)')).toBe('')
    expect(P.normalizePseudoElementContentForCapture('counters(section, ".")')).toBe('')
    expect(P.normalizePseudoElementContentForCapture('attr(data-label)')).toBe('')
    expect(P.normalizePseudoElementContentForCapture('""')).toBe('')
  })

  it('serializes a conservative inline style for materialized pseudo text', () => {
    expect(P.pseudoElementInlineStyleForCapture({
      display: 'inline-block',
      color: 'rgb(255, 255, 255)',
      backgroundColor: 'rgb(0, 0, 0)',
      fontWeight: '700',
      fontSize: '12px',
      lineHeight: '16px',
      margin: '0px 4px',
      padding: '2px 6px',
      borderRadius: '4px',
      textTransform: 'uppercase',
      letterSpacing: '0.2px',
    })).toBe('display:inline-block;color:rgb(255, 255, 255);background-color:rgb(0, 0, 0);font-weight:700;font-size:12px;line-height:16px;margin:0px 4px;padding:2px 6px;border-radius:4px;text-transform:uppercase;letter-spacing:0.2px')
  })

  it('strips unsafe inline style punctuation', () => {
    expect(P.pseudoElementInlineStyleForCapture({
      display: 'inline;position:absolute',
      color: 'rgb(1, 2, 3)"',
      backgroundColor: 'transparent',
      fontWeight: '400',
      fontSize: '12px<script>',
      lineHeight: 'normal',
      margin: '0px',
      padding: '1px',
      borderRadius: '0px',
      textTransform: 'none',
      letterSpacing: '0px',
    })).toBe('display:inlineposition:absolute;color:rgb(1, 2, 3);font-size:12pxscript;margin:0px;padding:1px')
  })
})
