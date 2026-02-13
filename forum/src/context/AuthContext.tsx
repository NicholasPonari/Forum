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
  const [session, setSession] = useState<Session | null>(null);
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

  // Check if user is a "Member" type (has restrictions)
  const isMember = profile?.type?.toLowerCase() === "member";

  const fetchProfile = async (
    userId: string,
    timeoutMs: number = 45000,
    mountedRef?: React.MutableRefObject<boolean>,
  ) => {
    const now = Date.now();
    const guard = profileFetchGuardRef.current;
    if (guard.inFlight && guard.userId === userId) {
      return;
    }
    if (guard.userId === userId && now - guard.lastStartedAt < 1000) {
      return;
    }
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
            checkBlockchainIdentity();
          } else {
            setBlockchainVerified(null);
          }
        }
      }
    } catch (err) {
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
        // Node unreachable or no identity — not a critical failure
        if (isMountedRef.current) {
          setBlockchainVerified(null);
        }
      }
    } catch {
      // Silently fail — blockchain verification is additive
      if (isMountedRef.current) {
        setBlockchainVerified(null);
      }
    }
  };

  const refreshProfile = async () => {
    if (user?.id) {
      await fetchProfile(user.id, 45000, isMountedRef);
    }
  };

  useEffect(() => {
    isMountedRef.current = true;

    const loadSession = async () => {
      try {
        const sessionPromise = supabase.auth.getSession();
        const timeoutPromise = new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("getSession timeout")), 45000),
        );
        const { data, error } = await Promise.race([
          sessionPromise,
          timeoutPromise,
        ]);
        if (error) {
        }

        if (!isMountedRef.current) {
          return;
        }

        setSession(data.session);
        setUser(data.session?.user ?? null);
        if (data.session?.user?.id) {
          fetchProfile(data.session.user.id, 45000, isMountedRef);
        }
      } catch (error) {
        if (!isMountedRef.current) return;
        if (error instanceof Error && error.message === "getSession timeout") {
          console.warn(
            "[AuthProvider] getSession timed out; consider clearing persisted auth token if this recurs",
          );
          if (process.env.NEXT_PUBLIC_SUPABASE_RECOVERY_RESET === "1") {
            const key = Object.keys(localStorage).find(
              (k) => k.startsWith("sb-") && k.endsWith("-auth-token"),
            );
            if (key) {
              console.warn(
                "[AuthProvider] Auto-clearing corrupted Supabase auth token and reloading:",
                key,
              );
              localStorage.removeItem(key);
              window.location.reload();
            }
          }
          return;
        }
        setSession(null);
        setUser(null);
        setProfile(null);
      } finally {
        if (isMountedRef.current) {
          setLoading(false);
        }
      }
    };

    loadSession();

    const { data: listener } = supabase.auth.onAuthStateChange(
      async (event, nextSession) => {
        if (!isMountedRef.current) return;
        try {
          setSession(nextSession);
          setUser(nextSession?.user ?? null);
          if (nextSession?.user?.id) {
            await fetchProfile(nextSession.user.id, 45000, isMountedRef);
          } else {
            setProfile(null);
            setBlockchainVerified(null);
          }
        } catch (error) {
        } finally {
          if (isMountedRef.current) {
            setLoading(false);
          }
        }
      },
    );

    return () => {
      isMountedRef.current = false;
      listener.subscription.unsubscribe();
    };
  }, [supabase]);

  const signOut = async () => {
    setLoading(true);
    try {
      await supabase.auth.signOut();
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
