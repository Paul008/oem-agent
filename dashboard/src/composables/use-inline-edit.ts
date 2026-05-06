import { ref } from 'vue'

/**
 * Composable for inline contenteditable text editing.
 * Handles focus, blur, paste-as-plain-text, Enter key behavior,
 * and emits the updated value on blur.
 */
export function useInlineEdit(onUpdate: (value: string) => void) {
  const editing = ref(false)
  const editEl = ref<HTMLElement | null>(null)

  function startEdit(el: HTMLElement) {
    editing.value = true
    editEl.value = el
    el.setAttribute('contenteditable', 'true')
    el.focus()
    // Select all text
    const range = document.createRange()
    range.selectNodeContents(el)
    const sel = window.getSelection()
    sel?.removeAllRanges()
    sel?.addRange(range)
  }

  function stopEdit() {
    if (!editEl.value)
      return
    const el = editEl.value
    el.removeAttribute('contenteditable')
    const text = el.textContent?.trim() || ''
    editing.value = false
    editEl.value = null
    onUpdate(text)
  }

  function onKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter') {
      e.preventDefault()
      ;(e.target as HTMLElement)?.blur()
    }
    if (e.key === 'Escape') {
      e.preventDefault()
      // Revert — blur without saving
      if (editEl.value) {
        editEl.value.removeAttribute('contenteditable')
        editing.value = false
        editEl.value = null
      }
    }
  }

  function onPaste(e: ClipboardEvent) {
    e.preventDefault()
    const text = e.clipboardData?.getData('text/plain') || ''
    document.execCommand('insertText', false, text)
  }

  return { editing, editEl, startEdit, stopEdit, onKeydown, onPaste }
}
