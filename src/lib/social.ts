import type { Stats } from './stats';

/**
 * Who votes with whom, as a graph.
 *
 * Every relationship figure is grounded in **net points** (`upvotes - downvotes`),
 * not raw upvotes alone: giving someone +5 and −5 across the season is a net 0
 * wash, not a friendship.
 *
 * The graph exposes three complementary views over the same deterministic
 * node positions:
 * 1. `directed` (`isTopBacker` / `isTopRival`): directional arrows (A → B) for
 *    who each voter actually backs or targets.
 * 2. `alliances` and `edges`: mutual warmth where *both* players are net-positive
 *    toward each other.
 * 3. `lopsided` and `feuds`: one-way crushes and net-negative rivalries.
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
  /** 0..1 mutual net warmth. */
  strength: number;
  /** Net positive points traded, for the tooltip. */
  traded: number;
  /** The quieter net direction, so an imbalance can be described. */
  weaker: number;
  /** Net points from `a` to `b`. */
  netAtoB: number;
  /** Net points from `b` to `a`. */
  netBtoA: number;
  /** Raw upvotes traded (both ways). */
  upvotesTraded: number;
  /** Raw downvotes traded (both ways). */
  downvotesTraded: number;
}

export interface DirectedEdge {
  from: string;
  to: string;
  upvotes: number;
  downvotes: number;
  /** Net points (`upvotes - downvotes`) from `from` to `to`. */
  net: number;
  /** Net points (`upvotes - downvotes`) in the reverse direction (`to` -> `from`). */
  reverseNet: number;
  opportunities: number;
  /** True when this is `from`'s #1 net-positive target (or a strong secondary tie >= +6). */
  isTopBacker: boolean;
  /** True when this is `from`'s #1 net-negative target (or a strong secondary rivalry <= -6). */
  isTopRival: boolean;
  /** True when both directions are positive and at least one is a top backer. */
  isMutualBacker: boolean;
  /** True when both directions are net-negative (`net < 0 && reverseNet < 0`). */
  isMutualRival: boolean;
}

export interface AllianceEdge {
  a: string;
  b: string;
  netAtoB: number;
  netBtoA: number;
  /** `Math.min(netAtoB, netBtoA)` — both > 0. */
  minNet: number;
  /** `netAtoB + netBtoA`. */
  totalNet: number;
  upvotesTraded: number;
  downvotesTraded: number;
}

export interface LopsidedEdge {
  from: string;
  to: string;
  net: number;
  reverseNet: number;
  upvotes: number;
  downvotes: number;
  reverseUpvotes: number;
  reverseDownvotes: number;
  /** `net - reverseNet`. */
  gap: number;
}

export interface FeudEdge {
  from: string;
  to: string;
  net: number;
  reverseNet: number;
  upvotes: number;
  downvotes: number;
  mutual: boolean;
  combinedNet: number;
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
  directed: DirectedEdge[];
  alliances: AllianceEdge[];
  lopsided: LopsidedEdge[];
  feuds: FeudEdge[];
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

/**
 * How many rounds' worth of league-average warmth an edge is assumed to start
 * with before the pair's own votes are counted.
 */
export const PRIOR_ROUNDS = 3;

/** Mutual net warmth for every pair that could vote for each other. */
function buildEdges(stats: Stats): GraphEdge[] {
  const index = new Map(stats.pairs.map((p) => [`${p.voterId}\u0000${p.targetId}`, p]));

  // Mutual means both directions after subtracting downvotes: a +5 / −5 wash
  // is net 0, not warmth.
  const raw: {
    a: string;
    b: string;
    mutual: number;
    evidence: number;
    traded: number;
    weaker: number;
    netAtoB: number;
    netBtoA: number;
    upvotesTraded: number;
    downvotesTraded: number;
  }[] = [];
  const seen = new Set<string>();
  for (const pair of stats.pairs) {
    const [first, second] = [pair.voterId, pair.targetId].sort();
    const key = `${first}\u0000${second}`;
    if (seen.has(key)) continue;
    const ab = index.get(`${first}\u0000${second}`);
    const ba = index.get(`${second}\u0000${first}`);
    if (!ab || !ba || ab.maxPossible <= 0 || ba.maxPossible <= 0) continue;
    seen.add(key);

    const netAB = ab.upvotes - ab.downvotes;
    const netBA = ba.upvotes - ba.downvotes;
    const posAB = Math.max(0, netAB);
    const posBA = Math.max(0, netBA);

    raw.push({
      a: first,
      b: second,
      mutual: Math.min(posAB / ab.maxPossible, posBA / ba.maxPossible),
      evidence: Math.min(ab.maxPossible, ba.maxPossible),
      traded: posAB + posBA,
      weaker: Math.min(posAB, posBA),
      netAtoB: netAB,
      netBtoA: netBA,
      upvotesTraded: ab.upvotes + ba.upvotes,
      downvotesTraded: ab.downvotes + ba.downvotes,
    });
  }

  const totalEvidence = raw.reduce((a, e) => a + e.evidence, 0);
  const baseline =
    totalEvidence > 0 ? raw.reduce((a, e) => a + e.mutual * e.evidence, 0) / totalEvidence : 0;
  const totalAllowed = stats.pairs.reduce((a, p) => a + p.maxPossible, 0);
  const totalOpportunities = stats.pairs.reduce((a, p) => a + p.opportunities, 0);
  const prior = totalOpportunities > 0 ? (totalAllowed / totalOpportunities) * PRIOR_ROUNDS : 0;

  const byPair = new Map<string, GraphEdge>();
  for (const e of raw) {
    byPair.set(`${e.a}\u0000${e.b}`, {
      a: e.a,
      b: e.b,
      strength: (e.mutual * e.evidence + baseline * prior) / (e.evidence + prior),
      traded: e.traded,
      weaker: e.weaker,
      netAtoB: e.netAtoB,
      netBtoA: e.netBtoA,
      upvotesTraded: e.upvotesTraded,
      downvotesTraded: e.downvotesTraded,
    });
  }

  return [...byPair.values()].sort(
    (x, y) => y.strength - x.strength || y.weaker - x.weaker || x.a.localeCompare(y.a),
  );
}

/** Build directional net edges, alliances, one-way crushes, and feuds. */
function buildDirectional(
  ids: string[],
  stats: Stats,
): {
  directed: DirectedEdge[];
  alliances: AllianceEdge[];
  lopsided: LopsidedEdge[];
  feuds: FeudEdge[];
} {
  const idSet = new Set(ids);
  const validPairs = stats.pairs.filter(
    (p) => idSet.has(p.voterId) && idSet.has(p.targetId) && p.voterId !== p.targetId,
  );
  const byKey = new Map(validPairs.map((p) => [`${p.voterId}\u0000${p.targetId}`, p]));

  // Find each voter's #1 net-positive target and #1 net-negative target.
  const topBackerKey = new Set<string>();
  const topRivalKey = new Set<string>();

  for (const voterId of ids) {
    const outgoing = validPairs.filter((p) => p.voterId === voterId);
    const revNet = (targetId: string) =>
      byKey.get(`${targetId}\u0000${voterId}`)?.net ?? 0;
    const pos = outgoing
      .filter((p) => p.net > 0)
      .sort(
        (a, b) =>
          b.net - a.net ||
          b.upvotes - a.upvotes ||
          a.downvotes - b.downvotes ||
          revNet(b.targetId) - revNet(a.targetId) ||
          b.opportunities - a.opportunities ||
          a.targetId.localeCompare(b.targetId),
      );
    if (pos.length > 0) {
      // Always pick the single strongest #1 net recipient (tie-broken by who
      // reciprocates most), plus any secondary recipient with net >= +6.
      topBackerKey.add(`${pos[0].voterId}\u0000${pos[0].targetId}`);
      for (const p of pos.slice(1)) {
        if (p.net >= 6) {
          topBackerKey.add(`${p.voterId}\u0000${p.targetId}`);
        }
      }
    }

    const neg = outgoing
      .filter((p) => p.net < 0)
      .sort(
        (a, b) =>
          a.net - b.net ||
          b.downvotes - a.downvotes ||
          b.opportunities - a.opportunities ||
          a.targetId.localeCompare(b.targetId),
      );
    if (neg.length > 0 && neg[0].net <= -3) {
      topRivalKey.add(`${neg[0].voterId}\u0000${neg[0].targetId}`);
      for (const p of neg.slice(1)) {
        if (p.net <= -6) {
          topRivalKey.add(`${p.voterId}\u0000${p.targetId}`);
        }
      }
    }
  }

  const directed: DirectedEdge[] = [];
  for (const p of validPairs) {
    if (p.upvotes === 0 && p.downvotes === 0) continue;
    const rev = byKey.get(`${p.targetId}\u0000${p.voterId}`);
    const reverseNet = rev ? rev.net : 0;
    const key = `${p.voterId}\u0000${p.targetId}`;
    const revKey = `${p.targetId}\u0000${p.voterId}`;
    const isTopBacker = topBackerKey.has(key);
    const isTopRival = topRivalKey.has(key);
    const isMutualBacker =
      p.net > 0 && reverseNet > 0 && (isTopBacker || topBackerKey.has(revKey));
    const isMutualRival = p.net < 0 && reverseNet < 0;

    directed.push({
      from: p.voterId,
      to: p.targetId,
      upvotes: p.upvotes,
      downvotes: p.downvotes,
      net: p.net,
      reverseNet,
      opportunities: p.opportunities,
      isTopBacker,
      isTopRival,
      isMutualBacker,
      isMutualRival,
    });
  }

  directed.sort(
    (a, b) =>
      Math.abs(b.net) - Math.abs(a.net) ||
      b.upvotes + b.downvotes - (a.upvotes + a.downvotes) ||
      a.from.localeCompare(b.from),
  );

  // Mutual alliances: both sides strictly net-positive.
  const alliances: AllianceEdge[] = [];
  const seenUndirected = new Set<string>();
  for (const p of validPairs) {
    const [first, second] = [p.voterId, p.targetId].sort();
    const uKey = `${first}\u0000${second}`;
    if (seenUndirected.has(uKey)) continue;
    seenUndirected.add(uKey);
    const ab = byKey.get(`${first}\u0000${second}`);
    const ba = byKey.get(`${second}\u0000${first}`);
    if (!ab || !ba) continue;
    if (ab.net > 0 && ba.net > 0) {
      alliances.push({
        a: first,
        b: second,
        netAtoB: ab.net,
        netBtoA: ba.net,
        minNet: Math.min(ab.net, ba.net),
        totalNet: ab.net + ba.net,
        upvotesTraded: ab.upvotes + ba.upvotes,
        downvotesTraded: ab.downvotes + ba.downvotes,
      });
    }
  }
  alliances.sort(
    (x, y) =>
      y.minNet - x.minNet ||
      y.totalNet - x.totalNet ||
      x.downvotesTraded - y.downvotesTraded ||
      x.a.localeCompare(y.a),
  );

  // One-way crushes: `from` is strongly net-positive toward `to` (`net >= 4`),
  // while `to` gives much less (or negative!) back (`gap >= 4`).
  const lopsided: LopsidedEdge[] = [];
  for (const p of validPairs) {
    if (p.net < 4) continue;
    const rev = byKey.get(`${p.targetId}\u0000${p.voterId}`);
    const reverseNet = rev ? rev.net : 0;
    const gap = p.net - reverseNet;
    if (gap < 4) continue;
    lopsided.push({
      from: p.voterId,
      to: p.targetId,
      net: p.net,
      reverseNet,
      upvotes: p.upvotes,
      downvotes: p.downvotes,
      reverseUpvotes: rev?.upvotes ?? 0,
      reverseDownvotes: rev?.downvotes ?? 0,
      gap,
    });
  }
  lopsided.sort((a, b) => b.gap - a.gap || b.net - a.net || a.from.localeCompare(b.from));

  // Feuds: top net-negative relationships, deduplicating mutual feuds so a
  // mutual feud appears once oriented from the harsher side.
  const feuds: FeudEdge[] = [];
  const seenFeudPair = new Set<string>();
  for (const p of validPairs) {
    if (p.net >= 0) continue;
    const rev = byKey.get(`${p.targetId}\u0000${p.voterId}`);
    const reverseNet = rev ? rev.net : 0;
    const mutual = reverseNet < 0;
    if (mutual) {
      const uKey = [p.voterId, p.targetId].sort().join('\u0000');
      if (seenFeudPair.has(uKey)) continue;
      seenFeudPair.add(uKey);
      const harsher =
        p.net < reverseNet || (p.net === reverseNet && p.downvotes >= (rev?.downvotes ?? 0))
          ? p
          : rev!;
      const other = harsher === p ? rev! : p;
      if (harsher.net + other.net <= -4 || harsher.net <= -4) {
        feuds.push({
          from: harsher.voterId,
          to: harsher.targetId,
          net: harsher.net,
          reverseNet: other.net,
          upvotes: harsher.upvotes,
          downvotes: harsher.downvotes,
          mutual: true,
          combinedNet: harsher.net + other.net,
        });
      }
    } else if (p.net <= -5) {
      feuds.push({
        from: p.voterId,
        to: p.targetId,
        net: p.net,
        reverseNet,
        upvotes: p.upvotes,
        downvotes: p.downvotes,
        mutual: false,
        combinedNet: p.net + reverseNet,
      });
    }
  }
  feuds.sort(
    (a, b) =>
      a.net - b.net ||
      a.combinedNet - b.combinedNet ||
      b.downvotes - a.downvotes ||
      a.from.localeCompare(b.from),
  );

  return { directed, alliances, lopsided, feuds };
}

/**
 * Groups players by their strongest net-positive ties.
 */
function findClusters(
  ids: string[],
  edges: GraphEdge[],
  keepPerNode = 2,
): Map<string, number> {
  const byStrength = [...edges].sort(
    (x, y) => y.strength - x.strength || x.a.localeCompare(y.a) || x.b.localeCompare(y.b),
  );

  const kept = new Set<GraphEdge>();
  for (const id of ids) {
    const mine = byStrength
      .filter((e) => (e.a === id || e.b === id) && e.weaker > 0)
      .slice(0, keepPerNode);
    for (const edge of mine) kept.add(edge);
  }

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

  const biggest = Math.max(...[...groups.values()].map((g) => g.length));
  if (keepPerNode > 1 && biggest > Math.max(2, ids.length * 0.7)) {
    return findClusters(ids, edges, keepPerNode - 1);
  }

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
 * Spring layout: mutual and directional net support pulls together,
 * everything pushes apart. Deterministic.
 */
function layout(
  ids: string[],
  edges: GraphEdge[],
  directed: DirectedEdge[],
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
  const topBonus = new Map<string, number>();
  for (const d of directed) {
    if (d.isTopBacker && d.net > 0) {
      const k = [d.from, d.to].sort().join('\u0000');
      topBonus.set(k, (topBonus.get(k) ?? 0) + 0.22 + d.net * 0.025);
    }
  }
  const between = (a: string, b: string) => {
    const k = [a, b].sort().join('\u0000');
    return (strength.get(k) ?? 0) + (topBonus.get(k) ?? 0);
  };

  const repulsion = 300;
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
          dx = (i - j) * 0.01;
          dy = 0.01;
          dist = Math.hypot(dx, dy);
        }
        const push = repulsion / (dist * dist);
        const sameCluster = clusters.get(a) === clusters.get(b);
        const hasTopLink = (topBonus.get([a, b].sort().join('\u0000')) ?? 0) > 0;
        const affinity = between(a, b) * (sameCluster || hasTopLink ? 1.8 : 0.6);
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
      p.x += (50 - p.x) * 0.012;
      p.y += (50 - p.y) * 0.012;
    }
  }

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
    p.x = 10 + ((p.x - minX) / spanX) * 80;
    p.y = 12 + ((p.y - minY) / spanY) * 76;
  }
  return pos;
}

export function socialGraph(stats: Stats): SocialGraph {
  const players = stats.players.filter((p) => p.roundsVoted > 0 || p.songs > 0);
  const ids = players.map((p) => p.playerId).sort();
  const edges = buildEdges(stats).filter((e) => ids.includes(e.a) && ids.includes(e.b));

  if (ids.length < 2 || !edges.length) {
    return {
      nodes: [],
      edges: [],
      directed: [],
      alliances: [],
      lopsided: [],
      feuds: [],
      clusters: [],
      average: 0,
      distinct: false,
    };
  }

  const { directed, alliances, lopsided, feuds } = buildDirectional(ids, stats);
  const average = edges.reduce((sum, e) => sum + e.strength, 0) / edges.length;
  const clusters = findClusters(ids, edges);
  const positions = layout(ids, edges, directed, clusters);

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

  const biggest = Math.max(...clusterList.map((c) => c.members.length));
  const distinct = clusterList.length > 1 && biggest <= Math.max(2, ids.length * 0.7);

  return {
    nodes,
    edges,
    directed,
    alliances,
    lopsided,
    feuds,
    clusters: clusterList,
    average,
    distinct,
  };
}
