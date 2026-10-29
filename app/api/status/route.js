import { NextResponse } from 'next/server';

import { SEASON } from '@/lib/config';
import { redditConfigured } from '@/lib/reddit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json({
    version: '1.1.4',
    season: SEASON,
    source: process.env.SOCCERWAY_LIVE === '1' ? 'live' : 'archive',
    redditConfigured: redditConfigured(),
    runtime: `Next.js ${process.env.NEXT_VERSION || '16'}`,
  });
}
