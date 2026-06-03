import { describe, expect, it } from 'vitest'

import { getPageWorkflowState, getPrimaryWorkflowAction, isPipelineActionDisabled, shouldShowSourceUrlInput } from './page-workflow'

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

  it('keeps structured pages editable when a stale 404 error is present', () => {
    expect(getPageWorkflowState({
      page: { content: { sections: [{ id: 's1', type: 'hero' }] } },
      error: 'Worker API error 404: Page not found',
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

  it('keeps cloned pages available when a stale 404 error is present', () => {
    expect(getPageWorkflowState({
      page: { content: { rendered: '<link rel="stylesheet" href="/x.css">', sections: [] } },
      error: 'Worker API error 404: Page not found',
    })).toBe('cloned')
  })

  it('returns custom for custom pages even with no sections', () => {
    expect(getPageWorkflowState({
      page: { page_type: 'custom', content: { rendered: '', sections: [] } },
      error: null,
    })).toBe('custom')
  })
})

describe('isPipelineActionDisabled', () => {
  it('requires a source URL when the workflow needs one', () => {
    expect(isPipelineActionDisabled({
      needsSourceUrl: true,
      sourceUrlOverride: '',
    })).toBe(true)
  })

  it('allows the pipeline when a required source URL is provided', () => {
    expect(isPipelineActionDisabled({
      needsSourceUrl: true,
      sourceUrlOverride: 'https://example.com/model',
    })).toBe(false)
  })

  it('disables the pipeline while another workflow operation is running', () => {
    expect(isPipelineActionDisabled({
      needsSourceUrl: false,
      sourceUrlOverride: '',
      pipelining: true,
    })).toBe(true)
  })
})

describe('shouldShowSourceUrlInput', () => {
  it('allows source overrides for existing model pages', () => {
    expect(shouldShowSourceUrlInput('missing')).toBe(true)
    expect(shouldShowSourceUrlInput('empty')).toBe(true)
    expect(shouldShowSourceUrlInput('structured')).toBe(true)
    expect(shouldShowSourceUrlInput('cloned')).toBe(true)
  })

  it('does not show source overrides for custom pages', () => {
    expect(shouldShowSourceUrlInput('custom')).toBe(false)
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
