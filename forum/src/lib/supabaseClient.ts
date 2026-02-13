import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";

let clientInstance: SupabaseClient | undefined;

const createLoggingFetch = (timeoutMs: number = 45000): typeof fetch => {
  const baseFetch = globalThis.fetch.bind(globalThis);

  return async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const method = init?.method || "GET";
    const logPrefix = `[SupabaseFetch] ${method} ${url}`;
    const start = Date.now();

    if (process.env.NEXT_PUBLIC_PERF_DEBUG === "1") {
      console.log(logPrefix, "START", { start });
    }

    const controller = new AbortController();
    const timeoutId: ReturnType<typeof setTimeout> = setTimeout(
      () => controller.abort(),
      timeoutMs
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
      if (process.env.NEXT_PUBLIC_PERF_DEBUG === "1") {
        console.log(logPrefix, "END", { end, duration: end - start, status: res.status });
      }
      return res;
    } catch (err) {
      const end = Date.now();
      if (process.env.NEXT_PUBLIC_PERF_DEBUG === "1") {
        console.error(logPrefix, "ERROR", { end, duration: end - start, err });
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

  clientInstance = createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      global: process.env.NEXT_PUBLIC_PERF_DEBUG === "1"
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

  return clientInstance;
};
