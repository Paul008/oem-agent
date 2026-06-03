import { readFileSync } from 'node:fs'
import { fileURLToPath, URL } from 'node:url'

import { describe, expect, it } from 'vitest'

function readComponent(name: string): string {
  return readFileSync(fileURLToPath(new URL(`./${name}`, import.meta.url)), 'utf8')
}

describe('Clone Studio components', () => {
  it('wires the canvas through the tokenized iframe bridge', () => {
    const source = readComponent('CloneStudioCanvas.vue')

    expect(source).toContain('buildCloneStudioHtml')
    expect(source).toContain('getCloneHtml')
    expect(source).toContain('bridgeToken')
    expect(source).toContain('crypto.randomUUID')
    expect(source).toContain("data.source !== 'clone-studio'")
    expect(source).toContain('data.bridgeToken !== bridgeToken')
    expect(source).toContain("data.type === 'clone-studio:select-region'")
    expect(source).toContain("data.type === 'clone-studio:dom-updated'")
    expect(source).toContain('source !== iframe.value.contentWindow')
    expect(source).toContain("type: 'clone-studio:select'")
    expect(source).toContain("type: 'clone-studio:patch-field'")
    expect(source).toContain('defineExpose')
    expect(source).toContain('patchField')
    expect(source).toContain('sandbox="allow-scripts"')
    expect(source).not.toContain('allow-top-navigation')
    expect(source).not.toContain('allow-popups')
  })

  it('keeps clone regions separate from structured sections in the sidebar', () => {
    const source = readComponent('CloneRegionSidebar.vue')

    expect(source).toContain('regions:')
    expect(source).toContain('structuredSections')
    expect(source).toContain('selectRegion')
    expect(source).toContain('editRegion')
    expect(source).toContain('editable_fields')
    expect(source).toContain('Edit clone region')
    expect(source).toContain('aria-label')
    expect(source).toContain('selectedRegionId')
    expect(source).toContain('height')
    expect(source).toContain('tag')
  })

  it('supports all Clone Studio field kinds in the region editor', () => {
    const source = readComponent('CloneRegionEditor.vue')

    for (const kind of ['text', 'html', 'image', 'link', 'button', 'background', 'visibility']) {
      expect(source).toContain(`'${kind}'`)
    }

    expect(source).toContain('patchField')
    expect(source).toContain('UiInput')
    expect(source).toContain('UiTextarea')
    expect(source).toContain('UiSelect')
    expect(source).toContain('fieldId: field.id')
    expect(source).toContain('regionId: region.id')
    expect(source).toContain('selector: field.selector')
    expect(source).toContain('kind: field.kind')
    expect(source).toContain('value')
    expect(source).toContain('hidden')
    expect(source).toContain('visible')
  })
})
