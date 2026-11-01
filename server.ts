import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import * as dotenv from 'dotenv';
import { createServer as createViteServer } from 'vite';
import {
  requireAuth,
  resolvePilotSession,
  type AuthRequest,
} from './src/middleware/auth.ts';
import { ensureDemoSeedData } from './src/db/seed.ts';
import {
  getOrCreateAuthUser,
  getFullBootstrapState,
  updateFarmerProfileAndFarm,
  toggleFarmerSavedKnowledge,
  updateFarmerVocabulary,
  toggleMerchantSavedListing,
  createProduceListing,
  createMerchantDemandRecord,
  createPurchaseEnquiryRecord,
  updatePurchaseEnquiryStatus,
  createFarmerOfferRecord,
  updateFarmerOfferStatus,
  updateOrderRecordStatus,
  saveConversationTurn,
  createManualEscalationRecord,
  updateEscalationResolution,
  upsertKnowledgeDocument,
  upsertSchemeRecord,
  createHarvestAndRoutes,
  selectAgriRouteDestination,
  createSupplyProductEnquiryNotification,
  markNotificationRead,
  markAllNotificationsReadForRole,
} from './src/db/repository.ts';
import { evaluateCropSuitability } from './src/services/cropSuitabilityEngine.ts';
import { evaluateAgriRouteDestinations } from './src/services/agrirouteEngine.ts';
import {
  getAiRuntimeStatus,
  generateAgriculturalGuidance,
  transcribeRegionalTeluguAudio,
  synthesizeTeluguSpeech,
} from './src/services/aiService.ts';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.disable('x-powered-by');

  // Block any HTTP access to .env files, hidden dotfiles, config files, and server-only modules
  app.use((req, res, next) => {
    const reqPath = decodeURIComponent(req.path || '').toLowerCase();
    const isViteInternal =
      reqPath.startsWith('/@vite') ||
      reqPath.startsWith('/@react-refresh') ||
      reqPath.startsWith('/@id/') ||
      reqPath.startsWith('/node_modules/.vite/');

    if (!isViteInternal) {
      const blocked =
        reqPath.includes('.env') ||
        /(^|\/)\.(?!well-known)/.test(reqPath) ||
        reqPath === '/server.ts' ||
        reqPath === '/package.json' ||
        reqPath === '/bun.lock' ||
        reqPath === '/tsconfig.json' ||
        reqPath === '/vite.config.ts' ||
        (reqPath === '/firebase-applet-config.json' && !('import' in req.query)) ||
        reqPath.startsWith('/src/db') ||
        reqPath.startsWith('/src/services') ||
        reqPath.startsWith('/src/middleware') ||
        reqPath === '/src/lib/firebase-admin.ts';

      if (blocked) {
        return res.status(404).end();
      }
    }
    next();
  });

  app.use(express.json({ limit: '15mb' }));

  // Sync verified Firebase user on Google login
  app.post('/api/auth/sync', requireAuth, async (req: AuthRequest, res) => {
    try {
      await ensureDemoSeedData();
      const uid = req.user!.uid;
      const email = req.user!.email || `${uid}@firebase.user`;
      const name = req.user!.name || email.split('@')[0];
      const dbUser = await getOrCreateAuthUser(uid, email, name);
      res.json({ user: dbUser });
    } catch (error: any) {
      console.error('Auth sync error:', error);
      res.status(500).json({ error: error.message || 'Failed to sync user account.' });
    }
  });

  // Bootstrap connected platform data + AI runtime configuration boundary
  app.get('/api/bootstrap', resolvePilotSession, async (req: AuthRequest, res) => {
    try {
      await ensureDemoSeedData();
      let currentUserRecord = null;
      if (req.user) {
        currentUserRecord = await getOrCreateAuthUser(
          req.user.uid,
          req.user.email || `${req.user.uid}@firebase.user`,
          req.user.name
        );
      }
      const state = await getFullBootstrapState();
      res.json({
        ...state,
        currentUser: currentUserRecord,
        aiRuntime: getAiRuntimeStatus(),
      });
    } catch (error: any) {
      console.error('Bootstrap error:', error);
      res.status(500).json({ error: error.message || 'Failed to load AGRISETU data.' });
    }
  });

  // Update farmer profile, farm details, soil, crops, and consent settings
  app.put('/api/farmers/:id', resolvePilotSession, async (req: AuthRequest, res) => {
    try {
      const farmerId = Number(req.params.id);
      if (Number.isNaN(farmerId)) {
        return res.status(400).json({ error: 'Invalid farmer ID.' });
      }
      if (!req.body.name || !req.body.village || !req.body.district) {
        return res.status(400).json({ error: 'Name, village, and district are required.' });
      }
      await updateFarmerProfileAndFarm(farmerId, req.body);
      const state = await getFullBootstrapState();
      res.json(state);
    } catch (error: any) {
      console.error('Update farmer error:', error);
      res.status(500).json({ error: error.message || 'Failed to update farmer profile.' });
    }
  });

  app.post('/api/farmers/:id/toggle-knowledge', resolvePilotSession, async (req: AuthRequest, res) => {
    try {
      const farmerId = Number(req.params.id);
      const knowledgeId = Number(req.body.knowledgeId);
      const savedIds = await toggleFarmerSavedKnowledge(farmerId, knowledgeId);
      res.json({ savedKnowledgeIds: savedIds });
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'Failed to save knowledge item.' });
    }
  });

  app.put('/api/farmers/:id/vocabulary', resolvePilotSession, async (req: AuthRequest, res) => {
    try {
      const farmerId = Number(req.params.id);
      if (!Array.isArray(req.body.vocabulary)) {
        return res.status(400).json({ error: 'Vocabulary array required.' });
      }
      await updateFarmerVocabulary(farmerId, req.body.vocabulary);
      const state = await getFullBootstrapState();
      res.json(state);
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'Failed to update regional vocabulary.' });
    }
  });

  // Soil-to-Crop Decision Support evaluation
  app.post('/api/farmers/:id/crop-suitability', resolvePilotSession, async (req: AuthRequest, res) => {
    try {
      const farmerId = Number(req.params.id);
      const state = await getFullBootstrapState();
      const farmer = state.farmers.find((f) => f.id === farmerId);
      if (!farmer) {
        return res.status(404).json({ error: 'Farmer profile not found.' });
      }

      const overrides = req.body || {};
      const result = evaluateCropSuitability({
        district: overrides.district || farmer.district,
        region: overrides.region || farmer.region,
        soilType: overrides.soilType || farmer.latestSoil?.soilType || 'Alluvial Loam',
        phLevel: overrides.phLevel ?? farmer.latestSoil?.phLevel,
        salinityNote: overrides.salinityNote ?? farmer.latestSoil?.salinityNote,
        isVerifiedLabTest: Boolean(farmer.latestSoil?.isVerifiedLabTest),
        farmAreaAcres: overrides.farmAreaAcres || farmer.farmDetails?.farmAreaAcres || '2.0',
        irrigationType: overrides.irrigationType || farmer.farmDetails?.irrigationType || 'Canal',
        waterAvailability:
          overrides.waterAvailability || farmer.farmDetails?.waterAvailability || 'Seasonal',
        previousCrop: overrides.previousCrop || farmer.previousCrop,
        climateZone: overrides.climateZone || farmer.farmDetails?.climateZone || 'Coastal Delta',
        preferences: overrides.preferences ?? farmer.farmDetails?.cropInterests,
        constraints: overrides.constraints ?? farmer.farmDetails?.constraints,
        activeDemands: state.demands
          .filter((d) => d.demandStatus === 'Open')
          .map((d) => ({
            cropName: d.cropName,
            quantityRequiredQuintals: d.quantityRequiredQuintals,
            offeredPriceRange: d.offeredPriceRange,
            buyerType: d.buyerType,
          })),
      });

      res.json(result);
    } catch (error: any) {
      console.error('Crop suitability error:', error);
      res.status(500).json({ error: error.message || 'Failed to evaluate crop suitability.' });
    }
  });

  // AI Farmer Assistant Chat + RAG + Responsible Escalation
  app.post('/api/ai/chat', resolvePilotSession, async (req: AuthRequest, res) => {
    try {
      const {
        farmerId,
        conversationId,
        question,
        responseLanguage = 'te',
        transcribedFromVoice = false,
        dialectOverride,
      } = req.body;

      if (!question || typeof question !== 'string' || !question.trim()) {
        return res.status(400).json({ error: 'Please provide a question.' });
      }

      const state = await getFullBootstrapState();
      const farmer = state.farmers.find((f) => f.id === Number(farmerId)) || state.farmers[0];
      if (!farmer) {
        return res.status(404).json({ error: 'Farmer profile not found.' });
      }

      const shareWithAi = farmer.consent?.shareProfileWithAi ?? true;
      const shareWithExperts = farmer.consent?.shareConversationWithExperts ?? true;

      // RAG Retrieval: Score non-outdated knowledge documents & relevant schemes
      const qTokens = question
        .toLowerCase()
        .split(/[\s,?.!]+/)
        .filter((w) => w.length > 2);

      const scoredKnowledge = state.knowledge
        .filter((k) => !k.isOutdated)
        .map((k) => {
          const hay = `${k.category} ${k.title} ${k.titleTe || ''} ${k.summary} ${k.content} ${k.applicableCrops || ''} ${k.applicableRegions}`.toLowerCase();
          let score = 0;
          for (const tok of qTokens) {
            if (hay.includes(tok)) score += 3;
          }
          if (
            shareWithAi &&
            farmer.currentCrop &&
            hay.includes(farmer.currentCrop.split(' ')[0].toLowerCase())
          ) {
            score += 2;
          }
          if (shareWithAi && hay.includes(farmer.district.toLowerCase())) {
            score += 1;
          }
          return { doc: k, score };
        })
        .sort((a, b) => b.score - a.score)
        .slice(0, 4)
        .map((x) => x.doc);

      const scoredSchemes = state.schemes
        .filter((s) => !s.isOutdated)
        .map((s) => {
          const hay = `${s.schemeCode} ${s.schemeName} ${s.schemeNameTe || ''} ${s.purpose} ${s.applicableState}`.toLowerCase();
          let score = 0;
          for (const tok of qTokens) {
            if (hay.includes(tok)) score += 4;
          }
          if (
            question.toLowerCase().includes('scheme') ||
            question.toLowerCase().includes('పథక') ||
            question.toLowerCase().includes('సబ్సిడీ') ||
            question.toLowerCase().includes('భీమా') ||
            question.toLowerCase().includes('లోన్') ||
            question.toLowerCase().includes('loan')
          ) {
            score += 2;
          }
          return { scheme: s, score };
        })
        .filter((x) => x.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, 3)
        .map((x) => x.scheme);

      const existingConv = conversationId
        ? state.conversations.find((c) => c.id === Number(conversationId))
        : null;

      let customVocab: Array<{ term: string; meaning: string }> = [];
      try {
        customVocab = JSON.parse(farmer.customVocabularyJson || '[]');
      } catch {
        customVocab = [];
      }

      const activeDialect = dialectOverride || farmer.dialectProfile || 'kakinada_coastal';

      const aiResult = await generateAgriculturalGuidance({
        question: question.trim(),
        responseLanguage: responseLanguage === 'en' ? 'en' : 'te',
        farmerContext: {
          profileShared: shareWithAi,
          name: farmer.name,
          village: farmer.village,
          mandal: farmer.mandal,
          district: farmer.district,
          region: farmer.region,
          preferredLanguage: farmer.preferredLanguage,
          dialectProfile: activeDialect,
          farmAreaAcres: farmer.farmDetails?.farmAreaAcres,
          soilType: farmer.latestSoil?.soilType,
          phLevel: farmer.latestSoil?.phLevel,
          salinityNote: farmer.latestSoil?.salinityNote,
          irrigationType: farmer.farmDetails?.irrigationType,
          previousCrop: farmer.previousCrop,
          currentCrop: farmer.currentCrop,
          customVocabulary: customVocab,
        },
        history: (existingConv?.messages || []).map((m) => ({
          sender: m.sender,
          messageText: m.messageText,
        })),
        knowledgeDocs: scoredKnowledge,
        schemes: scoredSchemes,
      });

      const expertContextString = shareWithExperts
        ? `Farmer: ${farmer.name} (${farmer.farmerCode}), ${farmer.village}, ${farmer.district}. Crop: ${farmer.currentCrop}. Soil: ${farmer.latestSoil?.soilType || 'N/A'}.`
        : `Farmer (${farmer.farmerCode}) withheld full conversation context sharing; review question standalone.`;

      const savedConvId = await saveConversationTurn({
        conversationId: existingConv?.id || null,
        farmerId: farmer.id,
        title: question.trim(),
        language: responseLanguage,
        dialectProfile: activeDialect,
        mode: transcribedFromVoice ? 'voice_call' : 'text_chat',
        questionText: question.trim(),
        transcribedFromVoice: Boolean(transcribedFromVoice),
        replyText: aiResult.replyText,
        citationsJson: JSON.stringify(aiResult.citations),
        confidenceNote: aiResult.confidenceNote,
        shouldEscalate: aiResult.shouldEscalate,
        escalationCategory: aiResult.escalationCategory,
        escalationReason: aiResult.escalationReason,
        conversationContextForExpert: expertContextString,
      });

      const updatedState = await getFullBootstrapState();
      res.json({
        conversationId: savedConvId,
        turn: aiResult,
        state: updatedState,
      });
    } catch (error: any) {
      console.error('AI chat error:', error);
      res.status(500).json({
        error:
          error.message ||
          'Unable to generate agricultural guidance right now. Please try again.',
      });
    }
  });

  // Server-side Telugu Audio Transcription (Gemini 3.5 Transcribe)
  app.post('/api/ai/transcribe', resolvePilotSession, async (req: AuthRequest, res) => {
    try {
      const { audioBase64, mimeType, dialectProfile, farmerId } = req.body;
      if (!audioBase64) {
        return res.status(400).json({ error: 'Audio data is required for transcription.' });
      }

      const state = await getFullBootstrapState();
      const farmer = state.farmers.find((f) => f.id === Number(farmerId));
      let customVocabulary: Array<{ term: string; meaning: string }> = [];
      try {
        customVocabulary = JSON.parse(farmer?.customVocabularyJson || '[]');
      } catch {
        customVocabulary = [];
      }

      const result = await transcribeRegionalTeluguAudio({
        audioBase64,
        mimeType: mimeType || 'audio/webm',
        dialectProfile: dialectProfile || farmer?.dialectProfile || 'kakinada_coastal',
        customVocabulary,
      });

      res.json(result);
    } catch (error: any) {
      console.error('Audio transcription error:', error);
      res.status(500).json({
        error: error.message || 'Audio transcription failed.',
      });
    }
  });

  // Server-side Telugu Text-to-Speech (Gemini 3.8 Flash Lite TTS)
  app.post('/api/ai/tts', resolvePilotSession, async (req: AuthRequest, res) => {
    try {
      const { text, language = 'te' } = req.body;
      if (!text || typeof text !== 'string') {
        return res.status(400).json({ error: 'Text is required for speech synthesis.' });
      }
      const result = await synthesizeTeluguSpeech({
        text: text.slice(0, 1400),
        language: language === 'en' ? 'en' : 'te',
      });
      res.json(result);
    } catch (error: any) {
      console.error('TTS error:', error);
      res.status(500).json({ error: error.message || 'Speech synthesis failed.' });
    }
  });

  // Produce Listings
  app.post('/api/listings', resolvePilotSession, async (req: AuthRequest, res) => {
    try {
      const { farmerId, cropName, quantityQuintals, expectedHarvestDate, qualityGrade } = req.body;
      if (!farmerId || !cropName || !quantityQuintals || !expectedHarvestDate || !qualityGrade) {
        return res.status(400).json({ error: 'Crop, quantity, harvest date, and quality are required.' });
      }
      await createProduceListing(req.body);
      const state = await getFullBootstrapState();
      res.json(state);
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'Failed to publish produce listing.' });
    }
  });

  app.post('/api/merchants/:id/toggle-save-listing', resolvePilotSession, async (req: AuthRequest, res) => {
    try {
      const merchantId = Number(req.params.id);
      const listingId = Number(req.body.listingId);
      const savedIds = await toggleMerchantSavedListing(merchantId, listingId);
      res.json({ savedListingIds: savedIds });
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'Failed to update saved listings.' });
    }
  });

  // Merchant Procurement Demand
  app.post('/api/demands', resolvePilotSession, async (req: AuthRequest, res) => {
    try {
      const { merchantId, cropName, quantityRequiredQuintals, qualitySpecifications, procurementPeriod, deliveryLocation } =
        req.body;
      if (!merchantId || !cropName || !quantityRequiredQuintals || !qualitySpecifications || !procurementPeriod || !deliveryLocation) {
        return res.status(400).json({ error: 'Please complete all required procurement fields.' });
      }
      await createMerchantDemandRecord(req.body);
      const state = await getFullBootstrapState();
      res.json(state);
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'Failed to publish procurement requirement.' });
    }
  });

  // Purchase Enquiries (Merchant -> Farmer Listing)
  app.post('/api/enquiries', resolvePilotSession, async (req: AuthRequest, res) => {
    try {
      const { listingId, merchantId, farmerId, requiredQuantityQuintals, proposedPricePerQuintal, procurementDate } =
        req.body;
      if (!listingId || !merchantId || !farmerId || !requiredQuantityQuintals || !proposedPricePerQuintal || !procurementDate) {
        return res.status(400).json({ error: 'Quantity, proposed price, and procurement date are required.' });
      }
      await createPurchaseEnquiryRecord(req.body);
      const state = await getFullBootstrapState();
      res.json(state);
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'Failed to submit purchase enquiry.' });
    }
  });

  app.patch('/api/enquiries/:id/status', resolvePilotSession, async (req: AuthRequest, res) => {
    try {
      const enquiryId = Number(req.params.id);
      const { status } = req.body;
      if (!status) return res.status(400).json({ error: 'Status is required.' });
      await updatePurchaseEnquiryStatus(enquiryId, status);
      const state = await getFullBootstrapState();
      res.json(state);
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'Failed to update enquiry status.' });
    }
  });

  // Farmer Offers (Farmer -> Merchant Demand)
  app.post('/api/offers', resolvePilotSession, async (req: AuthRequest, res) => {
    try {
      const { demandId, farmerId, merchantId, quantityOfferedQuintals, expectedPricePerQuintal, expectedHarvestDate } =
        req.body;
      if (!demandId || !farmerId || !merchantId || !quantityOfferedQuintals || !expectedPricePerQuintal || !expectedHarvestDate) {
        return res.status(400).json({ error: 'Quantity, expected price, and harvest date are required.' });
      }
      await createFarmerOfferRecord(req.body);
      const state = await getFullBootstrapState();
      res.json(state);
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'Failed to submit offer.' });
    }
  });

  app.patch('/api/offers/:id/status', resolvePilotSession, async (req: AuthRequest, res) => {
    try {
      const offerId = Number(req.params.id);
      const { status } = req.body;
      if (!status) return res.status(400).json({ error: 'Status is required.' });
      await updateFarmerOfferStatus(offerId, status);
      const state = await getFullBootstrapState();
      res.json(state);
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'Failed to update offer status.' });
    }
  });

  // Order Status & Farmer Feedback
  app.patch('/api/orders/:id/status', resolvePilotSession, async (req: AuthRequest, res) => {
    try {
      const orderId = Number(req.params.id);
      const { orderStatus, farmerFeedback } = req.body;
      if (!orderStatus) return res.status(400).json({ error: 'Order status is required.' });
      await updateOrderRecordStatus(orderId, orderStatus, farmerFeedback);
      const state = await getFullBootstrapState();
      res.json(state);
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'Failed to update order status.' });
    }
  });

  // Agricultural Supply Product Enquiry
  app.post('/api/supplies/enquiry', resolvePilotSession, async (req: AuthRequest, res) => {
    try {
      const { farmerId, productName, supplierName, quantityNote } = req.body;
      if (!farmerId || !productName || !supplierName) {
        return res.status(400).json({ error: 'Product and supplier details are required.' });
      }
      await createSupplyProductEnquiryNotification({
        farmerId: Number(farmerId),
        productName,
        supplierName,
        quantityNote: quantityNote || 'Standard pack enquiry',
      });
      const state = await getFullBootstrapState();
      res.json(state);
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'Failed to log supply enquiry.' });
    }
  });

  // AGRIROUTE Harvest Input & Destination Comparison
  app.post('/api/agriroute/evaluate', resolvePilotSession, async (req: AuthRequest, res) => {
    try {
      const {
        farmerId,
        cropName,
        quantityHarvestedQuintals,
        harvestDate,
        qualityGrade,
        expectedShelfLifeDays,
        location,
        storageAvailable,
        additionalInfo,
      } = req.body;

      if (!farmerId || !cropName || !quantityHarvestedQuintals || !harvestDate || !qualityGrade) {
        return res.status(400).json({ error: 'Crop, harvested quantity, harvest date, and quality are required.' });
      }

      const state = await getFullBootstrapState();
      const farmer = state.farmers.find((f) => f.id === Number(farmerId));
      const isKakinada = (farmer?.region || location || '').toLowerCase().includes('kakinada');

      const candidateChannels = state.demands.map((d) => ({
        merchantId: d.merchantId,
        destinationName: d.merchantName,
        destinationType: (d.buyerType || 'Wholesaler') as
          | 'Direct Merchant'
          | 'Wholesaler'
          | 'Retail Procurement'
          | 'Food Processing Unit',
        cropWanted: d.cropName,
        maxQuantityQuintals: parseFloat(d.quantityRequiredQuintals) || 50,
        qualitySpecifications: d.qualitySpecifications,
        acceptsCosmeticImperfect: d.acceptsCosmeticImperfect,
        distanceKm: isKakinada ? d.distanceKmFromKakinada : d.distanceKmFromGodavari,
        procurementPeriod: d.procurementPeriod,
        offeredPriceRange: d.offeredPriceRange,
        demandStatus: d.demandStatus,
        isDemo: d.isDemo,
      }));

      const evaluated = evaluateAgriRouteDestinations(
        {
          farmerRegion: farmer?.region || 'Kakinada',
          cropName,
          quantityQuintals: parseFloat(quantityHarvestedQuintals) || 20,
          harvestDate,
          qualityGrade,
          expectedShelfLifeDays: Number(expectedShelfLifeDays) || 7,
          location: location || `${farmer?.village || ''}, ${farmer?.district || ''}`,
          storageAvailable: Boolean(storageAvailable),
          additionalInfo,
        },
        candidateChannels
      );

      const harvestId = await createHarvestAndRoutes(
        {
          farmerId: Number(farmerId),
          cropName,
          quantityHarvestedQuintals: String(quantityHarvestedQuintals),
          harvestDate,
          qualityGrade,
          expectedShelfLifeDays: Number(expectedShelfLifeDays) || 7,
          location: location || `${farmer?.village || ''}, ${farmer?.district || ''}`,
          storageAvailable: Boolean(storageAvailable),
          additionalInfo,
        },
        evaluated
      );

      const updatedState = await getFullBootstrapState();
      res.json({ harvestId, state: updatedState });
    } catch (error: any) {
      console.error('AGRIROUTE evaluate error:', error);
      res.status(500).json({ error: error.message || 'Failed to evaluate AGRIROUTE destinations.' });
    }
  });

  app.post('/api/agriroute/select', resolvePilotSession, async (req: AuthRequest, res) => {
    try {
      const { recommendationId, harvestId } = req.body;
      if (!recommendationId || !harvestId) {
        return res.status(400).json({ error: 'Recommendation ID and Harvest ID are required.' });
      }
      await selectAgriRouteDestination(Number(recommendationId), Number(harvestId));
      const state = await getFullBootstrapState();
      res.json(state);
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'Failed to select route destination.' });
    }
  });

  // Expert Escalations & Coordinator Management
  app.post('/api/escalations', resolvePilotSession, async (req: AuthRequest, res) => {
    try {
      const { farmerId, questionText, category, conversationContext, escalationReason } = req.body;
      if (!farmerId || !questionText) {
        return res.status(400).json({ error: 'Farmer ID and question details are required.' });
      }
      await createManualEscalationRecord({
        farmerId: Number(farmerId),
        questionText,
        category: category || 'Crop Suitability Review',
        conversationContext: conversationContext || '',
        escalationReason: escalationReason || 'Farmer requested human agricultural expert review.',
      });
      const state = await getFullBootstrapState();
      res.json(state);
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'Failed to submit escalation request.' });
    }
  });

  app.patch('/api/escalations/:id', resolvePilotSession, async (req: AuthRequest, res) => {
    try {
      const escalationId = Number(req.params.id);
      const { status, assignedExpert, resolutionNotes } = req.body;
      await updateEscalationResolution(escalationId, {
        status: status || 'Resolved',
        assignedExpert: assignedExpert || 'Agronomy Coordinator',
        resolutionNotes: resolutionNotes || '',
      });
      const state = await getFullBootstrapState();
      res.json(state);
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'Failed to update escalation case.' });
    }
  });

  app.post('/api/coordinator/knowledge', resolvePilotSession, async (req: AuthRequest, res) => {
    try {
      const { category, title, summary, content, sourceName, lastVerifiedDate } = req.body;
      if (!category || !title || !summary || !content || !sourceName || !lastVerifiedDate) {
        return res.status(400).json({ error: 'Category, title, summary, content, source, and verification date are required.' });
      }
      await upsertKnowledgeDocument(req.body);
      const state = await getFullBootstrapState();
      res.json(state);
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'Failed to save knowledge document.' });
    }
  });

  app.post('/api/coordinator/schemes', resolvePilotSession, async (req: AuthRequest, res) => {
    try {
      const { schemeCode, schemeName, purpose, officialPortal, officialSource, lastVerifiedDate } =
        req.body;
      if (!schemeCode || !schemeName || !purpose || !officialPortal || !officialSource || !lastVerifiedDate) {
        return res.status(400).json({ error: 'Scheme code, name, purpose, official portal, source, and verification date are required.' });
      }
      await upsertSchemeRecord(req.body);
      const state = await getFullBootstrapState();
      res.json(state);
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'Failed to save government scheme record.' });
    }
  });

  // Notifications
  app.patch('/api/notifications/:id/read', resolvePilotSession, async (req: AuthRequest, res) => {
    try {
      await markNotificationRead(Number(req.params.id));
      const state = await getFullBootstrapState();
      res.json(state);
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'Failed to mark notification read.' });
    }
  });

  app.post('/api/notifications/read-all', resolvePilotSession, async (req: AuthRequest, res) => {
    try {
      const { role, farmerId, merchantId } = req.body;
      await markAllNotificationsReadForRole(role || 'farmer', farmerId, merchantId);
      const state = await getFullBootstrapState();
      res.json(state);
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'Failed to mark notifications read.' });
    }
  });

  // Vite middleware for development vs static dist for production
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(__dirname, 'dist');
    app.use(express.static(distPath, { dotfiles: 'deny' }));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`AGRISETU full-stack server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
