import { NextResponse } from 'next/server';
import { loadAgentConfig, agentConfigExists } from '@/lib/utils/load-agent-config';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ agentName: string }> }
) {
  try {
    const { agentName } = await params;

    if (!agentName) {
      return NextResponse.json(
        { error: 'Agent name is required' },
        { status: 400 }
      );
    }

    if (!agentConfigExists(agentName)) {
      return NextResponse.json(
        { error: `Agent config not found: ${agentName}` },
        { status: 404 }
      );
    }

    const agentYaml = loadAgentConfig(agentName);

    return NextResponse.json({
      agentName,
      agentYaml,
    });
  } catch (error) {
    console.error('[Agent Config API Error]', error);
    return NextResponse.json(
      {
        error: 'Failed to load agent config',
        message: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
