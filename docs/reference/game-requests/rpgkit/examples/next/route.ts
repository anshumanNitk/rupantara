// app/api/npc/route.ts: server-side LLM call for NPC dialogue (keeps your API key off the client).
// Not run in this repo's tests: wire it up with your own key. Use a small/fast model for NPC chat.
import Anthropic from '@anthropic-ai/sdk';
const client = new Anthropic(); // reads ANTHROPIC_API_KEY

export async function POST(req: Request) {
  const { system, messages } = await req.json();
  const msg = await client.messages.create({
    model: process.env.NPC_MODEL ?? 'claude-haiku-4-5-20251001',
    max_tokens: 300, system, messages: messages.slice(-12),
  });
  const text = msg.content.find((b) => b.type === 'text');
  return new Response(text && 'text' in text ? text.text : '{"say":"..."}');
}
