import { NextResponse } from 'next/server';

import { errorLines } from './lines';

export function ok(payload) {
  return NextResponse.json({ ok: true, ...payload });
}

export function fail(error) {
  const message = error?.message || 'Unexpected source error.';
  return NextResponse.json(
    { ok: false, error: message, lines: errorLines(message) },
    { status: 502 },
  );
}
