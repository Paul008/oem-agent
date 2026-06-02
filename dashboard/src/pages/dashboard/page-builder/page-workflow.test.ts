import { describe, expect, it } from 'vitest'

import { getPageWorkflowState, getPrimaryWorkflowAction } from './page-workflow'

describe('getPageWorkflowState', () => {
  it('returns missing when the API error is a 404', () => {
    expect(getPageWorkflowState({
      page: null,
      error: 'Worker API error 404: Page not found',
    })).toBe('missing')
  })

  it('detects 404 errors case-insensitively', () => {
    expect(getPageWorkflowState({
      page: null,
      error: 'worker api error 404: page not found',
    })).toBe('missing')
  })

  it('returns empty when no page exists but the error is not a 404', () => {
    expect(getPageWorkflowState({
      page: null,
      error: null,
    })).toBe('empty')
  })

  it('returns structured when sections exist', () => {
    expect(getPageWorkflowState({
      page: { content: { sections: [{ id: 's1', type: 'hero' }] } },
      error: null,
    })).toBe('structured')
  })

  it('returns cloned when rendered HTML exists but sections do not', () => {
    expect(getPageWorkflowState({
      page: { content: { rendered: '<link rel="stylesheet" href="/x.css">', sections: [] } },
      error: null,
    })).toBe('cloned')
  })

  it('returns cloned when rendered HTML includes Tailwind CDN output', () => {
    expect(getPageWorkflowState({
      page: { content: { rendered: '<script src="https://cdn.tailwindcss.com"></script>', sections: [] } },
      error: null,
    })).toBe('cloned')
  })

  it('returns custom for custom pages even with no sections', () => {
    expect(getPageWorkflowState({
      page: { page_type: 'custom', content: { rendered: '', sections: [] } },
      error: null,
    })).toBe('custom')
  })
})

describe('getPrimaryWorkflowAction', () => {
  it('uses pipeline as the single missing-page action', () => {
    expect(getPrimaryWorkflowAction('missing')).toEqual({
      key: 'pipeline',
      label: 'Run Pipeline',
    })
  })

  it('uses pipeline for empty pages', () => {
    expect(getPrimaryWorkflowAction('empty')).toEqual({
      key: 'pipeline',
      label: 'Run Pipeline',
    })
  })

  it('uses structure for cloned pages', () => {
    expect(getPrimaryWorkflowAction('cloned')).toEqual({
      key: 'structure',
      label: 'Structure Page',
    })
  })

  it('uses save for structured dirty pages', () => {
    expect(getPrimaryWorkflowAction('structured', { isDirty: true })).toEqual({
      key: 'save',
      label: 'Save',
    })
  })

  it('uses edit for structured clean pages', () => {
    expect(getPrimaryWorkflowAction('structured', { isDirty: false })).toEqual({
      key: 'edit',
      label: 'Edit Sections',
    })
  })

  it('uses edit for custom pages', () => {
    expect(getPrimaryWorkflowAction('custom')).toEqual({
      key: 'edit',
      label: 'Edit Sections',
    })
  })
})
