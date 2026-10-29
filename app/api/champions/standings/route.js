import { fail, ok } from '@/lib/api';
import { getChampionsStandings } from '@/lib/soccerway';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET() {
  try {
    return ok(await getChampionsStandings());
  } catch (error) {
    return fail(error);
  }
}
