// =============================================================================
// Dynamic Instruction Providers
//
// Scope templates register per-haseef instruction providers during init.
// core-api.ts calls getDynamicInstructions() when building the prompt.
//
// This keeps scope-specific logic out of the service layer — each template
// owns its own instructions without core-api needing to know about it.
// =============================================================================

type InstructionProvider = (haseefId: string) => Promise<string | null>;

const providers: InstructionProvider[] = [];

/** Register a dynamic instruction provider (called during scope init) */
export function registerInstructionProvider(fn: InstructionProvider): void {
  providers.push(fn);
}

/** Collect all dynamic instructions for a haseef (called by core-api.ts) */
export async function getDynamicInstructions(haseefId: string): Promise<string[]> {
  const results = await Promise.all(providers.map((fn) => fn(haseefId)));
  return results.filter((r): r is string => r !== null);
}
