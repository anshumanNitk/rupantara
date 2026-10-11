'use client';
// Next.js (app router) client component: mounts the engine into a div.
// Three.js touches `window`, so keep everything inside useEffect.
import { useEffect, useRef } from 'react';

export default function NpcGame({ pack }: { pack: any }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let dispose = () => {};
    (async () => {
      const { Game, LLMProvider, ScriptedProvider, createDefaultResolver, validatePack, ThreeRenderer, HudUI } = await import('rpgkit');
      const errors = validatePack(pack).filter((i) => i.level === 'error');
      if (errors.length) { console.error(errors); return; }          // never load an invalid AI-generated pack
      const game = new Game(pack, {
        providers: [
          new LLMProvider({ complete: async (r) => (await fetch('/api/npc', { method: 'POST', body: JSON.stringify(r) })).text() }),
          new ScriptedProvider(),                                      // automatic fallback if the LLM call fails
        ],
      });
      const renderer = new ThreeRenderer(game, { container: ref.current!, resolver: createDefaultResolver() });
      new HudUI(game, ref.current!);
      await renderer.init(); renderer.start();
      dispose = () => renderer.dispose();
    })();
    return () => dispose();
  }, [pack]);
  return <div ref={ref} style={{ position: 'relative', width: '100%', height: '100vh' }} />;
}
