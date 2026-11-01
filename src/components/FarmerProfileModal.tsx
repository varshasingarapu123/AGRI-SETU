import React, { useEffect, useState } from 'react';
import { X, ShieldCheck } from 'lucide-react';
import type { EnrichedFarmerProfile, BootstrapData } from '../types/agrisetu.ts';
import { useAgriSetu } from '../context/AgriSetuContext.tsx';

interface FarmerProfileModalProps {
  farmer: EnrichedFarmerProfile;
  isOpen: boolean;
  onClose: () => void;
}

export const FarmerProfileModal: React.FC<FarmerProfileModalProps> = ({
  farmer,
  isOpen,
  onClose,
}) => {
  const { apiFetch, updateBootstrapState, pushToast } = useAgriSetu();
  const [saving, setSaving] = useState(false);

  const buildFormFromFarmer = (f: EnrichedFarmerProfile) => ({
    name: f.name,
    nameTe: f.nameTe || '',
    village: f.village,
    mandal: f.mandal,
    district: f.district,
    region: f.region,
    preferredLanguage: f.preferredLanguage || 'te',
    dialectProfile: f.dialectProfile || 'kakinada_coastal',
    farmAreaAcres: f.farmDetails?.farmAreaAcres || '2.0',
    irrigationType: f.farmDetails?.irrigationType || 'Canal',
    waterAvailability: f.farmDetails?.waterAvailability || 'Seasonal canal water',
    climateZone: f.farmDetails?.climateZone || 'Coastal Delta',
    storageAvailable: Boolean(f.farmDetails?.storageAvailable),
    storageDetails: f.farmDetails?.storageDetails || '',
    cropInterests: f.farmDetails?.cropInterests || '',
    constraints: f.farmDetails?.constraints || '',
    soilType: f.latestSoil?.soilType || 'Alluvial Clay Loam',
    phLevel: f.latestSoil?.phLevel || '',
    organicCarbon: f.latestSoil?.organicCarbon || '',
    salinityNote: f.latestSoil?.salinityNote || '',
    currentCrop: f.currentCrop || '',
    previousCrop: f.previousCrop || '',
    // Missing consent ALWAYS defaults to false (never true)
    shareProfileWithAi: f.consent?.shareProfileWithAi === true,
    shareProfileWithMerchants: f.consent?.shareProfileWithMerchants === true,
    shareContactOnEnquiry: f.consent?.shareContactOnEnquiry === true,
    shareConversationWithExperts: f.consent?.shareConversationWithExperts === true,
    saveConversationHistory: f.consent?.saveConversationHistory === true,
  });

  const [form, setForm] = useState(() => buildFormFromFarmer(farmer));

  useEffect(() => {
    setForm(buildFormFromFarmer(farmer));
  }, [farmer, isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const nextState = await apiFetch<BootstrapData>(`/api/farmers/${farmer.id}`, {
        method: 'PUT',
        body: JSON.stringify(form),
      });
      updateBootstrapState(nextState);
      pushToast('success', `Saved profile and privacy consent settings for ${form.name}.`);
      onClose();
    } catch (err: any) {
      pushToast('error', err.message || 'Failed to update farmer profile.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 overflow-y-auto">
      <div className="bg-white border border-[#E3E7E1] rounded-xl w-full max-w-3xl max-h-[90vh] overflow-y-auto p-6">
        <div className="flex items-start justify-between gap-4 pb-4 border-b border-[#E8ECE6]">
          <div>
            <p className="text-xs text-[#4B5E52]">
              {farmer.farmerCode} · {farmer.isDemo ? 'Fictional Demo Farmer Record' : 'Personal Farmer Account'}
            </p>
            <h2 className="text-xl font-semibold text-[#14241B] mt-0.5">
              Edit Farmer Profile, Soil & Data Consent
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 text-[#4B5E52] hover:text-[#14241B] rounded-lg focus-visible:outline-2 focus-visible:outline-[#1B4332]"
            aria-label="Close modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-5 space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-[#4B5E52] mb-1">
                Farmer Name (English)
              </label>
              <input
                type="text"
                required
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-[#D4DCD2] rounded-lg focus:outline-none focus:border-[#1B4332]"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[#4B5E52] mb-1">
                Name in Telugu (తెలుగు పేరు)
              </label>
              <input
                type="text"
                value={form.nameTe}
                onChange={(e) => setForm({ ...form, nameTe: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-[#D4DCD2] rounded-lg focus:outline-none focus:border-[#1B4332]"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[#4B5E52] mb-1">Village</label>
              <input
                type="text"
                required
                value={form.village}
                onChange={(e) => setForm({ ...form, village: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-[#D4DCD2] rounded-lg focus:outline-none focus:border-[#1B4332]"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[#4B5E52] mb-1">Mandal</label>
              <input
                type="text"
                required
                value={form.mandal}
                onChange={(e) => setForm({ ...form, mandal: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-[#D4DCD2] rounded-lg focus:outline-none focus:border-[#1B4332]"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[#4B5E52] mb-1">District</label>
              <input
                type="text"
                required
                value={form.district}
                onChange={(e) => setForm({ ...form, district: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-[#D4DCD2] rounded-lg focus:outline-none focus:border-[#1B4332]"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[#4B5E52] mb-1">
                Regional Speech Profile
              </label>
              <select
                value={form.dialectProfile}
                onChange={(e) => setForm({ ...form, dialectProfile: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-[#D4DCD2] rounded-lg bg-white focus:outline-none focus:border-[#1B4332]"
              >
                <option value="kakinada_coastal">Kakinada coastal Telugu (కాకినాడ తీరప్రాంతం)</option>
                <option value="godavari_delta">Godavari regional Telugu (గోదావరి ప్రాంతం)</option>
              </select>
            </div>
          </div>

          <div className="pt-4 border-t border-[#E8ECE6] grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium text-[#4B5E52] mb-1">
                Farm Area (Acres)
              </label>
              <input
                type="text"
                required
                value={form.farmAreaAcres}
                onChange={(e) => setForm({ ...form, farmAreaAcres: e.target.value })}
                className="w-full px-3 py-2 text-sm font-mono-num border border-[#D4DCD2] rounded-lg focus:outline-none focus:border-[#1B4332]"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[#4B5E52] mb-1">Soil Type</label>
              <input
                type="text"
                required
                value={form.soilType}
                onChange={(e) => setForm({ ...form, soilType: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-[#D4DCD2] rounded-lg focus:outline-none focus:border-[#1B4332]"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[#4B5E52] mb-1">Soil pH</label>
              <input
                type="text"
                value={form.phLevel}
                onChange={(e) => setForm({ ...form, phLevel: e.target.value })}
                placeholder="e.g. 6.8"
                className="w-full px-3 py-2 text-sm font-mono-num border border-[#D4DCD2] rounded-lg focus:outline-none focus:border-[#1B4332]"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[#4B5E52] mb-1">
                Irrigation Type
              </label>
              <input
                type="text"
                required
                value={form.irrigationType}
                onChange={(e) => setForm({ ...form, irrigationType: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-[#D4DCD2] rounded-lg focus:outline-none focus:border-[#1B4332]"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[#4B5E52] mb-1">Current Crop</label>
              <input
                type="text"
                required
                value={form.currentCrop}
                onChange={(e) => setForm({ ...form, currentCrop: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-[#D4DCD2] rounded-lg focus:outline-none focus:border-[#1B4332]"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[#4B5E52] mb-1">Previous Crop</label>
              <input
                type="text"
                required
                value={form.previousCrop}
                onChange={(e) => setForm({ ...form, previousCrop: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-[#D4DCD2] rounded-lg focus:outline-none focus:border-[#1B4332]"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-[#4B5E52] mb-1">
                Crop Interests & Rotation Goals
              </label>
              <input
                type="text"
                value={form.cropInterests}
                onChange={(e) => setForm({ ...form, cropInterests: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-[#D4DCD2] rounded-lg focus:outline-none focus:border-[#1B4332]"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[#4B5E52] mb-1">
                Preferred Language
              </label>
              <select
                value={form.preferredLanguage}
                onChange={(e) => setForm({ ...form, preferredLanguage: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-[#D4DCD2] rounded-lg bg-white focus:outline-none focus:border-[#1B4332]"
              >
                <option value="te">Telugu (తెలుగు)</option>
                <option value="en">English</option>
              </select>
            </div>
            <div className="sm:col-span-3">
              <label className="block text-xs font-medium text-[#4B5E52] mb-1">
                Salinity / Field Constraints
              </label>
              <input
                type="text"
                value={form.constraints}
                onChange={(e) => setForm({ ...form, constraints: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-[#D4DCD2] rounded-lg focus:outline-none focus:border-[#1B4332]"
              />
            </div>
          </div>

          <div className="pt-4 border-t border-[#E8ECE6] space-y-3">
            <div className="flex items-center gap-2 text-sm font-semibold text-[#14241B]">
              <ShieldCheck className="w-4 h-4 text-[#1B4332]" />
              <span>Data Sharing & Privacy Consent Controls (Default: Off)</span>
            </div>
            <p className="text-xs text-[#4B5E52]">
              All sharing and storage permissions default to off unless explicitly granted below. Raw voice audio is never stored.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
              <label className="flex items-start gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.shareProfileWithAi}
                  onChange={(e) => setForm({ ...form, shareProfileWithAi: e.target.checked })}
                  className="mt-1 accent-[#1B4332]"
                />
                <span>
                  Allow AI Farmer Assistant & STT to use my soil, location, crop, and vocabulary context
                </span>
              </label>
              <label className="flex items-start gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.saveConversationHistory}
                  onChange={(e) => setForm({ ...form, saveConversationHistory: e.target.checked })}
                  className="mt-1 accent-[#1B4332]"
                />
                <span>
                  Save my AI conversation transcripts in My Farm history (uncheck for ephemeral chats)
                </span>
              </label>
              <label className="flex items-start gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.shareProfileWithMerchants}
                  onChange={(e) =>
                    setForm({ ...form, shareProfileWithMerchants: e.target.checked })
                  }
                  className="mt-1 accent-[#1B4332]"
                />
                <span>Show my farmer name on Merchant Market produce listings & offers</span>
              </label>
              <label className="flex items-start gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.shareContactOnEnquiry}
                  onChange={(e) => setForm({ ...form, shareContactOnEnquiry: e.target.checked })}
                  className="mt-1 accent-[#1B4332]"
                />
                <span>Share masked phone details with verified buyer enquiries</span>
              </label>
              <label className="flex items-start gap-2.5 cursor-pointer sm:col-span-2">
                <input
                  type="checkbox"
                  checked={form.shareConversationWithExperts}
                  onChange={(e) =>
                    setForm({ ...form, shareConversationWithExperts: e.target.checked })
                  }
                  className="mt-1 accent-[#1B4332]"
                />
                <span>
                  Share my question and conversation context with Agricultural Experts when escalating
                </span>
              </label>
            </div>
          </div>

          <div className="flex items-center justify-end gap-3 pt-4 border-t border-[#E8ECE6]">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-[#4B5E52] hover:text-[#14241B] rounded-lg whitespace-nowrap shrink-0"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 text-sm font-medium bg-[#1B4332] text-white rounded-lg hover:bg-[#143326] disabled:opacity-60 transition-colors whitespace-nowrap shrink-0"
            >
              {saving ? 'Saving...' : 'Save Profile & Consent'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
