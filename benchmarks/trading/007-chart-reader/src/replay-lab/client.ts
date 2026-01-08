export interface ReplayLabConfig {
  apiKey: string;
  baseUrl: string;
}

export function getConfig(): ReplayLabConfig {
  const apiKey = process.env['REPLAY_LAB_API_KEY'];
  const baseUrl = process.env['REPLAY_LAB_BASE_URL'];

  if (apiKey === undefined || apiKey === '') {
    throw new Error('REPLAY_LAB_API_KEY environment variable is required');
  }

  if (baseUrl === undefined || baseUrl === '') {
    throw new Error('REPLAY_LAB_BASE_URL environment variable is required');
  }

  return { apiKey, baseUrl };
}

export async function replayLabFetch<T>(
  path: string,
  options?: RequestInit
): Promise<T> {
  const config = getConfig();
  const url = `${config.baseUrl}${path}`;

  const headers: HeadersInit = {
    'x-api-key': config.apiKey,
  };

  if (options?.headers !== undefined) {
    Object.assign(headers, options.headers);
  }

  const response = await fetch(url, {
    ...options,
    headers,
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Replay Lab API error (${String(response.status)}): ${body}`);
  }

  return await (response.json() as Promise<T>);
}

