/**
 * Hash routing for the dashboard.
 *
 * Everything is one static page, so navigation lives in the URL fragment. A
 * route is one of:
 *   #this-round                a top-level tab
 *   #standings, #players, ...
 *   #player/<slug>             a deep player page
 *   #round/<n>                 a single round
 *   #demo:<tab>                load the sample league on a tab (legacy form)
 *
 * Old fragments from the previous layouts are redirected so shared links and
 * bookmarks keep working.
 */

export type TabId =
  | 'This Round'
  | 'Standings'
  | 'Players'
  | 'Songs'
  | 'Room'
  | 'Rounds';

export const TABS: TabId[] = ['This Round', 'Standings', 'Players', 'Songs', 'Room', 'Rounds'];

export type Route =
  | { kind: 'tab'; tab: TabId }
  | { kind: 'player'; slug: string }
  | { kind: 'round'; sequence: number };

/** Old tab/segment names → new tab. Keeps existing links alive. */
const REDIRECTS: Record<string, TabId> = {
  overview: 'This Round',
  'this-round': 'This Round',
  standings: 'Standings',
  'the race': 'Standings',
  'the-race': 'Standings',
  race: 'Standings',
  future: 'Standings',
  players: 'Players',
  songs: 'Songs',
  'the songs': 'Songs',
  'the-songs': 'Songs',
  room: 'Room',
  'the room': 'Room',
  'the-room': 'Room',
  voting: 'Room',
  network: 'Room',
  rounds: 'Rounds',
  'play-by-play': 'Rounds',
  participation: 'Rounds',
};

const slugToTab = new Map<string, TabId>(TABS.map((t) => [tabSlug(t), t]));

export function tabSlug(tab: TabId): string {
  return tab.toLowerCase().replace(/\s+/g, '-');
}

export interface ParsedHash {
  demo: boolean;
  route: Route;
}

export function parseHash(hash: string): ParsedHash {
  const raw = decodeURIComponent(hash.replace(/^#/, '')).trim();

  // Legacy "#demo:Tab" form loads the sample league on a tab.
  const [head, tail] = raw.split(':');
  const demo = head.toLowerCase() === 'demo';
  const body = (demo ? tail ?? '' : raw).trim();

  const [segment, arg] = body.split('/');
  const key = segment.toLowerCase();

  if (key === 'player' && arg) return { demo, route: { kind: 'player', slug: arg.toLowerCase() } };
  if (key === 'round' && arg && /^\d+$/.test(arg)) {
    return { demo, route: { kind: 'round', sequence: Number(arg) } };
  }

  const direct = slugToTab.get(key);
  const redirected = REDIRECTS[key] ?? REDIRECTS[body.toLowerCase()];
  return { demo, route: { kind: 'tab', tab: direct ?? redirected ?? 'This Round' } };
}

/** The hash for a route, without the leading '#'. */
export function routeToHash(route: Route): string {
  switch (route.kind) {
    case 'tab':
      return tabSlug(route.tab);
    case 'player':
      return `player/${route.slug}`;
    case 'round':
      return `round/${route.sequence}`;
  }
}
