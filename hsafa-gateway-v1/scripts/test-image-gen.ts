/**
 * Test script for OpenRouter image generation.
 * Tests both direct fetch and AI SDK approaches.
 */

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const MODEL = 'google/gemini-3-pro-image-preview';
const PROMPT = 'Draw a simple red circle on white background';

if (!OPENROUTER_API_KEY) {
  console.error('Missing OPENROUTER_API_KEY env var');
  process.exit(1);
}

// ── Test 1: Direct fetch to /chat/completions ──
async function testDirectFetch() {
  console.log('\n=== Test 1: Direct fetch to /chat/completions ===');
  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [{ role: 'user', content: PROMPT }],
    }),
  });

  console.log('Status:', res.status);
  const json = await res.json() as any;

  const message = json.choices?.[0]?.message;
  console.log('Content type:', typeof message?.content);
  console.log('Content is array:', Array.isArray(message?.content));

  if (typeof message?.content === 'string') {
    console.log('Content length:', message.content.length);
    console.log('Content first 100 chars:', message.content.slice(0, 100));
    console.log('Content last 100 chars:', message.content.slice(-100));
    // Check if it's base64
    if (message.content.length > 1000) {
      console.log('Likely base64 image data!');
    }
  } else if (Array.isArray(message?.content)) {
    console.log('Parts count:', message.content.length);
    for (const [i, part] of message.content.entries()) {
      console.log(`Part ${i}:`, { type: part.type, keys: Object.keys(part) });
      if (part.type === 'text') console.log(`  text (${part.text?.length} chars):`, part.text?.slice(0, 100));
      if (part.type === 'image_url') console.log('  image_url keys:', Object.keys(part.image_url || {}));
      if (part.inline_data) console.log('  inline_data keys:', Object.keys(part.inline_data));
    }
  }

  // Check other top-level keys
  console.log('Top-level keys:', Object.keys(json));
  console.log('Choice keys:', Object.keys(json.choices?.[0] || {}));
  console.log('Message keys:', Object.keys(message || {}));
}

// ── Test 2: AI SDK with @openrouter/ai-sdk-provider ──
async function testAiSdk() {
  console.log('\n=== Test 2: AI SDK with @openrouter/ai-sdk-provider ===');
  const { createOpenRouter } = await import('@openrouter/ai-sdk-provider');
  const { generateText } = await import('ai');

  const openrouter = createOpenRouter({ apiKey: OPENROUTER_API_KEY! });

  const result = await generateText({
    model: openrouter.chat(MODEL),
    prompt: PROMPT,
  });

  console.log('Text length:', result.text?.length);
  console.log('Text first 100:', result.text?.slice(0, 100));
  console.log('Files count:', result.files?.length ?? 0);
  if (result.files && result.files.length > 0) {
    for (const [i, file] of result.files.entries()) {
      console.log(`File ${i}:`, { mediaType: file.mediaType, base64Length: file.base64?.length });
    }
  }
  console.log('Response messages count:', result.response?.messages?.length);
}

async function main() {
  try {
    await testDirectFetch();
  } catch (e) {
    console.error('Test 1 failed:', e);
  }

  try {
    await testAiSdk();
  } catch (e) {
    console.error('Test 2 failed:', e);
  }
}

main();
