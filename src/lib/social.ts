import type { Stats } from './stats';

/**
 * Who votes with whom, as a graph.
 *
 * An edge is the *mutual* warmth between two players: what they gave each
 * other as a share of what they were allowed to give. Using the mutual figure
 * rather than the sum means a one-way crush does not read as a friendship, and
 * normalising by what the rules allowed keeps players with different numbers of
 * shared rounds comparable.
 *
 * The layout and the clustering are both deterministic — no randomness, fixed
 * iteration counts — so the same export always draws the same picture.
 */

export interface GraphNode {
  id: string;
  name: string;
  /** Position in a 0..100 square. */
  x: number;
  y: number;
  /** Points scored, for sizing. */
  score: number;
  /** Index of the cluster this player fell into. */
  cluster: number;
  /** Sum of this player's edge strengths, i.e. how connected they are. */
  warmth: number;
}

export interface GraphEdge {
  a: string;
  b: string;
  /** 0..1 mutual warmth. */
  strength: number;
  /** Points traded, for the tooltip. */
  traded: number;
  /** The quieter direction, so an imbalance can be described. */
  weaker: number;
}

export interface Cluster {
  index: number;
  members: string[];
  /** Mean edge strength inside the cluster. */
  internal: number;
  /** Mean edge strength from these members to everyone else. */
  external: number;
}

export interface SocialGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
  clusters: Cluster[];
  /** Mean strength across all pairs, the baseline a cluster is measured against. */
  average: number;
  /**
   * False when the league does not really split into groups — everyone votes
   * for everyone at much the same rate. Saying so is more useful than drawing
   * one blob and calling it a cluster.
   */
  distinct: boolean;
}

/** Mutual warmth for every pair that could vote for each other. */
function buildEdges(stats: Stats): GraphEdge[] {
  const byPair = new Map<string, GraphEdge>();

  for (const pair of stats.pairs) {
    const [first, second] = [pair.voterId, pair.targetId].sort();
    const key = `${first}\u0000${second}`;
    const reverse = stats.pairs.find(
      (p) => p.voterId === pair.targetId && p.targetId === pair.voterId,
    );
    if (!reverse || byPair.has(key)) continue;

    const allowed = pair.maxPossible + reverse.maxPossible;
    if (allowed <= 0) continue;
    byPair.set(key, {
      a: first,
      b: second,
      strength: (pair.upvotes + reverse.upvotes) / allowed,
      traded: pair.upvotes + reverse.upvotes,
      weaker: Math.min(pair.upvotes, reverse.upvotes),
    });
  }

  return [...byPair.values()].sort(
    (x, y) => y.strength - x.strength || x.a.localeCompare(y.a),
  );
}

/**
 * Groups players by their strongest ties.
 *
 * Label propagation was the obvious choice and it does not work here: in a
 * league everyone votes for everyone at least a little, so the graph is dense
 * and propagation converges on a single community that says nothing. Instead
 * each player keeps only their few warmest relationships, and the groups are the
 * connected components of what remains. That answers the actual question —
 * whose company do you keep — and is stable without tuning.
 */
function findClusters(
  ids: string[],
  edges: GraphEdge[],
  keepPerNode = 2,
): Map<string, number> {
  const byStrength = [...edges].sort(
    (x, y) => y.strength - x.strength || x.a.localeCompare(y.a) || x.b.localeCompare(y.b),
  );

  // Each player nominates their warmest few. An edge survives if either end
  // nominated it, so a lopsided-but-strong tie still connects.
  const kept = new Set<GraphEdge>();
  for (const id of ids) {
    const mine = byStrength.filter((e) => e.a === id || e.b === id).slice(0, keepPerNode);
    for (const edge of mine) if (edge.strength > 0) kept.add(edge);
  }

  // Union-find over the surviving edges.
  const parent = new Map(ids.map((id) => [id, id]));
  const find = (id: string): string => {
    let root = id;
    while (parent.get(root) !== root) root = parent.get(root)!;
    return root;
  };
  const union = (a: string, b: string) => {
    const [ra, rb] = [find(a), find(b)].sort();
    if (ra !== rb) parent.set(rb, ra);
  };
  for (const edge of kept) union(edge.a, edge.b);

  const groups = new Map<string, string[]>();
  for (const id of ids) {
    const root = find(id);
    groups.set(root, [...(groups.get(root) ?? []), id]);
  }

  // One group swallowing the league is not a finding: tighten and retry.
  const biggest = Math.max(...[...groups.values()].map((g) => g.length));
  if (keepPerNode > 1 && biggest > Math.max(2, ids.length * 0.7)) {
    return findClusters(ids, edges, keepPerNode - 1);
  }

  // Renumber so clusters read 0, 1, 2… by size then by first member.
  const ordered = [...groups.values()].sort(
    (x, y) => y.length - x.length || x[0].localeCompare(y[0]),
  );
  const renumbered = new Map<string, number>();
  ordered.forEach((members, index) => {
    for (const id of members) renumbered.set(id, index);
  });
  return renumbered;
}

/**
 * Spring layout: edges pull, everything pushes apart.
 *
 * Positions start on a circle rather than at random, and the iteration count is
 * fixed, so the drawing is reproducible.
 */
function layout(
  ids: string[],
  edges: GraphEdge[],
  clusters: Map<string, number>,
  iterations = 400,
): Map<string, { x: number; y: number }> {
  const n = ids.length;
  const pos = new Map<string, { x: number; y: number }>();
  ids.forEach((id, i) => {
    const angle = (i / n) * Math.PI * 2;
    pos.set(id, { x: 50 + Math.cos(angle) * 34, y: 50 + Math.sin(angle) * 34 });
  });
  if (n < 3) return pos;

  const strength = new Map<string, number>();
  for (const edge of edges) strength.set(`${edge.a}\u0000${edge.b}`, edge.strength);
  const between = (a: string, b: string) =>
    strength.get(`${a}\u0000${b}`) ?? strength.get(`${b}\u0000${a}`) ?? 0;

  const repulsion = 260;
  for (let step = 0; step < iterations; step += 1) {
    const cooling = 1 - step / iterations;
    const force = new Map(ids.map((id) => [id, { x: 0, y: 0 }]));

    for (let i = 0; i < n; i += 1) {
      for (let j = i + 1; j < n; j += 1) {
        const a = ids[i];
        const b = ids[j];
        const pa = pos.get(a)!;
        const pb = pos.get(b)!;
        let dx = pa.x - pb.x;
        let dy = pa.y - pb.y;
        let dist = Math.hypot(dx, dy);
        if (dist < 0.01) {
          // Deterministic nudge for coincident nodes.
          dx = (i - j) * 0.01;
          dy = 0.01;
          dist = Math.hypot(dx, dy);
        }
        const push = repulsion / (dist * dist);
        // Pull harder within a cluster than across one. The affinity itself is
        // never invented — only how strongly it is allowed to draw two nodes
        // together — which keeps camps legible instead of collapsing them into
        // one ring.
        const sameCluster = clusters.get(a) === clusters.get(b);
        const affinity = between(a, b) * (sameCluster ? 2 : 0.5);
        const pull = affinity * dist * 0.09;
        const net = (pull - push) / dist;
        const fa = force.get(a)!;
        const fb = force.get(b)!;
        fa.x -= dx * net;
        fa.y -= dy * net;
        fb.x += dx * net;
        fb.y += dy * net;
      }
    }

    for (const id of ids) {
      const p = pos.get(id)!;
      const f = force.get(id)!;
      p.x += Math.max(-4, Math.min(4, f.x)) * cooling;
      p.y += Math.max(-4, Math.min(4, f.y)) * cooling;
      // Pull gently back toward the middle so nothing drifts off the canvas.
      p.x += (50 - p.x) * 0.012;
      p.y += (50 - p.y) * 0.012;
    }
  }

  // Rescale to fill the canvas with a margin.
  const xs = ids.map((id) => pos.get(id)!.x);
  const ys = ids.map((id) => pos.get(id)!.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const spanX = Math.max(1, maxX - minX);
  const spanY = Math.max(1, maxY - minY);
  for (const id of ids) {
    const p = pos.get(id)!;
    p.x = 8 + ((p.x - minX) / spanX) * 84;
    p.y = 8 + ((p.y - minY) / spanY) * 84;
  }
  return pos;
}

export function socialGraph(stats: Stats): SocialGraph {
  const players = stats.players.filter((p) => p.roundsVoted > 0 || p.songs > 0);
  const ids = players.map((p) => p.playerId).sort();
  const edges = buildEdges(stats).filter((e) => ids.includes(e.a) && ids.includes(e.b));

  if (ids.length < 2 || !edges.length) {
    return { nodes: [], edges: [], clusters: [], average: 0, distinct: false };
  }

  const average = edges.reduce((sum, e) => sum + e.strength, 0) / edges.length;
  const clusters = findClusters(ids, edges);
  const positions = layout(ids, edges, clusters);

  const warmth = new Map(ids.map((id) => [id, 0]));
  for (const edge of edges) {
    warmth.set(edge.a, (warmth.get(edge.a) ?? 0) + edge.strength);
    warmth.set(edge.b, (warmth.get(edge.b) ?? 0) + edge.strength);
  }

  const nodes: GraphNode[] = players
    .map((player) => ({
      id: player.playerId,
      name: player.name,
      x: positions.get(player.playerId)?.x ?? 50,
      y: positions.get(player.playerId)?.y ?? 50,
      score: player.pointsCounted,
      cluster: clusters.get(player.playerId) ?? 0,
      warmth: warmth.get(player.playerId) ?? 0,
    }))
    .sort((a, b) => a.cluster - b.cluster || b.warmth - a.warmth);

  // Describe each cluster by how much warmer it is inside than out.
  const nameOf = new Map(players.map((p) => [p.playerId, p.name]));
  const groups = new Map<number, string[]>();
  for (const id of ids) {
    const index = clusters.get(id) ?? 0;
    groups.set(index, [...(groups.get(index) ?? []), id]);
  }

  const clusterList: Cluster[] = [...groups.entries()]
    .map(([index, members]) => {
      const inside = edges.filter((e) => members.includes(e.a) && members.includes(e.b));
      const crossing = edges.filter(
        (e) => members.includes(e.a) !== members.includes(e.b),
      );
      const mean = (list: GraphEdge[]) =>
        list.length ? list.reduce((sum, e) => sum + e.strength, 0) / list.length : 0;
      return {
        index,
        members: members.map((id) => nameOf.get(id) ?? id).sort(),
        internal: mean(inside),
        external: mean(crossing),
      };
    })
    .sort((a, b) => b.members.length - a.members.length || a.index - b.index);

  // A single cluster holding nearly everyone is not a finding.
  const biggest = Math.max(...clusterList.map((c) => c.members.length));
  const distinct = clusterList.length > 1 && biggest <= Math.max(2, ids.length * 0.7);

  return { nodes, edges, clusters: clusterList, average, distinct };
}
