/** Keep the deadline active until the response body is consumed, too. */
export async function fetchJsonWithTimeout<T>(url: string, options: RequestInit = {}, timeoutMs = 12_000): Promise<{ response: Response; data: T }> {
  const controller = new AbortController();
  const abort = () => controller.abort();
  if (options.signal?.aborted) controller.abort();
  options.signal?.addEventListener("abort", abort, { once: true });
  const timer = setTimeout(abort, timeoutMs);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    const data: T = await response.json();
    return { response, data };
  }
  finally {
    clearTimeout(timer);
    options.signal?.removeEventListener("abort", abort);
  }
}
