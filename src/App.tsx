import { useEffect, useMemo, useState } from 'react';
import {
  embeddedEnrichment,
  embeddedFiles,
  embeddedFlooring,
  embeddedLabel,
  embeddedRedacted,
  embeddedScoring,
  embeddedTotalRounds,
  embeddedTheme,
  embeddedBudget,
  embeddedHistory,
} from 'virtual:league-data';
import { parseLeague, type NamedFile } from './lib/parse';
import { computeStats, computeSuperlatives, type FloorMode, type ScoringMode } from './lib/stats';
import { buildHistoryLeagues, joinHistory, type History } from './lib/history';
import { resolveSlug } from './lib/playerProfile';
import { parseHash, tabSlug, TABS, type Route, type TabId } from './lib/route';
import { attachEnrichment, parseEnrichment, type RawEnrichmentFiles } from './lib/enrich';
import { buildDemoCsv, buildDemoEnrichment } from './lib/demo';
import { FileDrop } from './components/FileDrop';
import { Card } from './components/ui';
import { ThisRoundTab } from './components/ThisRoundTab';
import { TheRaceTab } from './components/TheRaceTab';
import { TheSongsTab } from './components/TheSongsTab';
import { TheRoomTab } from './components/TheRoomTab';
import { PlayersTab } from './components/PlayersTab';
import { PlayByPlayTab } from './components/PlayByPlayTab';
import { PlayerPage } from './components/PlayerPage';
import { FuturePanel } from './components/FuturePanel';

function initialFiles(demo: boolean): NamedFile[] | null {
  if (embeddedFiles?.length) return embeddedFiles;
  if (demo) return [{ name: 'Sample League.csv', text: buildDemoCsv() }];
  return null;
}

export default function App() {
  const initial = parseHash(window.location.hash);
  const [files, setFiles] = useState<NamedFile[] | null>(() => initialFiles(initial.demo));
  const [isDemo, setIsDemo] = useState(initial.demo && !embeddedFiles?.length);
  const [route, setRoute] = useState<Route>(initial.route);
  const [error, setError] = useState<string | undefined>();
  const scoringChoice: ScoringMode | undefined = embeddedScoring ?? undefined;
  const flooringChoice: FloorMode | undefined = embeddedFlooring ?? undefined;
  const isBaked = Boolean(embeddedFiles?.length) && files === embeddedFiles;

  // Keep the URL and the route in step, both ways.
  useEffect(() => {
    const onHash = () => setRoute(parseHash(window.location.hash).route);
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);
  const navigate = (hash: string) => {
    if (window.location.hash.replace(/^#/, '') !== hash) window.location.hash = hash;
    else setRoute(parseHash(hash).route);
  };
  const goTab = (tab: TabId) => navigate(tabSlug(tab));

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
        theme: embeddedTheme ?? undefined,
        budget: embeddedBudget ?? undefined,
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

  // Prior leagues embedded for the player pages, joined to this roster by id.
  const history = useMemo<History | null>(() => {
    if (!stats || !embeddedHistory?.length) return null;
    const leagues = buildHistoryLeagues(
      embeddedHistory.map((h) => ({
        id: h.id,
        label: h.label,
        files: h.files,
        options: {
          scoring: h.scoring ?? 'auto',
          flooring: h.flooring ?? 'auto',
          totalRounds: h.totalRounds ?? undefined,
        },
        enrichment: h.enrichment as RawEnrichmentFiles,
      })),
    );
    return joinHistory(
      stats.players.map((p) => ({ id: p.playerId, name: p.name })),
      leagues,
    );
  }, [stats]);

  // Genres per history league, keyed by league id, for the profile builder.
  const historyGenres = useMemo(() => {
    const map = new Map<string, Record<string, string[]>>();
    for (const h of embeddedHistory ?? []) map.set(h.id, h.genres ?? {});
    return map;
  }, []);

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

  const activeTab: TabId =
    route.kind === 'tab' ? route.tab : route.kind === 'round' ? 'Rounds' : 'Players';

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
            {stats.themeOutcomes.length > 0 && <span className="badge">themed rounds</span>}
            {isDemo && <span className="badge">sample data</span>}
          </span>
        </div>
        <nav className="tabs" role="tablist" aria-label="Sections">
          {TABS.map((t) => (
            <button
              key={t}
              role="tab"
              aria-selected={activeTab === t}
              tabIndex={activeTab === t ? 0 : -1}
              className={activeTab === t ? 'tab tab--on' : 'tab'}
              onClick={() => goTab(t)}
              onKeyDown={(e) => {
                if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
                  e.preventDefault();
                  const i = TABS.indexOf(t);
                  const next = e.key === 'ArrowRight' ? (i + 1) % TABS.length : (i - 1 + TABS.length) % TABS.length;
                  goTab(TABS[next]);
                }
              }}
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

      {stats.themeUnresolved.length > 0 && (
        <div className="warnings">
          {stats.themeUnresolved.map((w) => (
            <p className="alert" key={w}>
              Theme bonus: {w}
            </p>
          ))}
        </div>
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
        {route.kind === 'player' ? (
          (() => {
            const id = resolveSlug(route.slug, stats);
            if (!id)
              return (
                <Card title="No such player" wide>
                  <p className="dim">
                    Nobody in this league matches “{route.slug}”. Surnames are shortened, so links use the
                    redacted name.
                  </p>
                  <button className="linklike" onClick={() => goTab('Players' as TabId)}>
                    See all players →
                  </button>
                </Card>
              );
            return (
              <PlayerPage
                playerId={id}
                stats={stats}
                currentLabel={isBaked && embeddedLabel ? embeddedLabel : stats.league.name}
                history={history}
                historyGenres={historyGenres}
                onNavigate={(slug) => navigate(`player/${slug}`)}
              />
            );
          })()
        ) : route.kind === 'round' ? (
          <PlayByPlayTab stats={stats} focusSequence={route.sequence} />
        ) : activeTab === 'This Round' ? (
          <ThisRoundTab
            stats={stats}
            history={history}
            historyGenres={historyGenres}
            currentLabel={isBaked && embeddedLabel ? embeddedLabel : stats.league.name}
            onNavigate={navigate}
          />
        ) : activeTab === 'Standings' ? (
          <>
            <FuturePanel stats={stats} onOpenPlayer={(slug) => navigate(`player/${slug}`)} />
            <TheRaceTab stats={stats} onOpenPlayer={(slug) => navigate(`player/${slug}`)} />
          </>
        ) : activeTab === 'Songs' ? (
          <TheSongsTab stats={stats} />
        ) : activeTab === 'Room' ? (
          <TheRoomTab stats={stats} />
        ) : activeTab === 'Players' ? (
          <PlayersTab stats={stats} onOpenPlayer={(slug) => navigate(`player/${slug}`)} />
        ) : activeTab === 'Rounds' ? (
          <PlayByPlayTab stats={stats} />
        ) : null}
      </main>

      <footer className="foot">
        {isBaked && embeddedRedacted
          ? 'Surnames shortened to an initial. Parsed in your browser, with no backend — the only outside request is to Spotify, and only if you press play.'
          : 'Parsed entirely in your browser. Your league data never leaves this machine; pressing play on a song is the only thing that contacts Spotify.'}
      </footer>
    </div>
  );
}
