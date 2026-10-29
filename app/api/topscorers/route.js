import { fail, ok } from '@/lib/api';
import { getTopScorers } from '@/lib/soccerway';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const league = searchParams.get('league') || 'epl';
  const competition = searchParams.get('competition');

  try {
    return ok(await getTopScorers({ league, competition }));
  } catch (error) {
    return fail(error);
  }
}
