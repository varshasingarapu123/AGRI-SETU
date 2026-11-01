import React, { useEffect, useState } from 'react';
import { Route, Sparkles, CheckCircle2, Info } from 'lucide-react';
import { useAgriSetu } from '../context/AgriSetuContext.tsx';
import type { BootstrapData } from '../types/agrisetu.ts';

export const AgriRouteTab: React.FC = () => {
  const {
    data,
    selectedFarmerId,
    setSelectedFarmerId,
    prefillAgrirouteFromListingId,
    setPrefillAgrirouteFromListingId,
    apiFetch,
    updateBootstrapState,
    pushToast,
  } = useAgriSetu();

  const farmers = data?.farmers || [];
  const activeFarmer = farmers.find((f) => f.id === selectedFarmerId) || farmers[0];
  const demoFarmerOptions = data?.demoPersonas?.farmers || farmers;
  const farmerListings = (data?.listings || []).filter(
    (l) => l.farmerId === activeFarmer?.id
  );
  const farmerHarvests = (data?.harvests || []).filter(
    (h) => h.farmerId === activeFarmer?.id
  );

  const [selectedHarvestId, setSelectedHarvestId] = useState<number | null>(null);
  const [evaluating, setEvaluating] = useState(false);
  const [routeWarnings, setRouteWarnings] = useState<string[]>([]);
  const [methodologyBanner, setMethodologyBanner] = useState<string | null>(null);

  const [form, setForm] = useState({
    cropName: activeFarmer?.currentCrop || 'Paddy (MTU-1061 Indra)',
    quantityHarvestedQuintals: '45',
    harvestDate: '2026-11-05',
    qualityGrade: 'Grade A Sorted Lot (<14% moisture)',
    expectedShelfLifeDays: 14,
    location: activeFarmer
      ? `${activeFarmer.village}, ${activeFarmer.district}`
      : 'Gollaprolu, Kakinada',
    storageAvailable: Boolean(activeFarmer?.farmDetails?.storageAvailable),
    additionalInfo: '',
  });

  // Prefill if navigated from My Farm listing
  useEffect(() => {
    if (prefillAgrirouteFromListingId && data) {
      const target = data.listings.find((l) => l.id === prefillAgrirouteFromListingId);
      if (target) {
        setSelectedFarmerId(target.farmerId);
        setForm({
          cropName: target.cropName,
          quantityHarvestedQuintals: target.quantityQuintals,
          harvestDate: target.expectedHarvestDate,
          qualityGrade: target.qualityGrade,
          expectedShelfLifeDays: target.cropName.toLowerCase().includes('banana') ? 5 : 30,
          location: `${target.village}, ${target.district}`,
          storageAvailable: Boolean(activeFarmer?.farmDetails?.storageAvailable),
          additionalInfo: `Prefilled from listing #${target.id} (${target.productionMethod})`,
        });
      }
      setPrefillAgrirouteFromListingId(null);
    }
  }, [prefillAgrirouteFromListingId, data]);

  const handlePrefillFromProfile = (listingId?: number) => {
    if (!activeFarmer) return;
    const chosenListing = listingId
      ? farmerListings.find((l) => l.id === listingId)
      : farmerListings[0];

    if (chosenListing) {
      const isPerishable = chosenListing.cropName.toLowerCase().includes('banana');
      setForm({
        cropName: chosenListing.cropName,
        quantityHarvestedQuintals: chosenListing.quantityQuintals,
        harvestDate: chosenListing.expectedHarvestDate,
        qualityGrade: chosenListing.qualityGrade,
        expectedShelfLifeDays: isPerishable ? 5 : 45,
        location: `${chosenListing.village}, ${chosenListing.district}`,
        storageAvailable: Boolean(activeFarmer.farmDetails?.storageAvailable),
        additionalInfo: `Prefilled from ${activeFarmer.name}'s consented profile & produce listing.`,
      });
      pushToast('info', `Prefilled harvest details from ${chosenListing.cropName} listing.`);
    } else {
      setForm({
        ...form,
        cropName: activeFarmer.currentCrop,
        location: `${activeFarmer.village}, ${activeFarmer.district}`,
        storageAvailable: Boolean(activeFarmer.farmDetails?.storageAvailable),
      });
      pushToast('info', `Prefilled crop and location from ${activeFarmer.name}'s profile.`);
    }
  };

  const handleEvaluateRoutes = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeFarmer) return;
    setEvaluating(true);
    try {
      const res = await apiFetch<{
        harvestId: number;
        missingInformation?: string[];
        methodologyNote?: string;
        state: BootstrapData;
      }>('/api/agriroute/evaluate', {
        method: 'POST',
        body: JSON.stringify({
          farmerId: activeFarmer.id,
          ...form,
        }),
      });
      updateBootstrapState(res.state);
      setSelectedHarvestId(res.harvestId);
      setRouteWarnings(res.missingInformation || []);
      setMethodologyBanner(res.methodologyNote || null);
      pushToast(
        'success',
        'Evaluated harvest destinations across wholesale, retail, direct, and processing channels.'
      );
    } catch (err: any) {
      pushToast('error', err.message || 'Failed to evaluate AGRIROUTE destinations.');
    } finally {
      setEvaluating(false);
    }
  };

  const handleSelectDestination = async (recommendationId: number, harvestId: number) => {
    try {
      const nextState = await apiFetch<BootstrapData>('/api/agriroute/select', {
        method: 'POST',
        body: JSON.stringify({ recommendationId, harvestId }),
      });
      updateBootstrapState(nextState);
      pushToast(
        'success',
        'Selected destination recorded in My Farm & Coordinator Pilot Tracking.'
      );
    } catch (err: any) {
      pushToast('error', err.message || 'Failed to select destination.');
    }
  };

  const displayedHarvest =
    farmerHarvests.find((h) => h.id === selectedHarvestId) ||
    farmerHarvests[0] ||
    (data?.harvests || [])[0] ||
    null;

  return (
    <div className="space-y-6">
      {/* Module Header & Farmer Switcher */}
      <section className="bg-white border border-[#E3E7E1] rounded-xl p-5 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <p className="text-xs text-[#4B5E52]">
            Post-Harvest Routing & Value Optimization · Transparent Scoring Rubric
          </p>
          <h2 className="text-lg font-semibold text-[#14241B] mt-0.5">
            AGRIROUTE — Harvest-to-Destination Comparison
          </h2>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {activeFarmer?.isDemo && (
            <select
              value={activeFarmer?.id || 1}
              onChange={(e) => {
                setSelectedFarmerId(Number(e.target.value));
                setSelectedHarvestId(null);
                setRouteWarnings([]);
              }}
              className="px-3 py-2 text-sm border border-[#D4DCD2] rounded-lg bg-white"
            >
              {demoFarmerOptions.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name} · {f.region} (Demo)
                </option>
              ))}
            </select>
          )}

          <button
            type="button"
            onClick={() => handlePrefillFromProfile()}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium border border-[#CFD8CE] text-[#14241B] rounded-lg hover:bg-[#F3F5F1] whitespace-nowrap shrink-0"
          >
            <Sparkles className="w-3.5 h-3.5 text-[#1B4332]" />
            <span>Prefill from Profile & Listing</span>
          </button>
        </div>
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Section A: Harvest Input Form */}
        <form
          onSubmit={handleEvaluateRoutes}
          className="lg:col-span-5 bg-white border border-[#E3E7E1] rounded-xl p-6 space-y-4"
        >
          <div className="pb-3 border-b border-[#E8ECE6]">
            <h3 className="text-base font-semibold text-[#14241B]">
              1. Enter Harvest Batch Details
            </h3>
            <p className="text-xs text-[#4B5E52] mt-0.5">
              Include ripe or cosmetically imperfect grades to compare food processing alternatives alongside fresh trade.
            </p>
          </div>

          {farmerListings.length > 0 && (
            <div>
              <label className="block text-xs font-medium text-[#4B5E52] mb-1">
                Quick Load from My Produce Listings
              </label>
              <div className="flex flex-wrap gap-1.5">
                {farmerListings.map((l) => (
                  <button
                    key={l.id}
                    type="button"
                    onClick={() => handlePrefillFromProfile(l.id)}
                    className="px-2.5 py-1 text-xs bg-[#F3F5F1] hover:bg-[#E5EBE2] text-[#14241B] rounded-md"
                  >
                    {l.cropName} ({l.quantityQuintals} qtl)
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-[#4B5E52] mb-1">Crop</label>
              <input
                type="text"
                required
                value={form.cropName}
                onChange={(e) => setForm({ ...form, cropName: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-[#D4DCD2] rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[#4B5E52] mb-1">
                Quantity Harvested (qtl)
              </label>
              <input
                type="number"
                required
                value={form.quantityHarvestedQuintals}
                onChange={(e) =>
                  setForm({ ...form, quantityHarvestedQuintals: e.target.value })
                }
                className="w-full px-3 py-2 text-sm font-mono-num border border-[#D4DCD2] rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[#4B5E52] mb-1">
                Harvest Date
              </label>
              <input
                type="date"
                required
                value={form.harvestDate}
                onChange={(e) => setForm({ ...form, harvestDate: e.target.value })}
                className="w-full px-3 py-2 text-sm font-mono-num border border-[#D4DCD2] rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[#4B5E52] mb-1">
                Expected Shelf Life (Days)
              </label>
              <input
                type="number"
                required
                min={1}
                max={365}
                value={form.expectedShelfLifeDays}
                onChange={(e) =>
                  setForm({ ...form, expectedShelfLifeDays: Number(e.target.value) })
                }
                className="w-full px-3 py-2 text-sm font-mono-num border border-[#D4DCD2] rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[#4B5E52] mb-1">
                Farm / Dispatch Location
              </label>
              <input
                type="text"
                required
                value={form.location}
                onChange={(e) => setForm({ ...form, location: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-[#D4DCD2] rounded-lg"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-[#4B5E52] mb-1">
              Quality & Grade Description
            </label>
            <select
              value={form.qualityGrade}
              onChange={(e) => setForm({ ...form, qualityGrade: e.target.value })}
              className="w-full px-3 py-2 text-sm border border-[#D4DCD2] rounded-lg bg-white mb-2"
            >
              <option value="Grade A Sorted Lot (<14% moisture)">
                Grade A Sorted Lot (Clean Uniform Table/Grain Quality)
              </option>
              <option value="Fair Average Quality (FAQ) — Unsorted Field Lot">
                Fair Average Quality (FAQ) — Standard Field Lot
              </option>
              <option value="Edible Grade B — Cosmetically Imperfect / Ripe Lot for Processing">
                Edible Grade B — Cosmetically Imperfect / Skin-Spotted / Ripe Lot
              </option>
            </select>
          </div>

          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={form.storageAvailable}
              onChange={(e) => setForm({ ...form, storageAvailable: e.target.checked })}
              className="accent-[#1B4332]"
            />
            <span>Covered ventilated on-farm storage available</span>
          </label>

          <div>
            <label className="block text-xs font-medium text-[#4B5E52] mb-1">
              Additional Harvest Notes
            </label>
            <textarea
              rows={2}
              value={form.additionalInfo}
              onChange={(e) => setForm({ ...form, additionalInfo: e.target.value })}
              placeholder="e.g. Plastic crates available; 7 qtl has minor wind rub marks..."
              className="w-full px-3 py-2 text-sm border border-[#D4DCD2] rounded-lg"
            />
          </div>

          <button
            type="submit"
            disabled={evaluating}
            className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium bg-[#1B4332] text-white rounded-lg hover:bg-[#143326] disabled:opacity-60 transition-colors"
          >
            <Route className="w-4 h-4" />
            <span>{evaluating ? 'Comparing Destinations...' : 'Compare Suitable Destinations'}</span>
          </button>
        </form>

        {/* Section B & C: Ranked Destination Recommendations & Methodology */}
        <div className="lg:col-span-7 space-y-5">
          {/* Methodology & Transaction Stage Transparency Card */}
          <div className="bg-white border border-[#E3E7E1] rounded-xl p-5 space-y-2.5">
            <div className="flex items-center gap-2 text-sm font-semibold text-[#14241B]">
              <Info className="w-4 h-4 text-[#1B4332]" />
              <span>How AGRIROUTE Ranks Destinations (100-Point Rule-Based Rubric)</span>
            </div>
            <p className="text-xs text-[#4B5E52]">
              Volume Absorption Capacity (30 pts) · Quality & Cosmetic Grade Acceptance (25 pts) · Shelf-Life vs Transit Distance Safety (20 pts) · Procurement Window Alignment (15 pts) · Illustrative Transport Cost Efficiency (10 pts).
            </p>
            <p className="text-xs text-[#374B3E] bg-[#F6F8F5] p-2.5 rounded-lg">
              <strong>Stage Distinction:</strong> AGRIROUTE outputs{' '}
              <em>Suggested Destinations (Demo Estimates)</em> based on{' '}
              <em>Indicative Buyer Demand</em>. Selecting a route records your preference in My Farm — it is{' '}
              <strong>not</strong> a Confirmed Buyer Commitment, Transporter Quote, or Completed Transaction until an Enquiry/Offer is mutually accepted into a Confirmed Order.
            </p>
            {methodologyBanner && (
              <p className="text-xs text-[#5A6D60]">{methodologyBanner}</p>
            )}
            {routeWarnings.length > 0 && (
              <div className="pt-2 border-t border-[#E8ECE6] text-xs text-[#B45309] space-y-1">
                <p className="font-semibold">Missing / Defaulted Input Assumptions:</p>
                {routeWarnings.map((w, idx) => (
                  <p key={idx}>• {w}</p>
                ))}
              </div>
            )}
          </div>

          {displayedHarvest ? (
            <div className="bg-white border border-[#E3E7E1] rounded-xl p-6 space-y-5">
              <div className="flex flex-wrap items-start justify-between gap-3 pb-4 border-b border-[#E8ECE6]">
                <div>
                  <p className="text-xs text-[#4B5E52]">
                    Harvest Batch #{displayedHarvest.id} ·{' '}
                    <span className="font-mono-num">{displayedHarvest.harvestDate}</span> ·{' '}
                    {displayedHarvest.outcomeStatus}
                  </p>
                  <h3 className="text-lg font-semibold text-[#14241B] mt-0.5">
                    {displayedHarvest.cropName} — {displayedHarvest.quantityHarvestedQuintals}{' '}
                    Quintals ({displayedHarvest.location})
                  </h3>
                  <p className="text-xs text-[#4B5E52] mt-0.5">
                    Quality: {displayedHarvest.qualityGrade} · Shelf Life:{' '}
                    <span className="font-mono-num">
                      {displayedHarvest.expectedShelfLifeDays} days
                    </span>
                  </p>
                </div>

                {farmerHarvests.length > 1 && (
                  <select
                    value={displayedHarvest.id}
                    onChange={(e) => setSelectedHarvestId(Number(e.target.value))}
                    className="px-2.5 py-1.5 text-xs border border-[#D4DCD2] rounded-lg bg-white"
                  >
                    {farmerHarvests.map((h) => (
                      <option key={h.id} value={h.id}>
                        Batch #{h.id}: {h.cropName} ({h.quantityHarvestedQuintals} qtl)
                      </option>
                    ))}
                  </select>
                )}
              </div>

              {/* Side-by-Side Comparison Matrix */}
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-[#E3E7E1] text-xs text-[#5A6D60]">
                      <th className="py-2.5 pr-3">Destination & Channel</th>
                      <th className="py-2.5 px-2 text-right">Suitability</th>
                      <th className="py-2.5 px-2">Qty Accepted</th>
                      <th className="py-2.5 px-2 text-right">Distance</th>
                      <th className="py-2.5 px-2">Est. Transport</th>
                      <th className="py-2.5 pl-2">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#EEF1EC]">
                    {displayedHarvest.recommendations.map((rec) => (
                      <tr key={rec.id} className="align-top hover:bg-[#F9FBF8]">
                        <td className="py-3.5 pr-3">
                          <p className="font-semibold text-[#14241B]">{rec.destinationName}</p>
                          <p className="text-xs text-[#2D6A4F] mt-0.5">
                            {rec.destinationType} · {rec.qualityMatchLabel}
                          </p>
                          <p className="text-xs text-[#4B5E52] mt-1">{rec.rankingReason}</p>
                          <p className="text-[11px] text-[#5A6D60] mt-1">
                            Timing: {rec.procurementTiming} · {rec.demandStatus}
                          </p>
                        </td>
                        <td className="py-3.5 px-2 text-right font-mono-num font-semibold text-[#1B4332]">
                          {rec.suitabilityScore}/100
                        </td>
                        <td className="py-3.5 px-2 font-mono-num text-xs">
                          {rec.quantityAcceptedQuintals}
                        </td>
                        <td className="py-3.5 px-2 text-right font-mono-num text-xs">
                          ~{rec.distanceKm} km
                          <span className="block text-[10px] text-[#5A6D60]">Demo Centroid</span>
                        </td>
                        <td className="py-3.5 px-2 font-mono-num text-xs text-[#4B5E52]">
                          {rec.estimatedLogisticsCostInr}
                          <span className="block text-[10px] text-[#B45309]">
                            {rec.isIllustrativeEstimate
                              ? 'Illustrative Formula (Not a Quote)'
                              : 'Verified Quote'}
                          </span>
                        </td>
                        <td className="py-3.5 pl-2">
                          {rec.isSelected ? (
                            <span className="inline-flex items-center gap-1 text-xs font-medium text-[#16A34A] whitespace-nowrap">
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              Selected
                            </span>
                          ) : (
                            <button
                              type="button"
                              onClick={() =>
                                handleSelectDestination(rec.id, displayedHarvest.id)
                              }
                              className="px-3 py-1.5 text-xs font-medium bg-[#1B4332] text-white rounded-lg hover:bg-[#143326] whitespace-nowrap shrink-0"
                            >
                              Select Route
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <div className="bg-white border border-[#E3E7E1] rounded-xl p-10 text-center text-sm text-[#4B5E52]">
              Submit your harvest details on the left to generate a side-by-side destination comparison.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
