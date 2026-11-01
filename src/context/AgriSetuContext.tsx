import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import { onAuthStateChanged, signInWithPopup, signOut, type User } from 'firebase/auth';
import { auth, googleAuthProvider } from '../lib/firebase.ts';
import type { BootstrapData, MainTabId } from '../types/agrisetu.ts';
import type { UiLanguage } from '../lib/i18n.ts';

interface ToastMessage {
  id: number;
  type: 'success' | 'error' | 'info';
  text: string;
}

interface AgriSetuContextValue {
  data: BootstrapData | null;
  loading: boolean;
  error: string | null;
  firebaseUser: User | null;
  authReady: boolean;
  uiLang: UiLanguage;
  setUiLang: (lang: UiLanguage) => void;
  activeTab: MainTabId;
  setActiveTab: (tab: MainTabId) => void;
  activeRole: 'farmer' | 'merchant' | 'coordinator';
  setActiveRole: (role: 'farmer' | 'merchant' | 'coordinator') => void;
  selectedFarmerId: number;
  setSelectedFarmerId: (id: number) => void;
  selectedMerchantId: number;
  setSelectedMerchantId: (id: number) => void;
  pendingAssistantPrompt: string | null;
  setPendingAssistantPrompt: (prompt: string | null) => void;
  activeConversationId: number | null;
  setActiveConversationId: (id: number | null) => void;
  prefillAgrirouteFromListingId: number | null;
  setPrefillAgrirouteFromListingId: (id: number | null) => void;
  apiFetch: <T = any>(path: string, options?: RequestInit) => Promise<T>;
  refreshData: () => Promise<void>;
  updateBootstrapState: (nextState: Partial<BootstrapData>) => void;
  signInWithGoogle: () => Promise<void>;
  logoutGoogle: () => Promise<void>;
  toasts: ToastMessage[];
  pushToast: (type: 'success' | 'error' | 'info', text: string) => void;
  dismissToast: (id: number) => void;
}

const AgriSetuContext = createContext<AgriSetuContextValue | undefined>(undefined);

export const AgriSetuProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [data, setData] = useState<BootstrapData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState<boolean>(false);

  const idTokenRef = useRef<string | null>(null);
  const demoSessionCacheRef = useRef<{ key: string; token: string } | null>(null);

  const [uiLang, setUiLang] = useState<UiLanguage>('en');
  const [activeTab, setActiveTab] = useState<MainTabId>('assistant');
  const [activeRole, setActiveRole] = useState<'farmer' | 'merchant' | 'coordinator'>('farmer');
  const [selectedFarmerId, setSelectedFarmerId] = useState<number>(1);
  const [selectedMerchantId, setSelectedMerchantId] = useState<number>(1);

  const [pendingAssistantPrompt, setPendingAssistantPrompt] = useState<string | null>(null);
  const [activeConversationId, setActiveConversationId] = useState<number | null>(null);
  const [prefillAgrirouteFromListingId, setPrefillAgrirouteFromListingId] = useState<number | null>(
    null
  );
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const pushToast = useCallback((type: 'success' | 'error' | 'info', text: string) => {
    const id = Date.now() + Math.floor(Math.random() * 1000);
    setToasts((prev) => [...prev, { id, type, text }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4500);
  }, []);

  const dismissToast = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  // Sync role context in controlled Demo Mode when switching workspaces;
  // for real Firebase-authenticated users, role is strictly server-derived.
  const handleSetActiveTab = useCallback(
    (tab: MainTabId) => {
      setActiveTab(tab);
      if (!firebaseUser) {
        if (tab === 'merchant_market') {
          setActiveRole('merchant');
        } else if (tab === 'coordinator') {
          setActiveRole('coordinator');
        } else {
          setActiveRole('farmer');
        }
      }
    },
    [firebaseUser]
  );

  const acquireDemoBearerToken = useCallback(async (): Promise<string> => {
    const personaKey = `${activeRole}:${
      activeRole === 'farmer'
        ? selectedFarmerId
        : activeRole === 'merchant'
          ? selectedMerchantId
          : 0
    }`;

    if (demoSessionCacheRef.current && demoSessionCacheRef.current.key === personaKey) {
      return demoSessionCacheRef.current.token;
    }

    const res = await fetch('/api/auth/demo-session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        role: activeRole,
        farmerId: activeRole === 'farmer' ? selectedFarmerId : undefined,
        merchantId: activeRole === 'merchant' ? selectedMerchantId : undefined,
      }),
    });

    const body = await res.json().catch(() => ({}));
    if (!res.ok || !body.token) {
      throw new Error(
        body.error || 'Authentication required. Please sign in with Google to continue.'
      );
    }

    demoSessionCacheRef.current = { key: personaKey, token: body.token };
    return body.token;
  }, [activeRole, selectedFarmerId, selectedMerchantId]);

  const apiFetch = useCallback(
    async <T = any>(path: string, options: RequestInit = {}): Promise<T> => {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        ...(options.headers as Record<string, string> | undefined),
      };

      if (firebaseUser) {
        try {
          const freshToken = await firebaseUser.getIdToken();
          idTokenRef.current = freshToken;
          headers.Authorization = `Bearer ${freshToken}`;
        } catch {
          if (idTokenRef.current) {
            headers.Authorization = `Bearer ${idTokenRef.current}`;
          }
        }
      } else {
        const demoToken = await acquireDemoBearerToken();
        headers.Authorization = `Bearer ${demoToken}`;
      }

      const res = await fetch(path, {
        ...options,
        headers,
      });

      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(body.error || `Request failed (${res.status})`);
      }
      return body as T;
    },
    [firebaseUser, acquireDemoBearerToken]
  );

  const refreshData = useCallback(async () => {
    if (!authReady) return;
    try {
      setError(null);
      const bootstrap = await apiFetch<BootstrapData>('/api/bootstrap');
      setData(bootstrap);

      if (bootstrap.currentActor) {
        setActiveRole(bootstrap.currentActor.role);
        if (!bootstrap.currentActor.isDemo) {
          if (bootstrap.currentActor.role === 'merchant' && activeTab !== 'merchant_market') {
            setActiveTab('merchant_market');
          } else if (bootstrap.currentActor.role === 'coordinator' && activeTab !== 'coordinator') {
            setActiveTab('coordinator');
          } else if (
            bootstrap.currentActor.role === 'farmer' &&
            (activeTab === 'merchant_market' || activeTab === 'coordinator')
          ) {
            setActiveTab('assistant');
          }
        }
      }

      if (bootstrap.farmers.length > 0) {
        setSelectedFarmerId((prev) =>
          bootstrap.farmers.some((f) => f.id === prev) ? prev : bootstrap.farmers[0].id
        );
      }
      if (bootstrap.merchants.length > 0) {
        setSelectedMerchantId((prev) =>
          bootstrap.merchants.some((m) => m.id === prev) ? prev : bootstrap.merchants[0].id
        );
      }
    } catch (err: any) {
      console.error('Bootstrap load error:', err);
      setError(err.message || 'Unable to load AGRISETU platform data.');
    } finally {
      setLoading(false);
    }
  }, [authReady, apiFetch, activeTab]);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      setFirebaseUser(user);
      if (user) {
        demoSessionCacheRef.current = null;
        try {
          const token = await user.getIdToken();
          idTokenRef.current = token;
          await fetch('/api/auth/sync', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`,
            },
          });
        } catch (syncErr) {
          console.error('Failed to sync Firebase user:', syncErr);
        }
      } else {
        idTokenRef.current = null;
      }
      setAuthReady(true);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    if (authReady) {
      refreshData();
    }
  }, [authReady, refreshData]);

  const updateBootstrapState = useCallback((nextState: Partial<BootstrapData>) => {
    setData((prev) => (prev ? { ...prev, ...nextState } : (nextState as BootstrapData)));
  }, []);

  const signInWithGoogle = useCallback(async () => {
    try {
      const cred = await signInWithPopup(auth, googleAuthProvider);
      const token = await cred.user.getIdToken();
      idTokenRef.current = token;
      demoSessionCacheRef.current = null;
      pushToast('success', `Signed in as ${cred.user.displayName || cred.user.email}`);
    } catch (err: any) {
      pushToast('error', err.message || 'Google Sign-In cancelled or unavailable.');
    }
  }, [pushToast]);

  const logoutGoogle = useCallback(async () => {
    try {
      await signOut(auth);
      idTokenRef.current = null;
      demoSessionCacheRef.current = null;
      setSelectedFarmerId(1);
      setSelectedMerchantId(1);
      setActiveRole('farmer');
      setActiveTab('assistant');
      pushToast('info', 'Signed out of Google account.');
    } catch (err: any) {
      pushToast('error', err.message || 'Sign-out failed.');
    }
  }, [pushToast]);

  return (
    <AgriSetuContext.Provider
      value={{
        data,
        loading,
        error,
        firebaseUser,
        authReady,
        uiLang,
        setUiLang,
        activeTab,
        setActiveTab: handleSetActiveTab,
        activeRole,
        setActiveRole,
        selectedFarmerId,
        setSelectedFarmerId,
        selectedMerchantId,
        setSelectedMerchantId,
        pendingAssistantPrompt,
        setPendingAssistantPrompt,
        activeConversationId,
        setActiveConversationId,
        prefillAgrirouteFromListingId,
        setPrefillAgrirouteFromListingId,
        apiFetch,
        refreshData,
        updateBootstrapState,
        signInWithGoogle,
        logoutGoogle,
        toasts,
        pushToast,
        dismissToast,
      }}
    >
      {children}
    </AgriSetuContext.Provider>
  );
};

export function useAgriSetu() {
  const ctx = useContext(AgriSetuContext);
  if (!ctx) {
    throw new Error('useAgriSetu must be used inside AgriSetuProvider');
  }
  return ctx;
}
