export interface KnowledgeCandidate {
  id: number;
  category: string;
  title: string;
  titleTe?: string | null;
  summary: string;
  content: string;
  contentTe?: string | null;
  applicableRegions: string;
  applicableCrops?: string | null;
  sourceName: string;
  sourceUrl?: string | null;
  verificationStatus: string;
  lastVerifiedDate: string;
  isOutdated: boolean;
}

export interface SchemeCandidate {
  id?: number;
  schemeCode: string;
  schemeName: string;
  schemeNameTe?: string | null;
  level: string;
  applicableState: string;
  purpose: string;
  eligibilityConditions: string;
  benefits: string;
  requiredDocuments?: string;
  applicationProcedure?: string;
  officialPortal: string;
  officialSource: string;
  officialSourceUrl?: string | null;
  verificationStatus: string;
  lastVerifiedDate: string;
  isOutdated: boolean;
}

export interface RetrievalContextFilter {
  profileShared: boolean;
  district?: string;
  region?: string;
  currentCrop?: string;
}

export interface SafetyEvaluation {
  isHighRisk: boolean;
  escalationCategory: string;
  escalationReason: string;
  missingDiagnosticPrompts: string[];
}

export const MIN_KNOWLEDGE_RELEVANCE_SCORE = 5;
export const MIN_SCHEME_RELEVANCE_SCORE = 5;

const STOPWORDS = new Set([
  'the', 'and', 'for', 'with', 'that', 'this', 'from', 'what', 'when', 'where', 'which',
  'how', 'can', 'should', 'could', 'would', 'please', 'tell', 'about', 'give', 'need',
  'have', 'has', 'had', 'are', 'was', 'were', 'will', 'into', 'your', 'our', 'their',
  'any', 'some', 'more', 'best', 'good', 'help', 'want', 'know', 'explain', 'details',
  // Common Telugu conversational fillers / postpositions
  'నాకు', 'మాకు', 'మేము', 'ఎలా', 'ఏమిటి', 'ఏం', 'ఎప్పుడు', 'ఎక్కడ', 'చెప్పండి', 'గురించి',
  'కోసం', 'మరియు', 'లేదా', 'ఉంది', 'ఉన్నాయి', 'చేయాలి', 'కావాలి', 'దయచేసి', 'వివరాలు',
]);

// Bilingual crop & agricultural concept synonyms so Telugu queries match English metadata and vice-versa
const CONCEPT_EXPANSIONS: Array<{ triggers: string[]; expansions: string[] }> = [
  { triggers: ['వరి', 'ధాన్యం', 'చేను', 'నారుమడి', 'paddy', 'rice'], expansions: ['paddy', 'వరి'] },
  { triggers: ['అరటి', 'గెల', 'పిలకలు', 'banana'], expansions: ['banana', 'అరటి'] },
  { triggers: ['పసుపు', 'కొమ్ము', 'దుంప', 'turmeric'], expansions: ['turmeric', 'పసుపు'] },
  { triggers: ['మినుము', 'మినుములు', 'black gram', 'urad'], expansions: ['black gram', 'pulses', 'మినుము'] },
  { triggers: ['పెసర', 'పెసలు', 'green gram', 'moong'], expansions: ['green gram', 'pulses', 'పెసర'] },
  { triggers: ['మిరప', 'మిర్చి', 'chilli', 'chili'], expansions: ['chilli', 'మిరప'] },
  {
    triggers: ['దోమపోటు', 'దోమ పోటు', 'దోమ', 'planthopper', 'bph', 'hopper'],
    expansions: ['planthopper', 'bph', 'pest', 'దోమపోటు'],
  },
  {
    triggers: ['పసుపు రంగు', 'ఆకులు పసుపు', 'yellow', 'yellowing', 'chlorosis', 'zinc', 'nitrogen'],
    expansions: ['yellowing', 'nitrogen', 'zinc', 'fertiliser', 'soil'],
  },
  {
    triggers: ['నిల్వ', 'తేమ', 'గోదాము', 'storage', 'moisture', 'drying', 'post-harvest'],
    expansions: ['storage', 'moisture', 'post-harvest', 'drying'],
  },
  {
    triggers: ['డ్రిప్', 'నీరు', 'సాగునీరు', 'కాలువ', 'irrigation', 'drip', 'water'],
    expansions: ['irrigation', 'drip', 'water', 'awd'],
  },
  {
    triggers: ['నేల', 'భూమి', 'ఉప్పు', 'చౌడు', 'soil', 'salinity', 'ph'],
    expansions: ['soil', 'salinity', 'ph', 'alluvial'],
  },
  {
    triggers: ['తుఫాను', 'వర్షం', 'గాలి', 'వాతావరణం', 'cyclone', 'weather', 'rain', 'wind', 'lodging'],
    expansions: ['weather', 'cyclone', 'rain', 'lodging', 'drainage'],
  },
  {
    triggers: ['మార్కెట్', 'ధర', 'కొనుగోలు', 'తేమ ప్రమాణం', 'market', 'price', 'faq', 'buyer'],
    expansions: ['market', 'faq', 'moisture', 'buyer'],
  },
];

export function tokenizeAgriculturalQuery(question: string): string[] {
  const cleaned = question
    .toLowerCase()
    .replace(/[.,?!;:"'()[\]{}/\\|+=-]+/g, ' ')
    .trim();

  const rawTokens = cleaned
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 2 && !STOPWORDS.has(t));

  const expanded = new Set<string>(rawTokens);
  for (const group of CONCEPT_EXPANSIONS) {
    if (group.triggers.some((tr) => cleaned.includes(tr))) {
      for (const exp of group.expansions) {
        expanded.add(exp);
      }
    }
  }
  return Array.from(expanded);
}

/**
 * Scores and filters non-outdated agricultural knowledge documents.
 * Strictly enforces MIN_KNOWLEDGE_RELEVANCE_SCORE and never boosts unrelated documents
 * solely from farmer profile fields when the query itself has zero topical match.
 */
export function retrieveRelevantKnowledge(
  question: string,
  docs: KnowledgeCandidate[],
  filter: RetrievalContextFilter,
  maxResults = 4
): Array<{ doc: KnowledgeCandidate; score: number }> {
  const tokens = tokenizeAgriculturalQuery(question);
  if (tokens.length === 0) {
    return [];
  }

  const qLower = question.toLowerCase();
  const mentionsTelangana = qLower.includes('telangana') || qLower.includes('తెలంగాణ');
  const mentionsAp =
    qLower.includes('kakinada') ||
    qLower.includes('godavari') ||
    qLower.includes('konaseema') ||
    qLower.includes('andhra') ||
    qLower.includes('కాకినాడ') ||
    qLower.includes('గోదావరి');

  const scored: Array<{ doc: KnowledgeCandidate; score: number }> = [];

  for (const doc of docs) {
    if (doc.isOutdated) continue;

    const titleField = `${doc.title} ${doc.titleTe || ''} ${doc.category}`.toLowerCase();
    const cropField = (doc.applicableCrops || '').toLowerCase();
    const bodyField = `${doc.summary} ${doc.content} ${doc.contentTe || ''}`.toLowerCase();
    const regionField = doc.applicableRegions.toLowerCase();

    let queryMatchScore = 0;

    for (const tok of tokens) {
      if (tok.length < 3 && /^[a-z0-9]+$/.test(tok) && tok !== 'ph') {
        continue;
      }
      if (titleField.includes(tok)) {
        queryMatchScore += 5;
      } else if (cropField && cropField !== 'all crops' && cropField.includes(tok)) {
        queryMatchScore += 5;
      } else if (bodyField.includes(tok)) {
        queryMatchScore += 3;
      }
    }

    // Critical guard: if the farmer's question has ZERO topical match to this document,
    // never select it based on profile crop/district alone.
    if (queryMatchScore === 0) {
      continue;
    }

    let totalScore = queryMatchScore;

    // Region metadata compatibility check
    if (mentionsTelangana && !regionField.includes('telangana') && !regionField.includes('all')) {
      totalScore -= 3;
    }
    if (mentionsAp && regionField.includes('telangana') && !regionField.includes('andhra')) {
      totalScore -= 3;
    }

    // Consented profile context tie-breaker (only applied when query already matched topic)
    if (filter.profileShared) {
      const farmerCropKey = (filter.currentCrop || '').split('(')[0].trim().split(' ')[0].toLowerCase();
      if (farmerCropKey && farmerCropKey.length >= 3 && (cropField.includes(farmerCropKey) || titleField.includes(farmerCropKey))) {
        totalScore += 2;
      }
      const farmerDist = (filter.district || '').toLowerCase();
      if (farmerDist && regionField.includes(farmerDist)) {
        totalScore += 1;
      }
    }

    if (totalScore >= MIN_KNOWLEDGE_RELEVANCE_SCORE) {
      scored.push({ doc, score: totalScore });
    }
  }

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, maxResults);
}

/**
 * Scores and filters non-outdated government scheme records with a strict minimum relevance threshold.
 */
export function retrieveRelevantSchemes(
  question: string,
  schemes: SchemeCandidate[],
  filter: RetrievalContextFilter,
  maxResults = 3
): Array<{ scheme: SchemeCandidate; score: number }> {
  const qLower = question.toLowerCase();
  const tokens = tokenizeAgriculturalQuery(question);

  const schemeIntentKeywords = [
    'scheme', 'subsidy', 'pm-kisan', 'pmkisan', 'pmfby', 'insurance', 'kcc',
    'credit card', 'loan', 'rythu', 'annadata', 'sukhibhava', 'bharosa', 'e-panta', 'epanta',
    'పథకం', 'పథకాలు', 'సబ్సిడీ', 'భీమా', 'బీమా', 'రుణం', 'లోన్', 'కిసాన్', 'రైతు భరోసా', 'అన్నదాత', 'ఇ-పంట',
  ];
  const hasSchemeIntent = schemeIntentKeywords.some((kw) => qLower.includes(kw));

  const scored: Array<{ scheme: SchemeCandidate; score: number }> = [];

  for (const s of schemes) {
    if (s.isOutdated) continue;

    const codeAndTitle = `${s.schemeCode} ${s.schemeName} ${s.schemeNameTe || ''}`.toLowerCase();
    const details = `${s.purpose} ${s.applicableState} ${s.benefits}`.toLowerCase();

    let score = 0;

    if (qLower.includes(s.schemeCode.toLowerCase())) {
      score += 10;
    }

    for (const tok of tokens) {
      if (tok.length < 3 && /^[a-z0-9]+$/.test(tok)) continue;
      if (codeAndTitle.includes(tok)) {
        score += 5;
      } else if (details.includes(tok)) {
        score += 2;
      }
    }

    if (hasSchemeIntent && score === 0) {
      // If farmer asks broadly about "government schemes for my region", filter by state compatibility
      const stateLower = s.applicableState.toLowerCase();
      if (qLower.includes('telangana') || qLower.includes('తెలంగాణ')) {
        if (stateLower.includes('telangana') || stateLower.includes('all india')) {
          score += 6;
        }
      } else if (filter.profileShared && filter.district) {
        if (stateLower.includes('andhra') || stateLower.includes('all india')) {
          score += 6;
        }
      } else if (stateLower.includes('all india')) {
        score += 5;
      }
    }

    // Exclude Telangana-only scheme if query explicitly asks for Kakinada/AP (and vice versa)
    if (
      (qLower.includes('kakinada') || qLower.includes('godavari') || qLower.includes('andhra')) &&
      s.applicableState.toLowerCase() === 'telangana' &&
      !qLower.includes('telangana') &&
      !qLower.includes('bharosa')
    ) {
      score = 0;
    }

    if (score >= MIN_SCHEME_RELEVANCE_SCORE) {
      scored.push({ scheme: s, score });
    }
  }

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, maxResults);
}

/**
 * Evaluates agricultural safety and escalation triggers across English and Telugu variations.
 */
export function evaluateAgriculturalSafety(question: string): SafetyEvaluation {
  const q = question.toLowerCase();

  const chemicalAndDosagePatterns = [
    'pesticide', 'insecticide', 'fungicide', 'herbicide', 'weedicide',
    'chemical spray', 'chemical dose', 'dosage', 'ml per litre', 'ml/l', 'ml per liter',
    'grams per litre', 'how much chemical', 'how many ml', 'tank mix', 'mix two chemicals',
    'poison', 'toxicity', 'monocrotophos', 'chlorpyrifos', 'paraquat', 'carbofuran', 'phorate',
    'acephate', 'profeno', 'cypermethrin', 'imidacloprid', 'urea dose', 'how many bags of urea',
    // Telugu chemical / dosage / spray phrases & variations
    'పురుగుమందు', 'పురుగు మందు', 'కలుపు మందు', 'కలుపుమందు', 'శిలీంధ్రనాశిని', 'తెగులు మందు',
    'మోతాదు', 'ఎంత మోతాదు', 'ఎంత మందు', 'ఎన్ని మిల్లీలీటర్లు', 'లీటరుకు ఎంత', 'ఎకరాకు ఎంత మందు',
    'ఏ మందు కొట్టాలి', 'మందు కొట్టాలి', 'స్ప్రే చేయాలి', 'మందులు కలపవచ్చా', 'విషం',
    'ఎన్ని బస్తాల యూరియా', 'రసాయన మందు',
  ];

  const severeDiseaseOrCropLossPatterns = [
    'severe wilt', 'sudden death', 'entire field dying', 'whole crop dying', 'destroy crop',
    'plough back', 'uproot entire', 'crop failure', 'hopper burn', 'hopperburn',
    'bacterial leaf blight', 'neck blast', 'rhizome rot', 'corm rot', 'panama wilt',
    'chemical burn', 'leaf scorch', 'viral curl outbreak',
    // Telugu severe disease / acute crop-loss variations
    'దోమపోటు', 'దోమ పోటు', 'దుంప కుళ్ళు', 'వేరు కుళ్ళు', 'కాండం కుళ్ళు',
    'అగ్గి తెగులు', 'ఆకు ఎండు తెగులు', 'మొత్తం చేను ఎండిపోతోంది', 'పంటంతా పాడైపోయింది',
    'పంట తీసేయాలా', 'దున్నేయాలా', 'ఆకులు కాలిపోయాయి', 'తీవ్రమైన తెగులు', 'వైరస్ తెగులు',
  ];

  const matchedChemical = chemicalAndDosagePatterns.find((p) => q.includes(p));
  if (matchedChemical) {
    return {
      isHighRisk: true,
      escalationCategory: 'Pest, Fertilizer & Chemical Dosage Safety',
      escalationReason: `Query involves chemical/fertilizer application or dosage ("${matchedChemical}") requiring certified agronomist verification.`,
      missingDiagnosticPrompts: [
        'What is the exact crop variety and days after sowing/transplanting?',
        'Roughly what percentage of the field shows symptoms, and were any sprays applied in the last 7 days?',
      ],
    };
  }

  const matchedSevere = severeDiseaseOrCropLossPatterns.find((p) => q.includes(p));
  if (matchedSevere) {
    return {
      isHighRisk: true,
      escalationCategory: 'Acute Crop Disease & Crop-Loss Risk',
      escalationReason: `Query describes severe pest/disease outbreak or major crop-loss decision ("${matchedSevere}") requiring field specialist inspection.`,
      missingDiagnosticPrompts: [
        'How many days ago did symptoms begin, and is there standing water or poor drainage in affected patches?',
        'Are symptoms appearing on young upper leaves, lower older leaves, or roots/stems?',
      ],
    };
  }

  return {
    isHighRisk: false,
    escalationCategory: 'General Advisory',
    escalationReason: '',
    missingDiagnosticPrompts: [],
  };
}
