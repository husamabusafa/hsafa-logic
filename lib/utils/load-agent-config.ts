import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * Load agent YAML configuration from .hsafa/agents folder
 * @param agentName - Name of the agent (without .hsafa extension)
 * @returns The YAML content as a string
 */
export function loadAgentConfig(agentName: string): string {
  const agentPath = join(process.cwd(), '.hsafa', 'agents', `${agentName}.hsafa`);
  
  try {
    return readFileSync(agentPath, 'utf-8');
  } catch (error) {
    throw new Error(
      `Failed to load agent config for "${agentName}". Make sure the file exists at: ${agentPath}`
    );
  }
}

/**
 * Check if an agent config exists
 * @param agentName - Name of the agent (without .hsafa extension)
 * @returns true if the agent config file exists
 */
export function agentConfigExists(agentName: string): boolean {
  const agentPath = join(process.cwd(), '.hsafa', 'agents', `${agentName}.hsafa`);
  try {
    readFileSync(agentPath, 'utf-8');
    return true;
  } catch {
    return false;
  }
}
