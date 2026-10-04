/** fetch + JSON with errors that say which request failed and what came back. */
export async function fetchJson<T = unknown>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  const text = await res.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    // fall through to the error below
  }
  if (!res.ok || data === null) {
    const detail = (data as { error?: string } | null)?.error ?? (text.trim().slice(0, 200) || "empty response");
    throw new Error(`${init?.method ?? "GET"} ${url} failed (${res.status}): ${detail}`);
  }
  return data as T;
}
