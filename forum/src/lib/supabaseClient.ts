import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

let clientInstance: SupabaseClient | undefined;
const PERF_DEBUG_ENABLED = process.env.NEXT_PUBLIC_PERF_DEBUG === "1";
const AUTH_DIAGNOSTICS_ENABLED =
  process.env.NEXT_PUBLIC_AUTH_DIAGNOSTICS === "1";
const TOKEN_ENDPOINT_SEGMENT = "/auth/v1/token";

let tokenRefreshWindow = {
  startedAt: 0,
  count: 0,
};

const trackTokenRefreshBurst = (url: string, method: string) => {
  if (!AUTH_DIAGNOSTICS_ENABLED || !url.includes(TOKEN_ENDPOINT_SEGMENT)) {
    return;
  }

  const now = Date.now();
  if (!tokenRefreshWindow.startedAt || now - tokenRefreshWindow.startedAt > 10000) {
    tokenRefreshWindow = {
      startedAt: now,
      count: 0,
    };
  }

  tokenRefreshWindow.count += 1;

  if (tokenRefreshWindow.count === 1 || tokenRefreshWindow.count % 5 === 0) {
    console.info("[AuthDiag][SupabaseFetch] token refresh", {
      method,
      url,
      countIn10s: tokenRefreshWindow.count,
    });
  }

  if (tokenRefreshWindow.count >= 15) {
    console.warn("[AuthDiag][SupabaseFetch] token refresh storm detected", {
      method,
      url,
      countIn10s: tokenRefreshWindow.count,
    });
  }
};

const createLoggingFetch = (timeoutMs: number = 45000): typeof fetch => {
  const baseFetch = globalThis.fetch.bind(globalThis);

  return async (input: RequestInfo | URL, init?: RequestInit) => {
    const url =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.href
          : input.url;
    const method = init?.method || "GET";
    const isAuthRequest = url.includes("/auth/v1/");
    const logPrefix = `[SupabaseFetch] ${method} ${url}`;
    const start = Date.now();

    trackTokenRefreshBurst(url, method);

    if (PERF_DEBUG_ENABLED) {
      console.log(logPrefix, "START", { start });
    } else if (AUTH_DIAGNOSTICS_ENABLED && isAuthRequest) {
      console.info("[AuthDiag][SupabaseFetch] auth request start", {
        method,
        url,
      });
    }

    const controller = new AbortController();
    const timeoutId: ReturnType<typeof setTimeout> = setTimeout(
      () => controller.abort(),
      timeoutMs,
    );

    if (init?.signal) {
      if (init.signal.aborted) {
        controller.abort();
      } else {
        init.signal.addEventListener("abort", () => controller.abort(), {
          once: true,
        });
      }
    }

    try {
      const res = await baseFetch(input, {
        ...init,
        signal: controller.signal,
      });
      const end = Date.now();
      if (PERF_DEBUG_ENABLED) {
        console.log(logPrefix, "END", {
          end,
          duration: end - start,
          status: res.status,
        });
      } else if (AUTH_DIAGNOSTICS_ENABLED && isAuthRequest) {
        console.info("[AuthDiag][SupabaseFetch] auth request end", {
          method,
          url,
          durationMs: end - start,
          status: res.status,
        });
      }
      return res;
    } catch (err) {
      const end = Date.now();
      if (PERF_DEBUG_ENABLED) {
        console.error(logPrefix, "ERROR", { end, duration: end - start, err });
      } else if (AUTH_DIAGNOSTICS_ENABLED && isAuthRequest) {
        console.warn("[AuthDiag][SupabaseFetch] auth request error", {
          method,
          url,
          durationMs: end - start,
          message: err instanceof Error ? err.message : String(err),
        });
      }
      throw err;
    } finally {
      clearTimeout(timeoutId);
    }
  };
};

export const createClient = (): SupabaseClient => {
  if (clientInstance) {
    return clientInstance;
  }

  clientInstance = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      global: PERF_DEBUG_ENABLED || AUTH_DIAGNOSTICS_ENABLED
        ? {
            fetch: createLoggingFetch(),
          }
        : undefined,
      auth: {
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: true,
      },
    }
  );

  return clientInstance!;
};
