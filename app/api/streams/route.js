import { fail, ok } from '@/lib/api';
import { getStreams, getStreamsListing } from '@/lib/reddit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get('q');

  try {
    return ok(query ? await getStreams(query) : await getStreamsListing());
  } catch (error) {
    return fail(error);
  }
}
