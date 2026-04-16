import { tool, jsonSchema } from 'ai';
import { dispatchToSkill, emitLifecycleToSkill } from './tool-dispatcher.js';

// =============================================================================
// Tool Builder (v7)
//
// Builds AI SDK tools from global SkillTool rows.
// Dispatches via SSE (tool-dispatcher) with lifecycle events.
// =============================================================================

export interface V7ToolRow {
  name: string;
  description: string;
  inputSchema: unknown;
  skillName: string;
}

export interface V7HaseefContext {
  id: string;
  name: string;
  profile: Record<string, unknown>;
  skills: string[];
}

/**
 * v7: Build AI SDK tools from global SkillTool rows.
 * Dispatches via SSE (tool-dispatcher) instead of Redis Streams.
 * Emits tool lifecycle events (tool.input.start, tool.input.delta,
 * tool.call, tool.result, tool.error) to the skill SSE channel so
 * services can display typing indicators and track execution.
 */
export function buildV7Tools(
  haseef: V7HaseefContext,
  globalTools: V7ToolRow[],
  defaultTimeout?: number,
): Record<string, unknown> {
  const tools: Record<string, unknown> = {};

  const haseefCtx = {
    id: haseef.id,
    name: haseef.name,
    profile: haseef.profile,
  };

  for (const dbTool of globalTools) {
    const skill = dbTool.skillName;
    const toolName = dbTool.name;
    const prefixedName = `${skill}_${toolName}`;

    const schema = jsonSchema<Record<string, unknown>>(dbTool.inputSchema as any);

    tools[prefixedName] = tool({
      description: dbTool.description,
      inputSchema: schema,

      onInputStart: ({ toolCallId }: { toolCallId: string }) => {
        emitLifecycleToSkill(skill, 'tool.input.start', {
          actionId: toolCallId,
          toolName,
          haseef: haseefCtx,
        });
      },

      onInputDelta: ({ toolCallId, inputTextDelta }: { toolCallId: string; inputTextDelta: string }) => {
        emitLifecycleToSkill(skill, 'tool.input.delta', {
          actionId: toolCallId,
          toolName,
          delta: inputTextDelta,
          haseef: haseefCtx,
        });
      },

      onInputAvailable: ({ toolCallId, input }: { toolCallId: string; input: unknown }) => {
        emitLifecycleToSkill(skill, 'tool.call', {
          actionId: toolCallId,
          toolName,
          args: input,
          haseef: haseefCtx,
        });
      },

      execute: async (args: Record<string, unknown>, { toolCallId }: { toolCallId: string }) => {
        const startedAt = Date.now();
        try {
          const result = await dispatchToSkill({
            skill,
            actionId: toolCallId,
            toolName,
            args,
            haseef: haseefCtx,
            timeout: defaultTimeout,
          });

          emitLifecycleToSkill(skill, 'tool.result', {
            actionId: toolCallId,
            toolName,
            args,
            result,
            durationMs: Date.now() - startedAt,
            haseef: haseefCtx,
          });

          return result;
        } catch (err) {
          const errMsg = err instanceof Error ? err.message : String(err);
          emitLifecycleToSkill(skill, 'tool.error', {
            actionId: toolCallId,
            toolName,
            error: errMsg,
            haseef: haseefCtx,
          });
          return { error: errMsg };
        }
      },
    });
  }

  return tools;
}
