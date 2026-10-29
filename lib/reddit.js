import { cacheGet, cacheSet } from './cache';
import { pad } from './format';
import { SourceError } from './errors';
import { errorLines, line } from './lines';

const UA =
  process.env.REDDIT_USER_AGENT ||
  'Football-CLI/1.1.4 (Next.js edition)';
const TOKEN_URL = 'https://www.reddit.com/api/v1/access_token';
const API_ROOT = 'https://oauth.reddit.com';
const REQUEST_TIMEOUT = 20000;

let tokenCache = null;

export function redditConfigured() {
  return Boolean(
    process.env.REDDIT_CLIENT_ID && process.env.REDDIT_CLIENT_SECRET,
  );
}

async function getToken() {
  if (!redditConfigured()) {
    throw new SourceError(
      'Reddit credentials are not configured. Add REDDIT_CLIENT_ID and REDDIT_CLIENT_SECRET to .env.local — see .env.example for setup steps.',
    );
  }

  if (tokenCache && tokenCache.expires > Date.now() + 60_000) {
    return tokenCache.value;
  }

  const basic = Buffer.from(
    `${process.env.REDDIT_CLIENT_ID}:${process.env.REDDIT_CLIENT_SECRET}`,
  ).toString('base64');

  const response = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: {
      authorization: `Basic ${basic}`,
      'content-type': 'application/x-www-form-urlencoded',
      'user-agent': UA,
    },
    body: 'grant_type=client_credentials',
    signal: AbortSignal.timeout(REQUEST_TIMEOUT),
    cache: 'no-store',
  });

  if (!response.ok) {
    throw new SourceError(
      `Reddit authentication failed (HTTP ${response.status}). Check the app credentials in .env.local.`,
    );
  }

  const data = await response.json();
  tokenCache = {
    value: data.access_token,
    expires: Date.now() + (data.expires_in || 3600) * 1000,
  };
  return tokenCache.value;
}

async function redditGet(path) {
  const token = await getToken();
  const response = await fetch(`${API_ROOT}${path}`, {
    headers: {
      authorization: `Bearer ${token}`,
      'user-agent': UA,
    },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT),
    cache: 'no-store',
  });

  if (response.status === 401) {
    tokenCache = null;
    throw new SourceError('Reddit rejected the access token. Try again.');
  }
  if (response.status === 429) {
    throw new SourceError(
      'Reddit is rate-limiting requests. Wait a moment and try again.',
    );
  }
  if (!response.ok) {
    throw new SourceError(`Reddit responded with HTTP ${response.status}.`);
  }

  return response.json();
}

async function getHot(subreddit, limit) {
  const cacheKey = `reddit:hot:${subreddit}:${limit}`;
  const cached = cacheGet(cacheKey);
  if (cached) return cached;

  const data = await redditGet(
    `/r/${subreddit}/hot?limit=${limit}&raw_json=1`,
  );
  const posts = (data?.data?.children || [])
    .filter((child) => child.kind === 't3')
    .map((child) => child.data);
  cacheSet(cacheKey, posts, 60 * 1000);
  return posts;
}

async function getComments(submissionId) {
  const data = await redditGet(
    `/comments/${submissionId}?limit=15&sort=top&raw_json=1`,
  );
  const listing = Array.isArray(data) ? data[1] : null;
  return (listing?.data?.children || [])
    .filter((child) => child.kind === 't1' && child.data?.body)
    .map((child) => child.data);
}

function safeSearch(pattern, text) {
  try {
    return new RegExp(pattern, 'i').test(text);
  } catch {
    return text.toLowerCase().includes(String(pattern).toLowerCase());
  }
}

// ---------------------------------------------------------------------------
// Live Streams
// ---------------------------------------------------------------------------

export async function getStreamsListing() {
  const posts = await getHot('soccerstreams', 20);
  const matchThreads = posts.filter((post) =>
    post.title.includes('Match Thread'),
  );

  const lines = [line('Live games that you can stream...', 'yellow'), line('')];

  if (!matchThreads.length) {
    lines.push(
      line(
        'There are currently no live games for streaming, please try again later...',
        'yellow',
      ),
    );
    return { lines, meta: { matches: 0 } };
  }

  for (const post of matchThreads) {
    lines.push(
      line(`Game Name: ${post.title.slice(13)}`, 'blue', { bold: true }),
    );
  }

  return {
    lines,
    meta: { matches: matchThreads.length, subreddit: 'soccerstreams' },
  };
}

export async function getStreams(query) {
  if (!query || query === '1') {
    return { lines: [], meta: { matches: 0 } };
  }

  const posts = await getHot('soccerstreams', 40);
  const matches = posts
    .filter((post) => safeSearch(query, post.title))
    .slice(0, 5);

  if (!matches.length) {
    return {
      lines: [
        line(''),
        line(
          `No stream threads matched "${query}". Try another team name or press 1 to exit.`,
          'yellow',
        ),
      ],
      meta: { matches: 0 },
    };
  }

  const lines = [];
  for (const post of matches) {
    lines.push(
      line(''),
      line(`Title: ${post.title}`, 'blue', { bold: true }),
      line(`Link: ${post.url}`, 'blue', { bold: true }),
      line('Pick your link!'),
      line(''),
    );

    try {
      const comments = await getComments(post.id);
      // Skip the first comment (the original code skips the moderator bot).
      for (const comment of comments.slice(1, 8)) {
        if (/acestream/i.test(comment.body)) continue;
        lines.push(line(comment.body.trim(), 'grey'));
      }
    } catch (error) {
      lines.push(...errorLines(`Could not load comments: ${error.message}`));
    }
  }

  return {
    lines,
    meta: { matches: matches.length, subreddit: 'soccerstreams' },
  };
}

// ---------------------------------------------------------------------------
// Highlights
// ---------------------------------------------------------------------------

const LEAGUE_STYLES = [
  { needle: 'Premier League', suffix: '– Premier League', label: 'Premier League', color: 'red' },
  { needle: 'La Liga', suffix: '– La Liga', label: 'La Liga', color: 'green' },
  { needle: 'Bundesliga', suffix: '– Bundesliga', label: 'Bundesliga', color: 'cyan' },
  { needle: 'Ligue 1', suffix: '– Ligue 1', label: 'Ligue 1', color: 'yellow' },
  { needle: 'Serie A', suffix: '– Serie A', label: 'Serie A', color: 'magenta' },
  { needle: 'MLS', suffix: '– MLS', label: 'MLS', color: 'blue' },
  { needle: 'Super Lig', suffix: '- Super Lig', label: 'Super Lig', color: 'blue' },
  { needle: 'Eredivisie', suffix: '– Eredivisie', label: 'Eredivisie', color: 'blue' },
  { needle: 'Europa League', suffix: '– UEFA Europa League', label: 'Europe League', color: 'grey' },
  { needle: 'Champions League', suffix: '– UEFA Champions League', label: 'Champions League', color: 'grey' },
];

function classifyHighlight(title) {
  for (const style of LEAGUE_STYLES) {
    if (title.includes(style.needle)) return style;
  }
  return null;
}

function buildHighlightLines(posts) {
  const lines = [line('')];

  for (const post of posts) {
    const title = post.title;
    if (!title.includes('vs')) continue;

    const date = title.slice(-11);
    const gameName = title.slice(0, -13);
    const style = classifyHighlight(title);

    if (style) {
      const game = gameName.replace(style.suffix, '');
      lines.push(
        line(
          `${pad(`${style.label} Highlights:`, 28)} ${date}  ${game}`,
          style.color,
          { bold: true },
        ),
      );
    } else if (title.includes(' ')) {
      lines.push(
        line(
          `${pad('Other Highlights:', 28)} ${date}  ${gameName}`,
          'blue',
          { bold: true },
        ),
      );
    }
  }

  return lines;
}

export async function getHighlightsListing() {
  const posts = await getHot('footballhighlights', 50);
  const lines = buildHighlightLines(posts);

  if (lines.length === 1) {
    lines.push(line('No highlights posts were found right now.', 'yellow'));
  }

  return { lines, meta: { posts: lines.length - 1 } };
}

export async function getHighlights(query) {
  if (!query || query === '1') {
    return { lines: [], meta: { posts: 0 } };
  }

  const posts = await getHot('footballhighlights', 100);
  const matches = posts
    .filter((post) => post.title.includes('vs') && safeSearch(query, post.title))
    .slice(0, 5);

  if (!matches.length) {
    return {
      lines: [
        line(''),
        line(
          `No highlights matched "${query}". Try another team name or press 1 to return.`,
          'yellow',
        ),
      ],
      meta: { posts: 0 },
    };
  }

  const lines = [];
  for (const post of matches) {
    lines.push(
      line(''),
      line(`Title: ${post.title}`, 'blue', { bold: true }),
      line(''),
    );
    if (post.selftext) {
      lines.push(line(post.selftext.trim()));
    } else {
      lines.push(line(`Link: ${post.url}`, 'grey'));
    }
  }

  return { lines, meta: { posts: matches.length } };
}
