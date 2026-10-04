import "server-only";

/**
 * Wrap a route handler so any thrown error becomes a JSON `{ error }` response
 * (and is logged) instead of an empty 500 the client can't parse.
 */
export function handle<A extends unknown[]>(fn: (...args: A) => Promise<Response>) {
  return async (...args: A): Promise<Response> => {
    try {
      return await fn(...args);
    } catch (e) {
      console.error("[api]", e);
      return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
    }
  };
}
