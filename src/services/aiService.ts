import { GoogleGenAI, Type } from '@google/genai';

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
    textModel: process.env.AI_TEXT_MODEL || 'gemini-3.8-flash',
    sttModel: process.env.AI_STT_MODEL || 'gemini-3.5-transcribe',
    ttsModel: process.env.AI_TTS_MODEL || 'gemini-3.8-flash-lite-tts',
    modeLabel: configured
      ? 'Live Server-Side Gemini AI + PostgreSQL RAG'
      : 'Demo Mode (Rule-Based PostgreSQL RAG Fallback — Configure GEMINI_API_KEY in Secrets for Live AI/Voice)',
  };
};

export interface FarmerContextForAi {
  profileShared: boolean;
  name: string;
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
  citations: Array<{
    type: 'knowledge' | 'scheme';
    idOrCode: string;
    title: string;
    source: string;
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

  const citations = [
    ...params.knowledgeDocs.slice(0, 3).map((k) => ({
      type: 'knowledge' as const,
      idOrCode: String(k.id),
      title: k.title,
      source: `${k.sourceName} (Verified: ${k.lastVerifiedDate})`,
      verifiedStatus: k.verificationStatus,
    })),
    ...params.schemes.slice(0, 2).map((s) => ({
      type: 'scheme' as const,
      idOrCode: s.schemeCode,
      title: s.schemeName,
      source: `${s.officialPortal} (${s.verificationStatus}, ${s.lastVerifiedDate})`,
      verifiedStatus: s.verificationStatus,
    })),
  ];

  // Responsible high-risk keyword detection (chemical dosage, acute toxicity, severe unknown blight)
  const qLower = params.question.toLowerCase();
  const highRiskTrigger =
    qLower.includes('dosage') ||
    qLower.includes('ml per litre') ||
    qLower.includes('chemical spray') ||
    qLower.includes('poison') ||
    qLower.includes('monocrotophos') ||
    qLower.includes('పురుగుమందు మోతాదు') ||
    qLower.includes('కెమికల్ మోతాదు');

  if (!ai) {
    // Transparent Demo RAG Fallback when GEMINI_API_KEY is unconfigured
    const topDoc = params.knowledgeDocs[0];
    const topScheme = params.schemes[0];
    const isTelugu = params.responseLanguage === 'te';

    let replyText = '';
    if (highRiskTrigger) {
      replyText = isTelugu
        ? `నమస్కారం ${params.farmerContext.name} గారు. పురుగుమందుల ఖచ్చితమైన మోతాదు లేదా తీవ్రమైన తెగులు నిర్ధారణ విషయంలో పొరపాటు జరగకూడదు కాబట్టి, నేను అంచనాతో మందుల మోతాదు చెప్పను. మీ ప్రశ్నను వెంటనే వ్యవసాయ నిపుణుల (Agricultural Expert) పరిశీలనకు పంపాను. ఆలోపు పొలంలో నీటి ముంపు లేకుండా చూసి, ప్రభావితమైన మొక్కల ఫోటో లేదా లక్షణాలను రైతు సేవా కేంద్రం అధికారికి చూపించండి.`
        : `Hello ${params.farmerContext.name}. Because chemical pesticide dosages and acute disease diagnosis carry crop and safety risks, AGRISETU does not guess dosages. Your query has been escalated to an Agricultural Expert. Meanwhile, inspect field drainage and share symptom details with your Mandal Agricultural Officer.`;
    } else if (topScheme && (qLower.includes('scheme') || qLower.includes('kisan') || qLower.includes('పథకం') || qLower.includes('సబ్సిడీ') || qLower.includes('భీమా'))) {
      replyText = isTelugu
        ? `నమస్కారం ${params.farmerContext.name} గారు. మీ ప్రాంతానికి సంబంధించిన పథకం వివరాలు: ${topScheme.schemeName} (${topScheme.verificationStatus}). ప్రయోజనం: ${topScheme.benefits}. అర్హత: ${topScheme.eligibilityConditions}. అధికారిక పోర్టల్: ${topScheme.officialPortal}. దయచేసి దరఖాస్తు చేసే ముందు మీ గ్రామ రైతు సేవా కేంద్రంలో తాజా గడువు తేదీలను నిర్ధారించుకోండి.`
        : `Hello ${params.farmerContext.name}. Relevant scheme from our verified catalogue: ${topScheme.schemeName} (${topScheme.verificationStatus}). Benefits: ${topScheme.benefits}. Eligibility: ${topScheme.eligibilityConditions}. Official Portal: ${topScheme.officialPortal}. Always verify current seasonal deadlines at your local Rythu Seva Kendra.`;
    } else if (topDoc) {
      replyText = isTelugu
        ? `నమస్కారం ${params.farmerContext.name} గారు. ${params.farmerContext.profileShared ? `మీ ${params.farmerContext.district} ప్రాంతం (${params.farmerContext.soilType}, ప్రస్తుత పంట: ${params.farmerContext.currentCrop}) ఆధారంగా: ` : ''}${topDoc.summary} ఆధారం: ${topDoc.sourceName}. మీ పొలంలో ఈ లక్షణాలు ఎన్ని రోజులుగా కనిపిస్తున్నాయి మరియు ఇటీవల ఏదైనా ఎరువు వేశారా?`
        : `Hello ${params.farmerContext.name}. ${params.farmerContext.profileShared ? `Based on your consented profile in ${params.farmerContext.district} (${params.farmerContext.soilType}, crop: ${params.farmerContext.currentCrop}): ` : ''}${topDoc.content} (Source: ${topDoc.sourceName}). To guide you better, how many days ago did you notice this condition, and what was your last irrigation or fertiliser application?`;
    } else {
      replyText = isTelugu
        ? `నమస్కారం ${params.farmerContext.name} గారు. మీ ప్రశ్నను అర్థం చేసుకున్నాను. మరింత ఖచ్చితమైన సూచన కోసం మీ పంట వయస్సు (విత్తిన ఎన్ని రోజులు అయింది), నేల తేమ పరిస్థితి మరియు లక్షణాలు ఆకులపై ఎలా ఉన్నాయో తెలియజేయగలరా?`
        : `Hello ${params.farmerContext.name}. Could you share your current crop stage (days after sowing/planting) and recent field moisture condition so I can provide grounded guidance?`;
    }

    return {
      replyText,
      followUpQuestions: isTelugu
        ? [
            'మీ పంట విత్తిన/నాటిన తర్వాత ఎన్ని రోజులు అయింది?',
            'గత వారం రోజుల్లో వర్షం పడిందా లేదా ఏదైనా ఎరువు వేశారా?',
          ]
        : [
            'How many days has it been since sowing or transplanting?',
            'Have you applied any fertiliser or experienced heavy rain in the past 7 days?',
          ],
      shouldEscalate: highRiskTrigger,
      escalationCategory: highRiskTrigger ? 'Pest & Chemical Safety' : 'General Advisory',
      escalationReason: highRiskTrigger
        ? 'Farmer requested chemical dosage / high-risk pest intervention requiring certified agronomist review.'
        : '',
      confidenceNote:
        'Demo Mode (Rule-Based RAG Fallback): Generated from AGRISETU PostgreSQL knowledge base because GEMINI_API_KEY is not active.',
      citations,
      demoFallback: true,
    };
  }

  const dialectInstruction =
    DIALECT_GUIDANCE[params.farmerContext.dialectProfile] || DIALECT_GUIDANCE.kakinada_coastal;

  const customVocabText =
    params.farmerContext.customVocabulary.length > 0
      ? params.farmerContext.customVocabulary
          .map((v) => `- "${v.term}": ${v.meaning}`)
          .join('\n')
      : 'None added yet.';

  const farmerProfileBlock = params.farmerContext.profileShared
    ? `CONSENTED FARMER PROFILE:
- Name: ${params.farmerContext.name}
- Location: ${params.farmerContext.village}, ${params.farmerContext.mandal} Mandal, ${params.farmerContext.district} (${params.farmerContext.region})
- Farm Size: ${params.farmerContext.farmAreaAcres} acres
- Soil: ${params.farmerContext.soilType} (pH: ${params.farmerContext.phLevel || 'Not tested'}, Salinity: ${params.farmerContext.salinityNote || 'Unknown'})
- Irrigation: ${params.farmerContext.irrigationType}
- Previous Crop: ${params.farmerContext.previousCrop || 'Not recorded'}
- Current Crop: ${params.farmerContext.currentCrop || 'Not recorded'}`
    : `FARMER CONSENT NOTICE: Farmer ${params.farmerContext.name} has disabled AI profile sharing. Do NOT assume soil, location, or crop details unless stated in the message—politely ask for them if needed.`;

  const ragKnowledgeBlock =
    params.knowledgeDocs.length > 0
      ? params.knowledgeDocs
          .map(
            (k) =>
              `[Knowledge #${k.id} | ${k.category} | Source: ${k.sourceName} | Status: ${k.verificationStatus} (${k.lastVerifiedDate})]\nTitle: ${k.title}\nContent: ${k.content}`
          )
          .join('\n\n')
      : 'No exact knowledge document matched; rely strictly on safe general agronomic principles and ask clarifying questions.';

  const ragSchemeBlock =
    params.schemes.length > 0
      ? params.schemes
          .map(
            (s) =>
              `[Scheme ${s.schemeCode} | ${s.schemeName} | ${s.level} (${s.applicableState}) | Verification: ${s.verificationStatus} (${s.lastVerifiedDate})]\nEligibility: ${s.eligibilityConditions}\nBenefits: ${s.benefits}\nPortal: ${s.officialPortal}`
          )
          .join('\n\n')
      : 'No specific scheme record matched.';

  const historyBlock =
    params.history.length > 0
      ? params.history
          .slice(-6)
          .map((h) => `${h.sender.toUpperCase()}: ${h.messageText}`)
          .join('\n')
      : 'Start of conversation.';

  const systemInstruction = `You are AGRISETU AI Farmer Assistant, a trustworthy, voice-friendly agricultural advisor for farmers in Andhra Pradesh & Telangana.

RESPONSE LANGUAGE REQUIREMENT:
${
  params.responseLanguage === 'te'
    ? `Respond naturally in Telugu script (తెలుగు). ${dialectInstruction} Keep sentences clear, warm, spoken-friendly (for phone call TTS), and explain any technical agricultural term in simple everyday farmer language.`
    : `Respond clearly in simple, accessible English while understanding any regional Telugu agricultural words the farmer uses.`
}

REGIONAL VOCABULARY & PHRASE DICTIONARY:
${customVocabText}

${farmerProfileBlock}

RETRIEVED AGRICULTURAL KNOWLEDGE BASE (RAG):
${ragKnowledgeBlock}

RETRIEVED GOVERNMENT SCHEMES CATALOGUE:
${ragSchemeBlock}

STRICT SAFETY & RESPONSIBLE AI RULES (NON-NEGOTIABLE):
1. NEVER invent exact chemical pesticide dosages, toxic spray mixes, guaranteed crop yields, guaranteed profits, live market prices, or unverified government scheme eligibility/deadlines.
2. If a scheme is marked "Requires Verification", explicitly tell the farmer to verify current availability and deadlines at their local Rythu Seva Kendra or official portal.
3. Ask 1–2 concise follow-up questions when important diagnostic context is missing (e.g., crop age, symptom distribution, soil moisture, recent fertiliser).
4. Set shouldEscalate = true whenever the farmer asks for specific chemical pesticide dosages, describes severe/ambiguous crop disease/pest outbreak, or faces high-risk crop loss decisions, and advise consulting a local Agricultural Officer / KVK specialist.
5. Keep replyText concise (3–6 short spoken-friendly sentences) suitable for reading aloud on a farm call.`;

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
            description: '1 to 2 helpful follow-up questions in the requested language.',
          },
          shouldEscalate: {
            type: Type.BOOLEAN,
            description: 'True if uncertain, high-risk, or chemical dosage / severe disease query.',
          },
          escalationCategory: {
            type: Type.STRING,
            description: 'Short category if escalated, e.g. Pest & Disease Diagnosis, Soil Salinity, Scheme Eligibility.',
          },
          escalationReason: {
            type: Type.STRING,
            description: 'Clear English explanation for the agricultural expert queue if escalated.',
          },
          confidenceNote: {
            type: Type.STRING,
            description: 'Short transparent note on sources used and any uncertainty.',
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

  const finalEscalate = Boolean(parsed.shouldEscalate || highRiskTrigger);

  return {
    replyText: parsed.replyText || 'క్షమించండి, దయచేసి మీ ప్రశ్నను మరోసారి అడగండి.',
    followUpQuestions: Array.isArray(parsed.followUpQuestions) ? parsed.followUpQuestions : [],
    shouldEscalate: finalEscalate,
    escalationCategory: parsed.escalationCategory || 'Agronomic Review',
    escalationReason:
      parsed.escalationReason ||
      (highRiskTrigger ? 'High-risk dosage or pest management query flagged for expert review.' : ''),
    confidenceNote:
      parsed.confidenceNote ||
      'Grounded in AGRISETU Knowledge Base; does not replace field inspection by an Agricultural Officer.',
    citations,
    demoFallback: false,
  };
}

export async function transcribeRegionalTeluguAudio(params: {
  audioBase64: string;
  mimeType: string;
  dialectProfile: string;
  customVocabulary: Array<{ term: string; meaning: string }>;
}): Promise<{ transcript: string; demoFallback: boolean }> {
  const ai = getAiClient();
  const sttModel = process.env.AI_STT_MODEL || 'gemini-3.5-transcribe';

  if (!ai) {
    throw new Error(
      'Server Speech-to-Text requires GEMINI_API_KEY in Settings > Secrets. Use browser voice recognition or text input in Demo Mode.'
    );
  }

  const vocabHints = params.customVocabulary
    .map((v) => `${v.term} (${v.meaning})`)
    .join(', ');

  const dialectLabel =
    params.dialectProfile === 'godavari_delta'
      ? 'Godavari regional Telugu (Konaseema/Godavari agricultural terms)'
      : 'Kakinada coastal Telugu (East Godavari/Kakinada coastal agricultural terms)';

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
          text: `Transcribe this spoken farmer audio accurately. The speaker uses ${dialectLabel}, possibly mixing Telugu and English agricultural words. Regional vocabulary hints: ${vocabHints || 'వరి, చేను, బోదె, దోమపోటు, లంక భూమి, గెల, పసుపు, ఎరువు, PM-KISAN'}. Output ONLY the exact transcribed speech text (in Telugu script for Telugu speech, preserving clear English scheme/crop codes if spoken) without commentary.`,
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
                  ? 'Warm, patient, clear Telugu agricultural advisor speaking on a phone call'
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
