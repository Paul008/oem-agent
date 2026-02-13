/**
 * Extraction Module — Public API
 *
 * 4-Layer Architecture:
 * - Layer 1 (Research): Brave + Perplexity for OEM discovery
 * - Layer 2 (Fast Path): Cached selectors/APIs, no LLM
 * - Layer 3 (Adaptive): Self-healing selector repair with LLM
 * - Layer 4 (Discovery): Full AI-driven exploration
 */

// Core extraction engine (JSON-LD, OpenGraph, CSS, LLM)
export * from './engine';

// Self-healing selector system (Layer 3)
export * from './self-heal';

// Discovery cache management
export * from './cache';

// Orchestrator (Layer routing)
export * from './orchestrator';
