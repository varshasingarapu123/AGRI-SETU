export interface CropSuitabilityInput {
  district: string;
  region: string;
  soilType: string;
  phLevel?: string | null;
  salinityNote?: string | null;
  isVerifiedLabTest?: boolean;
  farmAreaAcres: string;
  irrigationType: string;
  waterAvailability: string;
  previousCrop: string;
  climateZone: string;
  preferences?: string | null;
  constraints?: string | null;
  activeDemands: Array<{
    cropName: string;
    quantityRequiredQuintals: string;
    offeredPriceRange: string;
    buyerType?: string;
  }>;
}

export interface CropSuitabilityOption {
  cropName: string;
  cropNameTe: string;
  recommendedVarieties: string;
  suitabilityBand: 'High Agronomic Suitability' | 'Conditional Suitability' | 'Evaluate With Caution';
  ruleScore: number;
  whySuitable: string;
  soilRequirements: string;
  irrigationConsiderations: string;
  importantConstraints: string;
  rotationBenefit: string;
  marketDemandSignal: string;
  isDemoRuleModel: boolean;
}

export interface CropSuitabilityResult {
  disclaimer: string;
  missingInformation: string[];
  evaluatedInputsSummary: string;
  options: CropSuitabilityOption[];
}

interface CropRuleSpec {
  cropName: string;
  cropNameTe: string;
  varieties: string;
  idealSoils: string[];
  phMin: number;
  phMax: number;
  toleratesMildSalinity: boolean;
  waterNeed: 'high' | 'moderate' | 'low';
  goodAfterCrops: string[];
  avoidAfterCrops: string[];
  soilReqText: string;
  irrigationText: string;
  constraintsText: string;
}

const CROP_RULE_CATALOGUE: CropRuleSpec[] = [
  {
    cropName: 'Black Gram (Minumu)',
    cropNameTe: 'మినుము (Black Gram)',
    varieties: 'LBG-752, PU-31, TBG-104 (YMV tolerant)',
    idealSoils: ['clay loam', 'alluvial', 'silt loam', 'black', 'lanka'],
    phMin: 6.0,
    phMax: 7.8,
    toleratesMildSalinity: true,
    waterNeed: 'low',
    goodAfterCrops: ['paddy', 'rice', 'maize'],
    avoidAfterCrops: ['black gram', 'green gram'],
    soilReqText: 'Moisture-retentive clay loam or alluvial delta soil; pH 6.0–7.8.',
    irrigationText: 'Thrives on residual paddy moisture plus 1–2 light supplemental irrigations at flowering and pod fill.',
    constraintsText: 'Sensitive to waterlogging; select Yellow Mosaic Virus (YMV) tolerant certified seed.',
  },
  {
    cropName: 'Paddy (Sona / Coastal Varieties)',
    cropNameTe: 'వరి (Paddy)',
    varieties: 'MTU-1061 (Indra), BPT-5204 (Samba Mahsuri), MTU-1121 (Sri Dhruthi)',
    idealSoils: ['clay', 'alluvial', 'delta', 'silt'],
    phMin: 5.5,
    phMax: 8.0,
    toleratesMildSalinity: true,
    waterNeed: 'high',
    goodAfterCrops: ['black gram', 'green gram', 'sunhemp', 'pulses'],
    avoidAfterCrops: [],
    soilReqText: 'Heavy clay loam or coastal alluvial soil capable of holding standing water; pH 5.5–8.0.',
    irrigationText: 'Requires assured canal water or reliable borewell; Alternate Wetting and Drying (AWD) reduces water use.',
    constraintsText: 'Coastal lodging risk during Oct–Nov cyclones; continuous paddy-paddy rotation depletes zinc and organic carbon.',
  },
  {
    cropName: 'Banana (Tissue Culture / Chakkarakeli)',
    cropNameTe: 'అరటి (Banana)',
    varieties: 'Karpura Chakkarakeli, Grand Naine (G-9)',
    idealSoils: ['silt loam', 'lanka', 'well-drained alluvial', 'loam'],
    phMin: 6.0,
    phMax: 7.5,
    toleratesMildSalinity: false,
    waterNeed: 'high',
    goodAfterCrops: ['maize', 'paddy', 'pulses', 'turmeric'],
    avoidAfterCrops: ['banana'],
    soilReqText: 'Deep, well-drained fertile riverine silt loam (Lanka soil) with organic carbon >0.7%; sensitive to salinity.',
    irrigationText: 'Requires regular moisture year-round; drip irrigation strongly advised for uniform bunch development.',
    constraintsText: 'High wind damage risk without propping; sensitive to saline borewell water (EC > 1.2 dS/m) and Sigatoka leaf spot.',
  },
  {
    cropName: 'Turmeric (Pasupu)',
    cropNameTe: 'పసుపు (Turmeric)',
    varieties: 'Roma, Pragati, Duggirala',
    idealSoils: ['silt loam', 'loam', 'lanka', 'friable alluvial'],
    phMin: 5.8,
    phMax: 7.4,
    toleratesMildSalinity: false,
    waterNeed: 'moderate',
    goodAfterCrops: ['maize', 'pulses', 'paddy'],
    avoidAfterCrops: ['turmeric', 'ginger'],
    soilReqText: 'Friable, well-drained loamy or riverine silt soil rich in organic matter; heavy stagnant clay causes rhizome rot.',
    irrigationText: 'Moderate frequent irrigation via ridges/furrows or drip; requires strict drainage during monsoon rains.',
    constraintsText: '8–9 month crop duration; requires post-harvest boiling/curing and drying space.',
  },
  {
    cropName: 'Green Gram (Pesara)',
    cropNameTe: 'పెసర (Green Gram)',
    varieties: 'IPM 2-14, LGG-460, WGG-42',
    idealSoils: ['alluvial', 'clay loam', 'silt loam', 'sandy loam'],
    phMin: 6.2,
    phMax: 7.6,
    toleratesMildSalinity: true,
    waterNeed: 'low',
    goodAfterCrops: ['paddy', 'maize', 'cotton'],
    avoidAfterCrops: ['green gram'],
    soilReqText: 'Loamy to clay-loam delta soils with neutral pH and no standing water.',
    irrigationText: 'Short 60–65 day duration; requires minimal supplemental irrigation, suitable when summer water is scarce.',
    constraintsText: 'Pre-harvest sprouting risk if unseasonal rain coincides with pod maturity.',
  },
  {
    cropName: 'Red Chilli (Mirapa)',
    cropNameTe: 'మిరప (Chilli)',
    varieties: 'LCA-625, Teja, Hybrid Armour',
    idealSoils: ['black', 'loam', 'silt loam', 'well-drained clay loam'],
    phMin: 6.2,
    phMax: 7.5,
    toleratesMildSalinity: false,
    waterNeed: 'moderate',
    goodAfterCrops: ['maize', 'pulses', 'paddy'],
    avoidAfterCrops: ['chilli', 'tomato', 'brinjal'],
    soilReqText: 'Well-drained loamy or black cotton soils; sensitive to coastal salinity and prolonged root-zone saturation.',
    irrigationText: 'Drip or controlled furrow irrigation preferred; excess water triggers wilt and fruit rot.',
    constraintsText: 'High input cost and thrips/viral curl vulnerability; needs clean sun-drying yard post-harvest.',
  },
];

export function evaluateCropSuitability(input: CropSuitabilityInput): CropSuitabilityResult {
  const missingInformation: string[] = [];
  if (!input.phLevel || input.phLevel.trim() === '') {
    missingInformation.push('Soil pH test reading is missing — recommended before applying micronutrients or lime/gypsum.');
  }
  if (!input.isVerifiedLabTest) {
    missingInformation.push('Soil parameters are currently self-reported rather than verified by an accredited Mandal Soil Testing Lab.');
  }
  if (!input.salinityNote || input.salinityNote.trim() === '') {
    missingInformation.push('Irrigation water electrical conductivity (EC / salinity) is unrecorded — important for coastal borewells.');
  }

  const soilLower = (input.soilType || '').toLowerCase();
  const irrLower = `${input.irrigationType} ${input.waterAvailability}`.toLowerCase();
  const prevLower = (input.previousCrop || '').toLowerCase();
  const salLower = `${input.salinityNote || ''} ${input.constraints || ''}`.toLowerCase();
  const prefLower = (input.preferences || '').toLowerCase();
  const parsedPh = input.phLevel ? parseFloat(input.phLevel) : NaN;
  const hasSalinityRisk =
    salLower.includes('salin') ||
    salLower.includes('ec 1.') ||
    salLower.includes('ec 2.') ||
    soilLower.includes('coastal');
  const hasAssuredWater =
    irrLower.includes('drip') ||
    irrLower.includes('assured') ||
    irrLower.includes('godavari canal');

  const options: CropSuitabilityOption[] = CROP_RULE_CATALOGUE.map((spec) => {
    let score = 55;
    const reasons: string[] = [];

    // 1. Soil match
    const soilMatch = spec.idealSoils.some((s) => soilLower.includes(s));
    if (soilMatch) {
      score += 16;
      reasons.push(`Matches ${input.soilType} texture.`);
    } else {
      score -= 8;
    }

    // 2. pH check
    if (!Number.isNaN(parsedPh)) {
      if (parsedPh >= spec.phMin && parsedPh <= spec.phMax) {
        score += 10;
        reasons.push(`Soil pH (${parsedPh}) falls within optimal range (${spec.phMin}–${spec.phMax}).`);
      } else {
        score -= 12;
        reasons.push(`Soil pH (${parsedPh}) is outside preferred ${spec.phMin}–${spec.phMax} range.`);
      }
    }

    // 3. Salinity check
    if (hasSalinityRisk) {
      if (spec.toleratesMildSalinity) {
        score += 8;
        reasons.push('Tolerates mild coastal alluvial/borewell salinity better than salt-sensitive horticulture.');
      } else {
        score -= 16;
        reasons.push('Caution: sensitive to coastal/borewell salinity unless flushed with fresh canal water.');
      }
    }

    // 4. Water / irrigation check
    if (spec.waterNeed === 'high' && hasAssuredWater) {
      score += 10;
      reasons.push(`Supported by ${input.irrigationType}.`);
    } else if (spec.waterNeed === 'high' && !hasAssuredWater) {
      score -= 12;
      reasons.push('Requires assured water throughout crop cycle; seasonal canal fluctuations pose stress risk.');
    } else if (spec.waterNeed === 'low') {
      score += 9;
      reasons.push('Low water requirement reduces late-season irrigation risk.');
    } else if (spec.waterNeed === 'moderate' && (hasAssuredWater || irrLower.includes('canal'))) {
      score += 8;
      reasons.push('Compatible with available irrigation regime.');
    }

    // 5. Crop rotation check
    let rotationBenefit = 'Standard seasonal sequence; monitor soil organic matter.';
    if (spec.goodAfterCrops.some((c) => prevLower.includes(c))) {
      score += 10;
      rotationBenefit = `Beneficial rotation after ${input.previousCrop} — helps break pest cycles and balance root-zone nutrients.`;
      reasons.push(`Strong crop rotation fit following ${input.previousCrop}.`);
    } else if (spec.avoidAfterCrops.some((c) => prevLower.includes(c))) {
      score -= 14;
      rotationBenefit = `Repeated family after ${input.previousCrop} increases soil-borne pest and nutrient depletion risk.`;
    }

    // 6. Farmer preference signal
    const cropKeyword = spec.cropName.split(' ')[0].toLowerCase();
    if (prefLower.includes(cropKeyword) || (cropKeyword === 'black' && prefLower.includes('pulse'))) {
      score += 6;
      reasons.push('Aligns with stated farm crop interest.');
    }

    // 7. Market demand signal from connected database
    const matchingDemands = input.activeDemands.filter((d) =>
      d.cropName.toLowerCase().includes(cropKeyword) ||
      cropKeyword.includes(d.cropName.split(' ')[0].toLowerCase())
    );
    let marketDemandSignal = 'No open pilot buyer requirement currently listed on AGRISETU; verify local mandi demand.';
    if (matchingDemands.length > 0) {
      score += 7;
      const totalQty = matchingDemands.reduce(
        (acc, item) => acc + (parseFloat(item.quantityRequiredQuintals) || 0),
        0
      );
      const sampleRange = matchingDemands[0].offeredPriceRange;
      marketDemandSignal = `${matchingDemands.length} indicative pilot buyer requirement(s) open (${totalQty} quintals total, indicative range ${sampleRange}/qtl — not a guaranteed purchase).`;
    }

    const boundedScore = Math.max(25, Math.min(96, score));
    const suitabilityBand: CropSuitabilityOption['suitabilityBand'] =
      boundedScore >= 76
        ? 'High Agronomic Suitability'
        : boundedScore >= 58
          ? 'Conditional Suitability'
          : 'Evaluate With Caution';

    return {
      cropName: spec.cropName,
      cropNameTe: spec.cropNameTe,
      recommendedVarieties: spec.varieties,
      suitabilityBand,
      ruleScore: boundedScore,
      whySuitable: reasons.join(' '),
      soilRequirements: spec.soilReqText,
      irrigationConsiderations: spec.irrigationText,
      importantConstraints: spec.constraintsText,
      rotationBenefit,
      marketDemandSignal,
      isDemoRuleModel: true,
    };
  });

  options.sort((a, b) => b.ruleScore - a.ruleScore);

  return {
    disclaimer:
      'Transparent Rule-Based Decision Support (Pilot Demo): These options highlight agronomic compatibility and indicative buyer interest. AGRISETU does not identify a single "most profitable" crop and never guarantees crop yield, market price, or farm income. Consult a Mandal Agricultural Officer or KVK scientist before seed purchase.',
    missingInformation,
    evaluatedInputsSummary: `${input.district} (${input.climateZone}) · Soil: ${input.soilType} · Area: ${input.farmAreaAcres} acres · Irrigation: ${input.irrigationType} · Previous Crop: ${input.previousCrop}`,
    options: options.slice(0, 4),
  };
}
