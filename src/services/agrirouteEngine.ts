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

  // Filter channels matching crop family, plus fallback regional APMC / Processing channel if few match
  const relevant = merchantChannels.filter((ch) => {
    const chCrop = ch.cropWanted.toLowerCase();
    return chCrop.includes(cropKey) || cropKey.includes(chCrop.split(' ')[0]);
  });

  // Always include a transparent Processing / Alternate channel when crop is perishable or cosmetically imperfect
  const channelsToScore: CandidateBuyerChannel[] = [...relevant];

  const hasProcessingChannel = channelsToScore.some(
    (c) => c.destinationType === 'Food Processing Unit'
  );
  if (!hasProcessingChannel) {
    channelsToScore.push({
      merchantId: null,
      destinationName: `East Coast Agro Value-Add & Processing Unit (${harvest.cropName.split('(')[0].trim()} Line — Demo)`,
      destinationType: 'Food Processing Unit',
      cropWanted: harvest.cropName,
      maxQuantityQuintals: Math.max(60, Math.round(harvest.quantityQuintals * 1.2)),
      qualitySpecifications:
        'Edible, residue-safe produce; accepts cosmetically imperfect, uneven-sized, or ripe lots unsuitable for table retail.',
      acceptsCosmeticImperfect: true,
      distanceKm: 38,
      procurementPeriod: 'Weekly intake slots (Demo illustrative schedule)',
      offeredPriceRange: 'Illustrative processing slab (confirm prior to dispatch)',
      demandStatus: 'Indicative Processing Intake (Demo)',
      isDemo: true,
    });
  }

  const hasWholesaler = channelsToScore.some((c) => c.destinationType === 'Wholesaler');
  if (!hasWholesaler) {
    channelsToScore.push({
      merchantId: null,
      destinationName: `Regional Regulated Market Yard / Wholesale Commission Channel (${harvest.location.split(',')[0]} — Demo)`,
      destinationType: 'Wholesaler',
      cropWanted: harvest.cropName,
      maxQuantityQuintals: 200,
      qualitySpecifications: 'Fair Average Quality (FAQ); moisture and foreign matter graded at gate.',
      acceptsCosmeticImperfect: false,
      distanceKm: 18,
      procurementPeriod: 'Daily morning auction window (Demo estimate)',
      offeredPriceRange: 'Subject to daily mandi auction',
      demandStatus: 'Indicative Open Yard (Demo)',
      isDemo: true,
    });
  }

  const results: EvaluatedRouteDestination[] = channelsToScore.map((ch) => {
    let score = 0;
    const breakdown: string[] = [];

    // 1. Volume absorption capacity (max 30 pts)
    const acceptedQty = Math.min(harvest.quantityQuintals, ch.maxQuantityQuintals);
    const volumeRatio = harvest.quantityQuintals > 0 ? acceptedQty / harvest.quantityQuintals : 1;
    const volumePoints = Math.round(volumeRatio * 30);
    score += volumePoints;
    if (volumeRatio >= 1) {
      breakdown.push(`Full lot (${harvest.quantityQuintals} qtl) fits buyer capacity (${ch.maxQuantityQuintals} qtl).`);
    } else {
      breakdown.push(
        `Partial absorption (${acceptedQty} of ${harvest.quantityQuintals} qtl); split dispatch needed for remainder.`
      );
    }

    // 2. Quality & grade match (max 25 pts)
    let qualityMatchLabel = 'Standard FAQ Match';
    if (isCosmeticOrRipeLot) {
      if (ch.acceptsCosmeticImperfect || ch.destinationType === 'Food Processing Unit') {
        score += 25;
        qualityMatchLabel = 'Strong Match (Accepts Edible Imperfect / Ripe Produce)';
        breakdown.push('Accepts edible cosmetically imperfect/ripe produce without retail rejection risk.');
      } else if (ch.destinationType === 'Retail Procurement') {
        score += 7;
        qualityMatchLabel = 'Strict Cosmetic Risk (Retail Grade A Required)';
        breakdown.push('High rejection risk: retail buyer requires uniform Grade A appearance.');
      } else {
        score += 15;
        qualityMatchLabel = 'Moderate Match (Grade Deduction Possible)';
        breakdown.push('Wholesale channel may apply sorting deductions on uneven lots.');
      }
    } else {
      if (ch.destinationType === 'Retail Procurement' || ch.destinationType === 'Direct Merchant') {
        score += 24;
        qualityMatchLabel = 'Strong Grade A / Direct Spec Match';
        breakdown.push('Sorted Grade A quality aligns well with direct/retail specifications.');
      } else if (ch.destinationType === 'Wholesaler') {
        score += 21;
        qualityMatchLabel = 'Good FAQ Wholesale Match';
        breakdown.push('Meets Fair Average Quality wholesale requirements.');
      } else {
        score += 16;
        qualityMatchLabel = 'Eligible (Processing Channel — Lower Table Premium)';
        breakdown.push('Eligible for processing, though table-grade buyers may value fresh appearance higher.');
      }
    }

    // 3. Shelf-life vs transit distance & storage (max 20 pts)
    if (harvest.expectedShelfLifeDays <= 5) {
      if (ch.distanceKm <= 35) {
        score += 20;
        breakdown.push(`Short transit (${ch.distanceKm} km) protects ${harvest.expectedShelfLifeDays}-day perishable shelf life.`);
      } else {
        score += 10;
        breakdown.push(`Longer transit (${ch.distanceKm} km) adds spoilage risk for ${harvest.expectedShelfLifeDays}-day shelf life.`);
      }
    } else {
      score += ch.distanceKm <= 50 ? 19 : 15;
      breakdown.push(
        `${harvest.expectedShelfLifeDays}-day shelf life${harvest.storageAvailable ? ' + on-farm storage' : ''} supports ${ch.distanceKm} km dispatch.`
      );
    }

    // 4. Procurement timing & demand status (max 15 pts)
    if (ch.demandStatus.toLowerCase().includes('open')) {
      score += 15;
      breakdown.push(`Active open pilot procurement window (${ch.procurementPeriod}).`);
    } else {
      score += 10;
      breakdown.push(`Indicative intake schedule (${ch.procurementPeriod}).`);
    }

    // 5. Illustrative logistics cost efficiency (max 10 pts)
    // Transparent formula: ₹950 base loading/unloading + ₹14 per km per 10 quintals (illustrative rural mini-truck estimate)
    const truckMultiplier = Math.max(1, Math.ceil(acceptedQty / 25));
    const illustrativeCost = Math.round((850 + ch.distanceKm * 22) * truckMultiplier);
    const costPerQtl = acceptedQty > 0 ? illustrativeCost / acceptedQty : illustrativeCost;
    const logisticsPoints = costPerQtl <= 60 ? 10 : costPerQtl <= 110 ? 7 : 4;
    score += logisticsPoints;
    breakdown.push(
      `Illustrative mini-truck estimate ~₹${illustrativeCost.toLocaleString('en-IN')} (~₹${Math.round(costPerQtl)}/qtl over ${ch.distanceKm} km).`
    );

    return {
      merchantId: ch.merchantId,
      destinationName: ch.destinationName,
      destinationType: ch.destinationType,
      suitabilityScore: Math.min(98, Math.max(20, score)),
      quantityAcceptedQuintals: `${acceptedQty} qtl (of ${ch.maxQuantityQuintals} qtl cap)`,
      qualityMatchLabel,
      distanceKm: ch.distanceKm,
      estimatedLogisticsCostInr: `₹${illustrativeCost.toLocaleString('en-IN')} (Illustrative Estimate)`,
      isIllustrativeEstimate: true,
      procurementTiming: ch.procurementPeriod,
      demandStatus: `${ch.demandStatus} · ${ch.offeredPriceRange}`,
      rankingReason: breakdown.join(' '),
    };
  });

  results.sort((a, b) => b.suitabilityScore - a.suitabilityScore);
  return results;
}
