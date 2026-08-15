import { useMemo, useState } from 'react';
import {
  embeddedEnrichment,
  embeddedFiles,
  embeddedFlooring,
  embeddedLabel,
  embeddedRedacted,
  embeddedScoring,
  embeddedTotalRounds,
} from 'virtual:league-data';
import { parseLeague, type NamedFile } from './lib/parse';
import { computeStats, computeSuperlatives, type FloorMode, type ScoringMode } from './lib/stats';
import { attachEnrichment, parseEnrichment } from './lib/enrich';
import { buildDemoCsv, buildDemoEnrichment } from './lib/demo';
import { FileDrop } from './components/FileDrop';
import { Headlines, TopSongs, Overview } from './components/Overview';
import { SuperlativeStrip } from './components/SuperlativeStrip';
import { TheRaceTab } from './components/TheRaceTab';
import { TheSongsTab } from './components/TheSongsTab';
import { TheRoomTab } from './components/TheRoomTab';
import { PlayersTab } from './components/PlayersTab';
import { PlayByPlayTab } from './components/PlayByPlayTab';

const TABS = ['Overview', 'The Race', 'The Songs', 'The Room', 'Players', 'Play-by-Play'] as const;
type Tab = (typeof TABS)[number];

/**
 * Legacy hash fragments from old 8-tab layout → new 6-tab names.
 * Keeps any bookmarks or shared links working after the restructure.
 */
const HASH_REDIRECTS: Record<string, Tab> = {
  standings: 'The Race',
  future: 'The Race',
  voting: 'The Room',
  network: 'The Room',
  songs: 'The Songs',
  participation: 'Play-by-Play',
  players: 'Players',
  overview: 'Overview',
  'the race': 'The Race',
  'the songs': 'The Songs',
  'the room': 'The Room',
  'play-by-play': 'Play-by-Play',
};

function readHash(): { demo: boolean; tab: Tab } {
  const raw = decodeURIComponent(window.location.hash.replace(/^#/, ''));
  const [name, tabRaw] = raw.split(':');
  const tabKey = (tabRaw ?? '').toLowerCase();
  const redirected = HASH_REDIRECTS[tabKey];
  const direct = TABS.find((t) => t.toLowerCase() === tabKey);
  return { demo: name.toLowerCase() === 'demo', tab: redirected ?? direct ?? 'Overview' };
}

function initialFiles(demo: boolean): NamedFile[] | null {
  if (embeddedFiles?.length) return embeddedFiles;
  if (demo) return [{ name: 'Sample League.csv', text: buildDemoCsv() }];
  return null;
}

export default function App() {
  const initial = readHash();
  const [files, setFiles] = useState<NamedFile[] | null>(() => initialFiles(initial.demo));
  const [isDemo, setIsDemo] = useState(initial.demo && !embeddedFiles?.length);
  const [tab, setTab] = useState<Tab>(initial.tab);
  const [error, setError] = useState<string | undefined>();
  const scoringChoice: ScoringMode | undefined = embeddedScoring ?? undefined;
  const flooringChoice: FloorMode | undefined = embeddedFlooring ?? undefined;
  const isBaked = Boolean(embeddedFiles?.length) && files === embeddedFiles;

  const stats = useMemo(() => {
    if (!files) return null;
    try {
      const league = parseLeague(files);
      if (!league.submissions.length) {
        setError(
          'That file parsed but contained no submissions. Make sure it is the Export Data CSV from your league.',
        );
        return null;
      }
      const computed = computeStats(league, {
        scoring: scoringChoice ?? 'auto',
        flooring: flooringChoice ?? 'auto',
        totalRounds: embeddedTotalRounds ?? undefined,
      });
      const enrichment = parseEnrichment(
        embeddedFiles?.length ? embeddedEnrichment : isDemo ? buildDemoEnrichment() : {},
      );
      const enrichedSongs = attachEnrichment(computed.songs, enrichment);
      const enrichedStats = { ...computed, songs: enrichedSongs };
      return { ...enrichedStats, superlatives: computeSuperlatives(enrichedStats) };
    } catch (err) {
      setError(`Could not read that file: ${err instanceof Error ? err.message : String(err)}`);
      return null;
    }
  }, [files, scoringChoice, flooringChoice]);

  if (!stats) {
    return (
      <FileDrop
        error={error}
        onFiles={(next) => {
          setError(undefined);
          setIsDemo(false);
          setFiles(next);
        }}
        onDemo={() => {
          setError(undefined);
          setIsDemo(true);
          setFiles([{ name: 'Sample League.csv', text: buildDemoCsv() }]);
        }}
      />
    );
  }

  return (
    <div className="app">
      <header className="topbar">
        <div className="topbar__title">
          <h1>{isBaked && embeddedLabel ? embeddedLabel : stats.league.name}</h1>
          <span className="dim small">
            {stats.players.length} players ·{' '}
            {stats.totalRounds
              ? `${stats.roundsPlayed} of ${stats.totalRounds} rounds`
              : `${stats.league.rounds.length} rounds`}{' '}
            · {stats.songs.length} songs
            {isDemo && <span className="badge">sample data</span>}
          </span>
        </div>
        <nav className="tabs">
          {TABS.map((t) => (
            <button
              key={t}
              className={tab === t ? 'tab tab--on' : 'tab'}
              onClick={() => setTab(t)}
            >
              {t}
            </button>
          ))}
        </nav>
        {!isBaked && (
          <button
            className="ghost-btn ghost-btn--sm"
            onClick={() => {
              setFiles(null);
              setIsDemo(false);
            }}
          >
            Load another export
          </button>
        )}
      </header>

      {stats.inProgress && (
        <p className="progress">
          <strong>Season in progress.</strong>{' '}
          {stats.totalRounds
            ? `${stats.roundsPlayed} of ${stats.totalRounds} rounds played — everything below is a running total, not a result.`
            : `Not every round has results yet — everything below is a running total, not a result.`}
        </p>
      )}

      {stats.league.warnings.length > 0 && (
        <div className="warnings">
          {stats.league.warnings.map((w) => (
            <p className="alert" key={w}>
              {w}
            </p>
          ))}
        </div>
      )}

      <main className="grid">
        {tab === 'Overview' && (
          <>
            <SuperlativeStrip
              stats={stats}
              labels={[
                'Biggest single haul',
                'Biggest haul never counted',
                'Best average song',
                'Chattiest',
              ]}
            />
            <Headlines stats={stats} />
            <TopSongs stats={stats} />
            <Overview stats={stats} onNavigate={(t) => setTab(t as Tab)} />
          </>
        )}

        {tab === 'The Race' && <TheRaceTab stats={stats} />}
        {tab === 'The Songs' && <TheSongsTab stats={stats} />}
        {tab === 'The Room' && <TheRoomTab stats={stats} />}
        {tab === 'Players' && <PlayersTab stats={stats} />}
        {tab === 'Play-by-Play' && <PlayByPlayTab stats={stats} />}
      </main>

      <footer className="foot">
        {isBaked && embeddedRedacted
          ? 'Surnames shortened to an initial. Parsed in your browser, with no backend — the only outside request is to Spotify, and only if you press play.'
          : 'Parsed entirely in your browser. Your league data never leaves this machine; pressing play on a song is the only thing that contacts Spotify.'}
      </footer>
    </div>
  );
}
