import { useMemo, useState } from 'react';
import type { Stats } from '../lib/stats';
import {
  socialGraph,
  type AllianceEdge,
  type DirectedEdge,
  type GraphNode,
} from '../lib/social';
import { InfoTip } from './InfoTip';
import { Card, Empty, n1 } from './ui';

/** Cluster colours, kept distinct and stable by index. */
const CLUSTER_COLOURS = [
  'hsl(320 72% 62%)',
  'hsl(178 62% 55%)',
  'hsl(45 82% 62%)',
  'hsl(258 68% 68%)',
  'hsl(140 55% 58%)',
  'hsl(15 78% 62%)',
];

const POS_STROKE = '#3dd68c';
const NEG_STROKE = '#f26d7d';
const ALLY_STROKE = '#5ec8f8';

const colourFor = (cluster: number): string =>
  CLUSTER_COLOURS[cluster % CLUSTER_COLOURS.length];

type GraphLens = 'backers' | 'alliances' | 'rivalries';

const fmtSigned = (n: number): string => (n > 0 ? `+${n1(n)}` : `${n1(n)}`);

interface RenderedArc {
  key: string;
  d: string;
  mx: number;
  my: number;
  label: string;
  stroke: string;
  width: number;
  dashed?: boolean;
  markerEnd?: string;
  markerStart?: string;
  dimmed: boolean;
  tooltip: string;
}

/**
 * Compute quadratic Bezier path and midpoint between two nodes in 160×100 SVG space.
 */
function buildArcGeometry(
  from: { sx: number; sy: number; r: number },
  to: { sx: number; sy: number; r: number },
  curveOffset: number,
  padStart = 0.6,
  padEnd = 1.4,
  badgeT = 0.54,
): { d: string; mx: number; my: number } {
  const dx = to.sx - from.sx;
  const dy = to.sy - from.sy;
  const dist = Math.max(0.01, Math.hypot(dx, dy));
  const ux = dx / dist;
  const uy = dy / dist;
  // Right-hand normal so A->B and B->A bow on opposite sides.
  const nx = -uy;
  const ny = ux;

  // Keep bidirectional arcs bowed out by at least 4.8 units so opposing pills never touch.
  const scaledOffset =
    curveOffset > 3.5
      ? Math.max(5.2, curveOffset)
      : curveOffset * Math.min(1, dist / 24);
  const cx = (from.sx + to.sx) / 2 + nx * scaledOffset;
  const cy = (from.sy + to.sy) / 2 + ny * scaledOffset;

  // Trim start/end along the actual tangent lines to the control point so
  // arrowheads aim directly at the target node's center.
  const dStart = Math.max(0.01, Math.hypot(cx - from.sx, cy - from.sy));
  const sx = from.sx + ((cx - from.sx) / dStart) * Math.min(dist * 0.4, from.r + padStart);
  const sy = from.sy + ((cy - from.sy) / dStart) * Math.min(dist * 0.4, from.r + padStart);

  const dEnd = Math.max(0.01, Math.hypot(to.sx - cx, to.sy - cy));
  const ex = to.sx - ((to.sx - cx) / dEnd) * Math.min(dist * 0.4, to.r + padEnd);
  const ey = to.sy - ((to.sy - cy) / dEnd) * Math.min(dist * 0.4, to.r + padEnd);

  const t = curveOffset > 3.5 ? 0.5 : badgeT;
  const omt = 1 - t;
  const mx = omt * omt * sx + 2 * omt * t * cx + t * t * ex;
  const my = omt * omt * sy + 2 * omt * t * cy + t * t * ey;

  const d =
    Math.abs(scaledOffset) < 0.05
      ? `M ${sx.toFixed(2)} ${sy.toFixed(2)} L ${ex.toFixed(2)} ${ey.toFixed(2)}`
      : `M ${sx.toFixed(2)} ${sy.toFixed(2)} Q ${cx.toFixed(2)} ${cy.toFixed(2)} ${ex.toFixed(2)} ${ey.toFixed(2)}`;

  return { d, mx, my };
}

/**
 * The league as a directional net-points network: who backs whom, who forms
 * mutual alliances, and where the downvotes land.
 */
export function SocialGraphPanel({ stats }: { stats: Stats }) {
  const graph = useMemo(() => socialGraph(stats), [stats]);
  const [lens, setLens] = useState<GraphLens>('backers');
  const [hoverId, setHoverId] = useState<string | undefined>();
  const [pinnedId, setPinnedId] = useState<string | undefined>();

  const MIN_ROUNDS = 3;
  if (stats.roundsPlayed < MIN_ROUNDS) {
    return (
      <Card title="Who votes with whom">
        <Empty>
          The network appears after {MIN_ROUNDS} rounds — {stats.roundsPlayed} played so far. One or
          two rounds of votes are too few to tell a friendship from a coincidence.
        </Empty>
      </Card>
    );
  }

  if (!graph.nodes.length) {
    return (
      <Card title="Who votes with whom">
        <Empty>
          Not enough vote data to draw a network. This needs at least two players who could
          vote for each other.
        </Empty>
      </Card>
    );
  }

  const activePlayerId = hoverId ?? pinnedId;

  // Map 0..100 node coordinates into the 160×100 landscape SVG viewBox and
  // normalize radii across the full [minScore, maxScore] range so negative
  // scores still show relative standing.
  const scores = graph.nodes.map((n) => n.score);
  const minScore = Math.min(...scores);
  const maxScore = Math.max(...scores);
  const scoreSpan = Math.max(1, maxScore - minScore);

  const positioned = new Map<
    string,
    GraphNode & { sx: number; sy: number; r: number }
  >();
  for (const node of graph.nodes) {
    const t = (node.score - minScore) / scoreSpan;
    const r = 2.0 + t * 2.1;
    positioned.set(node.id, {
      ...node,
      sx: node.x * 1.6,
      sy: node.y,
      r,
    });
  }

  // Build the active set of arcs for the current lens (or for the spotlighted player).
  const arcs: RenderedArc[] = [];
  const connectedNodes = new Set<string>();
  if (activePlayerId) connectedNodes.add(activePlayerId);

  if (activePlayerId) {
    // Spotlight mode: show all meaningful directed net edges (+2 or <= -2, plus top backer/rival)
    // involving the focused player so both love and hate are visible at once.
    const egoEdges = graph.directed.filter(
      (e) =>
        (e.from === activePlayerId || e.to === activePlayerId) &&
        (e.net >= 2 || e.net <= -2 || e.isTopBacker || e.isTopRival),
    );
    const pairKeySet = new Set(egoEdges.map((e) => `${e.from}->${e.to}`));
    const maxAbs = Math.max(1, ...egoEdges.map((e) => Math.abs(e.net)));

    for (const edge of egoEdges) {
      const from = positioned.get(edge.from);
      const to = positioned.get(edge.to);
      if (!from || !to) continue;
      connectedNodes.add(edge.from);
      connectedNodes.add(edge.to);

      const hasReverse = pairKeySet.has(`${edge.to}->${edge.from}`);
      const offset = hasReverse ? 4.4 : 1.8;
      const { d, mx, my } = buildArcGeometry(from, to, offset);
      const isPos = edge.net > 0;
      const width = 0.5 + (Math.abs(edge.net) / maxAbs) * 1.15;

      arcs.push({
        key: `${edge.from}->${edge.to}`,
        d,
        mx,
        my,
        label: fmtSigned(edge.net),
        stroke: isPos ? POS_STROKE : NEG_STROKE,
        width,
        dashed: !isPos,
        markerEnd: isPos ? 'url(#arrow-pos)' : 'url(#arrow-neg)',
        dimmed: false,
        tooltip: `${from.name} → ${to.name}: ${fmtSigned(edge.net)} net (+${n1(edge.upvotes)} / −${n1(edge.downvotes)})`,
      });
    }
  } else if (lens === 'backers') {
    const shown = graph.directed.filter((e) => e.isTopBacker && e.net > 0);
    const pairKeySet = new Set(shown.map((e) => `${e.from}->${e.to}`));
    const maxNet = Math.max(1, ...shown.map((e) => e.net));

    for (const edge of shown) {
      const from = positioned.get(edge.from);
      const to = positioned.get(edge.to);
      if (!from || !to) continue;
      const hasReverse = pairKeySet.has(`${edge.to}->${edge.from}`);
      const offset = hasReverse ? 4.2 : 2.0;
      const { d, mx, my } = buildArcGeometry(from, to, offset);
      const width = 0.55 + (edge.net / maxNet) * 1.15;

      arcs.push({
        key: `${edge.from}->${edge.to}`,
        d,
        mx,
        my,
        label: `+${n1(edge.net)}`,
        stroke: hasReverse ? ALLY_STROKE : POS_STROKE,
        width,
        markerEnd: hasReverse ? 'url(#arrow-ally)' : 'url(#arrow-pos)',
        dimmed: false,
        tooltip: `${from.name} → ${to.name}: +${n1(edge.net)} net (+${n1(edge.upvotes)} / −${n1(edge.downvotes)})`,
      });
    }
  } else if (lens === 'alliances') {
    const strongAlliances = graph.alliances.filter((a) => a.minNet >= 2);
    const shown: AllianceEdge[] =
      strongAlliances.length >= 2 ? strongAlliances : graph.alliances.slice(0, 6);
    const maxTotal = Math.max(1, ...shown.map((a) => a.totalNet));

    for (const edge of shown) {
      const nodeA = positioned.get(edge.a);
      const nodeB = positioned.get(edge.b);
      if (!nodeA || !nodeB) continue;
      // Order left-to-right on the canvas so `+left ↔ +right` matches the positions on screen.
      const [left, right, netLeftToRight, netRightToLeft] =
        nodeA.sx <= nodeB.sx
          ? [nodeA, nodeB, edge.netAtoB, edge.netBtoA]
          : [nodeB, nodeA, edge.netBtoA, edge.netAtoB];

      const { d, mx, my } = buildArcGeometry(left, right, 0, 1.3, 1.3);
      const width = 0.65 + (edge.totalNet / maxTotal) * 1.25;

      arcs.push({
        key: `${edge.a}<->${edge.b}`,
        d,
        mx,
        my,
        label: `+${n1(netLeftToRight)} ↔ +${n1(netRightToLeft)}`,
        stroke: ALLY_STROKE,
        width,
        markerStart: 'url(#arrow-ally-start)',
        markerEnd: 'url(#arrow-ally)',
        dimmed: false,
        tooltip: `${left.name} ↔ ${right.name}: +${n1(edge.totalNet)} net (+${n1(netLeftToRight)} / +${n1(netRightToLeft)})`,
      });
    }
  } else {
    // Rivalries lens
    const shown: DirectedEdge[] = graph.directed.filter((e) => e.isTopRival && e.net < 0);
    const pairKeySet = new Set(shown.map((e) => `${e.from}->${e.to}`));
    const maxAbs = Math.max(1, ...shown.map((e) => Math.abs(e.net)));

    for (const edge of shown) {
      const from = positioned.get(edge.from);
      const to = positioned.get(edge.to);
      if (!from || !to) continue;
      const hasReverse = pairKeySet.has(`${edge.to}->${edge.from}`);
      const offset = hasReverse ? 4.2 : 2.0;
      const { d, mx, my } = buildArcGeometry(from, to, offset);
      const width = 0.55 + (Math.abs(edge.net) / maxAbs) * 1.15;

      arcs.push({
        key: `${edge.from}->${edge.to}`,
        d,
        mx,
        my,
        label: `${n1(edge.net)}`,
        stroke: NEG_STROKE,
        width,
        dashed: !edge.isMutualRival,
        markerEnd: 'url(#arrow-neg)',
        dimmed: false,
        tooltip: `${from.name} → ${to.name}: ${n1(edge.net)} net (+${n1(edge.upvotes)} / −${n1(edge.downvotes)})`,
      });
    }
  }

  // Spotlight summary bar for the active player
  const spotlightSummary = (() => {
    if (!activePlayerId) return null;
    const node = positioned.get(activePlayerId);
    if (!node) return null;
    const outgoingPos = graph.directed
      .filter((e) => e.from === activePlayerId && e.net > 0)
      .sort((a, b) => b.net - a.net)[0];
    const incomingPos = graph.directed
      .filter((e) => e.to === activePlayerId && e.net > 0)
      .sort((a, b) => b.net - a.net)[0];
    const outgoingNeg = graph.directed
      .filter((e) => e.from === activePlayerId && e.net < 0)
      .sort((a, b) => a.net - b.net)[0];
    const incomingNeg = graph.directed
      .filter((e) => e.to === activePlayerId && e.net < 0)
      .sort((a, b) => a.net - b.net)[0];

    return {
      name: node.name,
      outgoingPos: outgoingPos
        ? `${positioned.get(outgoingPos.to)?.name} (${fmtSigned(outgoingPos.net)})`
        : 'nobody net-positive',
      incomingPos: incomingPos
        ? `${positioned.get(incomingPos.from)?.name} (${fmtSigned(incomingPos.net)})`
        : 'nobody net-positive',
      outgoingNeg: outgoingNeg
        ? `${positioned.get(outgoingNeg.to)?.name} (${fmtSigned(outgoingNeg.net)})`
        : null,
      incomingNeg: incomingNeg
        ? `${positioned.get(incomingNeg.from)?.name} (${fmtSigned(incomingNeg.net)})`
        : null,
    };
  })();

  const lensSubtitle =
    lens === 'backers'
      ? 'Each voter\u2019s #1 net-positive recipient (upvotes minus downvotes, plus any tie \u2265 +6). Blue arrows mark pairs that back each other.'
      : lens === 'alliances'
        ? 'Pairs where both sides are net-positive (\u2265 +2 each way) after subtracting downvotes. Love\u2013hate washes drop out.'
        : 'Each voter\u2019s #1 net-negative target (plus any target \u2264 \u22126). Solid red curves mark mutual feuds; dashed curves are one-way.';

  return (
    <>
      <Card
        title="Who votes with whom"
        subtitle="Net points (upvotes minus downvotes) between players. Click or hover any player to isolate their full incoming and outgoing arrows."
        wide
      >
        <div className="graph-toolbar">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <div className="seg">
              {[
                { key: 'backers' as GraphLens, label: 'Top backers (A → B)' },
                { key: 'alliances' as GraphLens, label: 'Mutual alliances (A ↔ B)' },
                { key: 'rivalries' as GraphLens, label: 'Rivalries (A ⇢ B)' },
              ].map((option) => (
                <button
                  key={option.key}
                  className={
                    lens === option.key && !pinnedId ? 'seg__btn seg__btn--on' : 'seg__btn'
                  }
                  onClick={() => {
                    setPinnedId(undefined);
                    setLens(option.key);
                  }}
                >
                  {option.label}
                </button>
              ))}
            </div>
            <InfoTip label="How the network is calculated">
              Every arrow uses <strong>net points</strong> (<code>upvotes − downvotes</code>), not
              raw upvotes alone — giving a player +5 and −5 across the season is a net 0 wash, not
              an alliance. Click or hover any player to inspect their full incoming and outgoing net
              relationships at once.
            </InfoTip>
          </div>

          {spotlightSummary ? (
            <div className="graph-spotlight">
              <span>
                <strong>{spotlightSummary.name}</strong>
                {' · '}backs <span className="pos">{spotlightSummary.outgoingPos}</span>
                {' · '}backed by <span className="pos">{spotlightSummary.incomingPos}</span>
                {spotlightSummary.outgoingNeg && (
                  <>
                    {' · '}targets <span className="neg">{spotlightSummary.outgoingNeg}</span>
                  </>
                )}
                {spotlightSummary.incomingNeg && (
                  <>
                    {' · '}targeted by <span className="neg">{spotlightSummary.incomingNeg}</span>
                  </>
                )}
              </span>
              {pinnedId && (
                <button className="seg__btn" onClick={() => setPinnedId(undefined)}>
                  Clear pin ×
                </button>
              )}
            </div>
          ) : (
            <p className="note" style={{ margin: 0 }}>
              {lensSubtitle}
            </p>
          )}
        </div>

        <div className="graph">
          <svg
            viewBox="0 0 160 100"
            role="img"
            aria-label="Network of voting relationships"
            onClick={(e) => {
              if (e.target === e.currentTarget) setPinnedId(undefined);
            }}
          >
            <defs>
              <marker
                id="arrow-pos"
                viewBox="0 0 10 10"
                refX="7.5"
                refY="5"
                markerWidth="3.8"
                markerHeight="3.8"
                orient="auto"
              >
                <path d="M 0 1.5 L 9 5 L 0 8.5 z" fill={POS_STROKE} />
              </marker>
              <marker
                id="arrow-ally"
                viewBox="0 0 10 10"
                refX="7.5"
                refY="5"
                markerWidth="3.8"
                markerHeight="3.8"
                orient="auto"
              >
                <path d="M 0 1.5 L 9 5 L 0 8.5 z" fill={ALLY_STROKE} />
              </marker>
              <marker
                id="arrow-ally-start"
                viewBox="0 0 10 10"
                refX="2.5"
                refY="5"
                markerWidth="3.8"
                markerHeight="3.8"
                orient="auto"
              >
                <path d="M 10 1.5 L 1 5 L 10 8.5 z" fill={ALLY_STROKE} />
              </marker>
              <marker
                id="arrow-neg"
                viewBox="0 0 10 10"
                refX="7.5"
                refY="5"
                markerWidth="3.8"
                markerHeight="3.8"
                orient="auto"
              >
                <path d="M 0 1.5 L 9 5 L 0 8.5 z" fill={NEG_STROKE} />
              </marker>
            </defs>

            {/* Pass 1: Curved directed paths */}
            {arcs.map((arc) => (
              <path
                key={arc.key}
                d={arc.d}
                fill="none"
                stroke={arc.stroke}
                strokeWidth={arc.width}
                strokeOpacity={arc.dimmed ? 0.12 : 0.78}
                strokeDasharray={arc.dashed ? '1.8 1.3' : undefined}
                strokeLinecap="round"
                markerStart={arc.markerStart}
                markerEnd={arc.markerEnd}
              >
                <title>{arc.tooltip}</title>
              </path>
            ))}

            {/* Pass 2: Inline point pills at each arc's midpoint */}
            {arcs.map((arc) => {
              const pillWidth = Math.max(5.6, arc.label.length * 1.38 + 2.2);
              return (
                <g
                  key={`${arc.key}-label`}
                  transform={`translate(${arc.mx.toFixed(2)}, ${arc.my.toFixed(2)})`}
                  className="graph__badge"
                >
                  <title>{arc.tooltip}</title>
                  <rect
                    x={-pillWidth / 2}
                    y={-1.85}
                    width={pillWidth}
                    height={3.7}
                    rx={1.85}
                    fill="#101118"
                    fillOpacity="0.92"
                    stroke={arc.stroke}
                    strokeWidth="0.32"
                  />
                  <text
                    x={0}
                    y={0.75}
                    textAnchor="middle"
                    className="graph__badge-text"
                    fill={arc.stroke}
                  >
                    {arc.label}
                  </text>
                </g>
              );
            })}

            {/* Pass 3: Player nodes and labels */}
            {graph.nodes.map((rawNode) => {
              const node = positioned.get(rawNode.id)!;
              const isFocused = activePlayerId === node.id;
              const dim = activePlayerId && !connectedNodes.has(node.id);
              return (
                <g
                  key={node.id}
                  opacity={dim ? 0.25 : 1}
                  style={{ cursor: 'pointer' }}
                  onMouseEnter={() => setHoverId(node.id)}
                  onMouseLeave={() => setHoverId(undefined)}
                  onClick={(e) => {
                    e.stopPropagation();
                    setPinnedId((prev) => (prev === node.id ? undefined : node.id));
                  }}
                >
                  {isFocused && (
                    <circle
                      cx={node.sx}
                      cy={node.sy}
                      r={node.r + 1.3}
                      fill="none"
                      stroke="#ffffff"
                      strokeWidth="0.45"
                      strokeDasharray="1.2 0.8"
                    />
                  )}
                  <circle
                    cx={node.sx}
                    cy={node.sy}
                    r={node.r}
                    fill={colourFor(node.cluster)}
                    stroke="#0d0d11"
                    strokeWidth="0.55"
                  />
                  <text
                    className="graph__label"
                    x={node.sx}
                    y={node.sy - node.r - 1.3}
                    textAnchor="middle"
                  >
                    {node.name}
                  </text>
                </g>
              );
            })}
          </svg>
        </div>

        <p className="note">
          Circle size reflects season standings ({fmtSigned(minScore)} to {fmtSigned(maxScore)}).
          Node colours group players by their warmest net-positive ties. Click any player to pin
          their full incoming and outgoing network.
        </p>
      </Card>

      <Card
        title="Mutual alliances"
        subtitle="Pairs where both players are net-positive toward each other (upvotes minus downvotes), ranked by the quieter side."
      >
        {graph.alliances.length === 0 ? (
          <Empty>No mutually net-positive pairs yet.</Empty>
        ) : (
          <ol className="ranklist">
            {graph.alliances.slice(0, 8).map((edge) => {
              const nameA = positioned.get(edge.a)?.name ?? edge.a;
              const nameB = positioned.get(edge.b)?.name ?? edge.b;
              return (
                <li key={`${edge.a}-${edge.b}`}>
                  <span className="ranklist__val pos">+{n1(edge.totalNet)}</span>
                  <span className="ranklist__main">
                    <strong>
                      {nameA} ↔ {nameB}
                    </strong>
                    <span className="dim small">
                      {' '}
                      +{n1(edge.netAtoB)} / +{n1(edge.netBtoA)} net
                      {edge.downvotesTraded > 0
                        ? ` (+${n1(edge.upvotesTraded)} up, −${n1(edge.downvotesTraded)} down)`
                        : ' (0 downvotes)'}
                    </span>
                  </span>
                </li>
              );
            })}
          </ol>
        )}
      </Card>

      <Card
        title="One-way crushes & feuds"
        subtitle="Unrequited net backing (where one side gives heavily and gets little or negative back) and the room’s sharpest net rivalries."
      >
        <div className="story-split">
          <div>
            <div className="dim small" style={{ fontWeight: 600, marginBottom: '6px' }}>
              UNREQUITED BACKING (A → B)
            </div>
            <ol className="ranklist">
              {graph.lopsided.slice(0, 5).map((item) => {
                const fromName = positioned.get(item.from)?.name ?? item.from;
                const toName = positioned.get(item.to)?.name ?? item.to;
                return (
                  <li key={`lop-${item.from}-${item.to}`}>
                    <span className="ranklist__val pos">+{n1(item.net)}</span>
                    <span className="ranklist__main">
                      <strong>
                        {fromName} → {toName}
                      </strong>
                      <span className="dim small">
                        {' '}
                        gave +{n1(item.net)} net (+{n1(item.upvotes)}/−{n1(item.downvotes)}), got{' '}
                        {fmtSigned(item.reverseNet)} net back (+{n1(item.reverseUpvotes)}/−
                        {n1(item.reverseDownvotes)})
                      </span>
                    </span>
                  </li>
                );
              })}
            </ol>
          </div>

          {graph.feuds.length > 0 && (
            <div style={{ marginTop: '14px' }}>
              <div className="dim small" style={{ fontWeight: 600, marginBottom: '6px' }}>
                SHARPEST FEUDS & TARGETS
              </div>
              <ol className="ranklist">
                {graph.feuds.slice(0, 5).map((feud) => {
                  const fromName = positioned.get(feud.from)?.name ?? feud.from;
                  const toName = positioned.get(feud.to)?.name ?? feud.to;
                  return (
                    <li key={`feud-${feud.from}-${feud.to}`}>
                      <span className="ranklist__val neg">
                        {feud.mutual ? fmtSigned(feud.combinedNet) : fmtSigned(feud.net)}
                      </span>
                      <span className="ranklist__main">
                        <strong>
                          {fromName} {feud.mutual ? '↔' : '⇢'} {toName}
                        </strong>
                        <span className="dim small">
                          {' '}
                          {feud.mutual
                            ? `mutual feud: ${fmtSigned(feud.net)} and ${fmtSigned(feud.reverseNet)} net`
                            : `${fmtSigned(feud.net)} net (+${n1(feud.upvotes)}/−${n1(feud.downvotes)}), reverse ${fmtSigned(feud.reverseNet)} net`}
                        </span>
                      </span>
                    </li>
                  );
                })}
              </ol>
            </div>
          )}
        </div>
      </Card>
    </>
  );
}
