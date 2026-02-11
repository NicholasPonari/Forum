import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";

let clientInstance: SupabaseClient | undefined;

const createLoggingFetch = (timeoutMs: number = 45000): typeof fetch => {
  const baseFetch = globalThis.fetch.bind(globalThis);

  return async (input: RequestInfo | URL, init?: RequestInit) => {
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
      return res;
    } catch (err) {
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
      global: {
        fetch: createLoggingFetch(),
      },
      auth: {
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: true,
      },
    }
  );

  return clientInstance;
};
