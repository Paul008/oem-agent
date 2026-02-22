/**
 * Extraction Runner — Wraps extraction calls with logging and learning
 *
 * Creates an extraction_runs row, executes the extraction function,
 * completes the run with results, and triggers learnFromRun() to
 * update the OEM profile.
 */

import type { OemId, ExtractionPipeline, ExtractionRunResult } from '../oem/types';
import type { DesignMemoryManager } from './memory';

export class ExtractionRunner {
  constructor(private memoryManager: DesignMemoryManager) {}

  /**
   * Wrap an extraction function with run logging and learning.
   *
   * @param oemId - The OEM being extracted
   * @param modelSlug - The model being extracted
   * @param pipeline - Which pipeline is running
   * @param fn - The actual extraction function to execute
   * @returns The result of fn()
   */
  async run<T>(
    oemId: OemId,
    modelSlug: string,
    pipeline: ExtractionPipeline,
    fn: () => Promise<T & { extractionResult?: ExtractionRunResult }>,
  ): Promise<T> {
    const runId = await this.memoryManager.logExtractionRun({
      oem_id: oemId,
      model_slug: modelSlug,
      pipeline,
    });

    try {
      const result = await fn();

      // If the fn provides extractionResult metadata, use it
      if (result.extractionResult) {
        await this.memoryManager.completeExtractionRun(runId, result.extractionResult);
        await this.memoryManager.learnFromRun(runId);
      }

      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await this.memoryManager.failExtractionRun(runId, message);
      throw error;
    }
  }
}
