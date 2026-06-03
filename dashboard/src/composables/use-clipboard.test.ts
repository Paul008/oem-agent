import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { useClipboard } from './use-clipboard'

describe('useClipboard', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.stubGlobal('navigator', { clipboard: { writeText: vi.fn(async () => {}) } })
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('writes the value to the clipboard and flags it copied by key', async () => {
    const { copy, isCopied, copiedKey } = useClipboard(1000)

    await copy('#EB0A1E', 'primary')

    expect(vi.mocked(navigator.clipboard.writeText)).toHaveBeenCalledWith('#EB0A1E')
    expect(isCopied('primary')).toBe(true)
    expect(isCopied('secondary')).toBe(false)
    expect(copiedKey.value).toBe('primary')
  })

  it('defaults the key to the copied value', async () => {
    const { copy, isCopied } = useClipboard()
    await copy('16px')
    expect(isCopied('16px')).toBe(true)
  })

  it('clears the copied flag after the reset timeout', async () => {
    const { copy, isCopied } = useClipboard(800)
    await copy('#fff', 'surface')
    expect(isCopied('surface')).toBe(true)

    vi.advanceTimersByTime(800)
    expect(isCopied('surface')).toBe(false)
  })

  it('ignores empty values', async () => {
    const { copy, copiedKey } = useClipboard()
    await copy('')
    expect(vi.mocked(navigator.clipboard.writeText)).not.toHaveBeenCalled()
    expect(copiedKey.value).toBeNull()
  })

  it('only the most recently copied item is flagged', async () => {
    const { copy, isCopied } = useClipboard()
    await copy('#000', 'a')
    await copy('#fff', 'b')
    expect(isCopied('a')).toBe(false)
    expect(isCopied('b')).toBe(true)
  })
})
