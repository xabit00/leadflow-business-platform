import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import * as authApi from '../api/auth';
import { normalizeError } from '../api/errors';
import { clearMockAuth, createMockAuth, DEMO_EMAIL, DEMO_PASSWORD, readMockAuth, saveMockAuth } from '../api/mockAuth';
import { isMockMode } from '../lib/supabase';
import type { AuthProfile, UserStatus } from '../api/auth';

const PENDING_SIGNUP_KEY = 'leadflow_pending_signup';

interface PendingSignup {
  email: string;
  companyName: string;
  fullName: string;
}

interface SignUpResult {
  emailConfirmationRequired: boolean;
}

interface AuthContextType {
  session: Session | null;
  user: User | null;
  profile: AuthProfile | null;
  permissions: string[];
  loading: boolean;
  isLoading: boolean;
  isAuthenticated: boolean;
  profileError: string | null;
  hasPermission: (permission: string) => boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (input: authApi.SignUpInput) => Promise<SignUpResult>;
  signOut: () => Promise<void>;
  updateAvailability: (status: UserStatus) => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const getPendingSignup = (): PendingSignup | null => {
  const value = localStorage.getItem(PENDING_SIGNUP_KEY);
  if (!value) return null;

  try {
    return JSON.parse(value) as PendingSignup;
  } catch {
    localStorage.removeItem(PENDING_SIGNUP_KEY);
    return null;
  }
};

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<AuthProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [profileError, setProfileError] = useState<string | null>(null);
  const bootstrapPromise = useRef<Promise<void> | null>(null);

  const loadProfile = useCallback(async (user: User) => {
    setProfileError(null);

    try {
      setProfile(await authApi.getMyProfile());
      return;
    } catch (initialError) {
      const pending = getPendingSignup();
      if (!pending || pending.email.toLowerCase() !== (user.email ?? '').toLowerCase()) {
        const message = normalizeError(initialError, 'Could not load your workspace profile.').message;
        setProfileError(message);
        throw new Error(message);
      }

      if (!bootstrapPromise.current) {
        bootstrapPromise.current = (async () => {
          const { error } = await authApi.bootstrapWorkspace(pending.companyName, pending.fullName);
          if (error) throw new Error(normalizeError(error, 'Could not finish creating your workspace.').message);
          localStorage.removeItem(PENDING_SIGNUP_KEY);
        })().finally(() => {
          bootstrapPromise.current = null;
        });
      }

      try {
        await bootstrapPromise.current;
      } catch (bootstrapError) {
        const message = normalizeError(bootstrapError, 'Could not finish creating your workspace.').message;
        setProfileError(message);
        throw new Error(message);
      }
      setProfile(await authApi.getMyProfile());
    }
  }, []);

  const refreshProfile = useCallback(async () => {
    if (isMockMode) {
      setProfile(readMockAuth()?.profile ?? null);
      return;
    }
    if (!session?.user) return;
    await loadProfile(session.user);
  }, [loadProfile, session]);

  useEffect(() => {
    let active = true;

    if (isMockMode) {
      const mock = readMockAuth();
      setSession(mock?.session ?? null);
      setProfile(mock?.profile ?? null);
      setLoading(false);
      return;
    }

    const restore = async () => {
      const { data, error } = await authApi.getSession();
      if (!active) return;

      if (error) {
        setProfileError(normalizeError(error, 'Could not restore your session.').message);
        setLoading(false);
        return;
      }

      setSession(data.session);
      if (data.session?.user) {
        await loadProfile(data.session.user).catch(() => undefined);
      }
      if (active) setLoading(false);
    };

    void restore();

    const { data } = authApi.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      if (!nextSession?.user) {
        setProfile(null);
        setProfileError(null);
        setLoading(false);
        return;
      }

      setLoading(true);
      window.setTimeout(() => {
        void loadProfile(nextSession.user).catch(() => undefined).finally(() => setLoading(false));
      }, 0);
    });

    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, [loadProfile]);

  const signIn = useCallback(async (email: string, password: string) => {
    if (isMockMode) {
      if (email.trim().toLowerCase() !== DEMO_EMAIL || password !== DEMO_PASSWORD) {
        throw new Error('Use the demo credentials shown below the sign-in form.');
      }
      const mock = createMockAuth();
      saveMockAuth(mock);
      setSession(mock.session);
      setProfile(mock.profile);
      return;
    }

    const { data, error } = await authApi.signIn(email, password);
    if (error) throw new Error(normalizeError(error, 'Sign in failed.').message);

    if (!data.user) throw new Error('Sign in completed without a user. Please try again.');
    setSession(data.session);
    await loadProfile(data.user);
  }, [loadProfile]);

  const signUp = useCallback(async (input: authApi.SignUpInput): Promise<SignUpResult> => {
    if (isMockMode) {
      const mock = createMockAuth(input.email.trim(), input.fullName.trim(), input.companyName.trim());
      saveMockAuth(mock);
      setSession(mock.session);
      setProfile(mock.profile);
      return { emailConfirmationRequired: false };
    }

    const pending: PendingSignup = {
      email: input.email.trim(),
      companyName: input.companyName.trim(),
      fullName: input.fullName.trim(),
    };
    localStorage.setItem(PENDING_SIGNUP_KEY, JSON.stringify(pending));

    const { data, error } = await authApi.signUp(input);
    if (error) {
      localStorage.removeItem(PENDING_SIGNUP_KEY);
      throw new Error(normalizeError(error, 'Sign up failed.').message);
    }

    if (!data.session) return { emailConfirmationRequired: true };

    if (!data.user) throw new Error('Sign up completed without a user. Please sign in to continue.');
    setSession(data.session);
    await loadProfile(data.user);
    return { emailConfirmationRequired: false };
  }, [loadProfile]);

  const signOut = useCallback(async () => {
    if (isMockMode) {
      clearMockAuth();
      setSession(null);
      setProfile(null);
      setProfileError(null);
      return;
    }

    const { error } = await authApi.signOut();
    if (error) throw new Error(normalizeError(error, 'Sign out failed.').message);
    setSession(null);
    setProfile(null);
    setProfileError(null);
  }, []);

  const updateAvailability = useCallback(async (status: UserStatus) => {
    if (isMockMode) {
      setProfile((current) => {
        if (!current) return current;
        const next = { ...current, status };
        const mock = readMockAuth();
        if (mock) saveMockAuth({ ...mock, profile: next });
        return next;
      });
      return;
    }

    if (!profile) throw new Error('Your workspace profile is not loaded.');
    const { error } = await authApi.setUserStatus(profile.id, status);
    if (error) throw new Error(normalizeError(error, 'Could not update your availability.').message);
    setProfile((current) => current ? { ...current, status } : current);
  }, [profile]);

  const value = useMemo<AuthContextType>(() => ({
    session,
    user: session?.user ?? null,
    profile,
    permissions: profile?.permissions ?? [],
    loading,
    isLoading: loading,
    isAuthenticated: Boolean(session),
    profileError,
    hasPermission: (permission) => profile?.permissions.includes(permission) ?? false,
    signIn,
    signUp,
    signOut,
    updateAvailability,
    refreshProfile,
  }), [loading, profile, profileError, refreshProfile, session, signIn, signOut, signUp, updateAvailability]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
};
