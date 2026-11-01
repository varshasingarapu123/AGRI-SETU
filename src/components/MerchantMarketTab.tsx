import React, { useState } from 'react';
import {
  Bookmark,
  Plus,
  Search,
  Send,
  X,
  FileSpreadsheet,
  PackageCheck,
} from 'lucide-react';
import { useAgriSetu } from '../context/AgriSetuContext.tsx';
import { ResilientImage } from '../lib/imageAssets.tsx';
import type { BootstrapData, ProduceListingRecord } from '../types/agrisetu.ts';

type MerchantSubView = 'produce' | 'dashboard' | 'publish_demand';

const ENQUIRY_STATUSES = [
  'Enquiry received',
  'Under discussion',
  'Offer made',
  'Accepted',
  'Rejected',
  'Confirmed order',
  'Completed',
  'Cancelled',
];

export const MerchantMarketTab: React.FC = () => {
  const {
    data,
    selectedMerchantId,
    setSelectedMerchantId,
    apiFetch,
    updateBootstrapState,
    pushToast,
  } = useAgriSetu();

  const [subView, setSubView] = useState<MerchantSubView>('produce');

  // Search & Filter states for Available Produce
  const [cropFilter, setCropFilter] = useState('');
  const [districtFilter, setDistrictFilter] = useState('All');
  const [mandalFilter, setMandalFilter] = useState('');
  const [minQtyFilter, setMinQtyFilter] = useState('');
  const [maxPriceFilter, setMaxPriceFilter] = useState('');
  const [qualityFilter, setQualityFilter] = useState('');
  const [harvestDateFilter, setHarvestDateFilter] = useState('');
  const [availabilityFilter, setAvailabilityFilter] = useState<
    'all' | 'available_now' | 'upcoming_harvest'
  >('all');

  // Selected listing modal & enquiry form
  const [activeListing, setActiveListing] = useState<ProduceListingRecord | null>(null);
  const [submittingEnquiry, setSubmittingEnquiry] = useState(false);
  const [enquiryForm, setEnquiryForm] = useState({
    requiredQuantityQuintals: '',
    proposedPricePerQuintal: '',
    qualityRequirements: 'FAQ <= 14% moisture, clean grading at weighbridge',
    logisticsPreference: 'Farmgate pickup',
    procurementDate: '2026-11-18',
    message: '',
  });

  // Merchant Demand Creation form
  const [publishingDemand, setPublishingDemand] = useState(false);
  const [demandForm, setDemandForm] = useState({
    cropName: '',
    quantityRequiredQuintals: '',
    qualitySpecifications: '',
    acceptsCosmeticImperfect: false,
    procurementPeriod: '2026-11-10 to 2026-12-05',
    deliveryLocation: '',
    district: 'Kakinada',
    offeredPriceRange: '',
    additionalRequirements: '',
  });

  const merchants = data?.merchants || [];
  const activeMerchant =
    merchants.find((m) => m.id === selectedMerchantId) || merchants[0];

  if (!activeMerchant) {
    return (
      <div className="p-8 text-center text-sm text-[#4B5E52]">
        Loading merchant marketplace...
      </div>
    );
  }

  let savedListingIds: number[] = [];
  try {
    savedListingIds = JSON.parse(activeMerchant.savedListingIds || '[]');
  } catch {
    savedListingIds = [];
  }

  const allListings = data?.listings || [];
  const districts = Array.from(new Set(allListings.map((l) => l.district)));

  const filteredListings = allListings.filter((item) => {
    if (
      cropFilter.trim() &&
      !item.cropName.toLowerCase().includes(cropFilter.trim().toLowerCase())
    ) {
      return false;
    }
    if (districtFilter !== 'All' && item.district !== districtFilter) {
      return false;
    }
    if (
      mandalFilter.trim() &&
      !item.mandal.toLowerCase().includes(mandalFilter.trim().toLowerCase())
    ) {
      return false;
    }
    if (minQtyFilter && (parseFloat(item.quantityQuintals) || 0) < parseFloat(minQtyFilter)) {
      return false;
    }
    if (
      maxPriceFilter &&
      item.askingPricePerQuintal &&
      (parseFloat(item.askingPricePerQuintal) || 0) > parseFloat(maxPriceFilter)
    ) {
      return false;
    }
    if (
      qualityFilter.trim() &&
      !item.qualityGrade.toLowerCase().includes(qualityFilter.trim().toLowerCase())
    ) {
      return false;
    }
    if (harvestDateFilter && item.expectedHarvestDate > harvestDateFilter) {
      return false;
    }
    if (availabilityFilter !== 'all' && item.availabilityType !== availabilityFilter) {
      return false;
    }
    return true;
  });

  const merchantEnquiries = (data?.enquiries || []).filter(
    (e) => e.merchantId === activeMerchant.id
  );
  const merchantIncomingOffers = (data?.offers || []).filter(
    (o) => o.merchantId === activeMerchant.id
  );
  const merchantOrders = (data?.orders || []).filter(
    (ord) => ord.merchantId === activeMerchant.id
  );
  const merchantDemands = (data?.demands || []).filter(
    (d) => d.merchantId === activeMerchant.id
  );
  const savedListings = allListings.filter((l) => savedListingIds.includes(l.id));

  const openListingModal = (listing: ProduceListingRecord) => {
    setActiveListing(listing);
    setEnquiryForm({
      requiredQuantityQuintals: listing.quantityQuintals,
      proposedPricePerQuintal: listing.askingPricePerQuintal || '',
      qualityRequirements: `Match declared grade: ${listing.qualityGrade}`,
      logisticsPreference: `Pickup from ${listing.village}, ${listing.district}`,
      procurementDate: listing.expectedHarvestDate,
      message: '',
    });
  };

  const handleToggleSaveListing = async (listingId: number) => {
    try {
      const res = await apiFetch<{ savedListingIds: number[] }>(
        `/api/merchants/${activeMerchant.id}/toggle-save-listing`,
        {
          method: 'POST',
          body: JSON.stringify({ listingId }),
        }
      );
      const updatedMerchants = merchants.map((m) =>
        m.id === activeMerchant.id
          ? { ...m, savedListingIds: JSON.stringify(res.savedListingIds) }
          : m
      );
      updateBootstrapState({ merchants: updatedMerchants });
      pushToast('success', 'Updated saved produce listings.');
    } catch (err: any) {
      pushToast('error', err.message || 'Failed to update saved listings.');
    }
  };

  const handleSendEnquiry = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeListing) return;
    setSubmittingEnquiry(true);
    try {
      const nextState = await apiFetch<BootstrapData>('/api/enquiries', {
        method: 'POST',
        body: JSON.stringify({
          listingId: activeListing.id,
          merchantId: activeMerchant.id,
          farmerId: activeListing.farmerId,
          ...enquiryForm,
        }),
      });
      updateBootstrapState(nextState);
      pushToast(
        'success',
        'Purchase enquiry saved and sent to farmer. Status: Enquiry received (not a confirmed sale).'
      );
      setActiveListing(null);
      setSubView('dashboard');
    } catch (err: any) {
      pushToast('error', err.message || 'Failed to send purchase enquiry.');
    } finally {
      setSubmittingEnquiry(false);
    }
  };

  const handlePublishDemand = async (e: React.FormEvent) => {
    e.preventDefault();
    setPublishingDemand(true);
    try {
      const nextState = await apiFetch<BootstrapData>('/api/demands', {
        method: 'POST',
        body: JSON.stringify({
          merchantId: activeMerchant.id,
          ...demandForm,
        }),
      });
      updateBootstrapState(nextState);
      pushToast(
        'success',
        `Published procurement requirement for ${demandForm.cropName}. Now visible in Farmer Market & AGRIROUTE.`
      );
      setDemandForm({
        cropName: '',
        quantityRequiredQuintals: '',
        qualitySpecifications: '',
        acceptsCosmeticImperfect: false,
        procurementPeriod: '2026-11-15 to 2026-12-10',
        deliveryLocation: '',
        district: activeMerchant.district,
        offeredPriceRange: '',
        additionalRequirements: '',
      });
      setSubView('dashboard');
    } catch (err: any) {
      pushToast('error', err.message || 'Failed to publish procurement demand.');
    } finally {
      setPublishingDemand(false);
    }
  };

  const handleEnquiryStatusChange = async (enquiryId: number, status: string) => {
    try {
      const nextState = await apiFetch<BootstrapData>(`/api/enquiries/${enquiryId}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      });
      updateBootstrapState(nextState);
      pushToast('success', `Updated enquiry #${enquiryId} to "${status}".`);
    } catch (err: any) {
      pushToast('error', err.message || 'Failed to update enquiry status.');
    }
  };

  const handleOfferStatusChange = async (offerId: number, status: string) => {
    try {
      const nextState = await apiFetch<BootstrapData>(`/api/offers/${offerId}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      });
      updateBootstrapState(nextState);
      pushToast('success', `Updated farmer offer #${offerId} to "${status}".`);
    } catch (err: any) {
      pushToast('error', err.message || 'Failed to update offer status.');
    }
  };

  const handleOrderStatusChange = async (orderId: number, orderStatus: string) => {
    try {
      const nextState = await apiFetch<BootstrapData>(`/api/orders/${orderId}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ orderStatus }),
      });
      updateBootstrapState(nextState);
      pushToast('success', `Order updated to "${orderStatus}".`);
    } catch (err: any) {
      pushToast('error', err.message || 'Failed to update order status.');
    }
  };

  return (
    <div className="space-y-6">
      {/* Merchant Account Switcher & Summary Strip */}
      <section className="bg-white border border-[#E3E7E1] rounded-xl p-5">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 pb-4 border-b border-[#E8ECE6]">
          <div>
            <p className="text-xs text-[#4B5E52]">
              Merchant Procurement Workspace · {activeMerchant.verificationStatus} ·{' '}
              {activeMerchant.buyerType}
            </p>
            <h2 className="text-lg font-semibold text-[#14241B] mt-0.5">
              {activeMerchant.businessName}
            </h2>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <label className="text-xs font-medium text-[#4B5E52]">Active Buyer Account:</label>
            <select
              value={activeMerchant.id}
              onChange={(e) => setSelectedMerchantId(Number(e.target.value))}
              className="px-3 py-2 text-sm border border-[#D4DCD2] rounded-lg bg-white focus:outline-none focus:border-[#1B4332]"
            >
              {merchants.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.businessName} ({m.buyerType})
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* High-Density KPI Row */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-4 pt-4 text-sm">
          <div>
            <p className="text-xs text-[#5A6D60]">Active Enquiries</p>
            <p className="text-xl font-semibold font-mono-num text-[#14241B] mt-0.5">
              {merchantEnquiries.length}
            </p>
          </div>
          <div>
            <p className="text-xs text-[#5A6D60]">Incoming Farmer Offers</p>
            <p className="text-xl font-semibold font-mono-num text-[#14241B] mt-0.5">
              {merchantIncomingOffers.length}
            </p>
          </div>
          <div>
            <p className="text-xs text-[#5A6D60]">Confirmed Orders</p>
            <p className="text-xl font-semibold font-mono-num text-[#1B4332] mt-0.5">
              {merchantOrders.filter((o) => o.orderStatus === 'Confirmed order').length}
            </p>
          </div>
          <div>
            <p className="text-xs text-[#5A6D60]">Completed Transactions</p>
            <p className="text-xl font-semibold font-mono-num text-[#16A34A] mt-0.5">
              {merchantOrders.filter((o) => o.orderStatus === 'Completed').length}
            </p>
          </div>
          <div>
            <p className="text-xs text-[#5A6D60]">Saved Listings</p>
            <p className="text-xl font-semibold font-mono-num text-[#14241B] mt-0.5">
              {savedListings.length}
            </p>
          </div>
        </div>
      </section>

      {/* Sub-navigation */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1 p-1 bg-[#EFF2ED] rounded-lg">
          <button
            type="button"
            onClick={() => setSubView('produce')}
            className={`inline-flex items-center gap-2 px-3.5 py-2 text-sm font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
              subView === 'produce'
                ? 'bg-white text-[#14241B] shadow-xs'
                : 'text-[#4B5E52] hover:text-[#14241B]'
            }`}
          >
            <Search className="w-4 h-4 text-[#1B4332]" />
            <span>Available Farmer Produce ({filteredListings.length})</span>
          </button>
          <button
            type="button"
            onClick={() => setSubView('dashboard')}
            className={`inline-flex items-center gap-2 px-3.5 py-2 text-sm font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
              subView === 'dashboard'
                ? 'bg-white text-[#14241B] shadow-xs'
                : 'text-[#4B5E52] hover:text-[#14241B]'
            }`}
          >
            <FileSpreadsheet className="w-4 h-4 text-[#1B4332]" />
            <span>Merchant Dashboard & Orders</span>
          </button>
          <button
            type="button"
            onClick={() => setSubView('publish_demand')}
            className={`inline-flex items-center gap-2 px-3.5 py-2 text-sm font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
              subView === 'publish_demand'
                ? 'bg-white text-[#14241B] shadow-xs'
                : 'text-[#4B5E52] hover:text-[#14241B]'
            }`}
          >
            <Plus className="w-4 h-4 text-[#1B4332]" />
            <span>Publish Procurement Requirement</span>
          </button>
        </div>
      </div>

      {/* SUBVIEW 1: AVAILABLE PRODUCE */}
      {subView === 'produce' && (
        <div className="space-y-5">
          {/* Filter Panel */}
          <div className="bg-white border border-[#E3E7E1] rounded-xl p-5 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <div>
                <label className="block text-xs font-medium text-[#4B5E52] mb-1">Crop</label>
                <input
                  type="search"
                  value={cropFilter}
                  onChange={(e) => setCropFilter(e.target.value)}
                  placeholder="e.g. Paddy, Banana, Black Gram..."
                  className="w-full px-3 py-2 text-sm border border-[#D4DCD2] rounded-lg"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[#4B5E52] mb-1">District</label>
                <select
                  value={districtFilter}
                  onChange={(e) => setDistrictFilter(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-[#D4DCD2] rounded-lg bg-white"
                >
                  <option value="All">All Districts</option>
                  {districts.map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-[#4B5E52] mb-1">Mandal</label>
                <input
                  type="text"
                  value={mandalFilter}
                  onChange={(e) => setMandalFilter(e.target.value)}
                  placeholder="e.g. Gollaprolu, Atreyapuram"
                  className="w-full px-3 py-2 text-sm border border-[#D4DCD2] rounded-lg"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[#4B5E52] mb-1">
                  Availability Window
                </label>
                <select
                  value={availabilityFilter}
                  onChange={(e) => setAvailabilityFilter(e.target.value as any)}
                  className="w-full px-3 py-2 text-sm border border-[#D4DCD2] rounded-lg bg-white"
                >
                  <option value="all">Available Now & Upcoming</option>
                  <option value="available_now">Available Now</option>
                  <option value="upcoming_harvest">Upcoming Harvest</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-[#4B5E52] mb-1">
                  Min Quantity (Quintals)
                </label>
                <input
                  type="number"
                  value={minQtyFilter}
                  onChange={(e) => setMinQtyFilter(e.target.value)}
                  placeholder="e.g. 20"
                  className="w-full px-3 py-2 text-sm font-mono-num border border-[#D4DCD2] rounded-lg"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[#4B5E52] mb-1">
                  Max Asking Price (₹/qtl)
                </label>
                <input
                  type="number"
                  value={maxPriceFilter}
                  onChange={(e) => setMaxPriceFilter(e.target.value)}
                  placeholder="e.g. 7500"
                  className="w-full px-3 py-2 text-sm font-mono-num border border-[#D4DCD2] rounded-lg"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[#4B5E52] mb-1">
                  Quality / Grade Keyword
                </label>
                <input
                  type="text"
                  value={qualityFilter}
                  onChange={(e) => setQualityFilter(e.target.value)}
                  placeholder="e.g. Grade A, FAQ, Sorted"
                  className="w-full px-3 py-2 text-sm border border-[#D4DCD2] rounded-lg"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[#4B5E52] mb-1">
                  Harvest On or Before
                </label>
                <input
                  type="date"
                  value={harvestDateFilter}
                  onChange={(e) => setHarvestDateFilter(e.target.value)}
                  className="w-full px-3 py-2 text-sm font-mono-num border border-[#D4DCD2] rounded-lg"
                />
              </div>
            </div>
          </div>

          {filteredListings.length === 0 ? (
            <div className="bg-white border border-[#E3E7E1] rounded-xl p-10 text-center space-y-2">
              <p className="text-sm font-medium text-[#14241B]">
                No farmer produce listings match the current filters.
              </p>
              <button
                type="button"
                onClick={() => {
                  setCropFilter('');
                  setDistrictFilter('All');
                  setMandalFilter('');
                  setMinQtyFilter('');
                  setMaxPriceFilter('');
                  setQualityFilter('');
                  setHarvestDateFilter('');
                  setAvailabilityFilter('all');
                }}
                className="px-4 py-2 text-xs font-medium bg-[#1B4332] text-white rounded-lg"
              >
                Reset Filters
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {filteredListings.map((listing) => {
                const isSaved = savedListingIds.includes(listing.id);
                return (
                  <div
                    key={listing.id}
                    className="bg-white border border-[#E3E7E1] rounded-xl overflow-hidden flex flex-col justify-between"
                  >
                    <div>
                      <ResilientImage
                        imageKey={listing.imageKey}
                        alt={listing.cropName}
                        className="w-full h-48 object-cover"
                      />
                      <div className="p-5 space-y-3">
                        <div className="flex items-center justify-between gap-2 text-xs text-[#4B5E52]">
                          <span>
                            {listing.availabilityType === 'available_now'
                              ? 'Available Now'
                              : 'Upcoming Harvest'}{' '}
                            · {listing.listingStatus} · {listing.isDemo ? 'Demo Listing' : 'Live'}
                          </span>
                          <span
                            className={`font-medium ${
                              listing.qualityVerification === 'Coordinator inspected'
                                ? 'text-[#16A34A]'
                                : 'text-[#B45309]'
                            }`}
                          >
                            Quality: {listing.qualityVerification}
                          </span>
                        </div>

                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <h3 className="text-lg font-semibold text-[#14241B]">
                              {listing.cropName}
                            </h3>
                            <p className="text-xs text-[#4B5E52] mt-0.5">
                              {listing.farmerDisplayName} · {listing.village}, {listing.mandal},{' '}
                              {listing.district}
                            </p>
                          </div>
                          <div className="text-right shrink-0">
                            <p className="text-base font-semibold font-mono-num text-[#1B4332]">
                              {listing.askingPricePerQuintal
                                ? `₹${Number(listing.askingPricePerQuintal).toLocaleString('en-IN')}/qtl`
                                : 'Open to Offer'}
                            </p>
                            <p className="text-xs font-mono-num text-[#4B5E52]">
                              {listing.quantityQuintals} quintals
                            </p>
                          </div>
                        </div>

                        <div className="pt-2 border-t border-[#EEF1EC] space-y-1 text-xs text-[#4B5E52]">
                          <p>
                            <strong className="text-[#14241B]">Declared Grade:</strong>{' '}
                            {listing.qualityGrade}
                          </p>
                          <p>
                            <strong className="text-[#14241B]">Production Method:</strong>{' '}
                            {listing.productionMethod}
                          </p>
                          <p>
                            <strong className="text-[#14241B]">Expected Harvest Date:</strong>{' '}
                            <span className="font-mono-num">{listing.expectedHarvestDate}</span>
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="px-5 py-3.5 bg-[#F8FAF7] border-t border-[#E8ECE6] flex items-center justify-between gap-3">
                      <button
                        type="button"
                        onClick={() => handleToggleSaveListing(listing.id)}
                        className="inline-flex items-center gap-1.5 text-xs font-medium text-[#4B5E52] hover:text-[#14241B]"
                      >
                        <Bookmark className="w-3.5 h-3.5" />
                        <span>{isSaved ? 'Saved' : 'Save Listing'}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => openListingModal(listing)}
                        className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium bg-[#1B4332] text-white rounded-lg hover:bg-[#143326] transition-colors whitespace-nowrap shrink-0"
                      >
                        <Send className="w-3.5 h-3.5" />
                        <span>Inspect & Send Purchase Enquiry</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* SUBVIEW 2: MERCHANT DASHBOARD */}
      {subView === 'dashboard' && (
        <div className="space-y-6">
          {/* Active Purchase Enquiries */}
          <div className="bg-white border border-[#E3E7E1] rounded-xl p-6 space-y-4">
            <div>
              <p className="text-xs text-[#4B5E52]">
                Note: An enquiry is not a confirmed sale until mutually accepted and marked as a Confirmed Order.
              </p>
              <h3 className="text-base font-semibold text-[#14241B] mt-0.5">
                Outgoing Purchase Enquiries ({merchantEnquiries.length})
              </h3>
            </div>

            {merchantEnquiries.length === 0 ? (
              <p className="text-sm text-[#4B5E52]">
                No purchase enquiries sent yet from this merchant account.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-[#E3E7E1] text-xs text-[#5A6D60]">
                      <th className="py-2.5 pr-4">Listing</th>
                      <th className="py-2.5 px-3 text-right">Qty (qtl)</th>
                      <th className="py-2.5 px-3 text-right">Proposed (₹/qtl)</th>
                      <th className="py-2.5 px-3">Procurement Date</th>
                      <th className="py-2.5 px-3">Logistics</th>
                      <th className="py-2.5 pl-3">Status Progression</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#EEF1EC]">
                    {merchantEnquiries.map((enq) => {
                      const listing = allListings.find((l) => l.id === enq.listingId);
                      return (
                        <tr key={enq.id} className="hover:bg-[#F9FBF8]">
                          <td className="py-3 pr-4">
                            <p className="font-medium text-[#14241B]">
                              {listing?.cropName || `Listing #${enq.listingId}`}
                            </p>
                            <p className="text-xs text-[#4B5E52]">
                              {listing?.farmerDisplayName}
                            </p>
                          </td>
                          <td className="py-3 px-3 text-right font-mono-num">
                            {enq.requiredQuantityQuintals}
                          </td>
                          <td className="py-3 px-3 text-right font-mono-num">
                            ₹{Number(enq.proposedPricePerQuintal).toLocaleString('en-IN')}
                          </td>
                          <td className="py-3 px-3 font-mono-num text-xs">
                            {enq.procurementDate}
                          </td>
                          <td className="py-3 px-3 text-xs text-[#4B5E52]">
                            {enq.logisticsPreference}
                          </td>
                          <td className="py-3 pl-3">
                            <select
                              value={enq.status}
                              onChange={(e) => handleEnquiryStatusChange(enq.id, e.target.value)}
                              className="px-2.5 py-1.5 text-xs border border-[#D4DCD2] rounded-lg bg-white"
                            >
                              {ENQUIRY_STATUSES.map((st) => (
                                <option key={st} value={st}>
                                  {st}
                                </option>
                              ))}
                            </select>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Incoming Farmer Offers on Merchant Requirements */}
          <div className="bg-white border border-[#E3E7E1] rounded-xl p-6 space-y-4">
            <h3 className="text-base font-semibold text-[#14241B]">
              Incoming Farmer Offers on Your Requirements ({merchantIncomingOffers.length})
            </h3>

            {merchantIncomingOffers.length === 0 ? (
              <p className="text-sm text-[#4B5E52]">
                No farmer offers received yet for this merchant profile.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-[#E3E7E1] text-xs text-[#5A6D60]">
                      <th className="py-2.5 pr-4">Requirement & Farmer</th>
                      <th className="py-2.5 px-3 text-right">Offered Qty</th>
                      <th className="py-2.5 px-3 text-right">Expected Price</th>
                      <th className="py-2.5 px-3">Harvest Date</th>
                      <th className="py-2.5 px-3">Quality Details</th>
                      <th className="py-2.5 pl-3">Action / Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#EEF1EC]">
                    {merchantIncomingOffers.map((off) => {
                      const dem = (data?.demands || []).find((d) => d.id === off.demandId);
                      const farmer = (data?.farmers || []).find((f) => f.id === off.farmerId);
                      return (
                        <tr key={off.id} className="hover:bg-[#F9FBF8]">
                          <td className="py-3 pr-4">
                            <p className="font-medium text-[#14241B]">
                              {dem?.cropName || `Demand #${off.demandId}`}
                            </p>
                            <p className="text-xs text-[#4B5E52]">
                              {farmer ? `${farmer.name} (${farmer.village})` : `Farmer #${off.farmerId}`}
                            </p>
                          </td>
                          <td className="py-3 px-3 text-right font-mono-num">
                            {off.quantityOfferedQuintals} qtl
                          </td>
                          <td className="py-3 px-3 text-right font-mono-num">
                            ₹{Number(off.expectedPricePerQuintal).toLocaleString('en-IN')}/qtl
                          </td>
                          <td className="py-3 px-3 font-mono-num text-xs">
                            {off.expectedHarvestDate}
                          </td>
                          <td className="py-3 px-3 text-xs text-[#4B5E52] max-w-xs">
                            {off.qualityDetails}
                          </td>
                          <td className="py-3 pl-3">
                            <select
                              value={off.status}
                              onChange={(e) => handleOfferStatusChange(off.id, e.target.value)}
                              className="px-2.5 py-1.5 text-xs border border-[#D4DCD2] rounded-lg bg-white"
                            >
                              {ENQUIRY_STATUSES.map((st) => (
                                <option key={st} value={st}>
                                  {st}
                                </option>
                              ))}
                            </select>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Confirmed Orders & Completed Transactions */}
          <div className="bg-white border border-[#E3E7E1] rounded-xl p-6 space-y-4">
            <div className="flex items-center gap-2">
              <PackageCheck className="w-4 h-4 text-[#1B4332]" />
              <h3 className="text-base font-semibold text-[#14241B]">
                Confirmed Orders & Completed Transactions ({merchantOrders.length})
              </h3>
            </div>

            {merchantOrders.length === 0 ? (
              <p className="text-sm text-[#4B5E52]">
                No confirmed orders yet. Convert an accepted enquiry or farmer offer to create a Confirmed Order.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-[#E3E7E1] text-xs text-[#5A6D60]">
                      <th className="py-2.5 pr-4">Order Code</th>
                      <th className="py-2.5 px-3">Crop</th>
                      <th className="py-2.5 px-3 text-right">Agreed Qty</th>
                      <th className="py-2.5 px-3 text-right">Agreed Price</th>
                      <th className="py-2.5 px-3">Scheduled Date</th>
                      <th className="py-2.5 pl-3">Order Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#EEF1EC]">
                    {merchantOrders.map((ord) => (
                      <tr key={ord.id} className="hover:bg-[#F9FBF8]">
                        <td className="py-3 pr-4 font-mono-num font-medium text-[#14241B]">
                          {ord.orderCode}
                        </td>
                        <td className="py-3 px-3">{ord.cropName}</td>
                        <td className="py-3 px-3 text-right font-mono-num">
                          {ord.agreedQuantityQuintals} qtl
                        </td>
                        <td className="py-3 px-3 text-right font-mono-num">
                          ₹{Number(ord.agreedPricePerQuintal).toLocaleString('en-IN')}/qtl
                        </td>
                        <td className="py-3 px-3 font-mono-num text-xs">{ord.scheduledDate}</td>
                        <td className="py-3 pl-3">
                          <select
                            value={ord.orderStatus}
                            onChange={(e) => handleOrderStatusChange(ord.id, e.target.value)}
                            className="px-2.5 py-1.5 text-xs border border-[#D4DCD2] rounded-lg bg-white"
                          >
                            <option value="Confirmed order">Confirmed order</option>
                            <option value="Completed">Completed</option>
                            <option value="Cancelled">Cancelled</option>
                          </select>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Published Procurement Requirements & Saved Listings */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white border border-[#E3E7E1] rounded-xl p-6 space-y-3">
              <h3 className="text-base font-semibold text-[#14241B]">
                Published Procurement Requirements ({merchantDemands.length})
              </h3>
              {merchantDemands.map((d) => (
                <div key={d.id} className="pt-3 border-t border-[#EEF1EC] text-xs space-y-1">
                  <div className="flex items-center justify-between font-medium text-sm text-[#14241B]">
                    <span>{d.cropName}</span>
                    <span className="font-mono-num">{d.quantityRequiredQuintals} qtl</span>
                  </div>
                  <p className="text-[#4B5E52]">
                    Indicative Range: <span className="font-mono-num">{d.offeredPriceRange}</span> ·{' '}
                    {d.procurementPeriod}
                  </p>
                  <p className="text-[#5A6D60]">{d.qualitySpecifications}</p>
                </div>
              ))}
            </div>

            <div className="bg-white border border-[#E3E7E1] rounded-xl p-6 space-y-3">
              <h3 className="text-base font-semibold text-[#14241B]">
                Saved Produce Listings ({savedListings.length})
              </h3>
              {savedListings.length === 0 ? (
                <p className="text-xs text-[#4B5E52]">No listings bookmarked yet.</p>
              ) : (
                savedListings.map((l) => (
                  <div
                    key={l.id}
                    className="pt-3 border-t border-[#EEF1EC] flex items-center justify-between gap-2 text-xs"
                  >
                    <div>
                      <p className="font-medium text-sm text-[#14241B]">{l.cropName}</p>
                      <p className="text-[#4B5E52]">
                        {l.quantityQuintals} qtl · {l.village}, {l.district}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => openListingModal(l)}
                      className="px-3 py-1.5 font-medium border border-[#CFD8CE] rounded-lg hover:bg-[#F3F5F1]"
                    >
                      Enquire
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* SUBVIEW 3: PUBLISH PROCUREMENT DEMAND */}
      {subView === 'publish_demand' && (
        <div className="bg-white border border-[#E3E7E1] rounded-xl p-6 max-w-3xl">
          <div className="pb-4 border-b border-[#E8ECE6]">
            <p className="text-xs text-[#4B5E52]">
              Publishing as {activeMerchant.businessName} ({activeMerchant.buyerType})
            </p>
            <h3 className="text-lg font-semibold text-[#14241B] mt-0.5">
              Publish Procurement Requirement to Farmer Market & AGRIROUTE
            </h3>
          </div>

          <form onSubmit={handlePublishDemand} className="mt-5 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-[#4B5E52] mb-1">
                  Crop Required
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Paddy (BPT-5204), Turmeric, Banana..."
                  value={demandForm.cropName}
                  onChange={(e) => setDemandForm({ ...demandForm, cropName: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-[#D4DCD2] rounded-lg"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[#4B5E52] mb-1">
                  Quantity Required (Quintals)
                </label>
                <input
                  type="number"
                  required
                  placeholder="e.g. 100"
                  value={demandForm.quantityRequiredQuintals}
                  onChange={(e) =>
                    setDemandForm({ ...demandForm, quantityRequiredQuintals: e.target.value })
                  }
                  className="w-full px-3 py-2 text-sm font-mono-num border border-[#D4DCD2] rounded-lg"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[#4B5E52] mb-1">
                  Required Procurement Period
                </label>
                <input
                  type="text"
                  required
                  value={demandForm.procurementPeriod}
                  onChange={(e) =>
                    setDemandForm({ ...demandForm, procurementPeriod: e.target.value })
                  }
                  className="w-full px-3 py-2 text-sm border border-[#D4DCD2] rounded-lg"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[#4B5E52] mb-1">
                  Indicative Price Range (₹/qtl)
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. ₹2,320 – ₹2,450"
                  value={demandForm.offeredPriceRange}
                  onChange={(e) =>
                    setDemandForm({ ...demandForm, offeredPriceRange: e.target.value })
                  }
                  className="w-full px-3 py-2 text-sm font-mono-num border border-[#D4DCD2] rounded-lg"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[#4B5E52] mb-1">
                  Delivery Location / Yard
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Samalkot Mill Gate or Farmgate >= 40 qtl"
                  value={demandForm.deliveryLocation}
                  onChange={(e) =>
                    setDemandForm({ ...demandForm, deliveryLocation: e.target.value })
                  }
                  className="w-full px-3 py-2 text-sm border border-[#D4DCD2] rounded-lg"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[#4B5E52] mb-1">District</label>
                <input
                  type="text"
                  required
                  value={demandForm.district}
                  onChange={(e) => setDemandForm({ ...demandForm, district: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-[#D4DCD2] rounded-lg"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-[#4B5E52] mb-1">
                Quality Specifications
              </label>
              <input
                type="text"
                required
                placeholder="e.g. Moisture <= 14%, clean sorted lot, zero chemical ripeners"
                value={demandForm.qualitySpecifications}
                onChange={(e) =>
                  setDemandForm({ ...demandForm, qualitySpecifications: e.target.value })
                }
                className="w-full px-3 py-2 text-sm border border-[#D4DCD2] rounded-lg"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-[#4B5E52] mb-1">
                Additional Terms (Weighment, Packaging, Settlement)
              </label>
              <textarea
                rows={2}
                value={demandForm.additionalRequirements}
                onChange={(e) =>
                  setDemandForm({ ...demandForm, additionalRequirements: e.target.value })
                }
                className="w-full px-3 py-2 text-sm border border-[#D4DCD2] rounded-lg"
              />
            </div>

            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={demandForm.acceptsCosmeticImperfect}
                onChange={(e) =>
                  setDemandForm({ ...demandForm, acceptsCosmeticImperfect: e.target.checked })
                }
                className="accent-[#1B4332]"
              />
              <span>
                Processing / Value-Add Intake: Accept edible produce with cosmetic skin blemishes
              </span>
            </label>

            <div className="pt-3 flex justify-end">
              <button
                type="submit"
                disabled={publishingDemand}
                className="px-5 py-2.5 text-sm font-medium bg-[#1B4332] text-white rounded-lg hover:bg-[#143326] disabled:opacity-60"
              >
                {publishingDemand ? 'Publishing...' : 'Publish Procurement Requirement'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Produce Detail & Send Purchase Enquiry Modal */}
      {activeListing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 overflow-y-auto">
          <div className="bg-white border border-[#E3E7E1] rounded-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6 space-y-5">
            <div className="flex items-start justify-between gap-4 pb-3 border-b border-[#E8ECE6]">
              <div>
                <p className="text-xs text-[#4B5E52]">
                  {activeListing.farmerDisplayName} · {activeListing.village},{' '}
                  {activeListing.district}
                </p>
                <h3 className="text-lg font-semibold text-[#14241B] mt-0.5">
                  {activeListing.cropName} ({activeListing.quantityQuintals} quintals)
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setActiveListing(null)}
                className="p-1.5 text-[#4B5E52] hover:text-[#14241B]"
                aria-label="Close modal"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <ResilientImage
              imageKey={activeListing.imageKey}
              alt={activeListing.cropName}
              className="w-full h-52 object-cover rounded-lg"
            />

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs bg-[#F6F8F5] p-4 rounded-lg">
              <p>
                <strong className="text-[#14241B]">Quality Verification:</strong>{' '}
                {activeListing.qualityVerification === 'Coordinator inspected'
                  ? 'Coordinator Inspected (Pilot Field Check)'
                  : 'Self-Reported by Farmer (Verify sample at pickup)'}
              </p>
              <p>
                <strong className="text-[#14241B]">Expected Harvest:</strong>{' '}
                <span className="font-mono-num">{activeListing.expectedHarvestDate}</span>
              </p>
              <p>
                <strong className="text-[#14241B]">Declared Quality:</strong>{' '}
                {activeListing.qualityGrade}
              </p>
              <p>
                <strong className="text-[#14241B]">Farmer Contact Policy:</strong>{' '}
                {activeListing.farmerContactNote}
              </p>
            </div>

            <form onSubmit={handleSendEnquiry} className="space-y-4 pt-2 border-t border-[#E8ECE6]">
              <h4 className="text-sm font-semibold text-[#14241B]">
                Send Purchase Enquiry as {activeMerchant.businessName}
              </h4>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-medium text-[#4B5E52] mb-1">
                    Required Quantity (qtl)
                  </label>
                  <input
                    type="number"
                    required
                    value={enquiryForm.requiredQuantityQuintals}
                    onChange={(e) =>
                      setEnquiryForm({ ...enquiryForm, requiredQuantityQuintals: e.target.value })
                    }
                    className="w-full px-3 py-2 text-sm font-mono-num border border-[#D4DCD2] rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#4B5E52] mb-1">
                    Proposed Price (₹/qtl)
                  </label>
                  <input
                    type="number"
                    required
                    value={enquiryForm.proposedPricePerQuintal}
                    onChange={(e) =>
                      setEnquiryForm({ ...enquiryForm, proposedPricePerQuintal: e.target.value })
                    }
                    className="w-full px-3 py-2 text-sm font-mono-num border border-[#D4DCD2] rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#4B5E52] mb-1">
                    Target Procurement Date
                  </label>
                  <input
                    type="date"
                    required
                    value={enquiryForm.procurementDate}
                    onChange={(e) =>
                      setEnquiryForm({ ...enquiryForm, procurementDate: e.target.value })
                    }
                    className="w-full px-3 py-2 text-sm font-mono-num border border-[#D4DCD2] rounded-lg"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-[#4B5E52] mb-1">
                    Quality Requirements
                  </label>
                  <input
                    type="text"
                    required
                    value={enquiryForm.qualityRequirements}
                    onChange={(e) =>
                      setEnquiryForm({ ...enquiryForm, qualityRequirements: e.target.value })
                    }
                    className="w-full px-3 py-2 text-sm border border-[#D4DCD2] rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#4B5E52] mb-1">
                    Pickup or Delivery Preference
                  </label>
                  <input
                    type="text"
                    required
                    value={enquiryForm.logisticsPreference}
                    onChange={(e) =>
                      setEnquiryForm({ ...enquiryForm, logisticsPreference: e.target.value })
                    }
                    className="w-full px-3 py-2 text-sm border border-[#D4DCD2] rounded-lg"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-[#4B5E52] mb-1">
                  Additional Message to Farmer
                </label>
                <textarea
                  rows={2}
                  value={enquiryForm.message}
                  onChange={(e) => setEnquiryForm({ ...enquiryForm, message: e.target.value })}
                  placeholder="Share packaging, moisture testing, or payment timeline notes..."
                  className="w-full px-3 py-2 text-sm border border-[#D4DCD2] rounded-lg"
                />
              </div>

              <div className="flex items-center justify-between gap-3 pt-2">
                <p className="text-xs text-[#5A6D60]">
                  Submitting saves status as "Enquiry received" (not a confirmed order).
                </p>
                <button
                  type="submit"
                  disabled={submittingEnquiry}
                  className="px-4 py-2 text-xs font-medium bg-[#1B4332] text-white rounded-lg hover:bg-[#143326] disabled:opacity-60 whitespace-nowrap shrink-0"
                >
                  {submittingEnquiry ? 'Sending...' : 'Send Purchase Enquiry'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
