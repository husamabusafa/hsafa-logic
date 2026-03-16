// =============================================================================
// AI Generate Route — Light LLM for structured message generation
//
// POST /api/ai/generate-component
//   Body: { type, prompt }
//   Returns: { component } — the structured message payload ready to send
//
// Uses a lightweight model (e.g. gpt-4o-mini) to convert a natural language
// prompt into structured data for message types like confirmation, vote,
// choice, form, card, chart.
// =============================================================================

import { Router } from "express";
import type { Request, Response } from "express";
import { requireAnyAuth, isAuthError } from "../lib/spaces-auth.js";

const router = Router();

// Component type schemas — defines what the LLM should generate for each type
const TYPE_SCHEMAS: Record<string, string> = {
  confirmation: `{
  "title": "short descriptive title",
  "message": "detailed message or question",
  "confirmLabel": "confirm button text (default: Confirm)",
  "rejectLabel": "reject button text (default: Cancel)"
}`,
  vote: `{
  "title": "poll question",
  "options": ["option1", "option2", "option3"],
  "allowMultiple": false
}`,
  choice: `{
  "text": "question or prompt",
  "options": [
    { "label": "Option 1", "value": "opt1", "description": "optional description" },
    { "label": "Option 2", "value": "opt2" }
  ]
}`,
  form: `{
  "title": "form title",
  "description": "optional form description",
  "fields": [
    { "name": "fieldName", "label": "Field Label", "type": "text|number|email|select|textarea", "required": true, "options": ["only for select type"] }
  ]
}`,
  card: `{
  "title": "card title",
  "body": "card body text / description",
  "imageUrl": "optional image URL or null",
  "actions": [
    { "label": "Button Text", "value": "action_value", "style": "default|primary|danger" }
  ]
}`,
  chart: `{
  "chartType": "bar|line|pie",
  "title": "chart title",
  "data": [
    { "label": "Label1", "value": 10, "color": "#3b82f6" },
    { "label": "Label2", "value": 20, "color": "#10b981" },
    { "label": "Label3", "value": 30, "color": "#f59e0b" }
  ]
}`,
};

// Resolve which LLM provider to use (OpenRouter preferred, then OpenAI, then Anthropic)
function resolveLLMProvider(): { url: string; apiKey: string; model: string; extraHeaders?: Record<string, string> } | null {
  const orKey = process.env.OPENROUTER_API_KEY || process.env.CORE_OPENROUTER_API_KEY;
  if (orKey) {
    return {
      url: "https://openrouter.ai/api/v1/chat/completions",
      apiKey: orKey,
      model: "google/gemini-2.0-flash-001",
      extraHeaders: { "HTTP-Referer": "https://hsafa.com", "X-Title": "Hsafa Spaces" },
    };
  }
  const oaiKey = process.env.OPENAI_API_KEY;
  if (oaiKey) {
    return { url: "https://api.openai.com/v1/chat/completions", apiKey: oaiKey, model: "gpt-4o-mini" };
  }
  return null;
}

router.post("/generate-component", async (req: Request, res: Response) => {
  const auth = await requireAnyAuth(req);
  if (isAuthError(auth)) {
    res.status(auth.status).json({ error: auth.error });
    return;
  }

  const { type, prompt, previousComponent, history } = req.body as {
    type?: string;
    prompt?: string;
    previousComponent?: Record<string, unknown>;
    history?: Array<{ role: "user" | "assistant"; content: string }>;
  };

  if (!type || !prompt) {
    res.status(400).json({ error: "type and prompt are required" });
    return;
  }

  const schema = TYPE_SCHEMAS[type];
  if (!schema) {
    res.status(400).json({ error: `Unknown component type: ${type}. Supported: ${Object.keys(TYPE_SCHEMAS).join(", ")}` });
    return;
  }

  const systemPrompt = `You are a structured message generator. Given a user's description, generate a JSON object matching exactly the schema below. Return ONLY valid JSON, no markdown, no explanation.

Schema for type "${type}":
${schema}

Rules:
- Generate realistic, useful content based on the user's description.
- Keep text concise and clear.
- For votes/choices, generate 2-5 meaningful options.
- For forms, generate 2-5 relevant fields.
- For cards, include action buttons when the description implies actions.
- For charts, generate plausible sample data.
- Return ONLY the JSON object, nothing else.`;

  try {
    const provider = resolveLLMProvider();
    if (!provider) {
      res.status(500).json({ error: "No LLM provider configured. Set OPENROUTER_API_KEY or OPENAI_API_KEY." });
      return;
    }

    // Build messages array — support follow-up conversation
    const msgs: Array<{ role: string; content: string }> = [
      { role: "system", content: systemPrompt },
    ];

    // If there's history from previous generate + follow-up, include it
    if (history && history.length > 0) {
      for (const h of history) {
        msgs.push(h);
      }
    } else if (previousComponent) {
      // Single previous component — user is refining
      msgs.push({ role: "assistant", content: JSON.stringify(previousComponent, null, 2) });
    }

    msgs.push({ role: "user", content: prompt });

    const response = await fetch(provider.url, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${provider.apiKey}`,
        "Content-Type": "application/json",
        ...(provider.extraHeaders ?? {}),
      },
      body: JSON.stringify({
        model: provider.model,
        messages: msgs,
        temperature: 0.7,
        max_tokens: 1000,
        response_format: { type: "json_object" },
      }),
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => "Unknown error");
      console.error("[ai-generate] LLM error:", response.status, errText);
      res.status(502).json({ error: `AI generation failed (${response.status})`, details: errText });
      return;
    }

    const data = await response.json() as {
      choices?: Array<{ message?: { content?: string } }>;
    };

    const content = data.choices?.[0]?.message?.content;
    if (!content) {
      res.status(502).json({ error: "No content generated" });
      return;
    }

    const component = JSON.parse(content);
    res.json({ component, type });
  } catch (error: any) {
    console.error("[ai-generate] Error:", error);
    res.status(500).json({ error: "Failed to generate component", details: error.message });
  }
});

export default router;
