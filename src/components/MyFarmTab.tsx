import React, { useState } from 'react';
import {
  UserCog,
  Plus,
  Route,
  MessageSquare,
  ShieldCheck,
  BookmarkCheck,
} from 'lucide-react';
import { useAgriSetu } from '../context/AgriSetuContext.tsx';
import { FarmerProfileModal } from './FarmerProfileModal.tsx';
import type { BootstrapData } from '../types/agrisetu.ts';

type MyFarmSubSection =
  | 'listings_enquiries'
  | 'orders_offers'
  | 'harvests_routes'
  | 'ai_saved';

export const MyFarmTab: React.FC = () => {
  const {
    data,
    selectedFarmerId,
    setSelectedFarmerId,
    setActiveTab,
    setActiveConversationId,
    setPrefillAgrirouteFromListingId,
    apiFetch,
    updateBootstrapState,
    pushToast,
  } = useAgriSetu();

  const [editModalOpen, setEditModalOpen] = useState(false);
  const [subSection, setSubSection] = useState<MyFarmSubSection>('listings_enquiries');
  const [showNewListingForm, setShowNewListingForm] = useState(false);
  const [publishingListing, setPublishingListing] = useState(false);
  const [feedbackInputs, setFeedbackInputs] = useState<Record<number, string>>({});

  const farmers = data?.farmers || [];
  const activeFarmer = farmers.find((f) => f.id === selectedFarmerId) || farmers[0];

  const [listingForm, setListingForm] = useState({
    cropName: activeFarmer?.currentCrop || '',
    variety: '',
    imageKey: 'crop_paddy_harvest',
    quantityQuintals: '',
    expectedHarvestDate: '2026-11-22',
    availabilityType: 'upcoming_harvest',
    qualityGrade: 'Grade A FAQ (<14% moisture)',
    productionMethod: 'IPM Guided Cultivation',
    askingPricePerQuintal: '',
    privacyShowName: true,
  });

  if (!activeFarmer) {
    return <div className="p-8 text-center text-sm text-[#4B5E52]">Loading My Farm...</div>;
  }

  const myListings = (data?.listings || []).filter((l) => l.farmerId === activeFarmer.id);
  const myEnquiries = (data?.enquiries || []).filter((e) => e.farmerId === activeFarmer.id);
  const myOffers = (data?.offers || []).filter((o) => o.farmerId === activeFarmer.id);
  const myOrders = (data?.orders || []).filter((ord) => ord.farmerId === activeFarmer.id);
  const myHarvests = (data?.harvests || []).filter((h) => h.farmerId === activeFarmer.id);
  const myConversations = (data?.conversations || []).filter(
    (c) => c.farmerId === activeFarmer.id
  );

  let savedKnowledgeIds: number[] = [];
  try {
    savedKnowledgeIds = JSON.parse(activeFarmer.savedKnowledgeIds || '[]');
  } catch {
    savedKnowledgeIds = [];
  }
  const mySavedKnowledge = (data?.knowledge || []).filter((k) =>
    savedKnowledgeIds.includes(k.id)
  );

  const handlePublishListing = async (e: React.FormEvent) => {
    e.preventDefault();
    setPublishingListing(true);
    try {
      const nextState = await apiFetch<BootstrapData>('/api/listings', {
        method: 'POST',
        body: JSON.stringify({
          farmerId: activeFarmer.id,
          ...listingForm,
          village: activeFarmer.village,
          mandal: activeFarmer.mandal,
          district: activeFarmer.district,
        }),
      });
      updateBootstrapState(nextState);
      pushToast(
        'success',
        `Published ${listingForm.cropName} listing. Now live in Merchant Market!`
      );
      setShowNewListingForm(false);
      setListingForm({
        cropName: '',
        variety: '',
        imageKey: 'crop_paddy_harvest',
        quantityQuintals: '',
        expectedHarvestDate: '2026-11-25',
        availabilityType: 'upcoming_harvest',
        qualityGrade: 'Grade A FAQ (<14% moisture)',
        productionMethod: 'Standard Cultivation',
        askingPricePerQuintal: '',
        privacyShowName: true,
      });
    } catch (err: any) {
      pushToast('error', err.message || 'Failed to publish listing.');
    } finally {
      setPublishingListing(false);
    }
  };

  const handleFarmerRespondEnquiry = async (enquiryId: number, status: string) => {
    try {
      const nextState = await apiFetch<BootstrapData>(`/api/enquiries/${enquiryId}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      });
      updateBootstrapState(nextState);
      pushToast('success', `Updated buyer enquiry #${enquiryId} to "${status}".`);
    } catch (err: any) {
      pushToast('error', err.message || 'Failed to update enquiry.');
    }
  };

  const handleCompleteOrderWithFeedback = async (orderId: number) => {
    try {
      const feedback = feedbackInputs[orderId] || 'Completed smoothly as scheduled.';
      const nextState = await apiFetch<BootstrapData>(`/api/orders/${orderId}/status`, {
        method: 'PATCH',
        body: JSON.stringify({
          orderStatus: 'Completed',
          farmerFeedback: feedback,
        }),
      });
      updateBootstrapState(nextState);
      pushToast('success', 'Marked order Completed and recorded farmer feedback.');
    } catch (err: any) {
      pushToast('error', err.message || 'Failed to update order.');
    }
  };

  return (
    <div className="space-y-6">
      {/* Personal, Soil, Farm & Consent Summary */}
      <section className="bg-white border border-[#E3E7E1] rounded-xl p-6 space-y-5">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 pb-4 border-b border-[#E8ECE6]">
          <div>
            <p className="text-xs text-[#4B5E52]">
              {activeFarmer.farmerCode} · Demo Farmer Record · Consent-Protected Profile
            </p>
            <h2 className="text-xl font-semibold text-[#14241B] mt-0.5">
              My Farm — {activeFarmer.name} ({activeFarmer.nameTe})
            </h2>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <select
              value={activeFarmer.id}
              onChange={(e) => setSelectedFarmerId(Number(e.target.value))}
              className="px-3 py-2 text-sm border border-[#D4DCD2] rounded-lg bg-white"
            >
              {farmers.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name} · {f.region}
                </option>
              ))}
            </select>

            <button
              type="button"
              onClick={() => setEditModalOpen(true)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium border border-[#CFD8CE] text-[#14241B] rounded-lg hover:bg-[#F3F5F1] whitespace-nowrap shrink-0"
            >
              <UserCog className="w-4 h-4 text-[#1B4332]" />
              <span>Edit Profile, Soil & Consent</span>
            </button>

            <button
              type="button"
              onClick={() => setShowNewListingForm(!showNewListingForm)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium bg-[#1B4332] text-white rounded-lg hover:bg-[#143326] whitespace-nowrap shrink-0"
            >
              <Plus className="w-4 h-4" />
              <span>Publish Produce Listing</span>
            </button>
          </div>
        </div>

        {/* Farm & Soil Details Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-sm">
          <div className="space-y-1.5">
            <p className="text-xs font-semibold text-[#14241B]">Location & Language</p>
            <p className="text-[#374B3E]">
              Village: {activeFarmer.village}, {activeFarmer.mandal} Mandal
            </p>
            <p className="text-[#374B3E]">
              District: {activeFarmer.district} ({activeFarmer.region})
            </p>
            <p className="text-[#374B3E]">
              Language:{' '}
              {activeFarmer.preferredLanguage === 'te' ? 'Telugu (తెలుగు)' : 'English'} ·{' '}
              {activeFarmer.dialectProfile === 'godavari_delta'
                ? 'Godavari Telugu'
                : 'Kakinada Coastal Telugu'}
            </p>
          </div>

          <div className="space-y-1.5">
            <p className="text-xs font-semibold text-[#14241B]">Farm, Soil & Irrigation</p>
            <p className="text-[#374B3E]">
              Area: <span className="font-mono-num">{activeFarmer.farmDetails?.farmAreaAcres}</span>{' '}
              acres · {activeFarmer.farmDetails?.irrigationType}
            </p>
            <p className="text-[#374B3E]">
              Soil: {activeFarmer.latestSoil?.soilType} (pH{' '}
              <span className="font-mono-num">{activeFarmer.latestSoil?.phLevel || 'N/A'}</span>, OC{' '}
              <span className="font-mono-num">
                {activeFarmer.latestSoil?.organicCarbon || 'N/A'}
              </span>
              )
            </p>
            <p className="text-xs text-[#4B5E52]">
              {activeFarmer.latestSoil?.salinityNote} ·{' '}
              {activeFarmer.latestSoil?.isVerifiedLabTest ? 'Lab Verified' : 'Self-reported'}
            </p>
          </div>

          <div className="space-y-1.5">
            <p className="text-xs font-semibold text-[#14241B]">Crops, Interests & Constraints</p>
            <p className="text-[#374B3E]">Current: {activeFarmer.currentCrop}</p>
            <p className="text-[#374B3E]">Previous: {activeFarmer.previousCrop}</p>
            <p className="text-xs text-[#4B5E52]">
              Interests: {activeFarmer.farmDetails?.cropInterests || 'None listed'}
            </p>
            <p className="text-xs text-[#5A6D60]">
              Constraints: {activeFarmer.farmDetails?.constraints || 'None listed'}
            </p>
          </div>
        </div>

        {/* Consent Status Line */}
        <div className="pt-4 border-t border-[#E8ECE6] flex flex-wrap items-center gap-4 text-xs text-[#4B5E52]">
          <span className="inline-flex items-center gap-1.5 font-medium text-[#14241B]">
            <ShieldCheck className="w-4 h-4 text-[#1B4332]" />
            Active Sharing Consent:
          </span>
          <span>
            AI Profile Context:{' '}
            <strong>{activeFarmer.consent?.shareProfileWithAi ? 'Consented' : 'Withheld'}</strong>
          </span>
          <span>·</span>
          <span>
            Merchant Listing Name:{' '}
            <strong>
              {activeFarmer.consent?.shareProfileWithMerchants ? 'Visible' : 'Protected ID Only'}
            </strong>
          </span>
          <span>·</span>
          <span>
            Direct Phone on Enquiry:{' '}
            <strong>{activeFarmer.consent?.shareContactOnEnquiry ? 'Shared' : 'Protected'}</strong>
          </span>
          <span>·</span>
          <span>
            Expert Escalation Context:{' '}
            <strong>
              {activeFarmer.consent?.shareConversationWithExperts ? 'Consented' : 'Withheld'}
            </strong>
          </span>
        </div>

        {/* Publish New Listing Form */}
        {showNewListingForm && (
          <form
            onSubmit={handlePublishListing}
            className="pt-5 border-t border-[#E8ECE6] space-y-4 bg-[#F7F9F6] p-5 rounded-xl"
          >
            <h3 className="text-base font-semibold text-[#14241B]">
              Publish Available or Upcoming Harvest Listing
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-medium text-[#4B5E52] mb-1">Crop Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Paddy (MTU-1061)"
                  value={listingForm.cropName}
                  onChange={(e) => setListingForm({ ...listingForm, cropName: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-[#D4DCD2] rounded-lg bg-white"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[#4B5E52] mb-1">
                  Quantity (Quintals)
                </label>
                <input
                  type="number"
                  required
                  placeholder="e.g. 50"
                  value={listingForm.quantityQuintals}
                  onChange={(e) =>
                    setListingForm({ ...listingForm, quantityQuintals: e.target.value })
                  }
                  className="w-full px-3 py-2 text-sm font-mono-num border border-[#D4DCD2] rounded-lg bg-white"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[#4B5E52] mb-1">
                  Expected Harvest Date
                </label>
                <input
                  type="date"
                  required
                  value={listingForm.expectedHarvestDate}
                  onChange={(e) =>
                    setListingForm({ ...listingForm, expectedHarvestDate: e.target.value })
                  }
                  className="w-full px-3 py-2 text-sm font-mono-num border border-[#D4DCD2] rounded-lg bg-white"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[#4B5E52] mb-1">
                  Listing Timing
                </label>
                <select
                  value={listingForm.availabilityType}
                  onChange={(e) =>
                    setListingForm({ ...listingForm, availabilityType: e.target.value })
                  }
                  className="w-full px-3 py-2 text-sm border border-[#D4DCD2] rounded-lg bg-white"
                >
                  <option value="upcoming_harvest">Upcoming Harvest</option>
                  <option value="available_now">Available Now</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-[#4B5E52] mb-1">
                  Asking Price (₹/qtl, Optional)
                </label>
                <input
                  type="number"
                  placeholder="e.g. 2380"
                  value={listingForm.askingPricePerQuintal}
                  onChange={(e) =>
                    setListingForm({ ...listingForm, askingPricePerQuintal: e.target.value })
                  }
                  className="w-full px-3 py-2 text-sm font-mono-num border border-[#D4DCD2] rounded-lg bg-white"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[#4B5E52] mb-1">
                  Produce Photo Category
                </label>
                <select
                  value={listingForm.imageKey}
                  onChange={(e) => setListingForm({ ...listingForm, imageKey: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-[#D4DCD2] rounded-lg bg-white"
                >
                  <option value="crop_paddy_harvest">Paddy / Grain Harvest</option>
                  <option value="crop_turmeric_banana">Banana / Turmeric Harvest</option>
                  <option value="crop_chilli_pulses">Pulses / Red Chilli Harvest</option>
                </select>
              </div>
              <div className="sm:col-span-2">
                <label className="block text-xs font-medium text-[#4B5E52] mb-1">
                  Self-Reported Quality Description
                </label>
                <input
                  type="text"
                  required
                  value={listingForm.qualityGrade}
                  onChange={(e) => setListingForm({ ...listingForm, qualityGrade: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-[#D4DCD2] rounded-lg bg-white"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[#4B5E52] mb-1">
                  Production Method
                </label>
                <input
                  type="text"
                  required
                  value={listingForm.productionMethod}
                  onChange={(e) =>
                    setListingForm({ ...listingForm, productionMethod: e.target.value })
                  }
                  className="w-full px-3 py-2 text-sm border border-[#D4DCD2] rounded-lg bg-white"
                />
              </div>
            </div>

            <div className="flex items-center justify-between gap-3">
              <label className="flex items-center gap-2 text-xs cursor-pointer">
                <input
                  type="checkbox"
                  checked={listingForm.privacyShowName}
                  onChange={(e) =>
                    setListingForm({ ...listingForm, privacyShowName: e.target.checked })
                  }
                  className="accent-[#1B4332]"
                />
                <span>Display my farmer name on this listing (uncheck to show Farmer ID only)</span>
              </label>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowNewListingForm(false)}
                  className="px-3 py-1.5 text-xs text-[#4B5E52]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={publishingListing}
                  className="px-4 py-2 text-xs font-medium bg-[#1B4332] text-white rounded-lg hover:bg-[#143326]"
                >
                  {publishingListing ? 'Publishing...' : 'Publish to Merchant Market'}
                </button>
              </div>
            </div>
          </form>
        )}
      </section>

      {/* Sub-navigation across My Farm records */}
      <div className="flex flex-wrap items-center gap-1 p-1 bg-[#EFF2ED] rounded-lg w-fit">
        <button
          type="button"
          onClick={() => setSubSection('listings_enquiries')}
          className={`px-3.5 py-2 text-xs sm:text-sm font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
            subSection === 'listings_enquiries'
              ? 'bg-white text-[#14241B] shadow-xs'
              : 'text-[#4B5E52] hover:text-[#14241B]'
          }`}
        >
          Listings ({myListings.length}) & Buyer Enquiries ({myEnquiries.length})
        </button>
        <button
          type="button"
          onClick={() => setSubSection('orders_offers')}
          className={`px-3.5 py-2 text-xs sm:text-sm font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
            subSection === 'orders_offers'
              ? 'bg-white text-[#14241B] shadow-xs'
              : 'text-[#4B5E52] hover:text-[#14241B]'
          }`}
        >
          Confirmed Orders ({myOrders.length}) & Sent Offers ({myOffers.length})
        </button>
        <button
          type="button"
          onClick={() => setSubSection('harvests_routes')}
          className={`px-3.5 py-2 text-xs sm:text-sm font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
            subSection === 'harvests_routes'
              ? 'bg-white text-[#14241B] shadow-xs'
              : 'text-[#4B5E52] hover:text-[#14241B]'
          }`}
        >
          Harvests & AGRIROUTE ({myHarvests.length})
        </button>
        <button
          type="button"
          onClick={() => setSubSection('ai_saved')}
          className={`px-3.5 py-2 text-xs sm:text-sm font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
            subSection === 'ai_saved'
              ? 'bg-white text-[#14241B] shadow-xs'
              : 'text-[#4B5E52] hover:text-[#14241B]'
          }`}
        >
          AI History ({myConversations.length}) & Saved Info ({mySavedKnowledge.length})
        </button>
      </div>

      {/* 1. LISTINGS & INCOMING BUYER ENQUIRIES */}
      {subSection === 'listings_enquiries' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white border border-[#E3E7E1] rounded-xl p-6 space-y-4">
            <h3 className="text-base font-semibold text-[#14241B]">
              My Produce Listings ({myListings.length})
            </h3>
            {myListings.length === 0 ? (
              <p className="text-sm text-[#4B5E52]">No produce listings published yet.</p>
            ) : (
              myListings.map((l) => (
                <div key={l.id} className="pt-3 border-t border-[#EEF1EC] space-y-1.5 text-sm">
                  <div className="flex items-center justify-between font-medium text-[#14241B]">
                    <span>{l.cropName}</span>
                    <span className="font-mono-num">
                      {l.quantityQuintals} qtl ·{' '}
                      {l.askingPricePerQuintal ? `₹${l.askingPricePerQuintal}/qtl` : 'Open'}
                    </span>
                  </div>
                  <p className="text-xs text-[#4B5E52]">
                    Harvest: <span className="font-mono-num">{l.expectedHarvestDate}</span> ·{' '}
                    {l.qualityGrade} ({l.qualityVerification})
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      setPrefillAgrirouteFromListingId(l.id);
                      setActiveTab('agriroute');
                    }}
                    className="inline-flex items-center gap-1 text-xs font-medium text-[#1B4332] hover:underline pt-1"
                  >
                    <Route className="w-3.5 h-3.5" />
                    <span>Compare Post-Harvest Destinations in AGRIROUTE →</span>
                  </button>
                </div>
              ))
            )}
          </div>

          <div className="bg-white border border-[#E3E7E1] rounded-xl p-6 space-y-4">
            <h3 className="text-base font-semibold text-[#14241B]">
              Incoming Merchant Enquiries ({myEnquiries.length})
            </h3>
            {myEnquiries.length === 0 ? (
              <p className="text-sm text-[#4B5E52]">No buyer enquiries received yet.</p>
            ) : (
              myEnquiries.map((enq) => {
                const merchant = (data?.merchants || []).find((m) => m.id === enq.merchantId);
                const listing = myListings.find((l) => l.id === enq.listingId);
                return (
                  <div key={enq.id} className="pt-3 border-t border-[#EEF1EC] space-y-2 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-semibold text-[#14241B]">
                        {merchant?.businessName || `Merchant #${enq.merchantId}`}
                      </span>
                      <span className="font-medium text-[#2D6A4F]">{enq.status}</span>
                    </div>
                    <p className="text-[#374B3E]">
                      For <strong>{listing?.cropName || 'Listing'}</strong>:{' '}
                      <span className="font-mono-num">{enq.requiredQuantityQuintals} qtl</span> at{' '}
                      <span className="font-mono-num">
                        ₹{Number(enq.proposedPricePerQuintal).toLocaleString('en-IN')}/qtl
                      </span>{' '}
                      on <span className="font-mono-num">{enq.procurementDate}</span>
                    </p>
                    {enq.message && <p className="text-[#4B5E52]">"{enq.message}"</p>}
                    <div className="flex flex-wrap gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => handleFarmerRespondEnquiry(enq.id, 'Under discussion')}
                        className="px-2.5 py-1 border border-[#CFD8CE] rounded-md hover:bg-[#F3F5F1]"
                      >
                        Discuss
                      </button>
                      <button
                        type="button"
                        onClick={() => handleFarmerRespondEnquiry(enq.id, 'Accepted')}
                        className="px-2.5 py-1 border border-[#CFD8CE] rounded-md hover:bg-[#F3F5F1]"
                      >
                        Accept Terms
                      </button>
                      <button
                        type="button"
                        onClick={() => handleFarmerRespondEnquiry(enq.id, 'Confirmed order')}
                        className="px-2.5 py-1 bg-[#1B4332] text-white rounded-md hover:bg-[#143326]"
                      >
                        Confirm Order
                      </button>
                      <button
                        type="button"
                        onClick={() => handleFarmerRespondEnquiry(enq.id, 'Rejected')}
                        className="px-2.5 py-1 text-[#B91C1C] hover:underline"
                      >
                        Decline
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* 2. CONFIRMED ORDERS & MY SENT OFFERS */}
      {subSection === 'orders_offers' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white border border-[#E3E7E1] rounded-xl p-6 space-y-4">
            <h3 className="text-base font-semibold text-[#14241B]">
              My Confirmed & Completed Orders ({myOrders.length})
            </h3>
            {myOrders.length === 0 ? (
              <p className="text-sm text-[#4B5E52]">No confirmed orders yet.</p>
            ) : (
              myOrders.map((ord) => {
                const merchant = (data?.merchants || []).find((m) => m.id === ord.merchantId);
                return (
                  <div key={ord.id} className="pt-3 border-t border-[#EEF1EC] space-y-2 text-xs">
                    <div className="flex items-center justify-between text-sm font-semibold text-[#14241B]">
                      <span className="font-mono-num">{ord.orderCode}</span>
                      <span
                        className={
                          ord.orderStatus === 'Completed' ? 'text-[#16A34A]' : 'text-[#1B4332]'
                        }
                      >
                        {ord.orderStatus}
                      </span>
                    </div>
                    <p className="text-[#374B3E]">
                      {ord.cropName} ·{' '}
                      <span className="font-mono-num">{ord.agreedQuantityQuintals} qtl</span> @{' '}
                      <span className="font-mono-num">
                        ₹{Number(ord.agreedPricePerQuintal).toLocaleString('en-IN')}/qtl
                      </span>
                    </p>
                    <p className="text-[#4B5E52]">
                      Buyer: {merchant?.businessName} · {ord.deliveryMode} (
                      <span className="font-mono-num">{ord.scheduledDate}</span>)
                    </p>
                    {ord.farmerFeedback ? (
                      <p className="text-[#16A34A]">Outcome Feedback: {ord.farmerFeedback}</p>
                    ) : (
                      ord.orderStatus === 'Confirmed order' && (
                        <div className="flex items-center gap-2 pt-1">
                          <input
                            type="text"
                            placeholder="Record weighbridge / settlement outcome..."
                            value={feedbackInputs[ord.id] || ''}
                            onChange={(e) =>
                              setFeedbackInputs({ ...feedbackInputs, [ord.id]: e.target.value })
                            }
                            className="flex-1 px-2.5 py-1.5 border border-[#D4DCD2] rounded-md"
                          />
                          <button
                            type="button"
                            onClick={() => handleCompleteOrderWithFeedback(ord.id)}
                            className="px-3 py-1.5 bg-[#1B4332] text-white rounded-md whitespace-nowrap"
                          >
                            Mark Completed
                          </button>
                        </div>
                      )
                    )}
                  </div>
                );
              })
            )}
          </div>

          <div className="bg-white border border-[#E3E7E1] rounded-xl p-6 space-y-4">
            <h3 className="text-base font-semibold text-[#14241B]">
              My Offers Sent to Merchants ({myOffers.length})
            </h3>
            {myOffers.length === 0 ? (
              <p className="text-sm text-[#4B5E52]">
                No offers submitted yet. Visit Farmer Market → Find Buyers to send an offer.
              </p>
            ) : (
              myOffers.map((off) => {
                const merchant = (data?.merchants || []).find((m) => m.id === off.merchantId);
                return (
                  <div key={off.id} className="pt-3 border-t border-[#EEF1EC] space-y-1 text-xs">
                    <div className="flex items-center justify-between text-sm font-medium text-[#14241B]">
                      <span>{merchant?.businessName || `Merchant #${off.merchantId}`}</span>
                      <span className="text-[#2D6A4F]">{off.status}</span>
                    </div>
                    <p className="text-[#4B5E52]">
                      Offered <span className="font-mono-num">{off.quantityOfferedQuintals} qtl</span>{' '}
                      @ <span className="font-mono-num">₹{off.expectedPricePerQuintal}/qtl</span> ·
                      Harvest: <span className="font-mono-num">{off.expectedHarvestDate}</span>
                    </p>
                    <p className="text-[#5A6D60]">{off.qualityDetails}</p>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* 3. HARVEST RECORDS & AGRIROUTE RECOMMENDATIONS */}
      {subSection === 'harvests_routes' && (
        <div className="bg-white border border-[#E3E7E1] rounded-xl p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-semibold text-[#14241B]">
              My Harvest Records & AGRIROUTE Evaluations ({myHarvests.length})
            </h3>
            <button
              type="button"
              onClick={() => setActiveTab('agriroute')}
              className="px-3.5 py-1.5 text-xs font-medium bg-[#1B4332] text-white rounded-lg"
            >
              Open AGRIROUTE
            </button>
          </div>

          {myHarvests.length === 0 ? (
            <p className="text-sm text-[#4B5E52]">
              No harvest routing evaluations saved for {activeFarmer.name} yet.
            </p>
          ) : (
            myHarvests.map((h) => (
              <div key={h.id} className="pt-4 border-t border-[#EEF1EC] space-y-2 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-semibold text-[#14241B]">
                    {h.cropName} — <span className="font-mono-num">{h.quantityHarvestedQuintals}</span>{' '}
                    qtl ({h.harvestDate})
                  </span>
                  <span className="text-xs text-[#2D6A4F] font-medium">{h.outcomeStatus}</span>
                </div>
                <p className="text-xs text-[#4B5E52]">
                  Quality: {h.qualityGrade} · Top Recommended Destinations:{' '}
                  {h.recommendations
                    .slice(0, 2)
                    .map((r) => `${r.destinationName} (${r.suitabilityScore}/100)`)
                    .join(' · ')}
                </p>
              </div>
            ))
          )}
        </div>
      )}

      {/* 4. AI CONVERSATION HISTORY & SAVED KNOWLEDGE */}
      {subSection === 'ai_saved' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white border border-[#E3E7E1] rounded-xl p-6 space-y-4">
            <h3 className="text-base font-semibold text-[#14241B]">
              My AI Conversation History ({myConversations.length})
            </h3>
            {myConversations.length === 0 ? (
              <p className="text-sm text-[#4B5E52]">No conversations recorded yet.</p>
            ) : (
              myConversations.map((c) => (
                <div
                  key={c.id}
                  className="pt-3 border-t border-[#EEF1EC] flex items-center justify-between gap-3"
                >
                  <div>
                    <p className="text-sm font-medium text-[#14241B]">{c.title}</p>
                    <p className="text-xs text-[#4B5E52]">
                      {c.messages.length} messages · Status: {c.status}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setActiveConversationId(c.id);
                      setActiveTab('assistant');
                    }}
                    className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium border border-[#CFD8CE] rounded-lg hover:bg-[#F3F5F1] whitespace-nowrap shrink-0"
                  >
                    <MessageSquare className="w-3.5 h-3.5" />
                    <span>Open Thread</span>
                  </button>
                </div>
              ))
            )}
          </div>

          <div className="bg-white border border-[#E3E7E1] rounded-xl p-6 space-y-4">
            <div className="flex items-center gap-2">
              <BookmarkCheck className="w-4 h-4 text-[#1B4332]" />
              <h3 className="text-base font-semibold text-[#14241B]">
                My Saved Agricultural Information ({mySavedKnowledge.length})
              </h3>
            </div>
            {mySavedKnowledge.length === 0 ? (
              <p className="text-sm text-[#4B5E52]">
                Bookmark guidance items in the AI Farmer Assistant Knowledge Base to view them here.
              </p>
            ) : (
              mySavedKnowledge.map((doc) => (
                <div key={doc.id} className="pt-3 border-t border-[#EEF1EC] space-y-1 text-xs">
                  <p className="text-sm font-semibold text-[#14241B]">{doc.title}</p>
                  <p className="text-[#374B3E]">{doc.summary}</p>
                  <p className="text-[#5A6D60]">
                    Source: {doc.sourceName} · Verified {doc.lastVerifiedDate}
                  </p>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      <FarmerProfileModal
        farmer={activeFarmer}
        isOpen={editModalOpen}
        onClose={() => setEditModalOpen(false)}
      />
    </div>
  );
};
