import { fail, ok } from '@/lib/api';
import { getStandings } from '@/lib/soccerway';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const league = searchParams.get('league') || 'epl';
  try {
    return ok(await getStandings(league));
  } catch (error) {
    return fail(error);
  }
}
