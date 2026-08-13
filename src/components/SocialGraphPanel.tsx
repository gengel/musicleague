import { useMemo, useState } from 'react';
import type { Stats } from '../lib/stats';
import { socialGraph, type GraphEdge } from '../lib/social';
import { Card, Empty, n1, pct0 } from './ui';

/** Cluster colours, kept distinct and stable by index. */
const CLUSTER_COLOURS = [
  'hsl(320 72% 62%)',
  'hsl(178 62% 55%)',
  'hsl(45 82% 62%)',
  'hsl(258 68% 68%)',
  'hsl(140 55% 58%)',
  'hsl(15 78% 62%)',
];

const colourFor = (cluster: number): string =>
  CLUSTER_COLOURS[cluster % CLUSTER_COLOURS.length];

/**
 * The league as a network: who trades votes with whom.
 *
 * Edge thickness is mutual warmth — what a pair gave each other as a share of
 * what they were allowed to give — so a one-way crush does not draw as a
 * friendship. Weak edges are hidden by default because a fully connected graph
 * of a dozen players is unreadable.
 */
export function SocialGraphPanel({ stats }: { stats: Stats }) {
  const graph = useMemo(() => socialGraph(stats), [stats]);
  // Default to the strongest ties. Drawing every pair is technically complete
  // and visually useless: in a league everyone votes for everyone a little, so
  // the full graph is a single hairball and the camps disappear into it.
  const [threshold, setThreshold] = useState(1.4);
  const [focus, setFocus] = useState<string | undefined>();

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

  // Threshold is expressed relative to the league's average warmth, so it means
  // the same thing in a generous league and a stingy one.
  const cutoff = graph.average * threshold;
  const shown = graph.edges.filter((e) => e.strength >= cutoff);
  const strongest = Math.max(...graph.edges.map((e) => e.strength));
  const nodeAt = new Map(graph.nodes.map((n) => [n.id, n]));

  const isLit = (edge: GraphEdge) => !focus || edge.a === focus || edge.b === focus;

  return (
    <>
      <Card
        title="Who votes with whom"
        subtitle="Thicker lines mean a pair gave each other more of what the rules allowed. Colours mark clusters that vote together. Hover a name to isolate it."
        wide
      >
        <div className="seg">
          {[
            { label: 'Strongest ties', value: 1.4 },
            { label: 'Above average', value: 1 },
            { label: 'Most ties', value: 0.5 },
            { label: 'Everything', value: 0 },
          ].map((option) => (
            <button
              key={option.label}
              className={threshold === option.value ? 'seg__btn seg__btn--on' : 'seg__btn'}
              onClick={() => setThreshold(option.value)}
            >
              {option.label}
            </button>
          ))}
        </div>
        <p className="note">
          Showing the {shown.length} strongest of {graph.edges.length} pairs. Widen it and the camps
          blur together: everyone in a league votes for everyone a little, so the complete graph is
          one hairball.
        </p>

        <div className="graph">
          <svg viewBox="0 0 100 100" role="img" aria-label="Network of voting relationships">
            {shown.map((edge) => {
              const a = nodeAt.get(edge.a);
              const b = nodeAt.get(edge.b);
              if (!a || !b) return null;
              const lit = isLit(edge);
              const sameCluster = a.cluster === b.cluster;
              return (
                <line
                  key={`${edge.a}-${edge.b}`}
                  x1={a.x}
                  y1={a.y}
                  x2={b.x}
                  y2={b.y}
                  stroke={sameCluster ? colourFor(a.cluster) : '#6a6a78'}
                  strokeWidth={0.25 + (edge.strength / strongest) * 1.5}
                  strokeOpacity={lit ? 0.15 + (edge.strength / strongest) * 0.6 : 0.05}
                  strokeLinecap="round"
                />
              );
            })}

            {graph.nodes.map((node) => {
              const dim = focus && focus !== node.id;
              const radius = 1.9 + Math.sqrt(Math.max(0, node.score)) * 0.34;
              return (
                <g
                  key={node.id}
                  opacity={dim ? 0.35 : 1}
                  onMouseEnter={() => setFocus(node.id)}
                  onMouseLeave={() => setFocus(undefined)}
                >
                  <circle
                    cx={node.x}
                    cy={node.y}
                    r={radius}
                    fill={colourFor(node.cluster)}
                    stroke="#0d0d11"
                    strokeWidth="0.5"
                  />
                  <text
                    className="graph__label"
                    x={node.x}
                    y={node.y - radius - 1.4}
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
          Circle size is points scored. The average pair gave each other {pct0(graph.average)} of
          what the rules allowed.
        </p>
      </Card>

      <Card
        title="Clusters"
        subtitle={
          graph.distinct
            ? 'Built from each player\u2019s warmest few ties, then following the connections. Percentages compare warmth inside the group with warmth toward everyone else.'
            : 'This league does not split into camps: everyone backs everyone at much the same rate, so any grouping below is an artefact rather than a finding.'
        }
      >
        <ul className="clusters">
          {graph.clusters.map((cluster) => (
            <li key={cluster.index}>
              <span className="clusters__dot" style={{ background: colourFor(cluster.index) }} />
              <div>
                <strong>{cluster.members.join(', ')}</strong>
                <div className="dim small">
                  {cluster.members.length === 1
                    ? 'votes with nobody in particular'
                    : `${pct0(cluster.internal)} warmth inside the group, ${pct0(
                        cluster.external,
                      )} to everyone else`}
                  {cluster.members.length > 1 && cluster.external > 0 && (
                    <> — {(cluster.internal / cluster.external).toFixed(1)}× closer</>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      </Card>

      <Card title="Strongest ties" subtitle="Pairs who gave each other the most, relative to what they were allowed.">
        <ol className="ranklist">
          {[...graph.edges]
            .sort((a, b) => b.strength - a.strength)
            .slice(0, 8)
            .map((edge) => (
              <li key={`${edge.a}-${edge.b}`}>
                <span className="ranklist__val">{pct0(edge.strength)}</span>
                <span className="ranklist__main">
                  <strong>
                    {nodeAt.get(edge.a)?.name} ↔ {nodeAt.get(edge.b)?.name}
                  </strong>
                  <span className="dim small">
                    {' '}
                    {n1(edge.traded)} pts traded, {n1(edge.weaker)} from the quieter side
                  </span>
                </span>
              </li>
            ))}
        </ol>
      </Card>
    </>
  );
}
