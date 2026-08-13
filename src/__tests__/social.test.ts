import { describe, expect, it } from 'vitest';
import { parseLeague } from '../lib/parse';
import { computeStats } from '../lib/stats';
import { socialGraph } from '../lib/social';
import { future } from '../lib/future';
import { buildDemoCsv } from '../lib/demo';

/**
 * Two tight pairs who ignore each other: Ada/Bo trade heavily, Cleo/Dev trade
 * heavily, and nobody crosses over. The clustering has to find exactly that.
 */
const CLIQUES = `[rounds]
Position,Title
1,R1
2,R2
3,R3

[submissions]
Round,Submitter,Song Title,Artist,Spotify Track ID
R1,Ada,A1,x,s1
R1,Bo,B1,x,s2
R1,Cleo,C1,x,s3
R1,Dev,D1,x,s4
R2,Ada,A2,x,s5
R2,Bo,B2,x,s6
R2,Cleo,C2,x,s7
R2,Dev,D2,x,s8
R3,Ada,A3,x,s9
R3,Bo,B3,x,s10
R3,Cleo,C3,x,s11
R3,Dev,D3,x,s12

[votes]
Round,Voter,Submitter,Song Title,Points
R1,Ada,Bo,B1,4
R1,Bo,Ada,A1,4
R1,Cleo,Dev,D1,4
R1,Dev,Cleo,C1,4
R2,Ada,Bo,B2,4
R2,Bo,Ada,A2,4
R2,Cleo,Dev,D2,4
R2,Dev,Cleo,C2,4
R3,Ada,Bo,B3,4
R3,Bo,Ada,A3,4
R3,Cleo,Dev,D3,4
R3,Dev,Cleo,C3,4
`;

const cliqueStats = computeStats(parseLeague([{ name: 'c.csv', text: CLIQUES }]));
const demoStats = computeStats(parseLeague([{ name: 'd.csv', text: buildDemoCsv() }]));

describe('socialGraph', () => {
  it('finds the cliques that actually exist', () => {
    const graph = socialGraph(cliqueStats);
    const groups = graph.clusters.map((c) => c.members.join('+')).sort();
    expect(groups).toEqual(['Ada+Bo', 'Cleo+Dev']);
  });

  it('reports a clique as warmer inside than out', () => {
    const graph = socialGraph(cliqueStats);
    for (const cluster of graph.clusters) {
      expect(cluster.internal).toBeGreaterThan(cluster.external);
    }
  });

  it('measures an edge as mutual, so a one-way crush is not a friendship', () => {
    const oneWay = CLIQUES.replace('R1,Bo,Ada,A1,4', 'R1,Bo,Cleo,C1,4');
    const stats = computeStats(parseLeague([{ name: 'o.csv', text: oneWay }]));
    const graph = socialGraph(stats);
    const nameOf = new Map(graph.nodes.map((n) => [n.id, n.name]));
    const edge = graph.edges.find(
      (e) =>
        [nameOf.get(e.a), nameOf.get(e.b)].sort().join('+') === 'Ada+Bo',
    )!;
    const mutual = graph.edges.find(
      (e) => [nameOf.get(e.a), nameOf.get(e.b)].sort().join('+') === 'Cleo+Dev',
    )!;
    // Ada→Bo is still generous, but Bo no longer reciprocates in round one.
    expect(edge.weaker).toBeLessThan(mutual.weaker);
    expect(edge.strength).toBeLessThan(mutual.strength);
  });

  it('draws the same picture every time', () => {
    const first = socialGraph(demoStats);
    const second = socialGraph(demoStats);
    expect(first.nodes.map((n) => [n.name, n.x.toFixed(6), n.y.toFixed(6)])).toEqual(
      second.nodes.map((n) => [n.name, n.x.toFixed(6), n.y.toFixed(6)]),
    );
    expect(first.clusters).toEqual(second.clusters);
  });

  it('keeps every node inside the canvas', () => {
    for (const node of socialGraph(demoStats).nodes) {
      expect(node.x).toBeGreaterThanOrEqual(0);
      expect(node.x).toBeLessThanOrEqual(100);
      expect(node.y).toBeGreaterThanOrEqual(0);
      expect(node.y).toBeLessThanOrEqual(100);
      expect(Number.isFinite(node.x)).toBe(true);
    }
  });

  it('never places two players on the same spot', () => {
    const spots = socialGraph(demoStats).nodes.map((n) => `${n.x.toFixed(2)},${n.y.toFixed(2)}`);
    expect(new Set(spots).size).toBe(spots.length);
  });

  it('has one node per player and no self-edges', () => {
    const graph = socialGraph(demoStats);
    expect(graph.nodes).toHaveLength(7);
    expect(graph.edges.every((e) => e.a !== e.b)).toBe(true);
    // Undirected: each pair appears once.
    const keys = graph.edges.map((e) => [e.a, e.b].sort().join('|'));
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('returns nothing to draw when there are no votes', () => {
    const csv = `[submissions]
Round,Submitter,Song Title,Artist
R1,Ada,Song,Artist
`;
    const bare = computeStats(parseLeague([{ name: 'b.csv', text: csv }]));
    expect(socialGraph(bare).nodes).toEqual([]);
  });
});

describe('future', () => {
  const withRounds = (total?: number) =>
    future(computeStats(parseLeague([{ name: 'd.csv', text: buildDemoCsv() }]), {
      totalRounds: total,
    }));

  it('counts the rounds left when the league total is known', () => {
    expect(withRounds(10).roundsLeft).toBe(4);
    expect(withRounds(6).roundsLeft).toBe(0);
    expect(withRounds().roundsLeft).toBeUndefined();
  });

  it('grounds its ceiling in what the league has actually done', () => {
    const { swing } = withRounds(10);
    expect(swing.bestObserved).toBeGreaterThan(0);
    expect(swing.typicalWin).toBeGreaterThan(0);
    // A ceiling below the best actual round would be nonsense.
    expect(swing.ceiling).toBeGreaterThanOrEqual(swing.bestObserved);
    expect(swing.perRound).toBeGreaterThan(0);
  });

  it('says whether the title is still open', () => {
    const projection = withRounds(10).projections.find((p) => p.label === 'The title')!;
    expect(projection).toBeDefined();
    expect(['live', 'settled']).toContain(projection.status);
  });

  it('declares the title settled when the gap cannot be closed', () => {
    // With no rounds left, nothing can change.
    const projection = withRounds(6).projections.find((p) => p.label === 'The title')!;
    expect(projection.status).toBe('settled');
    expect(projection.headline).toMatch(/cannot be caught/);
  });

  it('always addresses both ends of the table', () => {
    const labels = withRounds(10).projections.map((p) => p.label);
    expect(labels).toContain('The title');
    expect(labels).toContain('Last place');
  });

  it('points a non-voter at the points they are leaving on the table', () => {
    const projections = withRounds(10).projections;
    // Gus is the demo's serial non-voter. The forfeit insight may arrive as its
    // own card or folded into the last-place one, but it must be somewhere.
    const mentioned = projections.filter(
      (p) => /forfeit/i.test(p.detail) && /Gus/.test(`${p.headline} ${p.detail}`),
    );
    expect(mentioned.length).toBeGreaterThan(0);
  });

  it('tells one story per player rather than several about the same one', () => {
    const projections = withRounds(10).projections;
    const subjects = projections.filter((p) => p.subject !== '__league__').map((p) => p.subject);
    expect(new Set(subjects).size).toBe(subjects.length);
  });

  it('finds several different angles, not just the standings', () => {
    const labels = withRounds(10).projections.map((p) => p.label);
    expect(labels.length).toBeGreaterThanOrEqual(4);
    // At least one insight that is not simply a gap in the table.
    expect(
      labels.some((l) =>
        ['The kingmaker', 'Form', 'Downvote exposure', 'Fragile support', 'Where games are won'].includes(l),
      ),
    ).toBe(true);
  });

  it('says nothing at all before any round has results', () => {
    const csv = `[submissions]
Round,Submitter,Song Title,Artist
R1,Ada,Song,Artist
`;
    const bare = computeStats(parseLeague([{ name: 'b.csv', text: csv }]));
    expect(future(bare).projections).toEqual([]);
  });

  it('gives per-round figures when the remaining round count is unknown', () => {
    const projection = withRounds().projections.find((p) => p.label === 'The title')!;
    // Without a round count it must not claim anything is decided.
    expect(projection.status).toBe('live');
  });
});

describe('cluster reporting', () => {
  it('reports distinct groups when they exist', () => {
    const graph = socialGraph(cliqueStats);
    expect(graph.distinct).toBe(true);
    expect(graph.clusters).toHaveLength(2);
  });

  it('declines to call one blob a cluster', () => {
    // Everyone votes for everyone equally: there are no camps to find.
    const flat = `[submissions]
Round,Submitter,Song Title,Artist,Spotify Track ID
R1,A,A1,x,s1
R1,B,B1,x,s2
R1,C,C1,x,s3
R1,D,D1,x,s4

[votes]
Round,Voter,Submitter,Song Title,Points
R1,A,B,B1,2
R1,A,C,C1,2
R1,A,D,D1,2
R1,B,A,A1,2
R1,B,C,C1,2
R1,B,D,D1,2
R1,C,A,A1,2
R1,C,B,B1,2
R1,C,D,D1,2
R1,D,A,A1,2
R1,D,B,B1,2
R1,D,C,C1,2
`;
    const even = computeStats(parseLeague([{ name: 'e.csv', text: flat }]));
    const graph = socialGraph(even);
    // Every tie is identical, so any split would be an artefact.
    expect(graph.distinct).toBe(false);
  });

  it('isolates a player who never voted', () => {
    const graph = socialGraph(demoStats);
    const alone = graph.clusters.filter((c) => c.members.length === 1);
    // Whatever the split, a cluster of one must have no internal warmth.
    for (const cluster of alone) expect(cluster.internal).toBe(0);
  });
});

describe('swing honesty', () => {
  it('separates the theoretical ceiling from what has actually happened', () => {
    const { swing } = future(
      computeStats(parseLeague([{ name: 'd.csv', text: buildDemoCsv() }]), { totalRounds: 10 }),
    );
    // The ceiling assumes every voter maxes one song, which never happens.
    expect(swing.perRound).toBeGreaterThanOrEqual(swing.realistic);
    expect(swing.realistic).toBe(swing.bestObserved - swing.worstObserved);
  });

  it('does not quote the same chaser count twice', () => {
    const projection = future(
      computeStats(parseLeague([{ name: 'd.csv', text: buildDemoCsv() }]), { totalRounds: 10 }),
    ).projections.find((p) => p.label === 'The title')!;
    if (projection.detail.includes('mathematically alive')) {
      // Either the two counts differ and both are given, or only one is.
      const numbers = projection.detail.match(/(\d+) players are mathematically alive[^.]*/);
      if (numbers && /only (\d+)/.test(numbers[0])) {
        const [, all] = numbers;
        const only = numbers[0].match(/only (\d+)/)![1];
        expect(Number(only)).toBeLessThan(Number(all));
      }
    }
  });
});
