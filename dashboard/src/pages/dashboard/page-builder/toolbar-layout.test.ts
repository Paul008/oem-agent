import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const source = readFileSync(new URL('./[slug].vue', import.meta.url), 'utf8')

describe('page builder toolbar layout', () => {
  it('wraps toolbar actions instead of clipping them', () => {
    expect(source).toContain('flex flex-wrap items-center')
    expect(source).not.toContain('bg-card shrink-0 overflow-hidden')
    expect(source).toContain('ml-auto flex max-w-full flex-wrap items-center justify-end')
  })

  it('keeps dense actions in the compact menu unless the viewport is genuinely wide', () => {
    expect(source).toContain('class="hidden min-[2100px]:inline-flex"')
    expect(source).toContain('class="hidden min-[2100px]:flex')
    expect(source).toContain('class="min-[2100px]:hidden size-8 p-0"')
  })

  it('keeps required subpage source input reachable on narrow screens', () => {
    expect(source).toContain('order-last flex basis-full items-center gap-1.5')
    expect(source).toContain('lg:w-64 lg:flex-none')
  })

  it('prevents the workflow stepper from squeezing the editor viewport', () => {
    expect(source).toContain('bg-muted/30 shrink-0 overflow-x-auto')
    expect(source).toContain('text-xs shrink-0')
  })
})
