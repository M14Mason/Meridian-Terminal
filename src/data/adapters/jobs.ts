// Data written by the scheduled GitHub jobs into the proxy's private cache.
import { api, ApiError } from '../../lib/api';
import type { Fetched } from '../client';
import { report } from '../health';

export class NoJobData extends Error {}

export async function jobData<T extends { at: number }>(name: string): Promise<Fetched<T>> {
  try {
    const data = await api<T>(`/api/cache/${name}`);
    report(`job:${name}`, { ok: true });
    return { data, fetchedAt: data.at, fromCache: false };
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) throw new NoJobData(`No data yet. The daily "${name}" job fills this; run it from GitHub Actions > Data jobs > Run workflow.`);
    throw e;
  }
}
