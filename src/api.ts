async function parse<T>(response: Response): Promise<T> {
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'The request could not be completed.');
  return result as T;
}

export async function api<T>(path: string, body?: unknown): Promise<T> {
  return parse<T>(
    await fetch(
      `/api${path}`,
      body === undefined
        ? undefined
        : {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
          },
    ),
  );
}

/** Deletes one saved game. The server refuses the sample and any game that is still playing. */
export async function removeGame(id: string): Promise<{ ok: true; deleted: string }> {
  return parse(await fetch(`/api/matches/${encodeURIComponent(id)}`, { method: 'DELETE' }));
}
