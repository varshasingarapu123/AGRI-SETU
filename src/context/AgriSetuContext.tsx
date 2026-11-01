import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
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
  toasts: ToastMessage[];
  pushToast: (type: 'success' | 'error' | 'info', text: string) => void;
  dismissToast: (id: number) => void;
}

const AgriSetuContext = createContext<AgriSetuContextValue | undefined>(undefined);

export const AgriSetuProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [data, setData] = useState<BootstrapData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const sessionCacheRef = useRef<{ key: string; token: string } | null>(null);

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

  // Automatically align active workspace role when navigating across modules
  const handleSetActiveTab = useCallback((tab: MainTabId) => {
    setActiveTab(tab);
    if (tab === 'merchant_market') {
      setActiveRole('merchant');
    } else if (tab === 'coordinator') {
      setActiveRole('coordinator');
    } else {
      setActiveRole('farmer');
    }
  }, []);

  const acquireWorkspaceToken = useCallback(async (): Promise<string> => {
    const personaKey = `${activeRole}:${
      activeRole === 'farmer'
        ? selectedFarmerId
        : activeRole === 'merchant'
          ? selectedMerchantId
          : 0
    }`;

    if (sessionCacheRef.current && sessionCacheRef.current.key === personaKey) {
      return sessionCacheRef.current.token;
    }

    const res = await fetch('/api/session', {
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
      throw new Error(body.error || 'Unable to establish workspace session.');
    }

    sessionCacheRef.current = { key: personaKey, token: body.token };
    return body.token;
  }, [activeRole, selectedFarmerId, selectedMerchantId]);

  const apiFetch = useCallback(
    async <T = any>(path: string, options: RequestInit = {}): Promise<T> => {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        ...(options.headers as Record<string, string> | undefined),
      };

      const workspaceToken = await acquireWorkspaceToken();
      headers.Authorization = `Bearer ${workspaceToken}`;

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
    [acquireWorkspaceToken]
  );

  const refreshData = useCallback(async () => {
    try {
      setError(null);
      const bootstrap = await apiFetch<BootstrapData>('/api/bootstrap');
      setData(bootstrap);

      if (bootstrap.farmers.length > 0) {
        setSelectedFarmerId((prev) => {
          const allFarmerChoices = bootstrap.demoPersonas?.farmers || bootstrap.farmers;
          return allFarmerChoices.some((f) => f.id === prev) ? prev : bootstrap.farmers[0].id;
        });
      }
      if (bootstrap.merchants.length > 0) {
        setSelectedMerchantId((prev) => {
          const allMerchantChoices = bootstrap.demoPersonas?.merchants || bootstrap.merchants;
          return allMerchantChoices.some((m) => m.id === prev) ? prev : bootstrap.merchants[0].id;
        });
      }
    } catch (err: any) {
      console.error('Bootstrap load error:', err);
      setError(err.message || 'Unable to load AGRISETU platform data.');
    } finally {
      setLoading(false);
    }
  }, [apiFetch]);

  useEffect(() => {
    refreshData();
  }, [refreshData]);

  const updateBootstrapState = useCallback((nextState: Partial<BootstrapData>) => {
    setData((prev) => (prev ? { ...prev, ...nextState } : (nextState as BootstrapData)));
  }, []);

  return (
    <AgriSetuContext.Provider
      value={{
        data,
        loading,
        error,
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
