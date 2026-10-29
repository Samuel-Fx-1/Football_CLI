export const SPACE = '   ';

export function pad(value, width) {
  const text = String(value ?? '');
  return text.length >= width ? text : text + ' '.repeat(width - text.length);
}

// The Python original deliberately uses one fewer space for two-digit ranks.
export function rankPrefix(rank) {
  return rank < 10 ? `${rank}.   ` : `${rank}.  `;
}

export function strip(value) {
  return String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim();
}
