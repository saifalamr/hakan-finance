// Bound every Supabase request (including Auth). Never retry writes automatically:
// a lost response does not prove that PostgreSQL rejected a committed write.
export async function boundedFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
  timeout = 15000,
) {
  const deadline = AbortSignal.timeout(timeout);
  const signal = init?.signal
    ? AbortSignal.any([init.signal, deadline])
    : deadline;
  return fetch(input, { ...init, signal });
}
