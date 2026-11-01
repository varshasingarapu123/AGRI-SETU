import React, { useState } from 'react';
import {
  PhoneCall,
  Store,
  Sprout,
  Route,
  Tractor,
  ShieldAlert,
  Bell,
  Menu,
  X,
  LogIn,
  LogOut,
  CheckCheck,
} from 'lucide-react';
import { AgriSetuProvider, useAgriSetu } from './context/AgriSetuContext.tsx';
import { UI_LABELS } from './lib/i18n.ts';
import type { BootstrapData, MainTabId } from './types/agrisetu.ts';
import { AssistantTab } from './components/AssistantTab.tsx';
import { MerchantMarketTab } from './components/MerchantMarketTab.tsx';
import { FarmerMarketTab } from './components/FarmerMarketTab.tsx';
import { AgriRouteTab } from './components/AgriRouteTab.tsx';
import { MyFarmTab } from './components/MyFarmTab.tsx';
import { CoordinatorDashboardTab } from './components/CoordinatorDashboardTab.tsx';

/**
 * Agricultural Connectivity Symbol + Wordmark for AGRISETU
 */
const AgriSetuLogo: React.FC = () => (
  <div className="flex items-center gap-2.5 whitespace-nowrap shrink-0">
    <div className="w-8 h-8 rounded-lg bg-[#1B4332] text-white flex items-center justify-center shrink-0">
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="w-5 h-5"
        aria-hidden="true"
      >
        <path d="M3 17c4-5 14-5 18 0" />
        <path d="M2 20h20" />
        <path d="M12 13V5" />
        <path d="M12 8c-2.5-2.5-5-2-5-2s-.5 2.5 2 5" />
        <path d="M12 8c2.5-2.5 5-2 5-2s.5 2.5-2 5" />
      </svg>
    </div>
    <span className="text-lg font-bold tracking-tight font-display text-[#14241B]">
      AGRISETU
    </span>
  </div>
);

const AgriSetuWorkspace: React.FC = () => {
  const {
    data,
    loading,
    error,
    firebaseUser,
    uiLang,
    setUiLang,
    activeTab,
    setActiveTab,
    activeRole,
    selectedFarmerId,
    selectedMerchantId,
    apiFetch,
    refreshData,
    updateBootstrapState,
    signInWithGoogle,
    logoutGoogle,
    toasts,
    dismissToast,
  } = useAgriSetu();

  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);

  const t = UI_LABELS[uiLang];

  const navItems: Array<{
    id: MainTabId;
    label: string;
    icon: React.FC<{ className?: string }>;
  }> = [
    { id: 'assistant', label: t.navAssistant, icon: PhoneCall },
    { id: 'merchant_market', label: t.navMerchantMarket, icon: Store },
    { id: 'farmer_market', label: t.navFarmerMarket, icon: Sprout },
    { id: 'agriroute', label: t.navAgriroute, icon: Route },
    { id: 'my_farm', label: t.navMyFarm, icon: Tractor },
    { id: 'coordinator', label: t.navCoordinator, icon: ShieldAlert },
  ];

  // Filter notifications relevant to current role/actor
  const roleNotifications = (data?.notifications || []).filter((n) => {
    if (activeRole === 'coordinator') return n.recipientRole === 'coordinator';
    if (activeRole === 'merchant') {
      return (
        n.recipientRole === 'merchant' &&
        (!n.recipientMerchantId || n.recipientMerchantId === selectedMerchantId)
      );
    }
    return (
      n.recipientRole === 'farmer' &&
      (!n.recipientFarmerId || n.recipientFarmerId === selectedFarmerId)
    );
  });

  const unreadCount = roleNotifications.filter((n) => !n.isRead).length;

  const handleMarkNotifRead = async (id: number, targetTab: string) => {
    try {
      const nextState = await apiFetch<BootstrapData>(`/api/notifications/${id}/read`, {
        method: 'PATCH',
      });
      updateBootstrapState(nextState);
      setNotifOpen(false);
      if (
        targetTab === 'assistant' ||
        targetTab === 'merchant_market' ||
        targetTab === 'farmer_market' ||
        targetTab === 'agriroute' ||
        targetTab === 'my_farm' ||
        targetTab === 'coordinator'
      ) {
        setActiveTab(targetTab);
      }
    } catch {
      setNotifOpen(false);
    }
  };

  const handleMarkAllRead = async () => {
    try {
      const nextState = await apiFetch<BootstrapData>('/api/notifications/read-all', {
        method: 'POST',
        body: JSON.stringify({
          role: activeRole,
          farmerId: selectedFarmerId,
          merchantId: selectedMerchantId,
        }),
      });
      updateBootstrapState(nextState);
    } catch {
      // ignore
    }
  };

  const currentNavLabel =
    navItems.find((item) => item.id === activeTab)?.label || 'AI Farmer Assistant';

  return (
    <div className="min-h-screen flex bg-[#FBFBF9] text-[#14241B]">
      {/* Desktop Sidebar (260px) */}
      <aside className="hidden lg:flex lg:flex-col lg:w-64 lg:shrink-0 bg-white border-r border-[#E3E7E1]">
        <div className="px-6 py-5 border-b border-[#E8ECE6]">
          <AgriSetuLogo />
          <p className="text-xs text-[#4B5E52] mt-1.5">{t.tagline}</p>
        </div>

        <nav className="flex-1 px-3 py-5 space-y-1" aria-label="Main Navigation">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveTab(item.id)}
                className={`w-full flex items-center gap-3 px-3.5 py-2.5 text-sm font-medium rounded-lg transition-colors whitespace-nowrap ${
                  active
                    ? 'bg-[#1B4332] text-white'
                    : 'text-[#374B3E] hover:bg-[#F3F5F1] hover:text-[#14241B]'
                }`}
              >
                <Icon className="w-4 h-4 shrink-0" />
                <span className="truncate">{item.label}</span>
              </button>
            );
          })}
        </nav>

        {/* Sidebar Bottom Language Switcher & Responsible AI Footer */}
        <div className="p-4 border-t border-[#E8ECE6] space-y-3">
          <div>
            <p className="text-[11px] font-medium text-[#5A6D60] mb-1.5">
              Interface Language / భాష
            </p>
            <div className="grid grid-cols-2 gap-1 p-1 bg-[#EFF2ED] rounded-lg">
              <button
                type="button"
                onClick={() => setUiLang('en')}
                className={`py-1.5 text-xs font-medium rounded-md transition-colors ${
                  uiLang === 'en' ? 'bg-white text-[#14241B] shadow-xs' : 'text-[#4B5E52]'
                }`}
              >
                English
              </button>
              <button
                type="button"
                onClick={() => setUiLang('te')}
                className={`py-1.5 text-xs font-medium rounded-md transition-colors ${
                  uiLang === 'te' ? 'bg-white text-[#14241B] shadow-xs' : 'text-[#4B5E52]'
                }`}
              >
                తెలుగు
              </button>
            </div>
          </div>

          <p className="text-[11px] text-[#5A6D60] leading-relaxed">
            AGRISETU supports farmers and agricultural experts; it does not replace field agricultural judgement.
          </p>
        </div>
      </aside>

      {/* Mobile Navigation Drawer */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div
            className="fixed inset-0 bg-black/40"
            onClick={() => setMobileMenuOpen(false)}
          />
          <div className="relative w-72 max-w-[85vw] bg-white h-full flex flex-col justify-between p-5 z-10">
            <div className="space-y-5">
              <div className="flex items-center justify-between pb-4 border-b border-[#E8ECE6]">
                <AgriSetuLogo />
                <button
                  type="button"
                  onClick={() => setMobileMenuOpen(false)}
                  className="p-1.5 text-[#4B5E52]"
                  aria-label="Close navigation menu"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <nav className="space-y-1">
                {navItems.map((item) => {
                  const Icon = item.icon;
                  const active = activeTab === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => {
                        setActiveTab(item.id);
                        setMobileMenuOpen(false);
                      }}
                      className={`w-full flex items-center gap-3 px-3.5 py-2.5 text-sm font-medium rounded-lg ${
                        active ? 'bg-[#1B4332] text-white' : 'text-[#374B3E] hover:bg-[#F3F5F1]'
                      }`}
                    >
                      <Icon className="w-4 h-4 shrink-0" />
                      <span>{item.label}</span>
                    </button>
                  );
                })}
              </nav>
            </div>

            <div className="pt-4 border-t border-[#E8ECE6] flex items-center gap-2">
              <button
                type="button"
                onClick={() => setUiLang('en')}
                className={`flex-1 py-2 text-xs font-medium rounded-lg ${
                  uiLang === 'en' ? 'bg-[#1B4332] text-white' : 'bg-[#EFF2ED] text-[#4B5E52]'
                }`}
              >
                English
              </button>
              <button
                type="button"
                onClick={() => setUiLang('te')}
                className={`flex-1 py-2 text-xs font-medium rounded-lg ${
                  uiLang === 'te' ? 'bg-[#1B4332] text-white' : 'bg-[#EFF2ED] text-[#4B5E52]'
                }`}
              >
                తెలుగు
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Clean Top Bar Contract: Zone 1 Breadcrumb/Brand — Zone 2 Context — Zone 3 Actions */}
        <header className="sticky top-0 z-30 bg-white border-b border-[#E3E7E1] px-4 sm:px-6 py-3 flex items-center justify-between gap-6">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              className="lg:hidden p-2 -ml-2 text-[#14241B] rounded-lg hover:bg-[#F3F5F1]"
              aria-label="Open menu"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-2 text-sm min-w-0">
              <span className="font-bold font-display text-[#14241B] lg:font-medium lg:text-[#5A6D60] whitespace-nowrap shrink-0">
                AGRISETU
              </span>
              <span className="text-[#9CA89E]" aria-hidden="true">
                /
              </span>
              <span className="font-semibold text-[#14241B] truncate">{currentNavLabel}</span>
            </div>
          </div>

          <div className="hidden md:block text-xs text-[#4B5E52] truncate">
            {t.demoNotice}
          </div>

          {/* Right Actions: Notifications & Auth */}
          <div className="flex items-center gap-3 shrink-0 relative">
            <button
              type="button"
              onClick={() => setNotifOpen(!notifOpen)}
              className="relative inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium border border-[#D4DCD2] rounded-lg hover:bg-[#F3F5F1] transition-colors whitespace-nowrap shrink-0"
              aria-label="Notifications"
            >
              <Bell className="w-4 h-4 text-[#1B4332]" />
              <span className="hidden sm:inline">Alerts</span>
              {unreadCount > 0 && (
                <span className="font-mono-num font-semibold text-[#1B4332]">
                  ({unreadCount})
                </span>
              )}
            </button>

            {firebaseUser ? (
              <button
                type="button"
                onClick={logoutGoogle}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium border border-[#D4DCD2] text-[#14241B] rounded-lg hover:bg-[#F3F5F1] whitespace-nowrap shrink-0"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span className="max-w-[110px] truncate">
                  {firebaseUser.displayName || t.signOut}
                </span>
              </button>
            ) : (
              <button
                type="button"
                onClick={signInWithGoogle}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium bg-[#1B4332] text-white rounded-lg hover:bg-[#143326] transition-colors whitespace-nowrap shrink-0"
              >
                <LogIn className="w-3.5 h-3.5" />
                <span>{t.signInGoogle}</span>
              </button>
            )}

            {/* Notifications Dropdown Panel */}
            {notifOpen && (
              <div className="absolute right-0 top-12 w-80 sm:w-96 bg-white border border-[#E3E7E1] rounded-xl shadow-lg p-4 z-50 space-y-3">
                <div className="flex items-center justify-between pb-2 border-b border-[#E8ECE6]">
                  <span className="text-xs font-semibold text-[#14241B]">
                    Notifications ({activeRole.toUpperCase()} View)
                  </span>
                  <div className="flex items-center gap-3">
                    {unreadCount > 0 && (
                      <button
                        type="button"
                        onClick={handleMarkAllRead}
                        className="inline-flex items-center gap-1 text-xs text-[#1B4332] hover:underline"
                      >
                        <CheckCheck className="w-3.5 h-3.5" />
                        <span>Mark all read</span>
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setNotifOpen(false)}
                      className="text-xs text-[#4B5E52]"
                    >
                      Close
                    </button>
                  </div>
                </div>

                <div className="max-h-80 overflow-y-auto divide-y divide-[#EEF1EC]">
                  {roleNotifications.length === 0 ? (
                    <p className="py-6 text-center text-xs text-[#4B5E52]">
                      No notifications for this role yet.
                    </p>
                  ) : (
                    roleNotifications.map((n) => (
                      <button
                        key={n.id}
                        type="button"
                        onClick={() => handleMarkNotifRead(n.id, n.relatedTab)}
                        className={`w-full text-left py-2.5 px-2 rounded-lg transition-colors ${
                          n.isRead ? 'opacity-70 hover:bg-[#F7F9F6]' : 'bg-[#F3F7F2] hover:bg-[#E8F0E6]'
                        }`}
                      >
                        <p className="text-xs font-semibold text-[#14241B]">{n.title}</p>
                        <p className="text-xs text-[#4B5E52] mt-0.5">{n.message}</p>
                      </button>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>
        </header>

        {/* Inline Toast Feedback Stack */}
        {toasts.length > 0 && (
          <div className="fixed bottom-4 right-4 z-50 space-y-2 max-w-sm">
            {toasts.map((toast) => (
              <div
                key={toast.id}
                className={`px-4 py-3 rounded-xl border text-xs font-medium flex items-start justify-between gap-3 shadow-md ${
                  toast.type === 'error'
                    ? 'bg-[#FEF2F2] border-[#FECACA] text-[#991B1B]'
                    : toast.type === 'info'
                      ? 'bg-[#FFFBEB] border-[#FDE68A] text-[#92400E]'
                      : 'bg-[#1B4332] border-[#143326] text-white'
                }`}
              >
                <span>{toast.text}</span>
                <button
                  type="button"
                  onClick={() => dismissToast(toast.id)}
                  className="opacity-80 hover:opacity-100"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Main Workspace Container */}
        <main className="flex-1 w-full max-w-[1320px] mx-auto px-4 sm:px-6 lg:px-8 py-6">
          {loading ? (
            <div className="space-y-4">
              <div className="h-28 bg-white border border-[#E3E7E1] rounded-xl animate-pulse" />
              <div className="h-96 bg-white border border-[#E3E7E1] rounded-xl animate-pulse" />
            </div>
          ) : error ? (
            <div className="bg-white border border-[#FECACA] rounded-xl p-6 space-y-3">
              <h2 className="text-base font-semibold text-[#991B1B]">
                Unable to load AGRISETU platform state
              </h2>
              <p className="text-sm text-[#4B5E52]">{error}</p>
              <button
                type="button"
                onClick={refreshData}
                className="px-4 py-2 text-xs font-medium bg-[#1B4332] text-white rounded-lg"
              >
                Retry Connection
              </button>
            </div>
          ) : (
            <>
              {activeTab === 'assistant' && <AssistantTab />}
              {activeTab === 'merchant_market' && <MerchantMarketTab />}
              {activeTab === 'farmer_market' && <FarmerMarketTab />}
              {activeTab === 'agriroute' && <AgriRouteTab />}
              {activeTab === 'my_farm' && <MyFarmTab />}
              {activeTab === 'coordinator' && <CoordinatorDashboardTab />}
            </>
          )}
        </main>

        <footer className="border-t border-[#E8ECE6] bg-white px-6 py-4 text-xs text-[#5A6D60] flex flex-col sm:flex-row items-center justify-between gap-2">
          <span>AGRISETU — Samriddh Annadata, Samriddh Bharat</span>
          <span>
            Pilot Prototype · Self-reported vs verified information is explicitly labelled across all modules
          </span>
        </footer>
      </div>
    </div>
  );
};

export default function App() {
  return (
    <AgriSetuProvider>
      <AgriSetuWorkspace />
    </AgriSetuProvider>
  );
}
