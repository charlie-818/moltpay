export * from './wallet';
export * from './agent';

import { AgentTransactionAPI, AgentConfig } from './agent';

/**
 * Create a new agent transaction API instance
 */
export function createAgentAPI(config?: AgentConfig): AgentTransactionAPI {
  return new AgentTransactionAPI(config);
}
