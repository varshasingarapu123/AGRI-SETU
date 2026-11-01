import React, { useState } from 'react';
import { Handshake, Package, Send, X } from 'lucide-react';
import { useAgriSetu } from '../context/AgriSetuContext.tsx';
import { ResilientImage } from '../lib/imageAssets.tsx';
import type {
  BootstrapData,
  MerchantDemandRecord,
  SupplyProductRecord,
} from '../types/agrisetu.ts';

type FarmerMarketSection = 'find_buyers' | 'supplies';

const SUPPLY_CATEGORIES = [
  'All',
  'Seeds and saplings',
  'Fertilisers',
  'Irrigation equipment',
  'Farming tools',
  'Agricultural machinery',
  'Crop protection products',
  'Other farm essentials',
];

export const FarmerMarketTab: React.FC = () => {
  const {
    data,
    selectedFarmerId,
    setSelectedFarmerId,
    apiFetch,
    updateBootstrapState,
    pushToast,
  } = useAgriSetu();

  const [section, setSection] = useState<FarmerMarketSection>('find_buyers');

  // Buyer Demand filters
  const [buyerCropFilter, setBuyerCropFilter] = useState('');
  const [buyerLocationFilter, setBuyerLocationFilter] = useState('');
  const [buyerMinQty, setBuyerMinQty] = useState('');
  const [buyerPriceSearch, setBuyerPriceSearch] = useState('');
  const [buyerPeriodSearch, setBuyerPeriodSearch] = useState('');
  const [buyerTypeFilter, setBuyerTypeFilter] = useState('All');

  // Send Offer Modal
  const [selectedDemand, setSelectedDemand] = useState<MerchantDemandRecord | null>(null);
  const [sendingOffer, setSendingOffer] = useState(false);
  const [offerForm, setOfferForm] = useState({
    quantityOfferedQuintals: '',
    expectedPricePerQuintal: '',
    expectedHarvestDate: '2026-11-18',
    qualityDetails: '',
    message: '',
  });

  // Supplies filters & Enquiry modal
  const [supplyCategory, setSupplyCategory] = useState('All');
  const [supplySearch, setSupplySearch] = useState('');
  const [supplyLocationFilter, setSupplyLocationFilter] = useState('All');
  const [selectedProduct, setSelectedProduct] = useState<SupplyProductRecord | null>(null);
  const [supplyEnquiryNote, setSupplyEnquiryNote] = useState('');
  const [sendingSupplyEnquiry, setSendingSupplyEnquiry] = useState(false);

  const farmers = data?.farmers || [];
  const activeFarmer = farmers.find((f) => f.id === selectedFarmerId) || farmers[0];
  const demoFarmerOptions = data?.demoPersonas?.farmers || farmers;
  const isKakinadaFarmer = (activeFarmer?.region || '').toLowerCase().includes('kakinada');

  const demands = data?.demands || [];
  const filteredDemands = demands.filter((d) => {
    if (
      buyerCropFilter.trim() &&
      !d.cropName.toLowerCase().includes(buyerCropFilter.trim().toLowerCase())
    ) {
      return false;
    }
    if (
      buyerLocationFilter.trim() &&
      !`${d.deliveryLocation} ${d.district}`
        .toLowerCase()
        .includes(buyerLocationFilter.trim().toLowerCase())
    ) {
      return false;
    }
    if (buyerMinQty && (parseFloat(d.quantityRequiredQuintals) || 0) < parseFloat(buyerMinQty)) {
      return false;
    }
    if (
      buyerPriceSearch.trim() &&
      !d.offeredPriceRange.toLowerCase().includes(buyerPriceSearch.trim().toLowerCase())
    ) {
      return false;
    }
    if (
      buyerPeriodSearch.trim() &&
      !d.procurementPeriod.toLowerCase().includes(buyerPeriodSearch.trim().toLowerCase())
    ) {
      return false;
    }
    if (buyerTypeFilter !== 'All' && d.buyerType !== buyerTypeFilter) {
      return false;
    }
    return true;
  });

  const supplyProducts = data?.supplyProducts || [];
  const supplyLocations = Array.from(new Set(supplyProducts.map((p) => p.supplierLocation)));

  const filteredProducts = supplyProducts.filter((p) => {
    if (supplyCategory !== 'All' && p.category !== supplyCategory) return false;
    if (supplyLocationFilter !== 'All' && p.supplierLocation !== supplyLocationFilter) {
      return false;
    }
    if (
      supplySearch.trim() &&
      !`${p.productName} ${p.description} ${p.supplierName}`
        .toLowerCase()
        .includes(supplySearch.trim().toLowerCase())
    ) {
      return false;
    }
    return true;
  });

  const openOfferModal = (demand: MerchantDemandRecord) => {
    setSelectedDemand(demand);
    setOfferForm({
      quantityOfferedQuintals: '25',
      expectedPricePerQuintal: '',
      expectedHarvestDate: '2026-11-18',
      qualityDetails: `Farm-sorted lot matching ${demand.cropName} standards`,
      message: '',
    });
  };

  const handleSubmitOffer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedDemand || !activeFarmer) return;
    setSendingOffer(true);
    try {
      const nextState = await apiFetch<BootstrapData>('/api/offers', {
        method: 'POST',
        body: JSON.stringify({
          demandId: selectedDemand.id,
          farmerId: activeFarmer.id,
          merchantId: selectedDemand.merchantId,
          ...offerForm,
        }),
      });
      updateBootstrapState(nextState);
      pushToast(
        'success',
        `Offer sent to ${selectedDemand.merchantName}. Viewable in Merchant Market & My Farm.`
      );
      setSelectedDemand(null);
    } catch (err: any) {
      pushToast('error', err.message || 'Failed to submit offer.');
    } finally {
      setSendingOffer(false);
    }
  };

  const handleSendSupplyEnquiry = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProduct || !activeFarmer) return;
    setSendingSupplyEnquiry(true);
    try {
      const nextState = await apiFetch<BootstrapData>('/api/supplies/enquiry', {
        method: 'POST',
        body: JSON.stringify({
          farmerId: activeFarmer.id,
          productName: selectedProduct.productName,
          supplierName: selectedProduct.supplierName,
          quantityNote: supplyEnquiryNote || '1 unit availability & pickup enquiry',
        }),
      });
      updateBootstrapState(nextState);
      pushToast(
        'success',
        `Logged availability enquiry with ${selectedProduct.supplierName} (No online payment collected).`
      );
      setSelectedProduct(null);
      setSupplyEnquiryNote('');
    } catch (err: any) {
      pushToast('error', err.message || 'Failed to send supply enquiry.');
    } finally {
      setSendingSupplyEnquiry(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Farmer Context & Section Switcher */}
      <section className="bg-white border border-[#E3E7E1] rounded-xl p-5 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <p className="text-xs text-[#4B5E52]">
            Farmer-Facing Marketplace · Buyer Discovery & Farm Supplies
          </p>
          <h2 className="text-lg font-semibold text-[#14241B] mt-0.5">
            Farmer Market — Acting as {activeFarmer?.name} ({activeFarmer?.village},{' '}
            {activeFarmer?.district})
          </h2>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {activeFarmer?.isDemo && (
            <select
              value={activeFarmer?.id || 1}
              onChange={(e) => setSelectedFarmerId(Number(e.target.value))}
              className="px-3 py-2 text-sm border border-[#D4DCD2] rounded-lg bg-white"
            >
              {demoFarmerOptions.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name} · {f.region} (Demo)
                </option>
              ))}
            </select>
          )}

          <div className="flex items-center gap-1 p-1 bg-[#EFF2ED] rounded-lg">
            <button
              type="button"
              onClick={() => setSection('find_buyers')}
              className={`inline-flex items-center gap-2 px-3.5 py-2 text-sm font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                section === 'find_buyers'
                  ? 'bg-white text-[#14241B] shadow-xs'
                  : 'text-[#4B5E52] hover:text-[#14241B]'
              }`}
            >
              <Handshake className="w-4 h-4 text-[#1B4332]" />
              <span>Find Buyers ({filteredDemands.length})</span>
            </button>
            <button
              type="button"
              onClick={() => setSection('supplies')}
              className={`inline-flex items-center gap-2 px-3.5 py-2 text-sm font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                section === 'supplies'
                  ? 'bg-white text-[#14241B] shadow-xs'
                  : 'text-[#4B5E52] hover:text-[#14241B]'
              }`}
            >
              <Package className="w-4 h-4 text-[#1B4332]" />
              <span>Agricultural Supplies ({filteredProducts.length})</span>
            </button>
          </div>
        </div>
      </section>

      {/* SECTION A: FIND BUYERS */}
      {section === 'find_buyers' && (
        <div className="space-y-5">
          <div className="bg-white border border-[#E3E7E1] rounded-xl p-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3">
            <input
              type="search"
              value={buyerCropFilter}
              onChange={(e) => setBuyerCropFilter(e.target.value)}
              placeholder="Crop (e.g. Paddy, Banana)"
              className="px-3 py-2 text-sm border border-[#D4DCD2] rounded-lg"
            />
            <input
              type="text"
              value={buyerLocationFilter}
              onChange={(e) => setBuyerLocationFilter(e.target.value)}
              placeholder="Location / District"
              className="px-3 py-2 text-sm border border-[#D4DCD2] rounded-lg"
            />
            <input
              type="number"
              value={buyerMinQty}
              onChange={(e) => setBuyerMinQty(e.target.value)}
              placeholder="Min Qty (qtl)"
              className="px-3 py-2 text-sm font-mono-num border border-[#D4DCD2] rounded-lg"
            />
            <input
              type="text"
              value={buyerPriceSearch}
              onChange={(e) => setBuyerPriceSearch(e.target.value)}
              placeholder="Price filter"
              className="px-3 py-2 text-sm border border-[#D4DCD2] rounded-lg"
            />
            <input
              type="text"
              value={buyerPeriodSearch}
              onChange={(e) => setBuyerPeriodSearch(e.target.value)}
              placeholder="Procurement month/date"
              className="px-3 py-2 text-sm border border-[#D4DCD2] rounded-lg"
            />
            <select
              value={buyerTypeFilter}
              onChange={(e) => setBuyerTypeFilter(e.target.value)}
              className="px-3 py-2 text-sm border border-[#D4DCD2] rounded-lg bg-white"
            >
              <option value="All">All Buyer Types</option>
              <option value="Wholesaler">Wholesaler</option>
              <option value="Retail Procurement">Retail Procurement</option>
              <option value="Food Processing Unit">Food Processing Unit</option>
              <option value="Direct Merchant">Direct Merchant</option>
            </select>
          </div>

          {filteredDemands.length === 0 ? (
            <div className="bg-white border border-[#E3E7E1] rounded-xl p-10 text-center text-sm text-[#4B5E52]">
              No buyer procurement requirements match your current filter.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {filteredDemands.map((demand) => {
                const distKm = isKakinadaFarmer
                  ? demand.distanceKmFromKakinada
                  : demand.distanceKmFromGodavari;
                return (
                  <div
                    key={demand.id}
                    className="bg-white border border-[#E3E7E1] rounded-xl p-5 flex flex-col justify-between space-y-4"
                  >
                    <div className="space-y-2.5">
                      <div className="flex items-center justify-between gap-2 text-xs text-[#4B5E52]">
                        <span>
                          {demand.buyerType} · {demand.merchantVerification} · Status:{' '}
                          {demand.demandStatus}
                        </span>
                        <span className="font-mono-num">~{distKm} km from {activeFarmer?.region}</span>
                      </div>

                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <h3 className="text-lg font-semibold text-[#14241B]">
                            {demand.cropName}
                          </h3>
                          <p className="text-xs text-[#4B5E52] mt-0.5">{demand.merchantName}</p>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-sm font-semibold font-mono-num text-[#1B4332]">
                            {demand.offeredPriceRange}/qtl
                          </p>
                          <p className="text-xs font-mono-num text-[#4B5E52]">
                            Needs {demand.quantityRequiredQuintals} qtl
                          </p>
                        </div>
                      </div>

                      <div className="pt-2 border-t border-[#EEF1EC] space-y-1 text-xs text-[#4B5E52]">
                        <p>
                          <strong className="text-[#14241B]">Quality Specs:</strong>{' '}
                          {demand.qualitySpecifications}
                        </p>
                        <p>
                          <strong className="text-[#14241B]">Procurement Window:</strong>{' '}
                          <span className="font-mono-num">{demand.procurementPeriod}</span>
                        </p>
                        <p>
                          <strong className="text-[#14241B]">Delivery / Pickup:</strong>{' '}
                          {demand.deliveryLocation} ({demand.district})
                        </p>
                        {demand.acceptsCosmeticImperfect && (
                          <p className="text-[#16A34A] font-medium">
                            Accepts edible cosmetically imperfect produce for value-added processing.
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="pt-3 border-t border-[#EEF1EC] flex items-center justify-between gap-3">
                      <span className="text-xs text-[#5A6D60]">
                        Indicative Pilot Requirement
                      </span>
                      <button
                        type="button"
                        onClick={() => openOfferModal(demand)}
                        className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium bg-[#1B4332] text-white rounded-lg hover:bg-[#143326] transition-colors whitespace-nowrap shrink-0"
                      >
                        <Send className="w-3.5 h-3.5" />
                        <span>Send Offer</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* SECTION B: AGRICULTURAL SUPPLIES */}
      {section === 'supplies' && (
        <div className="space-y-5">
          <div className="bg-white border border-[#E3E7E1] rounded-xl p-5 space-y-4">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
              <div>
                <p className="text-xs text-[#B45309]">
                  Prototype Supplier Discovery Notice: Listings below are Demo Supplier records and have not undergone independent supplier verification. No online payment is collected.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2 shrink-0">
                <input
                  type="search"
                  value={supplySearch}
                  onChange={(e) => setSupplySearch(e.target.value)}
                  placeholder="Search seeds, drip, sprayer..."
                  className="px-3 py-2 text-sm border border-[#D4DCD2] rounded-lg"
                />
                <select
                  value={supplyLocationFilter}
                  onChange={(e) => setSupplyLocationFilter(e.target.value)}
                  className="px-3 py-2 text-sm border border-[#D4DCD2] rounded-lg bg-white"
                >
                  <option value="All">All Supplier Locations</option>
                  {supplyLocations.map((loc) => (
                    <option key={loc} value={loc}>
                      {loc}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex flex-wrap gap-1.5">
              {SUPPLY_CATEGORIES.map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setSupplyCategory(cat)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap shrink-0 ${
                    supplyCategory === cat
                      ? 'bg-[#1B4332] text-white'
                      : 'bg-[#F3F5F1] text-[#4B5E52] hover:text-[#14241B]'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {filteredProducts.map((prod) => (
              <div
                key={prod.id}
                className="bg-white border border-[#E3E7E1] rounded-xl overflow-hidden flex flex-col justify-between"
              >
                <div>
                  <ResilientImage
                    imageKey={prod.imageKey}
                    alt={prod.productName}
                    className="w-full h-44 object-cover"
                  />
                  <div className="p-5 space-y-2.5">
                    <p className="text-xs text-[#4B5E52]">
                      {prod.category} · {prod.availabilityStatus}
                    </p>
                    <h3 className="text-base font-semibold text-[#14241B]">{prod.productName}</h3>
                    <p className="text-sm text-[#374B3E]">{prod.description}</p>
                    <div className="pt-2 border-t border-[#EEF1EC] space-y-1 text-xs text-[#4B5E52]">
                      <p>
                        <strong className="text-[#14241B]">Specs:</strong> {prod.specifications}
                      </p>
                      <p>
                        <strong className="text-[#14241B]">Supplier:</strong> {prod.supplierName} (
                        {prod.supplierLocation})
                      </p>
                      <p className="text-[#B45309]">{prod.supplierVerification}</p>
                    </div>
                  </div>
                </div>

                <div className="px-5 py-3.5 bg-[#F8FAF7] border-t border-[#E8ECE6] flex items-center justify-between gap-2">
                  <div>
                    <span className="text-base font-semibold font-mono-num text-[#1B4332]">
                      ₹{Number(prod.priceInr).toLocaleString('en-IN')}
                    </span>
                    <span className="text-xs text-[#4B5E52]"> {prod.unit}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSelectedProduct(prod)}
                    className="px-3.5 py-2 text-xs font-medium bg-[#1B4332] text-white rounded-lg hover:bg-[#143326] whitespace-nowrap shrink-0"
                  >
                    Enquire Availability
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Send Farmer Offer Modal */}
      {selectedDemand && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 overflow-y-auto">
          <div className="bg-white border border-[#E3E7E1] rounded-xl w-full max-w-xl p-6 space-y-4">
            <div className="flex items-start justify-between gap-4 pb-3 border-b border-[#E8ECE6]">
              <div>
                <p className="text-xs text-[#4B5E52]">
                  Sending Offer as {activeFarmer?.name} ({activeFarmer?.village})
                </p>
                <h3 className="text-lg font-semibold text-[#14241B] mt-0.5">
                  Offer Produce to {selectedDemand.merchantName}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setSelectedDemand(null)}
                className="p-1.5 text-[#4B5E52] hover:text-[#14241B]"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs text-[#4B5E52] bg-[#F6F8F5] p-3 rounded-lg">
              Requirement: <strong>{selectedDemand.cropName}</strong> ·{' '}
              <span className="font-mono-num">{selectedDemand.quantityRequiredQuintals} qtl</span> ·{' '}
              Indicative Range: <span className="font-mono-num">{selectedDemand.offeredPriceRange}</span>
            </p>

            <form onSubmit={handleSubmitOffer} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-medium text-[#4B5E52] mb-1">
                    Quantity Available (qtl)
                  </label>
                  <input
                    type="number"
                    required
                    value={offerForm.quantityOfferedQuintals}
                    onChange={(e) =>
                      setOfferForm({ ...offerForm, quantityOfferedQuintals: e.target.value })
                    }
                    className="w-full px-3 py-2 text-sm font-mono-num border border-[#D4DCD2] rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#4B5E52] mb-1">
                    Expected Price (₹/qtl)
                  </label>
                  <input
                    type="number"
                    required
                    placeholder="e.g. 2360"
                    value={offerForm.expectedPricePerQuintal}
                    onChange={(e) =>
                      setOfferForm({ ...offerForm, expectedPricePerQuintal: e.target.value })
                    }
                    className="w-full px-3 py-2 text-sm font-mono-num border border-[#D4DCD2] rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#4B5E52] mb-1">
                    Expected Harvest Date
                  </label>
                  <input
                    type="date"
                    required
                    value={offerForm.expectedHarvestDate}
                    onChange={(e) =>
                      setOfferForm({ ...offerForm, expectedHarvestDate: e.target.value })
                    }
                    className="w-full px-3 py-2 text-sm font-mono-num border border-[#D4DCD2] rounded-lg"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-[#4B5E52] mb-1">
                  Quality Details
                </label>
                <input
                  type="text"
                  required
                  value={offerForm.qualityDetails}
                  onChange={(e) => setOfferForm({ ...offerForm, qualityDetails: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-[#D4DCD2] rounded-lg"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-[#4B5E52] mb-1">
                  Message to Buyer
                </label>
                <textarea
                  rows={2}
                  value={offerForm.message}
                  onChange={(e) => setOfferForm({ ...offerForm, message: e.target.value })}
                  placeholder="Share village pickup access, moisture check, or harvest readiness..."
                  className="w-full px-3 py-2 text-sm border border-[#D4DCD2] rounded-lg"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setSelectedDemand(null)}
                  className="px-4 py-2 text-xs font-medium text-[#4B5E52]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={sendingOffer}
                  className="px-4 py-2 text-xs font-medium bg-[#1B4332] text-white rounded-lg hover:bg-[#143326] disabled:opacity-60"
                >
                  {sendingOffer ? 'Sending Offer...' : 'Submit Offer to Merchant'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Supplier Enquiry Modal */}
      {selectedProduct && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white border border-[#E3E7E1] rounded-xl w-full max-w-lg p-6 space-y-4">
            <div className="flex items-start justify-between gap-4 pb-3 border-b border-[#E8ECE6]">
              <div>
                <p className="text-xs text-[#B45309]">{selectedProduct.supplierVerification}</p>
                <h3 className="text-base font-semibold text-[#14241B] mt-0.5">
                  Supplier Enquiry: {selectedProduct.productName}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setSelectedProduct(null)}
                className="p-1 text-[#4B5E52]"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="text-xs text-[#4B5E52] space-y-1">
              <p>
                <strong className="text-[#14241B]">Supplier:</strong> {selectedProduct.supplierName}
              </p>
              <p>
                <strong className="text-[#14241B]">Address:</strong>{' '}
                {selectedProduct.supplierAddress}
              </p>
              <p>
                <strong className="text-[#14241B]">Demo Desk:</strong>{' '}
                {selectedProduct.supplierContact}
              </p>
            </div>

            <form onSubmit={handleSendSupplyEnquiry} className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-[#4B5E52] mb-1">
                  Required Quantity & Enquiry Note
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Need 3 bags for Gollaprolu Rabi sowing next week"
                  value={supplyEnquiryNote}
                  onChange={(e) => setSupplyEnquiryNote(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-[#D4DCD2] rounded-lg"
                />
              </div>
              <p className="text-xs text-[#5A6D60]">
                Discovery & Enquiry Prototype: Online payment is intentionally disabled. Inspect seed tags and batch bills in person before purchase.
              </p>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setSelectedProduct(null)}
                  className="px-4 py-2 text-xs font-medium text-[#4B5E52]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={sendingSupplyEnquiry}
                  className="px-4 py-2 text-xs font-medium bg-[#1B4332] text-white rounded-lg hover:bg-[#143326]"
                >
                  {sendingSupplyEnquiry ? 'Logging...' : 'Send Availability Enquiry'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
