// Pure pseudo-element text capture helpers for Smart Capture.
// Authored as ONE self-contained function so use-capture-injection can inject
// capturePseudoElementRules.toString() into the page. No outside references.
export function capturePseudoElementRules() {
  function fromCodePointForCapture(code: number): string {
    if (!isFinite(code) || code <= 0 || code > 0x10FFFF)
      return ''
    if (typeof String.fromCodePoint === 'function')
      return String.fromCodePoint(code)
    if (code <= 0xFFFF)
      return String.fromCharCode(code)
    const n = code - 0x10000
    return String.fromCharCode((n >> 10) + 0xD800, (n % 0x400) + 0xDC00)
  }

  function normalizePseudoElementContentForCapture(content: string | null | undefined): string {
    const raw = String(content || '').trim()
    if (!raw)
      return ''
    const lower = raw.toLowerCase()
    if (
      lower === 'none'
      || lower === 'normal'
      || lower === 'open-quote'
      || lower === 'close-quote'
      || lower === 'no-open-quote'
      || lower === 'no-close-quote'
      || lower.indexOf('url(') === 0
      || lower.indexOf('counter(') === 0
      || lower.indexOf('counters(') === 0
      || lower.indexOf('attr(') === 0
    ) {
      return ''
    }

    const quote = raw.charAt(0)
    if ((quote !== '"' && quote !== '\'') || raw.charAt(raw.length - 1) !== quote)
      return ''

    const value = raw
      .slice(1, -1)
      .replace(/\\A\s?/gi, String.fromCharCode(10))
      .replace(/\\([0-9a-f]{1,6})\s?/gi, (_match, hex) => {
        return fromCodePointForCapture(Number.parseInt(hex, 16))
      })
      .replace(/\\+(["'\\])/g, '$1')
      .trim()

    return value
  }

  function pseudoElementInlineStyleForCapture(style: {
    display?: string
    color?: string
    backgroundColor?: string
    fontWeight?: string
    fontSize?: string
    lineHeight?: string
    margin?: string
    padding?: string
    borderRadius?: string
    textTransform?: string
    letterSpacing?: string
  }): string {
    const out: string[] = []

    function clean(value: string | undefined): string {
      return String(value || '').trim().replace(/[;<>"']/g, '')
    }

    function push(prop: string, value: string | undefined, skip?: string[]) {
      const cleaned = clean(value)
      if (!cleaned)
        return
      const lower = cleaned.toLowerCase()
      for (let i = 0; skip && i < skip.length; i++) {
        if (lower === skip[i])
          return
      }
      out.push(`${prop}:${cleaned}`)
    }

    push('display', style.display, ['none'])
    push('color', style.color)
    push('background-color', style.backgroundColor, ['transparent', 'rgba(0, 0, 0, 0)'])
    push('font-weight', style.fontWeight, ['normal', '400'])
    push('font-size', style.fontSize)
    push('line-height', style.lineHeight, ['normal'])
    push('margin', style.margin)
    push('padding', style.padding)
    push('border-radius', style.borderRadius, ['0px'])
    push('text-transform', style.textTransform, ['none'])
    push('letter-spacing', style.letterSpacing, ['normal', '0px'])

    return out.join(';')
  }

  function isVisiblePseudoElementForCapture(style: CSSStyleDeclaration | null): boolean {
    return !!style && style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0'
  }

  function materializePseudoElementForCapture(src: Element, cln: Element, pseudo: string, includeStyle: boolean) {
    if (!src || !cln || !window.getComputedStyle)
      return
    const style = window.getComputedStyle(src, `::${pseudo}`)
    if (!isVisiblePseudoElementForCapture(style))
      return
    const text = normalizePseudoElementContentForCapture(style.content)
    if (!text)
      return
    const existing = cln.querySelector && cln.querySelector(`:scope > [data-oem-pseudo="${pseudo}"][data-oem-pseudo-capture="true"]`)
    if (existing)
      return

    const span = document.createElement('span')
    span.setAttribute('data-oem-pseudo', pseudo)
    span.setAttribute('data-oem-pseudo-capture', 'true')
    span.textContent = text

    if (includeStyle) {
      const styleText = pseudoElementInlineStyleForCapture(style)
      if (styleText)
        span.setAttribute('style', styleText)
    }

    if (pseudo === 'before')
      cln.insertBefore(span, cln.firstChild)
    else
      cln.appendChild(span)
  }

  function materializePseudoElementsForCapture(src: Element, cln: Element, includeStyle: boolean) {
    const srcCh = src && src.children ? src.children : []
    const clnCh = cln && cln.children ? cln.children : []
    for (let i = 0; i < srcCh.length && i < clnCh.length; i++) {
      if (srcCh[i].nodeType === 1)
        materializePseudoElementsForCapture(srcCh[i], clnCh[i], includeStyle)
    }
    materializePseudoElementForCapture(src, cln, 'before', includeStyle)
    materializePseudoElementForCapture(src, cln, 'after', includeStyle)
  }

  return {
    normalizePseudoElementContentForCapture,
    pseudoElementInlineStyleForCapture,
    materializePseudoElementsForCapture,
  }
}
