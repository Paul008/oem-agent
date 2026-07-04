import { describe, expect, it } from 'vitest'

import { injectCloneRuntimeScript } from './inject'

describe('injectCloneRuntimeScript', () => {
  it('appends the runtime as a script when provided', () => {
    const out = injectCloneRuntimeScript('<main><p>Body</p></main>', 'var x = 1;')

    expect(out).toContain('<main><p>Body</p></main>')
    expect(out).toMatch(/<script data-clone-runtime="true">[\s\S]*var x = 1;[\s\S]*<\/script>\s*$/)
  })

  it('returns html unchanged when runtime is empty', () => {
    expect(injectCloneRuntimeScript('<main></main>', undefined)).toBe('<main></main>')
    expect(injectCloneRuntimeScript('<main></main>', '')).toBe('<main></main>')
  })

  it('escapes closing script sequences in the runtime body', () => {
    const out = injectCloneRuntimeScript('<main></main>', 'var s = "</script>";')

    expect(out).not.toMatch(/<\/script>";/)
  })
})

import { readFileSync } from 'node:fs'

describe('production artifact wiring', () => {
  it('injects the runtime into the production clone body and exposes inventory in the manifest', () => {
    const source = readFileSync(new URL('../../routes/oem-agent.ts', import.meta.url), 'utf8')
    const artifactFn = source.indexOf('async function buildProductionCloneArtifact')
    const inject = source.indexOf('injectCloneRuntimeScript(scoped.html', artifactFn)
    const manifestInteractions = source.indexOf('interactions: page?.content?.modes?.clone?.interactions')

    expect(artifactFn).toBeGreaterThan(-1)
    expect(inject).toBeGreaterThan(artifactFn)
    expect(manifestInteractions).toBeGreaterThan(-1)
  })
})
