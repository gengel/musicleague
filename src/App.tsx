import { useMemo, useState } from 'react';
import {
  embeddedFiles,
  embeddedFlooring,
  embeddedLabel,
  embeddedRedacted,
  embeddedScoring,
  embeddedTotalRounds,
} from 'virtual:league-data';
import { parseLeague, type NamedFile } from './lib/parse';
import { computeStats, type FloorMode, type ScoringMode } from './lib/stats';
import { buildDemoCsv } from './lib/demo';
import { FileDrop } from './components/FileDrop';
import { Headlines, Overview, TopSongs } from './components/Overview';
import { ScoreTimeline } from './components/ScoreTimeline';
import { AffinityMatrix, PairLeaders } from './components/AffinityMatrix';
import { Participation } from './components/Participation';
import { ArtistsPanel, ConsensusPanel, RoundsPanel, SongsPanel } from './components/SongsPanel';
import { PlayerProfiles, PlayersPanel } from './components/PlayersPanel';
import { ScoreBreakdownPanel } from './components/ScoreBreakdownPanel';
import { SocialGraphPanel } from './components/SocialGraphPanel';
import { FuturePanel } from './components/FuturePanel';
import { GenrePanel } from './components/GenrePanel';

const TABS = [
  'Overview',
  'Standings',
  'Voting',
  'Network',
  'Future',
  'Participation',
  'Songs',
  'Players',
] as const;
type Tab = (typeof TABS)[number];

/**
 * Reads `#demo` / `#demo:Voting` from the URL so the sample league can be
 * linked to directly. Real exports are never encoded in the URL.
 */
function readHash(): { demo: boolean; tab: Tab } {
  const raw = decodeURIComponent(window.location.hash.replace(/^#/, ''));
  const [name, tab] = raw.split(':');
  const match = TABS.find((t) => t.toLowerCase() === (tab ?? '').toLowerCase());
  return { demo: name.toLowerCase() === 'demo', tab: match ?? 'Overview' };
}

/** A baked-in league takes precedence over the demo hash. */
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
  // The two league rules come from the bake flags, or are inferred from the
  // official standings when the export carries them.
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
      return computeStats(league, {
        scoring: scoringChoice ?? 'auto',
        flooring: flooringChoice ?? 'auto',
        totalRounds: embeddedTotalRounds ?? undefined,
      });
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
        <button
          className="ghost-btn ghost-btn--sm"
          onClick={() => {
            setFiles(null);
            setIsDemo(false);
          }}
        >
          {isBaked ? 'Load a different export' : 'Load another export'}
        </button>
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
            <Headlines stats={stats} />
            <TopSongs stats={stats} />
            <Overview stats={stats} />
            <ScoreTimeline stats={stats} />
          </>
        )}

        {tab === 'Standings' && (
          <>
            <ScoreTimeline stats={stats} />
            <ScoreBreakdownPanel stats={stats} />
            <RoundsPanel stats={stats} />
          </>
        )}

        {tab === 'Voting' && (
          <>
            <AffinityMatrix stats={stats} />
            <PairLeaders stats={stats} />
          </>
        )}

        {tab === 'Network' && <SocialGraphPanel stats={stats} />}

        {tab === 'Future' && <FuturePanel stats={stats} />}

        {tab === 'Participation' && <Participation stats={stats} />}

        {tab === 'Songs' && (
          <>
            <SongsPanel stats={stats} />
            <GenrePanel stats={stats} />
            <ConsensusPanel stats={stats} />
            <ArtistsPanel stats={stats} />
          </>
        )}

        {tab === 'Players' && (
          <>
            <PlayersPanel stats={stats} />
            <PlayerProfiles stats={stats} />
          </>
        )}
      </main>

      <footer className="foot">
        {isBaked && embeddedRedacted
          ? 'Surnames shortened to an initial. Parsed in your browser, with no backend — the only outside request is to Spotify, and only if you press play.'
          : 'Parsed entirely in your browser. Your league data never leaves this machine; pressing play on a song is the only thing that contacts Spotify.'}
      </footer>
    </div>
  );
}
