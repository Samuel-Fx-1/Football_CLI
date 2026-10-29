'use client';

import { useEffect, useRef, useState } from 'react';

import { errorLines, line } from '@/lib/lines';

const DEFAULT_STATUS = {
  version: '1.1.4',
  season: '2016/17',
  source: 'archive',
  redditConfigured: false,
  runtime: 'Next.js 16',
};

const PROMPTS = {
  streams:
    "Enter the name of the game you want to watch (Any team's name that you see above will work) [1]Exit:",
  highlights: 'Which game highlights do you want (Search by Team Name)?',
};

const LEAGUE_BY_KEY = {
  1: { id: 'epl', label: 'EPL' },
  2: { id: 'liga', label: 'Liga BBVA' },
  3: { id: 'serieA', label: 'Serie A' },
  4: { id: 'ligue1', label: 'Ligue 1' },
  5: { id: 'bundesliga', label: 'Bundesliga' },
};

const MENU_DEFS = {
  main: {
    title: 'Main Menu:',
    optionsLine:
      '[1]Standings  [2]Match Scores  [3]Top Scorers  [4]Champions League  [5]Live Streams  [6]Highlights  [7]Exit',
    options: [
      { key: '1', label: 'Standings', hint: 'League tables' },
      { key: '2', label: 'Match Scores', hint: 'Fixtures & events' },
      { key: '3', label: 'Top Scorers', hint: 'Golden boot race' },
      { key: '4', label: 'Champions League', hint: 'Groups A–H' },
      { key: '5', label: 'Live Streams', hint: 'Reddit threads' },
      { key: '6', label: 'Highlights', hint: 'Reddit highlights' },
      { key: '7', label: 'Exit', hint: 'Close session' },
    ],
  },
  league: {
    title: 'Which League do you want?',
    optionsLine:
      '[1]EPL  [2]Liga BBVA  [3]Serie A  [4]Ligue 1  [5]Bundesliga  [6]Main Menu',
    options: [
      { key: '1', label: 'EPL', hint: 'Premier League' },
      { key: '2', label: 'Liga BBVA', hint: 'Spain' },
      { key: '3', label: 'Serie A', hint: 'Italy' },
      { key: '4', label: 'Ligue 1', hint: 'France' },
      { key: '5', label: 'Bundesliga', hint: 'Germany' },
      { key: '6', label: 'Main Menu', hint: 'Go back' },
    ],
  },
  champions: {
    title: 'Champions League:',
    optionsLine:
      '[1]Group Stage Standings  [2]Group Stage Results  [3]Results by Group  [4]TopScorers  [5]Main Menu',
    options: [
      { key: '1', label: 'Group Stage Standings', hint: 'Tables A–H' },
      { key: '2', label: 'Group Stage Results', hint: 'All fixtures' },
      { key: '3', label: 'Results by Group', hint: 'Group by group' },
      { key: '4', label: 'Top Scorers', hint: 'Competition chart' },
      { key: '5', label: 'Main Menu', hint: 'Go back' },
    ],
  },
  streams: {
    options: [{ key: '1', label: 'Exit', hint: 'Back to main menu' }],
  },
  highlights: {
    options: [{ key: '1', label: 'Main Menu', hint: 'Back to main menu' }],
  },
};

const CHAMPIONS_ACTIONS = {
  1: {
    url: '/api/champions/standings',
    note: 'reading all eight group tables…',
  },
  2: {
    url: '/api/matches?competition=ucl',
    note: 'reading Champions League results…',
  },
  3: {
    url: '/api/matches?competition=ucl&byGroup=1',
    note: 'fetching every group — a cold archive fetch can take several minutes…',
  },
  4: {
    url: '/api/topscorers?competition=ucl',
    note: 'reading the Champions League scorers…',
  },
};

const DECK_TITLES = {
  main: 'Main Menu',
  league: 'Choose a League',
  champions: 'Champions League',
  streams: 'Live Streams',
  highlights: 'Highlights',
  boot: 'Starting Up',
  closed: 'Session Closed',
};

function RichText({ text }) {
  const value = String(text ?? '');
  if (!value) return <>{'\u00A0'}</>;

  const parts = value.split(/(https?:\/\/[^\s<>"']+)/g);
  if (parts.length === 1) return <>{value}</>;

  return (
    <>
      {parts.map((part, index) =>
        /^https?:\/\//.test(part) ? (
          <a
            key={`${part}-${index}`}
            href={part}
            target="_blank"
            rel="noopener noreferrer"
          >
            {part}
          </a>
        ) : (
          <span key={`text-${index}`}>{part}</span>
        ),
      )}
    </>
  );
}

export default function Terminal() {
  const [lines, setLines] = useState([]);
  const [mode, setMode] = useState('boot');
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [loadingNote, setLoadingNote] = useState('retrieving data…');
  const [status, setStatus] = useState(DEFAULT_STATUS);
  const [history, setHistory] = useState([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [clock, setClock] = useState('--:--:--');

  const screenRef = useRef(null);
  const inputRef = useRef(null);
  const idRef = useRef(0);
  const bootedRef = useRef(false);
  const sessionRef = useRef(0);
  const pendingActionRef = useRef(null);

  function append(incoming) {
    if (!incoming?.length) return;
    const decorated = incoming.map((entry) => ({
      ...entry,
      id: idRef.current++,
    }));
    setLines((previous) => [...previous, ...decorated]);
  }

  function invalid(message) {
    append([line(''), line(`  ! ${message}`, 'red')]);
  }

  function showMenu(name) {
    const definition = MENU_DEFS[name];
    setMode(name);
    if (!definition?.title) return;
    append([
      line(''),
      line(definition.title, 'red', { bold: true }),
      line(definition.optionsLine, 'red', { bold: true }),
    ]);
  }

  async function startSession() {
    const session = ++sessionRef.current;
    setLines([]);
    setMode('boot');
    setInput('');
    setBusy(false);
    setHistoryIndex(-1);
    pendingActionRef.current = null;

    append([
      line(''),
      line('⚽  F O O T B A L L - C L I', 'green', { bold: true }),
      line('live stats · scores · streams · highlights', 'grey'),
      line('v1.1.4 · Next.js edition · original Python source unchanged', 'grey'),
      line(''),
      line('booting terminal…', 'yellow'),
    ]);

    let info = DEFAULT_STATUS;
    try {
      const response = await fetch('/api/status', { cache: 'no-store' });
      if (response.ok) {
        info = { ...DEFAULT_STATUS, ...(await response.json()) };
      }
    } catch {
      // The terminal still works; the source line simply stays on defaults.
    }

    if (session !== sessionRef.current) return;

    setStatus(info);
    append([
      line(''),
      line(
        `source   soccerway ${info.source === 'live' ? 'live site' : 'archive · 2016/17'}`,
        'grey',
      ),
      line(
        `reddit   ${
          info.redditConfigured
            ? 'oauth ready'
            : 'not configured · add credentials to .env.local'
        }`,
        info.redditConfigured ? 'grey' : 'red',
      ),
      line(
        `runtime  ${info.runtime || 'Next.js 16'} · Football_CLI.py untouched`,
        'grey',
      ),
      line(''),
      line('Type a menu number and press Enter.', 'grey'),
    ]);
    showMenu('main');
  }

  useEffect(() => {
    if (bootedRef.current) return;
    bootedRef.current = true;
    void startSession();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const screen = screenRef.current;
    if (screen) screen.scrollTop = screen.scrollHeight;
  }, [lines, busy, mode]);

  useEffect(() => {
    if (
      mode !== 'boot' &&
      mode !== 'closed' &&
      typeof window !== 'undefined' &&
      window.matchMedia?.('(pointer: fine)').matches
    ) {
      inputRef.current?.focus({ preventScroll: true });
    }
  }, [mode]);

  useEffect(() => {
    const update = () =>
      setClock(new Date().toLocaleTimeString('en-GB', { hour12: false }));
    update();
    const timer = setInterval(update, 1000);
    return () => clearInterval(timer);
  }, []);

  function clearScreen() {
    setLines([]);
    if (mode === 'main' || mode === 'league' || mode === 'champions') {
      showMenu(mode);
    } else if (mode === 'streams') {
      append([line(''), line(PROMPTS.streams, 'red', { bold: true })]);
    } else if (mode === 'highlights') {
      append([line(''), line(PROMPTS.highlights, 'red', { bold: true })]);
    } else if (mode === 'closed') {
      append([line('Bye', 'yellow')]);
    }
  }

  useEffect(() => {
    function onKeyDown(event) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'l') {
        event.preventDefault();
        clearScreen();
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  async function requestLines(url, note) {
    setBusy(true);
    setLoadingNote(note || 'retrieving data…');
    let success = false;

    try {
      const response = await fetch(url, {
        cache: 'no-store',
        signal: AbortSignal.timeout(300_000),
      });
      const data = await response.json().catch(() => null);

      if (!data) {
        throw new Error(`Request failed with HTTP ${response.status}.`);
      }

      const hasLines = Array.isArray(data.lines) && data.lines.length > 0;
      if (hasLines) append(data.lines);

      success = response.ok && data.ok !== false;
      if (!success && !hasLines) {
        throw new Error(data.error || 'The data source returned no data.');
      }
    } catch (error) {
      append(errorLines(error.message || 'Request failed.'));
      success = false;
    }

    setBusy(false);
    return success;
  }

  async function runFeature(url, nextMode, note) {
    const success = await requestLines(url, note);
    if (!success) {
      showMenu('main');
      return;
    }
    append([line(''), line(PROMPTS[nextMode], 'red', { bold: true })]);
    setMode(nextMode);
  }

  async function processMain(value) {
    if (!['1', '2', '3', '4', '5', '6', '7'].includes(value)) {
      invalid('Choose a number from 1 to 7.');
      return;
    }

    if (value === '1') {
      pendingActionRef.current = 'standings';
      showMenu('league');
      return;
    }
    if (value === '2') {
      pendingActionRef.current = 'matches';
      showMenu('league');
      return;
    }
    if (value === '3') {
      pendingActionRef.current = 'topscorers';
      showMenu('league');
      return;
    }
    if (value === '4') {
      showMenu('champions');
      return;
    }
    if (value === '5') {
      await runFeature('/api/streams', 'streams', 'talking to Reddit…');
      return;
    }
    if (value === '6') {
      await runFeature('/api/highlights', 'highlights', 'talking to Reddit…');
      return;
    }
    append([line(''), line('Bye', 'yellow')]);
    setMode('closed');
  }

  async function processLeague(value) {
    if (value === '6') {
      showMenu('main');
      return;
    }

    const league = LEAGUE_BY_KEY[value];
    if (!league) {
      invalid('Choose a league from 1 to 6.');
      return;
    }

    const action = pendingActionRef.current || 'standings';
    const actions = {
      standings: {
        url: `/api/standings?league=${league.id}`,
        note: 'reading the league table…',
      },
      matches: {
        url: `/api/matches?league=${league.id}`,
        note: 'reading fixtures & match events…',
      },
      topscorers: {
        url: `/api/topscorers?league=${league.id}`,
        note: 'reading the scorers chart…',
      },
    };
    const selected = actions[action] || actions.standings;

    await requestLines(selected.url, selected.note);
    pendingActionRef.current = null;
    showMenu('main');
  }

  async function processChampions(value) {
    if (value === '5') {
      showMenu('main');
      return;
    }

    const action = CHAMPIONS_ACTIONS[value];
    if (!action) {
      invalid('Choose a Champions League option from 1 to 5.');
      return;
    }

    await requestLines(action.url, action.note);
    showMenu('main');
  }

  async function processStreams(value) {
    if (value === '1') {
      showMenu('main');
      return;
    }
    await requestLines(
      `/api/streams?q=${encodeURIComponent(value)}`,
      'searching Reddit stream threads…',
    );
    showMenu('main');
  }

  async function processHighlights(value) {
    if (value === '1') {
      showMenu('main');
      return;
    }
    await requestLines(
      `/api/highlights?q=${encodeURIComponent(value)}`,
      'searching Reddit highlights…',
    );
    showMenu('main');
  }

  async function processCommand(value) {
    if (mode === 'main') await processMain(value);
    else if (mode === 'league') await processLeague(value);
    else if (mode === 'champions') await processChampions(value);
    else if (mode === 'streams') await processStreams(value);
    else if (mode === 'highlights') await processHighlights(value);
  }

  function handleSubmit(event) {
    event.preventDefault();
    if (busy || mode === 'boot' || mode === 'closed') return;
    const value = input.trim();
    if (!value) return;

    setInput('');
    setHistory((previous) => [value, ...previous.filter((item) => item !== value)].slice(0, 50));
    setHistoryIndex(-1);
    append([line(`❯ ${value}`, 'grey')]);
    void processCommand(value);
  }

  function runOption(key) {
    if (busy || mode === 'boot' || mode === 'closed') return;
    setInput('');
    setHistoryIndex(-1);
    append([line(`❯ ${key}`, 'grey')]);
    void processCommand(key);
  }

  function handleInputKeyDown(event) {
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      if (!history.length) return;
      const next = Math.min(historyIndex + 1, history.length - 1);
      setHistoryIndex(next);
      setInput(history[next]);
    } else if (event.key === 'ArrowDown') {
      event.preventDefault();
      if (historyIndex <= 0) {
        setHistoryIndex(-1);
        setInput('');
        return;
      }
      const next = historyIndex - 1;
      setHistoryIndex(next);
      setInput(history[next]);
    } else if (event.key === 'Escape') {
      setInput('');
      setHistoryIndex(-1);
    }
  }

  const deckOptions = MENU_DEFS[mode]?.options || [];
  const deckTitle = DECK_TITLES[mode] || 'Session';
  const statusText = busy
    ? 'FETCHING'
    : mode === 'boot'
      ? 'BOOTING'
      : mode === 'closed'
        ? 'CLOSED'
        : 'READY';
  const statusDot = busy
    ? 'busy'
    : mode === 'closed'
      ? 'closed'
      : 'online';
  const placeholder =
    mode === 'streams'
      ? 'Team name, e.g. Barcelona…'
      : mode === 'highlights'
        ? 'Team name, e.g. Arsenal…'
        : 'Enter a menu number…';

  return (
    <div className="page">
      <div className="ambient" aria-hidden="true" />

      <section className="terminal" aria-label="Football-CLI terminal">
        <header className="titlebar">
          <div className="traffic" aria-hidden="true">
            <span className="dot dot-red" />
            <span className="dot dot-yellow" />
            <span className="dot dot-green" />
          </div>
          <div className="title">
            <span className="title-text">football-cli — terminal</span>
            <span className="title-sub"> / season {status.season}</span>
          </div>
          <span className="chip">
            {status.source === 'live' ? 'LIVE' : 'ARCHIVE'}
          </span>
        </header>

        <div className="terminal-body">
          <div
            className="screen"
            ref={screenRef}
            onMouseUp={(event) => {
              if (event.target.closest('a, button')) return;
              if (!window.getSelection()?.toString()) {
                inputRef.current?.focus({ preventScroll: true });
              }
            }}
          >
            {lines.map((entry) => (
              <div
                key={entry.id}
                className={[
                  'line',
                  entry.color ? `c-${entry.color}` : '',
                  entry.bold ? 'bold' : '',
                  entry.underline ? 'underline' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
              >
                <RichText text={entry.text} />
              </div>
            ))}

            {busy && (
              <div className="line loading-line">
                <span className="cursor-block" aria-hidden="true" />
                <span>{loadingNote}</span>
                <span className="loading-dots" aria-hidden="true" />
              </div>
            )}
          </div>

          <aside className="deck" aria-label="Command deck">
            <div className="deck-section">
              <div className="deck-eyebrow">Command Deck</div>
              <div className="deck-title">{deckTitle}</div>
              <div className="deck-options">
                {deckOptions.map((option) => (
                  <button
                    key={option.key}
                    type="button"
                    className="deck-option"
                    onClick={() => runOption(option.key)}
                    disabled={busy || mode === 'boot' || mode === 'closed'}
                  >
                    <span className="deck-key">{option.key}</span>
                    <span className="deck-option-label">{option.label}</span>
                    <span className="deck-option-hint">{option.hint}</span>
                  </button>
                ))}
                {!deckOptions.length && (
                  <div className="deck-empty">
                    {mode === 'boot' ? 'starting…' : 'session ended'}
                  </div>
                )}
              </div>
            </div>

            <div className="deck-section deck-rule">
              <div className="deck-eyebrow">System</div>
              <div className="sys-row">
                <span className="sys-key">source</span>
                <span className="sys-val">
                  {status.source === 'live' ? 'Soccerway live' : 'Wayback archive'}
                </span>
              </div>
              <div className="sys-row">
                <span className="sys-key">season</span>
                <span className="sys-val">{status.season}</span>
              </div>
              <div className="sys-row">
                <span className="sys-key">reddit</span>
                <span
                  className={`sys-val ${status.redditConfigured ? 'good' : 'bad'}`}
                >
                  {status.redditConfigured ? 'OAuth ready' : 'not configured'}
                </span>
              </div>
              <div className="sys-row">
                <span className="sys-key">runtime</span>
                <span className="sys-val">{status.runtime}</span>
              </div>
              <div className="sys-row">
                <span className="sys-key">original</span>
                <span className="sys-val good">Python · untouched</span>
              </div>
            </div>

            <div className="deck-section deck-rule">
              <div className="deck-eyebrow">Table key</div>
              <div className="legend-row">
                <span className="legend-dot legend-green" /> Champions League
              </div>
              <div className="legend-row">
                <span className="legend-dot legend-blue" /> Mid-table
              </div>
              <div className="legend-row">
                <span className="legend-dot legend-red" /> Relegation
              </div>
            </div>

            <div className="deck-actions">
              <button
                type="button"
                className="ghost-button"
                onClick={clearScreen}
                disabled={busy || mode === 'boot'}
              >
                Clear
              </button>
              <button
                type="button"
                className="ghost-button"
                onClick={() => void startSession()}
                disabled={busy || mode === 'boot'}
              >
                Restart
              </button>
            </div>
          </aside>
        </div>

        <div className="mobile-deck" aria-label="Menu shortcuts">
          {deckOptions.map((option) => (
            <button
              key={option.key}
              type="button"
              className="mobile-option"
              onClick={() => runOption(option.key)}
              disabled={busy || mode === 'boot' || mode === 'closed'}
            >
              <span className="mobile-key">{option.key}</span>
              {option.label}
            </button>
          ))}
          <button
            type="button"
            className="mobile-option mobile-clear"
            onClick={clearScreen}
            disabled={busy || mode === 'boot'}
          >
            CLR
          </button>
        </div>

        {mode === 'closed' ? (
          <div className="composer composer-closed">
            <span className="composer-prompt">■</span>
            <span className="composer-closed-text">
              Session ended. Thanks for watching.
            </span>
            <button
              type="button"
              className="run-button"
              onClick={() => void startSession()}
            >
              RESTART
            </button>
          </div>
        ) : (
          <form className="composer" onSubmit={handleSubmit}>
            <span className="composer-prompt" aria-hidden="true">
              ❯
            </span>
            <input
              ref={inputRef}
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={handleInputKeyDown}
              placeholder={placeholder}
              disabled={busy || mode === 'boot'}
              autoComplete="off"
              autoCapitalize="off"
              spellCheck={false}
              aria-label="Terminal command"
            />
            <span className="composer-hint">ENTER</span>
            <button
              type="submit"
              className="run-button"
              disabled={busy || mode === 'boot' || !input.trim()}
            >
              RUN
            </button>
          </form>
        )}

        <footer className="statusbar">
          <span className={`status-dot ${statusDot}`} aria-hidden="true" />
          <span>{statusText}</span>
          <span className="status-sep">/</span>
          <span className="status-muted">
            {status.source === 'live' ? 'soccerway live' : 'soccerway archive'}
          </span>
          <span className="grow" />
          <span className="status-muted status-hint">ctrl+l to clear</span>
          <span className="status-sep">/</span>
          <span>{clock}</span>
        </footer>
      </section>

      <p className="page-note">
        A Next.js rebuild of{' '}
        <a
          href="https://github.com/jctissier/Football-CLI"
          target="_blank"
          rel="noopener noreferrer"
        >
          Football-CLI
        </a>{' '}
        · the original <code>Football_CLI.py</code> is untouched · data from the
        Soccerway 2016/17 archive
      </p>
    </div>
  );
}
