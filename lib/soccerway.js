import * as cheerio from 'cheerio';

import { cacheGet, cacheSet } from './cache';
import { GROUPS, LEAGUES, SOCCERWAY_ORIGIN, UCL } from './config';
import { SourceError } from './errors';
import { pad, rankPrefix, SPACE, strip } from './format';
import { errorLines, heading, line } from './lines';

const ARCHIVE_ROOT = 'https://web.archive.org/web/';
const DEFAULT_TIMESTAMP =
  process.env.SOCCERWAY_ARCHIVE_TIMESTAMP || '20170601000000';
const UCL_TIMESTAMP =
  process.env.SOCCERWAY_UCL_ARCHIVE_TIMESTAMP || '20161215000000';
const LIVE = process.env.SOCCERWAY_LIVE === '1';
const PAGE_TTL = 60 * 60 * 1000;
const REQUEST_TIMEOUT = Number(process.env.SOCCERWAY_TIMEOUT_MS || 30000);
const USER_AGENT =
  'Mozilla/5.0 (compatible; Football-CLI/1.1.4; +https://github.com/jctissier/Football-CLI)';

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function toOriginalUrl(input) {
  let href = String(input).trim();

  // If a link was already rewritten by the archive, pull the original out.
  const archived = href.match(
    /https?:\/\/web\.archive\.org\/web\/[^/]+\/(https?:\/\/[^#]+)/,
  );
  if (archived) href = archived[1];

  href = href.replace(/#.*$/, '');
  const url = new URL(href, SOCCERWAY_ORIGIN);
  url.search = '';
  return url.toString();
}

function archiveUrl(original, timestamp) {
  return `${ARCHIVE_ROOT}${timestamp || DEFAULT_TIMESTAMP}id_/${original}`;
}

async function loadPage(pathOrUrl, { timestamp, ttl = PAGE_TTL } = {}) {
  const original = toOriginalUrl(pathOrUrl);
  const cacheKey = `${LIVE ? 'live' : 'archive'}:${timestamp || ''}:${original}`;
  const cached = cacheGet(cacheKey);
  if (cached) return cheerio.load(cached);

  const target = LIVE
    ? original.replace(/^http:/, 'https:')
    : archiveUrl(original, timestamp);

  let lastError = null;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const response = await fetch(target, {
        headers: { 'user-agent': USER_AGENT, accept: 'text/html' },
        redirect: 'follow',
        cache: 'no-store',
        signal: AbortSignal.timeout(REQUEST_TIMEOUT),
      });

      if (response.status === 429) {
        throw new SourceError(
          'The Soccerway archive is rate-limiting requests. Wait a minute and try again.',
        );
      }
      if (!response.ok) {
        throw new SourceError(
          `The data source responded with HTTP ${response.status}.`,
        );
      }

      const html = await response.text();
      if (
        !html ||
        /Wayback Machine has not archived that URL/i.test(html) ||
        /This page is not available in the Wayback Machine/i.test(html)
      ) {
        throw new SourceError(
          'No archived snapshot was found for this Soccerway page.',
        );
      }

      cacheSet(cacheKey, html, ttl);
      return cheerio.load(html);
    } catch (error) {
      lastError = error;
      if (attempt < 2) {
        await sleep(700 * (attempt + 1));
      }
    }
  }

  if (lastError instanceof SourceError) throw lastError;
  if (lastError?.name === 'TimeoutError' || lastError?.name === 'AbortError') {
    throw new SourceError(
      'The Soccerway archive timed out. Please try again in a moment.',
    );
  }
  throw new SourceError(
    `Could not reach the Soccerway archive: ${lastError?.message || 'unknown error'}`,
  );
}

function texts($, $scope, selector) {
  return $scope
    .find(selector)
    .map((_, element) => strip($(element).text()))
    .get();
}

function leagueTable($) {
  const detailed = $('table.leaguetable.detailed-table').first();
  if (detailed.length) return detailed;
  return $('table.leaguetable').first();
}

function playerStatsTable($) {
  const tables = $('table.playerstats');
  let found = null;
  tables.each((_, element) => {
    if (found) return;
    const table = $(element);
    if (table.find('td.player.large-link').length) found = table;
  });
  return found || $.root();
}

function buildStandingsLines($, table, leagueName) {
  const teams = texts($, table, 'td.text.team.large-link');
  const played = texts($, table, 'td.number.total.mp');
  const wins = texts($, table, 'td.number.total.won.total_won');
  const draws = texts($, table, 'td.number.total.drawn.total_drawn');
  const losses = texts($, table, 'td.number.total.lost.total_lost');
  const goalDiff = texts($, table, 'td.number.gd');
  const points = texts($, table, 'td.number.points');

  if (!teams.length) {
    throw new SourceError(
      `No standings table was found for ${leagueName}. The page layout may have changed.`,
    );
  }

  const lines = [
    line(`Retrieving Standings for ${leagueName}...`, 'yellow'),
    line(''),
    heading('Rank   Team Name           MP  W   D   L  GD  Pts '),
  ];

  const rowCount = Math.min(teams.length, 20);
  for (let index = 0; index < rowCount; index += 1) {
    const rank = index + 1;
    const row =
      ` ${rankPrefix(rank)}${pad(teams[index], 18)}${SPACE}` +
      `${played[index] ?? '-'}${SPACE}` +
      `${wins[index] ?? '-'}${SPACE}` +
      `${draws[index] ?? '-'}${SPACE}` +
      `${losses[index] ?? '-'}${SPACE}` +
      `${goalDiff[index] ?? '-'}${SPACE}` +
      `${points[index] ?? '-'}${SPACE}`;

    let color = 'blue';
    if (rank === 1) color = 'green';
    else if (rank >= 18) color = 'red';

    lines.push(line(row, color));
  }

  return { lines, rows: rowCount };
}

export async function getStandings(leagueKey) {
  const league = LEAGUES[leagueKey];
  if (!league) throw new SourceError(`Unknown league "${leagueKey}".`);

  const $ = await loadPage(league.path);
  const table = leagueTable($);
  const { lines, rows } = buildStandingsLines($, table, league.name);

  return { lines, meta: { league: leagueKey, leagueName: league.name, rows } };
}

function buildGroupStandingsLines($, table, group) {
  const teams = texts($, table, 'td.text.team.large-link');
  const played = texts($, table, 'td.number.total.mp');
  const wins = texts($, table, 'td.number.total.won.total_won');
  const draws = texts($, table, 'td.number.total.drawn.total_drawn');
  const losses = texts($, table, 'td.number.total.lost.total_lost');
  const goalDiff = texts($, table, 'td.number.gd');
  const points = texts($, table, 'td.number.points');

  if (!teams.length) {
    throw new SourceError('No group table was found.');
  }

  const lines = [
    line(''),
    line(`Champions League Group ${group.name.toUpperCase()}`, 'red', {
      bold: true,
    }),
    heading('Rank  Team Name            MP  W   D   L  GD  Pts '),
  ];

  const rowCount = Math.min(teams.length, 4);
  for (let index = 0; index < rowCount; index += 1) {
    const row =
      ` ${index + 1}.   ${pad(teams[index], 18)}${SPACE}` +
      `${played[index] ?? '-'}${SPACE}` +
      `${wins[index] ?? '-'}${SPACE}` +
      `${draws[index] ?? '-'}${SPACE}` +
      `${losses[index] ?? '-'}${SPACE}` +
      `${goalDiff[index] ?? '-'}${SPACE}` +
      `${points[index] ?? '-'}${SPACE}`;
    lines.push(line(row, index < 2 ? 'green' : null));
  }

  return lines;
}

export async function getChampionsStandings() {
  let results = null;

  // The archived group-stage page contains all eight final group tables in a
  // single snapshot. Prefer it so every group is read from the same date;
  // Soccerway's individual group pages were captured at different times.
  try {
    const $ = await loadPage(UCL.topStatsPath, { timestamp: UCL_TIMESTAMP });
    const tables = GROUPS.map((group) => ({
      group,
      table: $(`table.leaguetable[data-group_id="${group.id}"]`).first(),
    }));

    if (tables.every(({ table }) => table.length)) {
      results = tables.map(({ group, table }) => {
        try {
          return { group, lines: buildGroupStandingsLines($, table, group) };
        } catch (error) {
          return { group, error };
        }
      });
    }
  } catch {
    // Fall back to the per-group pages below.
  }

  if (!results) {
    results = await mapPool(GROUPS, 3, async (group) => {
      try {
        const $ = await loadPage(group.path, { timestamp: UCL_TIMESTAMP });
        return {
          group,
          lines: buildGroupStandingsLines($, leagueTable($), group),
        };
      } catch (error) {
        return { group, error };
      }
    });
  }

  const lines = [];
  let okGroups = 0;
  let firstError = null;

  for (const result of results) {
    if (result.error) {
      firstError ||= result.error;
      lines.push(
        line(''),
        ...errorLines(`Group ${result.group.name}: ${result.error.message}`),
      );
    } else {
      lines.push(...result.lines);
      okGroups += 1;
    }
  }

  if (!okGroups) {
    throw firstError || new SourceError('Champions League data is unavailable.');
  }

  return { lines, meta: { groups: okGroups } };
}

function extractMatches($) {
  const table = $('table.matches').first();
  const scope = table.length ? table : $.root();

  const days = texts($, scope, 'td.day.no-repetition');
  const dates = texts($, scope, 'td.date.no-repetition');
  const teamsA = texts($, scope, 'td.team.team-a');
  const scores = texts($, scope, 'td.score-time.score');
  const teamsB = texts($, scope, 'td.team.team-b');
  const hrefs = scope
    .find('td.events-button.button.first-occur a')
    .map((_, element) => $(element).attr('href'))
    .get();

  const count = Math.min(days.length, 20);
  const matches = [];
  for (let index = 0; index < count; index += 1) {
    matches.push({
      day: days[index] ?? '',
      date: dates[index] ?? '',
      teamA: teamsA[index] ?? '',
      score: scores[index] ?? '',
      teamB: teamsB[index] ?? '',
      href: hrefs[index] || null,
    });
  }
  return matches;
}

async function fetchMatchEvents(href) {
  if (!href) return [];
  try {
    const $ = await loadPage(href);
    const root = $.root();
    const left = texts($, root, 'td.player.player-a');
    const icons = texts($, root, 'td.event-icon');
    const right = texts($, root, 'td.player.player-b');
    const count = Math.min(left.length, icons.length, right.length, 15);
    const events = [];
    for (let index = 0; index < count; index += 1) {
      events.push({
        left: left[index],
        icon: icons[index],
        right: right[index],
      });
    }
    return events;
  } catch {
    // A missing match-detail snapshot should not take down the whole fixture
    // list; the original scraper also tolerated incomplete detail pages.
    return [];
  }
}

async function mapPool(items, concurrency, worker) {
  const results = new Array(items.length);
  let cursor = 0;

  async function run() {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await worker(items[index], index);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, run),
  );
  return results;
}

function matchEventLines(events) {
  const lines = [];
  for (const event of events) {
    lines.push(
      line(
        `${SPACE}${pad(event.left, 42)}${event.icon}${SPACE}${event.right}`,
        'blue',
      ),
    );
  }
  return lines;
}

async function matchBlock(match, detailConcurrency) {
  const events = await fetchMatchEvents(match.href);
  return [
    line(''),
    line(
      `${match.day} ${match.date}${SPACE}${pad(match.teamA, 18)}${match.score}${SPACE}${pad(match.teamB, 18)}`,
      'red',
      { bold: true },
    ),
    line('Match Details:', 'blue', { bold: true }),
    ...matchEventLines(events),
  ];
}

export async function getMatches({
  league: leagueKey,
  competition,
  byGroup = false,
} = {}) {
  const lines = [];
  const meta = { competition: competition || 'league', matches: 0 };

  if (competition === 'ucl') {
    if (byGroup) {
      for (const group of GROUPS) {
        lines.push(
          line(''),
          line(
            `Retrieving Match Scores for Champions League Group ${group.name.toUpperCase()}`,
            'yellow',
          ),
        );
        try {
          const $ = await loadPage(group.path, { timestamp: UCL_TIMESTAMP });
          const matches = extractMatches($);
          const blocks = await mapPool(matches, 4, (match) =>
            matchBlock(match, 4),
          );
          for (const block of blocks) lines.push(...block);
          meta.matches += matches.length;
        } catch (error) {
          lines.push(...errorLines(`Group ${group.name}: ${error.message}`));
        }
      }
      if (!meta.matches) {
        throw new SourceError('No Champions League fixtures were found.');
      }
      return { lines, meta };
    }

    const $ = await loadPage(UCL.topStatsPath, { timestamp: UCL_TIMESTAMP });
    const matches = extractMatches($);
    if (!matches.length) {
      throw new SourceError(
        'No Champions League fixtures were found. The page layout may have changed.',
      );
    }
    const blocks = await mapPool(matches, 4, (match) => matchBlock(match, 4));
    for (const block of blocks) lines.push(...block);
    meta.matches = matches.length;
    return { lines, meta };
  }

  const league = LEAGUES[leagueKey];
  if (!league) throw new SourceError(`Unknown league "${leagueKey}".`);

  lines.push(
    line(
      `Retrieving Match Scores and Details for ${league.name}...`,
      'yellow',
    ),
    line(''),
  );
  const $ = await loadPage(league.path);
  const matches = extractMatches($);
  if (!matches.length) {
    throw new SourceError(
      `No fixtures were found for ${league.name}. The page layout may have changed.`,
    );
  }
  const blocks = await mapPool(matches, 4, (match) => matchBlock(match, 4));
  for (const block of blocks) lines.push(...block);
  meta.league = leagueKey;
  meta.leagueName = league.name;
  meta.matches = matches.length;
  return { lines, meta };
}

function topScorerLines(players, teams, goals, competitionName) {
  const lines = [
    line(''),
    line(`Retrieving Top Scorers for ${competitionName}...`, 'yellow'),
    heading('Rank   Player                 Team            Goals'),
  ];

  const count = Math.min(players.length, 15);
  for (let index = 0; index < count; index += 1) {
    const padAfterRank = index < 9 ? '.    ' : '.   ';
    lines.push(
      line(
        ` ${index + 1}${padAfterRank}${pad(players[index], 20)}${SPACE}${pad(teams[index], 15)}${SPACE}${goals[index] ?? '-'}`,
        'blue',
      ),
    );
  }
  return lines;
}

export async function getTopScorers({ league: leagueKey, competition } = {}) {
  if (competition === 'ucl') {
    const $ = await loadPage(UCL.topStatsPath, { timestamp: UCL_TIMESTAMP });
    const table = playerStatsTable($);
    const players = texts($, table, 'td.player.large-link');
    const teams = texts($, table, 'td.team.large-link');
    const goals = texts($, table, 'td.number.goals');
    if (!players.length) {
      throw new SourceError(
        'No Champions League top scorers were found. The page layout may have changed.',
      );
    }
    return {
      lines: topScorerLines(players, teams, goals, UCL.name),
      meta: { competition: 'ucl', rows: Math.min(players.length, 15) },
    };
  }

  const league = LEAGUES[leagueKey];
  if (!league) throw new SourceError(`Unknown league "${leagueKey}".`);

  const $ = await loadPage(league.path);
  const table = playerStatsTable($);
  const players = texts($, table, 'td.player.large-link');
  const teams = texts($, table, 'td.team.large-link');
  const goals = texts($, table, 'td.number.goals');
  if (!players.length) {
    throw new SourceError(
      `No top scorers were found for ${league.name}. The page layout may have changed.`,
    );
  }

  return {
    lines: topScorerLines(players, teams, goals, league.name),
    meta: { league: leagueKey, rows: Math.min(players.length, 15) },
  };
}
