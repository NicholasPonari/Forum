"use client";

import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  ReactNode,
} from "react";
import { Session, User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabaseClient";
import { UserProfile } from "@/lib/types/db";

const SESSION_RESTORE_TIMEOUT_MS = 15000;
const PROFILE_FETCH_TIMEOUT_MS = 15000;
const PROFILE_FETCH_DEBOUNCE_MS = 1000;
const AUTH_DIAGNOSTICS_ENABLED =
  process.env.NEXT_PUBLIC_AUTH_DIAGNOSTICS === "1";

interface AuthContextType {
  user: User | null;
  session: Session | null;
  profile: UserProfile | null;
  loading: boolean;
  isMember: boolean;
  blockchainVerified: boolean | null;
  signOut: () => Promise<void>;
  setSession: (session: Session | null) => void;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSessionState] = useState<Session | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [blockchainVerified, setBlockchainVerified] = useState<boolean | null>(
    null,
  );
  // Memoize the client to avoid creating a new instance on every render
  const supabase = useMemo(() => createClient(), []);
  const profileFetchGuardRef = useRef<{
    userId: string | null;
    inFlight: boolean;
    lastStartedAt: number;
  }>({ userId: null, inFlight: false, lastStartedAt: 0 });
  const isMountedRef = useRef(true);
  const activeUserIdRef = useRef<string | null>(null);
  const authBootStartedAtRef = useRef<number>(Date.now());

  const logAuthEvent = (event: string, metadata?: Record<string, unknown>) => {
    if (!AUTH_DIAGNOSTICS_ENABLED) {
      return;
    }

    console.info("[AuthDiag]", event, {
      at: new Date().toISOString(),
      sinceBootMs: Date.now() - authBootStartedAtRef.current,
      ...metadata,
    });
  };

  const toErrorMeta = (error: unknown): Record<string, unknown> => {
    if (error instanceof Error) {
      return {
        name: error.name,
        message: error.message,
      };
    }

    if (
      typeof error === "object" &&
      error !== null &&
      "message" in error &&
      typeof (error as { message: unknown }).message === "string"
    ) {
      return { message: (error as { message: string }).message };
    }

    return { message: String(error) };
  };

  // All users are now verified - no member type restrictions
  const isMember = false;

  const fetchProfile = async (
    userId: string,
    timeoutMs: number = PROFILE_FETCH_TIMEOUT_MS,
    mountedRef?: React.MutableRefObject<boolean>,
    source: string = "unknown",
  ) => {
    const startedAt = Date.now();
    const now = Date.now();
    const guard = profileFetchGuardRef.current;
    if (guard.inFlight && guard.userId === userId) {
      logAuthEvent("PROFILE_FETCH_SKIPPED_IN_FLIGHT", { userId, source });
      return;
    }
    if (
      guard.userId === userId &&
      now - guard.lastStartedAt < PROFILE_FETCH_DEBOUNCE_MS
    ) {
      logAuthEvent("PROFILE_FETCH_SKIPPED_DEBOUNCE", {
        userId,
        source,
        debounceMs: PROFILE_FETCH_DEBOUNCE_MS,
      });
      return;
    }

    logAuthEvent("PROFILE_FETCH_START", { userId, source, timeoutMs });

    profileFetchGuardRef.current = {
      userId,
      inFlight: true,
      lastStartedAt: now,
    };

    const profilePromise = supabase
      .from("profiles")
      .select(
        `id, 
				username, 
				type, 
				verified,
				language, 
				avatar_url, 
				coord, 
				bookmarks,
				federal_district_id,
				municipal_district_id,
				provincial_district_id,
				federal_districts (
					name_en,
					name_fr
				),
				municipal_districts (
					name,
					city,
					borough
				),
				provincial_districts (
					name,
					province
				)`,
      )
      .eq("id", userId)
      .single();

    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("Profile fetch timeout")), timeoutMs),
    );

    try {
      const { data, error } = await Promise.race([
        profilePromise,
        timeoutPromise,
      ]);

      if (error) {
        logAuthEvent("PROFILE_FETCH_ERROR", {
          userId,
          source,
          code: error.code,
          message: error.message,
        });
        return;
      }

      if (activeUserIdRef.current !== userId) {
        logAuthEvent("PROFILE_FETCH_STALE", {
          source,
          fetchedForUserId: userId,
          activeUserId: activeUserIdRef.current,
        });
        return;
      }

      if (data) {
        const rawData = data as any;

        // Ensure coord is parsed if it comes as string
        let coord = rawData.coord;
        if (typeof coord === "string") {
          try {
            coord = JSON.parse(coord);
          } catch (e) {
            coord = null;
          }
        }

        const profileData: UserProfile = {
          id: rawData.id,
          username: rawData.username,
          type: rawData.type,
          verified: rawData.verified,
          language: rawData.language,
          avatar_url: rawData.avatar_url,
          coord: coord,
          bookmarks: rawData.bookmarks,
          federal_district_id: rawData.federal_district_id,
          municipal_district_id: rawData.municipal_district_id,
          provincial_district_id: rawData.provincial_district_id,
          // Handle the joined data - supabase-js usually returns it nested as the table name
          federal_district: Array.isArray(rawData.federal_districts)
            ? rawData.federal_districts[0]
            : rawData.federal_districts,
          municipal_district: Array.isArray(rawData.municipal_districts)
            ? rawData.municipal_districts[0]
            : rawData.municipal_districts,
          provincial_district: Array.isArray(rawData.provincial_districts)
            ? rawData.provincial_districts[0]
            : rawData.provincial_districts,
        };

        if (!mountedRef || mountedRef.current) {
          setProfile(profileData);

          // Check blockchain identity for verified users (non-blocking)
          if (profileData.verified) {
            void checkBlockchainIdentity();
          } else {
            setBlockchainVerified(null);
          }
        }
      }
      logAuthEvent("PROFILE_FETCH_END", {
        userId,
        source,
        durationMs: Date.now() - startedAt,
        hasProfile: Boolean(data),
      });
    } catch (err) {
      logAuthEvent("PROFILE_FETCH_EXCEPTION", {
        userId,
        source,
        durationMs: Date.now() - startedAt,
        ...toErrorMeta(err),
      });
    } finally {
      profileFetchGuardRef.current = {
        ...profileFetchGuardRef.current,
        inFlight: false,
      };
    }
  };

  /**
   * Check the user's blockchain identity status.
   * Fire-and-forget: doesn't block signin if blockchain is unreachable.
   */
  const checkBlockchainIdentity = async () => {
    try {
      const response = await fetch("/api/blockchain/status", {
        method: "GET",
        credentials: "include",
      });
      if (response.ok) {
        const data = await response.json();
        if (isMountedRef.current) {
          setBlockchainVerified(data.verified === true);
        }
      } else {
        logAuthEvent("BLOCKCHAIN_STATUS_NON_OK", {
          status: response.status,
        });
        // Node unreachable or no identity — not a critical failure
        if (isMountedRef.current) {
          setBlockchainVerified(null);
        }
      }
    } catch (error) {
      logAuthEvent("BLOCKCHAIN_STATUS_EXCEPTION", {
        ...toErrorMeta(error),
      });
      // Silently fail — blockchain verification is additive
      if (isMountedRef.current) {
        setBlockchainVerified(null);
      }
    }
  };

  const applySessionState = (nextSession: Session | null, source: string) => {
    if (!isMountedRef.current) {
      return;
    }

    const nextUser = nextSession?.user ?? null;
    const nextUserId = nextUser?.id ?? null;
    const previousUserId = activeUserIdRef.current;

    activeUserIdRef.current = nextUserId;
    setSessionState(nextSession);
    setUser(nextUser);

    if (!nextUserId) {
      setProfile(null);
      setBlockchainVerified(null);
    } else {
      if (previousUserId && previousUserId !== nextUserId) {
        setProfile(null);
        setBlockchainVerified(null);
      }

      // Supabase can deadlock if we run async queries directly inside onAuthStateChange.
      // Defer profile hydration to the next tick.
      window.setTimeout(() => {
        if (!isMountedRef.current) {
          return;
        }

        void fetchProfile(
          nextUserId,
          PROFILE_FETCH_TIMEOUT_MS,
          isMountedRef,
          source,
        );
      }, 0);
    }

    logAuthEvent("SESSION_APPLIED", {
      source,
      userId: nextUserId,
      changedUser: previousUserId !== nextUserId,
    });
  };

  const setSession = (nextSession: Session | null) => {
    applySessionState(nextSession, "manual_setSession");
  };

  const refreshProfile = async () => {
    if (user?.id) {
      await fetchProfile(
        user.id,
        PROFILE_FETCH_TIMEOUT_MS,
        isMountedRef,
        "manual_refresh",
      );
    }
  };

  useEffect(() => {
    isMountedRef.current = true;
    authBootStartedAtRef.current = Date.now();
    logAuthEvent("BOOT_START");

    const loadSession = async () => {
      logAuthEvent("GET_SESSION_START", {
        timeoutMs: SESSION_RESTORE_TIMEOUT_MS,
      });

      try {
        const sessionPromise = supabase.auth.getSession();
        const timeoutPromise = new Promise<never>((_, reject) =>
          setTimeout(
            () => reject(new Error("getSession timeout")),
            SESSION_RESTORE_TIMEOUT_MS,
          ),
        );
        const { data, error } = await Promise.race([
          sessionPromise,
          timeoutPromise,
        ]);

        if (error) {
          logAuthEvent("GET_SESSION_ERROR", {
            code: error.code,
            message: error.message,
          });
          applySessionState(null, "getSession_error");
          return;
        }

        if (!isMountedRef.current) {
          return;
        }

        logAuthEvent("GET_SESSION_END", {
          hasSession: Boolean(data.session),
          userId: data.session?.user?.id ?? null,
        });
        applySessionState(data.session, "getSession");
      } catch (error) {
        if (!isMountedRef.current) return;
        if (error instanceof Error && error.message === "getSession timeout") {
          console.warn(
            "[AuthProvider] getSession timed out; consider clearing persisted auth token if this recurs",
          );
          logAuthEvent("GET_SESSION_TIMEOUT", {
            timeoutMs: SESSION_RESTORE_TIMEOUT_MS,
          });

          if (process.env.NEXT_PUBLIC_SUPABASE_RECOVERY_RESET === "1") {
            const keysToClear = Object.keys(localStorage).filter(
              (k) => k.startsWith("sb-") && k.includes("-auth-token"),
            );

            if (keysToClear.length > 0) {
              console.warn(
                "[AuthProvider] Auto-clearing corrupted Supabase auth token(s) and reloading:",
                keysToClear,
              );
              keysToClear.forEach((key) => localStorage.removeItem(key));
              window.location.reload();
            }
          }
        } else {
          logAuthEvent("GET_SESSION_EXCEPTION", {
            ...toErrorMeta(error),
          });
        }

        applySessionState(null, "getSession_exception");
      } finally {
        if (isMountedRef.current) {
          setLoading(false);
          logAuthEvent("BOOT_DONE", {
            hasUser: Boolean(activeUserIdRef.current),
          });
        }
      }
    };

    const { data: listener } = supabase.auth.onAuthStateChange(
      (event, nextSession) => {
        if (!isMountedRef.current) return;

        logAuthEvent("AUTH_STATE_CHANGE", {
          event,
          hasSession: Boolean(nextSession),
          userId: nextSession?.user?.id ?? null,
        });

        window.setTimeout(() => {
          if (!isMountedRef.current) {
            return;
          }

          applySessionState(nextSession, `auth_event:${event}`);

          if (isMountedRef.current) {
            setLoading(false);
          }
        }, 0);
      },
    );

    void loadSession();

    return () => {
      isMountedRef.current = false;
      listener.subscription.unsubscribe();
    };
  }, [supabase]);

  const signOut = async () => {
    setLoading(true);
    try {
      const { error } = await supabase.auth.signOut();
      if (error) {
        logAuthEvent("SIGN_OUT_ERROR", {
          code: error.code,
          message: error.message,
        });
      }
    } catch (error) {
      logAuthEvent("SIGN_OUT_EXCEPTION", {
        ...toErrorMeta(error),
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        profile,
        loading,
        isMember,
        blockchainVerified,
        signOut,
        setSession,
        refreshProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};
