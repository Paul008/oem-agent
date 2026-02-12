/**
 * OEM Agent Shared Library
 *
 * Shared utilities and types for the OEM Agent container runtime.
 */

export const VERSION = '0.2.0';

export interface AgentConfig {
  port: number;
  timeout: number;
  debug: boolean;
}

export const defaultConfig: AgentConfig = {
  port: 8080,
  timeout: 30000,
  debug: false,
};
