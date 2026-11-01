export interface HarvestRoutingInput {
  farmerRegion: string; // e.g. 'Kakinada Coastal' | 'Godavari region'
  cropName: string;
  quantityQuintals: number;
  harvestDate: string;
  qualityGrade: string;
  expectedShelfLifeDays: number;
  location: string;
  storageAvailable: boolean;
  additionalInfo?: string;
}

export interface CandidateBuyerChannel {
  merchantId: number | null;
  destinationName: string;
  destinationType: 'Direct Merchant' | 'Wholesaler' | 'Retail Procurement' | 'Food Processing Unit';
  cropWanted: string;
  maxQuantityQuintals: number;
  qualitySpecifications: string;
  acceptsCosmeticImperfect: boolean;
  distanceKm: number;
  procurementPeriod: string;
  offeredPriceRange: string;
  demandStatus: string;
  isDemo: boolean;
}

export interface RouteRankingFactors {
  cropAndQualityFit: string;
  volumeAndDemandFit: string;
  shelfLifeAndTimingFit: string;
  distanceIndicativeNote: string;
  illustrativeLogisticsNote: string;
}

export interface EvaluatedRouteDestination {
  merchantId: number | null;
  destinationName: string;
  destinationType: string;
  suitabilityScore: number;
  quantityAcceptedQuintals: string;
  qualityMatchLabel: string;
  distanceKm: number;
  estimatedLogisticsCostInr: string;
  isIllustrativeEstimate: boolean;
  procurementTiming: string;
  demandStatus: string;
  rankingReason: string;
  confirmationStage:
    | 'Suggested Destination (Illustrative Demo Channel — Unconfirmed)'
    | 'Indicative Buyer Demand (Open Requirement — Send Offer to Confirm)';
  rankingFactors: RouteRankingFactors;
}

/**
 * Flags missing or unverified harvest routing inputs instead of silently inventing values.
 */
export function inspectAgriRouteInputs(harvest: Partial<HarvestRoutingInput>): {
  missingInformation: string[];
  methodologyNote: string;
} {
  const missingInformation: string[] = [];

  if (!harvest.location || harvest.location.trim().length < 4 || harvest.location.includes('Not set')) {
    missingInformation.push(
      'Exact village/mandal dispatch point is missing — distances shown use regional Kakinada/Godavari hub centroids (Demo Indicative Distance).'
    );
  }
  if (!harvest.additionalInfo || harvest.additionalInfo.trim() === '') {
    missingInformation.push(
      'Lab/weighbridge moisture percentage and lot defect count were not entered — grading match uses self-reported quality grade only.'
    );
  }
  if (!harvest.expectedShelfLifeDays || Number.isNaN(Number(harvest.expectedShelfLifeDays))) {
    missingInformation.push(
      'Expected post-harvest shelf life was not measured — a conservative default window was applied.'
    );
  }

  return {
    missingInformation,
    methodologyNote:
      'Rule-Based Post-Harvest Routing (Illustrative Pilot Estimates): Distances are regional centroid approximations and transport figures are illustrative mini-truck formulas — NOT live carrier quotes or confirmed buyer purchase commitments. A route only becomes a Confirmed Order after a mutual Marketplace Enquiry/Offer is accepted.',
  };
}

export function evaluateAgriRouteDestinations(
  harvest: HarvestRoutingInput,
  merchantChannels: CandidateBuyerChannel[]
): EvaluatedRouteDestination[] {
  const cropKey = harvest.cropName.toLowerCase().split('(')[0].trim().split(' ')[0];
  const qualityLower = `${harvest.qualityGrade} ${harvest.additionalInfo || ''}`.toLowerCase();
  const isCosmeticOrRipeLot =
    qualityLower.includes('imperfect') ||
    qualityLower.includes('grade b') ||
    qualityLower.includes('grade c') ||
    qualityLower.includes('ripe') ||
    qualityLower.includes('processing') ||
    qualityLower.includes('spotted');

  const relevant = merchantChannels.filter((ch) => {
    const chCrop = ch.cropWanted.toLowerCase();
    return chCrop.includes(cropKey) || cropKey.includes(chCrop.split(' ')[0]);
  });

  const channelsToScore: CandidateBuyerChannel[] = [...relevant];

  const hasProcessingChannel = channelsToScore.some(
    (c) => c.destinationType === 'Food Processing Unit'
  );
  if (!hasProcessingChannel) {
    channelsToScore.push({
      merchantId: null,
      destinationName: `East Coast Agro Value-Add & Processing Unit (${harvest.cropName.split('(')[0].trim()} Line — Demo Illustrative)`,
      destinationType: 'Food Processing Unit',
      cropWanted: harvest.cropName,
      maxQuantityQuintals: Math.max(60, Math.round(harvest.quantityQuintals * 1.2)),
      qualitySpecifications:
        'Edible, residue-safe produce; accepts cosmetically imperfect, uneven-sized, or ripe lots unsuitable for table retail.',
      acceptsCosmeticImperfect: true,
      distanceKm: 38,
      procurementPeriod: 'Weekly intake slots (Demo illustrative schedule — unconfirmed)',
      offeredPriceRange: 'Illustrative processing slab (not a binding quote)',
      demandStatus: 'Suggested Demo Processing Channel (Unconfirmed)',
      isDemo: true,
    });
  }

  const hasWholesaler = channelsToScore.some((c) => c.destinationType === 'Wholesaler');
  if (!hasWholesaler) {
    channelsToScore.push({
      merchantId: null,
      destinationName: `Regional Regulated Market Yard / Wholesale Channel (${(harvest.location || 'Regional').split(',')[0]} — Demo Illustrative)`,
      destinationType: 'Wholesaler',
      cropWanted: harvest.cropName,
      maxQuantityQuintals: 200,
      qualitySpecifications: 'Fair Average Quality (FAQ); moisture and foreign matter graded at gate.',
      acceptsCosmeticImperfect: false,
      distanceKm: 18,
      procurementPeriod: 'Daily morning auction window (Demo illustrative)',
      offeredPriceRange: 'Subject to daily mandi auction (unconfirmed)',
      demandStatus: 'Suggested Demo Market Yard (Unconfirmed)',
      isDemo: true,
    });
  }

  const results: EvaluatedRouteDestination[] = channelsToScore.map((ch) => {
    let score = 0;

    // 1. Volume & demand absorption capacity (max 30 pts)
    const acceptedQty = Math.min(harvest.quantityQuintals, ch.maxQuantityQuintals);
    const volumeRatio = harvest.quantityQuintals > 0 ? acceptedQty / harvest.quantityQuintals : 1;
    const volumePoints = Math.round(volumeRatio * 30);
    score += volumePoints;
    const volumeAndDemandFit =
      volumeRatio >= 1
        ? `Volume Fit (${volumePoints}/30): Full harvest lot (${harvest.quantityQuintals} qtl) fits indicative buyer cap (${ch.maxQuantityQuintals} qtl).`
        : `Volume Fit (${volumePoints}/30): Partial absorption (${acceptedQty} of ${harvest.quantityQuintals} qtl); split dispatch needed for remaining ${Math.max(0, harvest.quantityQuintals - acceptedQty)} qtl.`;

    // 2. Crop & quality grade match (max 25 pts)
    let qualityMatchLabel = 'Standard FAQ Match';
    let cropAndQualityFit = '';
    if (isCosmeticOrRipeLot) {
      if (ch.acceptsCosmeticImperfect || ch.destinationType === 'Food Processing Unit') {
        score += 25;
        qualityMatchLabel = 'Strong Match (Accepts Edible Imperfect / Ripe Produce)';
        cropAndQualityFit =
          'Crop & Quality Fit (25/25): Accepts edible cosmetically imperfect/ripe produce without retail cosmetic rejection.';
      } else if (ch.destinationType === 'Retail Procurement') {
        score += 7;
        qualityMatchLabel = 'Strict Cosmetic Risk (Retail Grade A Required)';
        cropAndQualityFit =
          'Crop & Quality Fit (7/25): High rejection risk — retail procurement requires uniform Grade A table appearance.';
      } else {
        score += 15;
        qualityMatchLabel = 'Moderate Match (Sorting Deduction Possible)';
        cropAndQualityFit =
          'Crop & Quality Fit (15/25): Wholesale channel may apply sorting deductions on uneven or ripe lots.';
      }
    } else {
      if (ch.destinationType === 'Retail Procurement' || ch.destinationType === 'Direct Merchant') {
        score += 24;
        qualityMatchLabel = 'Strong Grade A / Direct Spec Match';
        cropAndQualityFit =
          'Crop & Quality Fit (24/25): Declared sorted quality aligns with direct/retail specifications (subject to physical gate check).';
      } else if (ch.destinationType === 'Wholesaler') {
        score += 21;
        qualityMatchLabel = 'Good FAQ Wholesale Match';
        cropAndQualityFit =
          'Crop & Quality Fit (21/25): Aligns with Fair Average Quality wholesale intake criteria.';
      } else {
        score += 16;
        qualityMatchLabel = 'Eligible (Processing Channel — Lower Table Premium)';
        cropAndQualityFit =
          'Crop & Quality Fit (16/25): Eligible for processing intake, though sorted Grade A produce may earn better fresh-market terms.';
      }
    }

    // 3. Shelf-life vs indicative transit distance & storage (max 20 pts)
    let transitPoints = 15;
    if (harvest.expectedShelfLifeDays <= 5) {
      transitPoints = ch.distanceKm <= 35 ? 20 : 10;
    } else {
      transitPoints = ch.distanceKm <= 50 ? 19 : 15;
    }
    score += transitPoints;

    // 4. Procurement timing & demand status (max 15 pts)
    const isOpenMerchantDemand = ch.merchantId !== null && ch.demandStatus.toLowerCase().includes('open');
    const timingPoints = isOpenMerchantDemand ? 15 : 10;
    score += timingPoints;

    const shelfLifeAndTimingFit = `Timing & Perishability (${transitPoints + timingPoints}/35): ${harvest.expectedShelfLifeDays}-day shelf life${harvest.storageAvailable ? ' with on-farm storage' : ' (no cold/dry storage)'}; intake window: ${ch.procurementPeriod}.`;
    const distanceIndicativeNote = `Indicative Distance: ~${ch.distanceKm} km (${ch.isDemo ? 'Demo regional hub approximation — verify exact road km before dispatch' : 'Estimated regional distance'}).`;

    // 5. Illustrative logistics cost formula (max 10 pts) — explicitly NOT a transporter quote
    const truckMultiplier = Math.max(1, Math.ceil(acceptedQty / 25));
    const illustrativeCost = Math.round((850 + ch.distanceKm * 22) * truckMultiplier);
    const costPerQtl = acceptedQty > 0 ? illustrativeCost / acceptedQty : illustrativeCost;
    const logisticsPoints = costPerQtl <= 60 ? 10 : costPerQtl <= 110 ? 7 : 4;
    score += logisticsPoints;

    const illustrativeLogisticsNote = `Illustrative Transport Formula (${logisticsPoints}/10): ~₹${illustrativeCost.toLocaleString('en-IN')} (~₹${Math.round(costPerQtl)}/qtl) — Demo rule-of-thumb calculation ONLY, NOT a carrier quote.`;

    const confirmationStage: EvaluatedRouteDestination['confirmationStage'] =
      ch.merchantId !== null
        ? 'Indicative Buyer Demand (Open Requirement — Send Offer to Confirm)'
        : 'Suggested Destination (Illustrative Demo Channel — Unconfirmed)';

    const rankingFactors: RouteRankingFactors = {
      cropAndQualityFit,
      volumeAndDemandFit,
      shelfLifeAndTimingFit,
      distanceIndicativeNote,
      illustrativeLogisticsNote,
    };

    const rankingReason = [
      `[${confirmationStage}]`,
      cropAndQualityFit,
      volumeAndDemandFit,
      shelfLifeAndTimingFit,
      distanceIndicativeNote,
      illustrativeLogisticsNote,
    ].join(' | ');

    return {
      merchantId: ch.merchantId,
      destinationName: ch.destinationName,
      destinationType: ch.destinationType,
      suitabilityScore: Math.min(98, Math.max(20, score)),
      quantityAcceptedQuintals: `${acceptedQty} qtl (of ${ch.maxQuantityQuintals} qtl indicative cap)`,
      qualityMatchLabel,
      distanceKm: ch.distanceKm,
      estimatedLogisticsCostInr: `~₹${illustrativeCost.toLocaleString('en-IN')} (Illustrative Demo Formula — Not a Quote)`,
      isIllustrativeEstimate: true,
      procurementTiming: ch.procurementPeriod,
      demandStatus: `${confirmationStage} · ${ch.offeredPriceRange}`,
      rankingReason,
      confirmationStage,
      rankingFactors,
    };
  });

  results.sort((a, b) => b.suitabilityScore - a.suitabilityScore);
  return results;
}
