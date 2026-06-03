import { ref } from 'vue'

/**
 * Copy-to-clipboard with transient per-item "copied" feedback.
 *
 * Tracks which item was last copied (by an optional key, defaulting to the value) so a single
 * instance can drive "Copied!" affordances across many elements (e.g. every swatch in a palette).
 */
export function useClipboard(resetMs = 1200) {
  const copiedKey = ref<string | null>(null)
  let timer: ReturnType<typeof setTimeout> | null = null

  async function writeToClipboard(value: string): Promise<void> {
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(value)
        return
      }
      catch {
        // fall through to the legacy path (e.g. insecure context or denied permission)
      }
    }

    if (typeof document === 'undefined')
      return

    const textarea = document.createElement('textarea')
    textarea.value = value
    textarea.setAttribute('readonly', '')
    textarea.style.position = 'fixed'
    textarea.style.opacity = '0'
    textarea.style.pointerEvents = 'none'
    document.body.appendChild(textarea)
    textarea.select()
    try {
      document.execCommand('copy')
    }
    finally {
      document.body.removeChild(textarea)
    }
  }

  async function copy(value: string, key?: string): Promise<void> {
    if (!value)
      return
    await writeToClipboard(value)
    copiedKey.value = key ?? value
    if (timer)
      clearTimeout(timer)
    timer = setTimeout(() => {
      copiedKey.value = null
    }, resetMs)
  }

  function isCopied(key: string): boolean {
    return copiedKey.value === key
  }

  return { copy, isCopied, copiedKey }
}
