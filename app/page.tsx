import { buildWorld } from '@/world/compiler';
import { RPA_ARCHITECTURE } from '@/fixtures/rpaArchitecture';
import { ECOMMERCE_ARCHITECTURE } from '@/fixtures/ecommerceArchitecture';
import { RPA_STORY_EVENTS } from '@/fixtures/rpaStory';
import { WorldStudio } from '@/components/visualization/WorldStudio';

/**
 * Server component.
 *
 * Renders a default world so the page is useful immediately, then hands control
 * to the client studio, which can analyze any public repository the user pastes.
 *
 * The deterministic pipeline runs on the server for the initial world:
 * Architecture Graph -> World Specification -> Placed World Specification.
 */

export interface PageProps {
  searchParams: { repo?: string };
}

export default function Page({ searchParams }: PageProps) {
  const repo = searchParams.repo === 'shopfront' ? 'shopfront' : 'rpa-agent';

  const source = repo === 'shopfront' ? ECOMMERCE_ARCHITECTURE : RPA_ARCHITECTURE;
  const { architecture } = buildWorld(source);

  const label = `${architecture.repository.owner ?? ''}/${architecture.repository.name}`.replace(/^\//, '');

  return (
    <main style={{ width: '100vw', height: '100vh', position: 'relative' }}>
      <WorldStudio
        initialArchitecture={architecture}
        initialLabel={label}
        initialEvents={repo === 'rpa-agent' ? RPA_STORY_EVENTS : []}
      />
    </main>
  );
}