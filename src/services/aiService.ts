import { GoogleGenAI, Type } from '@google/genai';
import { evaluateAgriculturalSafety } from './knowledgeRetrieval.ts';

const getAiClient = () => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY' || apiKey.trim() === '') {
    return null;
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
};

export const getAiRuntimeStatus = () => {
  const configured = Boolean(
    process.env.GEMINI_API_KEY &&
      process.env.GEMINI_API_KEY !== 'MY_GEMINI_API_KEY' &&
      process.env.GEMINI_API_KEY.trim() !== ''
  );
  return {
    aiConfigured: configured,
    isDemoMode: !configured,
  };
};

export interface FarmerContextForAi {
  profileShared: boolean;
  name?: string;
  village?: string;
  mandal?: string;
  district?: string;
  region?: string;
  preferredLanguage: string;
  dialectProfile: string;
  farmAreaAcres?: string;
  soilType?: string;
  phLevel?: string | null;
  salinityNote?: string | null;
  irrigationType?: string;
  previousCrop?: string;
  currentCrop?: string;
  customVocabulary: Array<{ term: string; meaning: string }>;
}

export interface RetrievedKnowledgeItem {
  id: number;
  category: string;
  title: string;
  summary: string;
  content: string;
  sourceName: string;
  lastVerifiedDate: string;
  verificationStatus: string;
}

export interface RetrievedSchemeItem {
  schemeCode: string;
  schemeName: string;
  level: string;
  applicableState: string;
  eligibilityConditions: string;
  benefits: string;
  officialPortal: string;
  officialSource?: string;
  officialSourceUrl?: string | null;
  verificationStatus: string;
  lastVerifiedDate: string;
}

export interface AssistantTurnResponse {
  replyText: string;
  followUpQuestions: string[];
  shouldEscalate: boolean;
  escalationCategory: string;
  escalationReason: string;
  confidenceNote: string;
  evidenceBasis: 'verified_knowledge_base' | 'general_ai_explanation' | 'safety_escalation';
  citations: Array<{
    type: 'knowledge' | 'scheme';
    idOrCode: string;
    title: string;
    source: string;
    lastVerifiedDate: string;
    verifiedStatus: string;
  }>;
  demoFallback: boolean;
}

const DIALECT_GUIDANCE: Record<string, string> = {
  kakinada_coastal:
    'Kakinada coastal Telugu (కాకినాడ తీరప్రాంత తెలుగు): Understand coastal Andhra farm expressions such as చేను (field), బోదె (field channel), నారుమడి (nursery), దోమపోటు (planthopper attack), పొల్లు (chaffy grain), ఉప్పు నీరు (saline water), మండువా (shed), and mixed Telugu-English farmer speech. Respond warmly in clear, natural coastal Telugu without stiff textbook Sanskritized phrasing.',
  godavari_delta:
    'Godavari regional Telugu (గోదావరి ప్రాంతీయ తెలుగు): Understand Konaseema/Godavari delta expressions such as లంక భూమి (fertile riverine silt), గెల (banana bunch), కొమ్ము (turmeric rhizome), దుంప కుళ్ళు (rhizome rot), కాలువ నీరు (canal water), పిలకలు (suckers), and mixed Telugu-English words. Respond respectfully and naturally in warm Godavari Telugu.',
};

export async function generateAgriculturalGuidance(params: {
  question: string;
  responseLanguage: 'te' | 'en';
  farmerContext: FarmerContextForAi;
  history: Array<{ sender: string; messageText: string }>;
  knowledgeDocs: RetrievedKnowledgeItem[];
  schemes: RetrievedSchemeItem[];
}): Promise<AssistantTurnResponse> {
  const ai = getAiClient();
  const textModel = process.env.AI_TEXT_MODEL || 'gemini-3.8-flash';
  const isTelugu = params.responseLanguage === 'te';

  // Enforce strict consent boundary: zero personal, location, soil, crop, or custom vocabulary details when profileShared === false
  const allowProfile = params.farmerContext.profileShared === true;
  const greetingNameTe =
    allowProfile && params.farmerContext.name ? `${params.farmerContext.name} గారు` : 'రైతు గారు';
  const greetingNameEn =
    allowProfile && params.farmerContext.name ? params.farmerContext.name : 'Farmer';

  const safety = evaluateAgriculturalSafety(params.question);
  const hasVerifiedMatch = params.knowledgeDocs.length > 0 || params.schemes.length > 0;

  const citations = [
    ...params.knowledgeDocs.slice(0, 3).map((k) => ({
      type: 'knowledge' as const,
      idOrCode: String(k.id),
      title: k.title,
      source: `${k.sourceName} (Last verified: ${k.lastVerifiedDate})`,
      lastVerifiedDate: k.lastVerifiedDate,
      verifiedStatus: k.verificationStatus,
    })),
    ...params.schemes.slice(0, 2).map((s) => ({
      type: 'scheme' as const,
      idOrCode: s.schemeCode,
      title: s.schemeName,
      source: `${s.officialSource || s.officialPortal} (Last verified: ${s.lastVerifiedDate})`,
      lastVerifiedDate: s.lastVerifiedDate,
      verifiedStatus: s.verificationStatus,
    })),
  ];

  if (!ai) {
    // Transparent Demo RAG Fallback when GEMINI_API_KEY is unconfigured.
    // Never falls back to a random knowledge document when nothing met the relevance threshold.
    const topDoc = params.knowledgeDocs[0];
    const topScheme = params.schemes[0];

    let replyText = '';
    let confidenceNote = '';
    let evidenceBasis: AssistantTurnResponse['evidenceBasis'] = 'verified_knowledge_base';

    if (safety.isHighRisk) {
      evidenceBasis = 'safety_escalation';
      replyText = isTelugu
        ? `నమస్కారం ${greetingNameTe}. పురుగుమందులు, ఎరువుల ఖచ్చితమైన మోతాదు లేదా తీవ్రమైన పంట తెగులు నిర్ధారణ విషయంలో ఊహాగానాలతో మోతాదు చెప్పడం సురక్షితం కాదు. అందుకే AGRISETU రసాయన మోతాదులను అంచనా వేయదు. దయచేసి వెంటనే మీ మండల వ్యవసాయ అధికారి (MAO) లేదా రైతు సేవా కేంద్రం నిపుణులను సంప్రదించండి.${topDoc ? ` (సంబంధిత ప్రాథమిక సూచన — ${topDoc.sourceName}, ధృవీకరించిన తేదీ ${topDoc.lastVerifiedDate}: ${topDoc.summary})` : ''}`
        : `Hello ${greetingNameEn}. Because pesticide sprays, chemical/fertilizer dosages, and severe crop-disease interventions carry crop-loss and safety risks, AGRISETU never guesses chemical dosages. Please consult your Mandal Agricultural Officer (MAO) or KVK specialist before applying any chemical.${topDoc ? ` (Related general reference from ${topDoc.sourceName}, last verified ${topDoc.lastVerifiedDate}: ${topDoc.summary})` : ''}`;
      confidenceNote =
        'Safety Escalation Active: High-risk chemical dosage or severe disease query requires certified human agronomist verification.';
    } else if (topScheme) {
      const verifyWarningTe =
        topScheme.verificationStatus !== 'Verified Scheme'
          ? ' గమనిక: ఈ పథకం "Requires Verification" స్థితిలో ఉంది — దరఖాస్తు చేసే ముందు గ్రామ రైతు సేవా కేంద్రంలో తాజా గడువు తేదీలను తప్పనిసరిగా నిర్ధారించుకోండి.'
          : '';
      const verifyWarningEn =
        topScheme.verificationStatus !== 'Verified Scheme'
          ? ' Note: This record is marked "Requires Verification" — confirm active seasonal deadlines at your local Rythu Seva Kendra before applying.'
          : '';
      replyText = isTelugu
        ? `నమస్కారం ${greetingNameTe}. AGRISETU పథకాల సమాచారం నుండి: ${topScheme.schemeName} (${topScheme.verificationStatus}, చివరిగా పరిశీలించిన తేదీ: ${topScheme.lastVerifiedDate}). ప్రయోజనం: ${topScheme.benefits}. అర్హత: ${topScheme.eligibilityConditions}. అధికారిక పోర్టల్: ${topScheme.officialSourceUrl || topScheme.officialPortal}.${verifyWarningTe}`
        : `Hello ${greetingNameEn}. From AGRISETU scheme records: ${topScheme.schemeName} (${topScheme.verificationStatus}, last verified ${topScheme.lastVerifiedDate}). Benefits: ${topScheme.benefits}. Eligibility: ${topScheme.eligibilityConditions}. Official portal: ${topScheme.officialSourceUrl || topScheme.officialPortal}.${verifyWarningEn}`;
      confidenceNote = `Verified Scheme Catalogue Record (${topScheme.schemeCode}, last verified ${topScheme.lastVerifiedDate}). Always verify live seasonal cut-off dates on the official portal.`;
    } else if (topDoc) {
      const profileNoteTe = allowProfile
        ? `మీ అనుమతితో జతచేసిన ప్రొఫైల్ (${params.farmerContext.district}, ${params.farmerContext.soilType}, పంట: ${params.farmerContext.currentCrop}) ఆధారంగా — `
        : '';
      const profileNoteEn = allowProfile
        ? `Using your consented farm profile (${params.farmerContext.district}, ${params.farmerContext.soilType}, crop: ${params.farmerContext.currentCrop}) — `
        : '';
      replyText = isTelugu
        ? `నమస్కారం ${greetingNameTe}. ${profileNoteTe}AGRISETU ధృవీకరించిన సమాచారం ప్రకారం: ${topDoc.summary} (ఆధారం: ${topDoc.sourceName}, చివరిగా ధృవీకరించిన తేదీ: ${topDoc.lastVerifiedDate}). మరింత ఖచ్చితమైన సూచన కోసం మీ పంట విత్తిన ఎన్ని రోజులు అయిందో తెలియజేయగలరా?`
        : `Hello ${greetingNameEn}. ${profileNoteEn}From verified AGRISETU knowledge base: ${topDoc.content} (Source: ${topDoc.sourceName}, last verified: ${topDoc.lastVerifiedDate}). To tailor guidance further, how many days ago was the crop sown and what is the current field moisture condition?`;
      confidenceNote = `Verified Knowledge Base Match: ${topDoc.sourceName} (Last verified: ${topDoc.lastVerifiedDate}). Does not replace on-field inspection.`;
    } else {
      // Honest no-match response: NEVER cite a random document or invent details
      evidenceBasis = 'general_ai_explanation';
      replyText = isTelugu
        ? `నమస్కారం ${greetingNameTe}. మీరు అడిగిన అంశానికి సంబంధించి ప్రస్తుతం AGRISETU ధృవీకరించిన విజ్ఞాన భాండాగారంలో (Knowledge Base) లేదా ప్రభుత్వ పథకాల జాబితాలో సరిపోయే రికార్డు లేదు. నేను ధృవీకరించని సమాచారాన్ని ఊహించి చెప్పను. దయచేసి మీ పంట పేరు, పంట దశ (విత్తిన ఎన్ని రోజులు అయింది), మరియు మీరు గమనిస్తున్న నిర్దిష్ట లక్షణాలను తెలియజేయండి — లేదా క్షేత్రస్థాయి సలహా కోసం వ్యవసాయ నిపుణులను (Expert Review) సంప్రదించండి.`
        : `Hello ${greetingNameEn}. AGRISETU does not currently have a verified knowledge-base advisory or scheme record matching this specific question, and will not invent unverified details. Could you clarify the exact crop name, crop stage (days after sowing), and specific field concern? For specialized diagnosis, we recommend requesting an Agricultural Expert review or consulting your local Rythu Seva Kendra.`;
      confidenceNote =
        'No Verified Knowledge Base Match: AGRISETU found 0 verified records meeting the relevance threshold for this query.';
    }

    const followUps = safety.isHighRisk
      ? isTelugu
        ? [
            'మీ పంట రకం మరియు విత్తిన/నాటిన తర్వాత ఎన్ని రోజులు అయింది?',
            'పొలంలో ఎంత శాతం మొక్కలలో ఈ లక్షణాలు కనిపిస్తున్నాయి?',
          ]
        : safety.missingDiagnosticPrompts
      : isTelugu
        ? [
            'మీరు ఏ పంట గురించి మరియు ఏ దశ (విత్తిన ఎన్ని రోజులు) గురించి అడుగుతున్నారు?',
            'గత వారం రోజుల్లో సాగునీరు లేదా ఎరువుల వివరాలు ఏమిటి?',
          ]
        : [
            'Which specific crop and growth stage (days after sowing/transplanting) are you asking about?',
            'What is the current soil moisture or drainage condition in your field?',
          ];

    return {
      replyText,
      followUpQuestions: followUps,
      shouldEscalate: safety.isHighRisk,
      escalationCategory: safety.isHighRisk ? safety.escalationCategory : 'General Advisory',
      escalationReason: safety.escalationReason,
      confidenceNote,
      evidenceBasis,
      citations: hasVerifiedMatch ? citations : [],
      demoFallback: true,
    };
  }

  const dialectInstruction =
    DIALECT_GUIDANCE[params.farmerContext.dialectProfile] || DIALECT_GUIDANCE.kakinada_coastal;

  const customVocabText =
    allowProfile && params.farmerContext.customVocabulary.length > 0
      ? params.farmerContext.customVocabulary
          .map((v) => `- "${v.term}": ${v.meaning}`)
          .join('\n')
      : 'No personal custom vocabulary shared.';

  const farmerProfileBlock = allowProfile
    ? `CONSENTED FARMER PROFILE:
- Name: ${params.farmerContext.name || 'Farmer'}
- Location: ${params.farmerContext.village}, ${params.farmerContext.mandal} Mandal, ${params.farmerContext.district} (${params.farmerContext.region})
- Farm Size: ${params.farmerContext.farmAreaAcres} acres
- Soil: ${params.farmerContext.soilType} (pH: ${params.farmerContext.phLevel || 'Not tested'}, Salinity: ${params.farmerContext.salinityNote || 'Unknown'})
- Irrigation: ${params.farmerContext.irrigationType}
- Previous Crop: ${params.farmerContext.previousCrop || 'Not recorded'}
- Current Crop: ${params.farmerContext.currentCrop || 'Not recorded'}`
    : `FARMER PRIVACY & CONSENT NOTICE: Profile sharing with AI is OFF. Zero personal, location, soil, or crop records are provided. Do NOT assume any location, soil, or crop details unless explicitly stated in the current message; politely ask clarifying questions if needed.`;

  const ragKnowledgeBlock =
    params.knowledgeDocs.length > 0
      ? params.knowledgeDocs
          .map(
            (k) =>
              `[Verified Knowledge #${k.id} | ${k.category} | Source: ${k.sourceName} | Status: ${k.verificationStatus} | Last Verified: ${k.lastVerifiedDate}]\nTitle: ${k.title}\nContent: ${k.content}`
          )
          .join('\n\n')
      : 'NO VERIFIED KNOWLEDGE BASE RECORD MATCHED THIS QUESTION.';

  const ragSchemeBlock =
    params.schemes.length > 0
      ? params.schemes
          .map(
            (s) =>
              `[Scheme ${s.schemeCode} | ${s.schemeName} | ${s.level} (${s.applicableState}) | Status: ${s.verificationStatus} | Last Verified: ${s.lastVerifiedDate}]\nEligibility: ${s.eligibilityConditions}\nBenefits: ${s.benefits}\nOfficial Source: ${s.officialSource || s.officialPortal} (${s.officialSourceUrl || s.officialPortal})`
          )
          .join('\n\n')
      : 'NO VERIFIED GOVERNMENT SCHEME RECORD MATCHED THIS QUESTION.';

  const historyBlock =
    params.history.length > 0
      ? params.history
          .slice(-6)
          .map((h) => `${h.sender.toUpperCase()}: ${h.messageText}`)
          .join('\n')
      : 'Start of conversation.';

  const systemInstruction = `You are AGRISETU AI Farmer Assistant, a transparent, voice-friendly agricultural advisor for farmers in Andhra Pradesh & Telangana.

RESPONSE LANGUAGE REQUIREMENT:
${
  isTelugu
    ? `Respond naturally in Telugu script (తెలుగు). ${dialectInstruction} Keep sentences clear, warm, and spoken-friendly, explaining technical terms in everyday farmer language.`
    : `Respond clearly in simple, accessible English while understanding any regional Telugu agricultural words the farmer uses.`
}

REGIONAL VOCABULARY HINTS:
${customVocabText}

${farmerProfileBlock}

RETRIEVED AGRICULTURAL KNOWLEDGE BASE (VERIFIED FACTS):
${ragKnowledgeBlock}

RETRIEVED GOVERNMENT SCHEMES CATALOGUE:
${ragSchemeBlock}

STRICT TRANSPARENCY, EVIDENCE & SAFETY RULES (NON-NEGOTIABLE):
1. Clearly distinguish between:
   (a) Verified AGRISETU Knowledge Base / Scheme facts (cite the source name and last-verified date when used),
   (b) General AI agronomic explanation (if NO VERIFIED RECORD MATCHED above, explicitly state that AGRISETU has no verified knowledge-base record for this specific query before giving safe general context or asking clarifying questions), and
   (c) Illustrative estimates (never present estimates as verified market prices or guaranteed yields).
2. NEVER invent chemical pesticide dosages, fertilizer chemical quantities, toxic tank mixes, guaranteed crop yields, guaranteed profits, live market prices, or unverified government scheme eligibility/deadlines/sources.
3. If a scheme is marked "Requires Verification", explicitly advise confirming active seasonal dates at the local Rythu Seva Kendra or official portal.
4. Ask 1–2 concise clarifying questions when key diagnostic details (crop stage, moisture, symptom distribution, variety) are missing.
5. Set shouldEscalate = true whenever the query involves pesticide selection/dosage, chemical/fertilizer dosage, severe or ambiguous crop disease, or major crop-loss risk, and advise consulting a Mandal Agricultural Officer / KVK specialist.
6. Keep replyText concise (3–6 short spoken-friendly sentences).`;

  const response = await ai.models.generateContent({
    model: textModel,
    contents: `CONVERSATION HISTORY:\n${historyBlock}\n\nFARMER'S NEW QUESTION:\n${params.question}`,
    config: {
      systemInstruction,
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          replyText: {
            type: Type.STRING,
            description: 'The spoken-friendly agricultural response in the requested language.',
          },
          followUpQuestions: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
            description: '1 to 2 helpful clarifying follow-up questions in the requested language.',
          },
          shouldEscalate: {
            type: Type.BOOLEAN,
            description: 'True if uncertain, high-risk, chemical/fertilizer dosage, or severe disease query.',
          },
          escalationCategory: {
            type: Type.STRING,
            description: 'Short category if escalated.',
          },
          escalationReason: {
            type: Type.STRING,
            description: 'Clear English explanation for the agricultural expert queue if escalated.',
          },
          confidenceNote: {
            type: Type.STRING,
            description: 'Transparent note distinguishing verified KB sources (with last verified date) vs general AI explanation.',
          },
        },
        required: [
          'replyText',
          'followUpQuestions',
          'shouldEscalate',
          'escalationCategory',
          'escalationReason',
          'confidenceNote',
        ],
      },
    },
  });

  const rawText = (response.text ?? '{}').trim();
  const parsed = JSON.parse(rawText);

  const finalEscalate = Boolean(parsed.shouldEscalate || safety.isHighRisk);
  const evidenceBasis: AssistantTurnResponse['evidenceBasis'] = finalEscalate
    ? 'safety_escalation'
    : hasVerifiedMatch
      ? 'verified_knowledge_base'
      : 'general_ai_explanation';

  return {
    replyText: parsed.replyText || 'క్షమించండి, దయచేసి మీ ప్రశ్నను మరోసారి అడగండి.',
    followUpQuestions: Array.isArray(parsed.followUpQuestions) ? parsed.followUpQuestions : [],
    shouldEscalate: finalEscalate,
    escalationCategory:
      parsed.escalationCategory ||
      (safety.isHighRisk ? safety.escalationCategory : 'Agronomic Review'),
    escalationReason:
      parsed.escalationReason ||
      safety.escalationReason ||
      (finalEscalate ? 'Flagged for certified agricultural specialist review.' : ''),
    confidenceNote:
      parsed.confidenceNote ||
      (hasVerifiedMatch
        ? 'Grounded in verified AGRISETU Knowledge Base records; does not replace field inspection.'
        : 'General AI explanation (no verified AGRISETU Knowledge Base record matched this query).'),
    evidenceBasis,
    citations: hasVerifiedMatch ? citations : [],
    demoFallback: false,
  };
}

export async function transcribeRegionalTeluguAudio(params: {
  audioBase64: string;
  mimeType: string;
  dialectProfile: string;
  profileShared?: boolean;
  customVocabulary: Array<{ term: string; meaning: string }>;
}): Promise<{ transcript: string; demoFallback: boolean }> {
  const ai = getAiClient();
  const sttModel = process.env.AI_STT_MODEL || 'gemini-3.5-transcribe';

  if (!ai) {
    throw new Error('Demo Mode active: Using browser voice recognition or text input.');
  }

  // Respect farmer AI privacy consent for custom vocabulary hints as well
  const vocabHints =
    params.profileShared === true && params.customVocabulary.length > 0
      ? params.customVocabulary.map((v) => `${v.term} (${v.meaning})`).join(', ')
      : '';

  const dialectLabel =
    params.profileShared === true && params.dialectProfile === 'godavari_delta'
      ? 'Godavari regional Telugu (Konaseema/Godavari agricultural terms)'
      : 'Telugu and English agricultural speech';

  const response = await ai.models.generateContent({
    model: sttModel,
    contents: {
      parts: [
        {
          inlineData: {
            mimeType: params.mimeType || 'audio/webm',
            data: params.audioBase64,
          },
        },
        {
          text: `Transcribe this spoken farmer audio accurately (${dialectLabel}). Regional vocabulary hints: ${vocabHints || 'వరి, చేను, బోదె, దోమపోటు, లంక భూమి, గెల, పసుపు, ఎరువు, PM-KISAN'}. Output ONLY the exact transcribed speech text without commentary.`,
        },
      ],
    },
  });

  return {
    transcript: (response.text ?? '').trim(),
    demoFallback: false,
  };
}

export async function synthesizeTeluguSpeech(params: {
  text: string;
  language: 'te' | 'en';
}): Promise<{ audioBase64: string | null; mimeType: string; demoFallback: boolean }> {
  const ai = getAiClient();
  const ttsModel = process.env.AI_TTS_MODEL || 'gemini-3.8-flash-lite-tts';

  if (!ai) {
    return { audioBase64: null, mimeType: 'audio/wav', demoFallback: true };
  }

  const response = await ai.models.generateContent({
    model: ttsModel,
    contents: [
      {
        role: 'user',
        parts: [
          {
            text: params.text,
            speechMetadata: {
              style:
                params.language === 'te'
                  ? 'Warm, patient, clear Telugu agricultural advisor'
                  : 'Warm, clear, approachable agricultural advisor',
            },
          },
        ],
      },
    ],
    config: {
      responseModalities: ['AUDIO'],
      speechConfig: {
        voiceConfig: {
          prebuiltVoiceConfig: { voiceName: 'Kore' },
        },
      },
    },
  });

  const base64Audio =
    response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data || null;

  return {
    audioBase64: base64Audio,
    mimeType: 'audio/wav',
    demoFallback: !base64Audio,
  };
}
