import type { LandmarkArchetype } from '../schemas/landmark';
import type { DistrictBiome } from '../schemas/tilemap';
import type { NpcRole } from '../schemas/npc';
import type { NarrativeRole } from '../schemas/narrative';

/**
 * Story-world flavour — names, biomes, rumors.
 *
 * Architecture decides STRUCTURE (where districts sit, which hall is which).
 * This module decides how that structure FEELS: a district of archives is not
 * just a beige floor, it is "The Quiet Stacks" with a rumor and a palette.
 *
 * Fully deterministic. Never invents components.
 */

export interface BiomeStyle {
  biome: DistrictBiome;
  color: string;
  plazaColor: string;
  treeKind: 'tree' | 'rock' | 'bush';
}

const BIOME_BY_ARCHETYPE: Record<LandmarkArchetype, DistrictBiome> = {
  guild_hall: 'commons',
  command_tower: 'towers',
  observatory: 'towers',
  town_hall: 'markets',
  workshop: 'forges',
  tower: 'towers',
  archive: 'archives',
  memory_vault: 'archives',
  storehouse: 'markets',
  dispatch_depot: 'gates',
  courier_station: 'gates',
  forge: 'forges',
  laboratory: 'forges',
  portal: 'gates',
  realm_gate: 'gates',
  camp: 'camps',
};

export const BIOME_STYLES: Record<DistrictBiome, BiomeStyle> = {
  commons: { biome: 'commons', color: '#e8d5b7', plazaColor: '#c9b48a', treeKind: 'tree' },
  archives: { biome: 'archives', color: '#c9d4e0', plazaColor: '#9aa7b8', treeKind: 'bush' },
  forges: { biome: 'forges', color: '#d9a066', plazaColor: '#c97b3c', treeKind: 'rock' },
  towers: { biome: 'towers', color: '#cdb4db', plazaColor: '#9b7bb8', treeKind: 'tree' },
  gates: { biome: 'gates', color: '#b8e0d2', plazaColor: '#6aa89a', treeKind: 'bush' },
  camps: { biome: 'camps', color: '#f4c27a', plazaColor: '#d4a05a', treeKind: 'tree' },
  markets: { biome: 'markets', color: '#ffc8dd', plazaColor: '#e89ab8', treeKind: 'bush' },
  gardens: { biome: 'gardens', color: '#c3e0a8', plazaColor: '#8fbf6a', treeKind: 'tree' },
};

const DISTRICT_TITLES: Record<DistrictBiome, string[]> = {
  commons: ['The Commons', 'The Gathering Green', 'Heartsquare'],
  archives: ['The Quiet Stacks', 'The Memory Ward', 'The Ledger Halls'],
  forges: ['The Emberworks', 'The Making Yards', 'Cinder Row'],
  towers: ['The High Watch', 'The Spire Quarter', 'Skyward Lane'],
  gates: ['The Crossing', 'Wayfarer Gate', 'The Outward Road'],
  camps: ['The Resting Grounds', 'Traveller Camp', 'Low Hearth'],
  markets: ['The Counting Fair', 'Stallrow', 'The Daymarket'],
  gardens: ['The Soft Orchard', 'Greenward', 'The Still Groves'],
};

const GIVEN_NAMES = [
  'Maren', 'Calder', 'Ilya', 'Soren', 'Nessa', 'Bram', 'Tamsin', 'Orrin',
  'Lira', 'Edric', 'Ysolde', 'Kael', 'Rowan', 'Petra', 'Wynn', 'Harlan',
  'Elowen', 'Torin', 'Mira', 'Joss', 'Anwen', 'Rook', 'Selene', 'Dace',
];

const ROLE_TITLES: Record<NarrativeRole, string[]> = {
  guide: ['the Pathkeeper', 'who remembers the roads', 'of the First Gate'],
  mentor: ['the Keeper', 'who teaches the old ways', 'of the High Hall'],
  guardian: ['the Warden', 'who bars the unready', 'of the Threshold'],
  artisan: ['the Maker', 'of the Emberworks', 'who shapes what others use'],
  archivist: ['the Rememberer', 'of the Quiet Stacks', 'who never forgets a debt'],
  messenger: ['the Runner', 'of the Crossing', 'who carries what cannot wait'],
  sentinel: ['the Watcher', 'of the High Spire', 'who sees the strain first'],
  villain: ['the Hollow', 'who drinks the weight', 'of the Unraveling'],
  ally: ['the Companion', 'who walks beside', 'of the Low Hearth'],
};

const RUMORS: Record<DistrictBiome, string[]> = {
  commons: [
    'They say every road in this realm begins here, whether it admits it or not.',
    'Stand still long enough and you will hear the whole town arguing with itself.',
  ],
  archives: [
    'The shelves remember more than the people who built them.',
    'If a fact goes missing, it is usually found here — or it was never true.',
  ],
  forges: [
    'Nothing in this town is finished until it has been through the fire.',
    'The makers complain that everyone leans on their work and nobody visits.',
  ],
  towers: [
    'From the spire you can see which halls are load-bearing and which only look it.',
    'The watchers never sleep. They say the strain shows first as a light in a window.',
  ],
  gates: [
    'Couriers never walk; they run, and they never carry the same thing twice.',
    'Whatever leaves this town leaves through here. Whatever returns, too.',
  ],
  camps: [
    'Travellers sleep here because the halls will not have them after dark.',
    'A rumor started in the camp is in every district by morning.',
  ],
  markets: [
    'You can buy a fact here, but you cannot buy the whole story.',
    'The stalls change every day. The debts do not.',
  ],
  gardens: [
    'The orchard is the only quiet left. Even the roads go around it.',
    'Something old is planted here. Nobody agrees what it is growing into.',
  ],
};

function hashString(value: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function pick<T>(items: readonly T[], seed: string): T {
  return items[hashString(seed) % items.length]!;
}

export function biomeForArchetypes(archetypes: readonly string[]): DistrictBiome {
  if (archetypes.length === 0) return 'commons';
  const counts = new Map<DistrictBiome, number>();
  for (const archetype of archetypes) {
    const biome = BIOME_BY_ARCHETYPE[archetype as LandmarkArchetype] ?? 'commons';
    counts.set(biome, (counts.get(biome) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]![0];
}

export function biomeStyle(biome: DistrictBiome): BiomeStyle {
  return BIOME_STYLES[biome];
}

export function districtTitle(biome: DistrictBiome, zoneId: string, fallback: string): string {
  if (zoneId === 'zone_commons') return pick(DISTRICT_TITLES.commons, zoneId);
  const titled = pick(DISTRICT_TITLES[biome], zoneId);
  return fallback && fallback !== zoneId ? `${titled}` : titled;
}

export function districtRumor(biome: DistrictBiome, zoneId: string): string {
  return pick(RUMORS[biome], zoneId);
}

export function characterGivenName(entityId: string, role?: NarrativeRole): string {
  // Include the role so two halls with the same id-hash do not share a name.
  return pick(GIVEN_NAMES, `name:${entityId}:${role ?? ''}`);
}

export function characterFullName(entityId: string, role: NarrativeRole): string {
  const given = characterGivenName(entityId, role);
  const title = pick(ROLE_TITLES[role], `title:${entityId}`);
  return `${given} ${title}`;
}

export function ambientTownsfolkName(seed: string): string {
  return pick(GIVEN_NAMES, `folk:${seed}`);
}

export function ambientTownsfolkRole(seed: string): NpcRole {
  const roles: NpcRole[] = ['wanderer', 'courier', 'artisan', 'scholar'];
  return pick(roles, `role:${seed}`);
}

export function ambientGreeting(biome: DistrictBiome, seed: string): string {
  const lines = [
    districtRumor(biome, seed),
    'Keep to the roads. The halls do not like to be surprised.',
    'If you are looking for the Guide, they never stray far from the first hall.',
    'I only live here. The halls are the ones with the stories.',
  ];
  return pick(lines, `greet:${seed}`);
}
