import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const source = readFileSync(new URL('./[slug].vue', import.meta.url), 'utf8')

describe('page builder toolbar layout', () => {
  it('keeps actions in a dedicated non-wrapping lane without covering the workflow', () => {
    const toolbarStart = source.indexOf('data-page-builder-toolbar="true"')
    const toolbarEnd = source.indexOf('<!-- Workflow Stepper -->', toolbarStart)
    const toolbarSource = source.slice(toolbarStart, toolbarEnd)

    expect(toolbarStart).toBeGreaterThan(-1)
    expect(toolbarEnd).toBeGreaterThan(toolbarStart)
    expect(toolbarSource).toContain('data-page-builder-context="true"')
    expect(toolbarSource).toContain('class="flex min-w-0 flex-1 items-center gap-1.5 overflow-hidden sm:gap-2"')
    expect(toolbarSource).toContain('data-page-builder-actions="true"')
    expect(toolbarSource).toContain('class="ml-auto flex shrink-0 flex-nowrap items-center justify-end gap-1.5"')
  })

  it('keeps dense actions in the compact menu unless the viewport is genuinely wide', () => {
    expect(source).not.toContain('min-[2100px]')
    expect(source).toContain('class="hidden min-[2400px]:inline-flex"')
    expect(source).toContain('class="hidden min-[2400px]:flex')
    expect(source).toContain('class="min-[2400px]:hidden size-8 p-0"')
  })

  it('keeps the required subpage source input in its own full-width row', () => {
    expect(source).toContain('data-page-builder-source-url="true"')
    expect(source).toContain('class="flex min-w-0 items-center gap-2 border-b bg-card px-3 py-2 shrink-0 sm:px-4"')
    expect(source).toContain('class="h-8 min-w-0 flex-1 rounded-md border border-input')
  })

  it('prevents the workflow stepper from squeezing the editor viewport', () => {
    expect(source).toContain('bg-muted/30 shrink-0 overflow-x-auto')
    expect(source).toContain('text-xs shrink-0')
  })
})
