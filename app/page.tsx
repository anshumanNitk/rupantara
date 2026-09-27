import { buildWorld } from '@/world/compiler';
import { RPA_ARCHITECTURE } from '@/fixtures/rpaArchitecture';
import { ECOMMERCE_ARCHITECTURE } from '@/fixtures/ecommerceArchitecture';
import { RPA_STORY_EVENTS } from '@/fixtures/rpaStory';
import { WorldExplorer } from '@/components/visualization/WorldExplorer';

/**
 * Server component.
 *
 * The deterministic pipeline runs on the server: Architecture Graph -> World
 * Specification -> Placed World Specification. The client receives only data.
 * This is the boundary that keeps "architecture is data" true.
 */

export interface PageProps {
  searchParams: { repo?: string };
}

export default function Page({ searchParams }: PageProps) {
  const repo = searchParams.repo === 'shopfront' ? 'shopfront' : 'rpa-agent';

  const source = repo === 'shopfront' ? ECOMMERCE_ARCHITECTURE : RPA_ARCHITECTURE;
  const { architecture, world, placed } = buildWorld(source);

  return (
    <main style={{ width: '100vw', height: '100vh', position: 'relative' }}>
      <WorldExplorer
        architecture={architecture}
        world={world}
        placed={placed}
        initialEvents={repo === 'rpa-agent' ? RPA_STORY_EVENTS : []}
      />
    </main>
  );
}