export function line(text = '', color = null, extra = {}) {
  return { text, color, ...extra };
}

export function blank() {
  return line('');
}

export function heading(text, color = 'red') {
  return line(text, color, { bold: true, underline: true });
}

export function errorLines(message) {
  return [line(''), line(`  ! ${message}`, 'red', { bold: true })];
}

export function infoLines(message) {
  return [line(''), line(`  · ${message}`, 'yellow')];
}
