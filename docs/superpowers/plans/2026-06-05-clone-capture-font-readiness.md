# Clone Capture Font Readiness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wait briefly for browser web fonts before Clone Studio capture serializes the DOM.

**Architecture:** Add a self-contained helper in `src/design/page-capturer.ts`, test it directly with fake font documents, and call it inside the browser capture path before pseudo-element materialization.

**Tech Stack:** TypeScript, Cloudflare Puppeteer, Vitest.

---

## Tasks

- [ ] Add tests for ready, timeout, and unsupported font readiness states.
- [ ] Add a source-level test that the capture path waits for fonts before pseudo-element materialization.
- [ ] Implement `CAPTURE_FONT_READY_TIMEOUT_MS` and `waitForCaptureFontsForCapture()`.
- [ ] Wire `page.evaluate(waitForCaptureFontsForCapture as any, CAPTURE_FONT_READY_TIMEOUT_MS)` into `captureDom()`.
- [ ] Run focused tests, worker tests, TypeScript, commit, push, and deploy the Worker.
