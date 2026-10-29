export const SOCCERWAY_ORIGIN = 'http://ca.soccerway.com/';

export const SEASON = '2016/17';

// The exact league paths used by Football_CLI.py (query strings removed, the
// archive resolves them to the closest 2016/17 snapshot).
export const LEAGUES = {
  epl: {
    name: 'Premier League',
    menuLabel: 'EPL',
    path: 'national/england/premier-league/20162017/regular-season/r35992/',
  },
  liga: {
    name: 'Liga BBVA',
    menuLabel: 'Liga BBVA',
    path: 'national/spain/primera-division/20162017/regular-season/r35880/',
  },
  serieA: {
    name: 'Serie A',
    menuLabel: 'Serie A',
    path: 'national/italy/serie-a/20162017/regular-season/r36003/',
  },
  ligue1: {
    name: 'Ligue 1',
    menuLabel: 'Ligue 1',
    path: 'national/france/ligue-1/20162017/regular-season/r35879/',
  },
  bundesliga: {
    name: 'Bundesliga',
    menuLabel: 'Bundesliga',
    path: 'national/germany/bundesliga/20162017/regular-season/r35823/',
  },
};

export const LEAGUE_ORDER = ['epl', 'liga', 'serieA', 'ligue1', 'bundesliga'];

export const UCL = {
  name: 'Champions League',
  topStatsPath:
    'international/europe/uefa-champions-league/20162017/group-stage/r35551/',
};

// Original: group_stage + groups[x], where groups[x] is e.g. "a/g10275/".
export const GROUPS = [
  { name: 'A', id: '10275', path: 'international/europe/uefa-champions-league/20162017/group-stage/group-a/g10275/' },
  { name: 'B', id: '10276', path: 'international/europe/uefa-champions-league/20162017/group-stage/group-b/g10276/' },
  { name: 'C', id: '10277', path: 'international/europe/uefa-champions-league/20162017/group-stage/group-c/g10277/' },
  { name: 'D', id: '10278', path: 'international/europe/uefa-champions-league/20162017/group-stage/group-d/g10278/' },
  { name: 'E', id: '10279', path: 'international/europe/uefa-champions-league/20162017/group-stage/group-e/g10279/' },
  { name: 'F', id: '10280', path: 'international/europe/uefa-champions-league/20162017/group-stage/group-f/g10280/' },
  { name: 'G', id: '10281', path: 'international/europe/uefa-champions-league/20162017/group-stage/group-g/g10281/' },
  { name: 'H', id: '10282', path: 'international/europe/uefa-champions-league/20162017/group-stage/group-h/g10282/' },
];
