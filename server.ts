import express, { type Response } from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import * as dotenv from 'dotenv';
import { createServer as createViteServer } from 'vite';
import {
  isDemoModeEnabled,
  issueDemoSessionToken,
  requireAuth,
  requireAuthenticatedActor,
  requireRole,
  type AuthRequest,
} from './src/middleware/auth.ts';
import { ensureDemoSeedData } from './src/db/seed.ts';
import {
  ValidationError,
  ForbiddenError,
  NotFoundError,
  assertFarmerOwnership,
  resolveConsentFlags,
  getOrCreateAuthUser,
  resolveDemoPersonaForSession,
  getScopedBootstrapState,
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
  deleteFarmerConversation,
  deleteAllFarmerConversations,
  createManualEscalationRecord,
  updateEscalationResolution,
  upsertKnowledgeDocument,
  upsertSchemeRecord,
  createHarvestAndRoutes,
  selectAgriRouteDestination,
  createSupplyProductEnquiryNotification,
  markNotificationRead,
  markAllNotificationsReadForActor,
} from './src/db/repository.ts';
import { evaluateCropSuitability } from './src/services/cropSuitabilityEngine.ts';
import {
  evaluateAgriRouteDestinations,
  inspectAgriRouteInputs,
} from './src/services/agrirouteEngine.ts';
import {
  retrieveRelevantKnowledge,
  retrieveRelevantSchemes,
} from './src/services/knowledgeRetrieval.ts';
import {
  getAiRuntimeStatus,
  generateAgriculturalGuidance,
  transcribeRegionalTeluguAudio,
  synthesizeTeluguSpeech,
} from './src/services/aiService.ts';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function handleRouteError(res: Response, error: unknown, fallbackMessage: string) {
  if (error instanceof ValidationError) {
    return res.status(400).json({ error: error.message });
  }
  if (error instanceof ForbiddenError) {
    return res.status(403).json({ error: error.message });
  }
  if (error instanceof NotFoundError) {
    return res.status(404).json({ error: error.message });
  }
  const message = error instanceof Error ? error.message : fallbackMessage;
  return res.status(500).json({ error: message || fallbackMessage });
}

export function createApiApp() {
  const app = express();

  app.disable('x-powered-by');

  // Block HTTP access to .env files, hidden dotfiles, config files, and server-only modules
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
        reqPath.startsWith('/tests') ||
        reqPath === '/src/lib/firebase-admin.ts';

      if (blocked) {
        return res.status(404).end();
      }
    }
    next();
  });

  app.use(express.json({ limit: '15mb' }));

  // Controlled Demo Persona Session Endpoint (strictly disabled in production)
  app.post('/api/auth/demo-session', async (req, res) => {
    if (!isDemoModeEnabled()) {
      return res.status(403).json({
        error: 'Demo authentication is disabled in this environment. Sign in with Firebase.',
      });
    }
    try {
      await ensureDemoSeedData();
      const role = req.body?.role;
      if (role !== 'farmer' && role !== 'merchant' && role !== 'coordinator') {
        return res.status(400).json({ error: 'Valid demo role is required.' });
      }
      const actor = await resolveDemoPersonaForSession({
        role,
        farmerId: req.body?.farmerId !== undefined ? Number(req.body.farmerId) : undefined,
        merchantId: req.body?.merchantId !== undefined ? Number(req.body.merchantId) : undefined,
      });
      const token = issueDemoSessionToken(actor.uid);
      return res.json({
        token,
        actor: {
          role: actor.role,
          farmerId: actor.farmerId,
          merchantId: actor.merchantId,
          displayName: actor.displayName,
          isDemo: true,
        },
      });
    } catch (error) {
      return handleRouteError(res, error, 'Failed to establish demo session.');
    }
  });

  // Sync verified Firebase user on Google login
  app.post('/api/auth/sync', requireAuth, async (req: AuthRequest, res) => {
    try {
      if (isDemoModeEnabled()) {
        await ensureDemoSeedData();
      }
      const uid = req.user!.uid;
      const email = req.user!.email || `${uid}@firebase.user`;
      const name = req.user!.name || email.split('@')[0];
      const dbUser = await getOrCreateAuthUser(uid, email, name);
      return res.json({ user: dbUser, actor: req.actor });
    } catch (error) {
      return handleRouteError(res, error, 'Failed to sync user account.');
    }
  });

  // Role-scoped & ownership-scoped platform bootstrap
  app.get('/api/bootstrap', requireAuthenticatedActor, async (req: AuthRequest, res) => {
    try {
      if (isDemoModeEnabled()) {
        await ensureDemoSeedData();
      }
      const actor = req.actor!;
      const state = await getScopedBootstrapState(actor, isDemoModeEnabled());
      return res.json({
        ...state,
        currentActor: {
          role: actor.role,
          farmerId: actor.farmerId,
          merchantId: actor.merchantId,
          displayName: actor.displayName,
          isDemo: actor.isDemo,
        },
        demoModeEnabled: isDemoModeEnabled(),
        aiRuntime: getAiRuntimeStatus(),
      });
    } catch (error) {
      return handleRouteError(res, error, 'Failed to load AGRISETU data.');
    }
  });

  // Update farmer profile, farm details, soil, crops, and consent settings
  app.put(
    '/api/farmers/:id',
    requireAuthenticatedActor,
    requireRole('farmer'),
    async (req: AuthRequest, res) => {
      try {
        const farmerId = Number(req.params.id);
        if (!Number.isInteger(farmerId) || farmerId <= 0) {
          return res.status(400).json({ error: 'Invalid farmer ID.' });
        }
        await updateFarmerProfileAndFarm(req.actor!, farmerId, req.body || {});
        const state = await getScopedBootstrapState(req.actor!, isDemoModeEnabled());
        return res.json(state);
      } catch (error) {
        return handleRouteError(res, error, 'Failed to update farmer profile.');
      }
    }
  );

  app.post(
    '/api/farmers/:id/toggle-knowledge',
    requireAuthenticatedActor,
    requireRole('farmer'),
    async (req: AuthRequest, res) => {
      try {
        const farmerId = Number(req.params.id);
        const knowledgeId = Number(req.body?.knowledgeId);
        const savedIds = await toggleFarmerSavedKnowledge(req.actor!, farmerId, knowledgeId);
        return res.json({ savedKnowledgeIds: savedIds });
      } catch (error) {
        return handleRouteError(res, error, 'Failed to save knowledge item.');
      }
    }
  );

  app.put(
    '/api/farmers/:id/vocabulary',
    requireAuthenticatedActor,
    requireRole('farmer'),
    async (req: AuthRequest, res) => {
      try {
        const farmerId = Number(req.params.id);
        if (!Array.isArray(req.body?.vocabulary)) {
          return res.status(400).json({ error: 'Vocabulary array required.' });
        }
        await updateFarmerVocabulary(req.actor!, farmerId, req.body.vocabulary);
        const state = await getScopedBootstrapState(req.actor!, isDemoModeEnabled());
        return res.json(state);
      } catch (error) {
        return handleRouteError(res, error, 'Failed to update regional vocabulary.');
      }
    }
  );

  // Soil-to-Crop Decision Support evaluation
  app.post(
    '/api/farmers/:id/crop-suitability',
    requireAuthenticatedActor,
    requireRole('farmer'),
    async (req: AuthRequest, res) => {
      try {
        const farmerId = Number(req.params.id);
        assertFarmerOwnership(req.actor!, farmerId);

        const state = await getScopedBootstrapState(req.actor!, isDemoModeEnabled());
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
          organicCarbon: overrides.organicCarbon ?? farmer.latestSoil?.organicCarbon,
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

        return res.json(result);
      } catch (error) {
        return handleRouteError(res, error, 'Failed to evaluate crop suitability.');
      }
    }
  );

  // AI Farmer Assistant Chat + Thresholded RAG + Explicit Consent Enforcement
  app.post(
    '/api/ai/chat',
    requireAuthenticatedActor,
    requireRole('farmer'),
    async (req: AuthRequest, res) => {
      try {
        const actor = req.actor!;
        const {
          farmerId,
          conversationId,
          question,
          responseLanguage = 'te',
          transcribedFromVoice = false,
          dialectOverride,
        } = req.body || {};

        if (!question || typeof question !== 'string' || !question.trim()) {
          return res.status(400).json({ error: 'Please provide a question.' });
        }
        if (question.trim().length > 2000) {
          return res.status(400).json({ error: 'Question must be 2000 characters or fewer.' });
        }

        const targetFarmerId = farmerId !== undefined ? Number(farmerId) : actor.farmerId!;
        assertFarmerOwnership(actor, targetFarmerId);

        const state = await getScopedBootstrapState(actor, isDemoModeEnabled());
        const farmer = state.farmers.find((f) => f.id === targetFarmerId);
        if (!farmer) {
          return res.status(404).json({ error: 'Farmer profile not found.' });
        }

        // Missing consent ALWAYS defaults to false
        const consentFlags = resolveConsentFlags(farmer.consent);
        const shareWithAi = consentFlags.shareProfileWithAi;
        const shareWithExperts = consentFlags.shareConversationWithExperts;
        const persistHistory = consentFlags.saveConversationHistory;

        const existingConv = conversationId
          ? state.conversations.find((c) => c.id === Number(conversationId))
          : null;

        if (conversationId && !existingConv) {
          return res.status(403).json({
            error: 'Forbidden: Conversation not found or belongs to another farmer.',
          });
        }

        const retrievalFilter = {
          profileShared: shareWithAi,
          district: shareWithAi ? farmer.district : undefined,
          region: shareWithAi ? farmer.region : undefined,
          currentCrop: shareWithAi ? farmer.currentCrop : undefined,
        };

        const matchedKnowledge = retrieveRelevantKnowledge(
          question.trim(),
          state.knowledge,
          retrievalFilter,
          4
        ).map((x) => x.doc);

        const matchedSchemes = retrieveRelevantSchemes(
          question.trim(),
          state.schemes,
          retrievalFilter,
          3
        ).map((x) => x.scheme);

        let customVocab: Array<{ term: string; meaning: string }> = [];
        if (shareWithAi) {
          try {
            customVocab = JSON.parse(farmer.customVocabularyJson || '[]');
          } catch {
            customVocab = [];
          }
        }

        const activeDialect =
          dialectOverride ||
          (shareWithAi ? farmer.dialectProfile : undefined) ||
          'kakinada_coastal';

        const aiResult = await generateAgriculturalGuidance({
          question: question.trim(),
          responseLanguage: responseLanguage === 'en' ? 'en' : 'te',
          farmerContext: shareWithAi
            ? {
                profileShared: true,
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
              }
            : {
                profileShared: false,
                preferredLanguage: responseLanguage === 'en' ? 'en' : 'te',
                dialectProfile: activeDialect,
                customVocabulary: [],
              },
          history: (existingConv?.messages || []).map((m) => ({
            sender: m.sender,
            messageText: m.messageText,
          })),
          knowledgeDocs: matchedKnowledge,
          schemes: matchedSchemes,
        });

        const expertContextString =
          shareWithExperts && shareWithAi
            ? `Farmer: ${farmer.name} (${farmer.farmerCode}), ${farmer.village}, ${farmer.district}. Crop: ${farmer.currentCrop}. Soil: ${farmer.latestSoil?.soilType || 'N/A'}.`
            : shareWithExperts
              ? `Farmer (${farmer.farmerCode}) granted expert escalation consent for this question (AI profile sharing is off).`
              : undefined;

        const savedConvId = await saveConversationTurn({
          conversationId: existingConv?.id || null,
          farmerId: farmer.id,
          persistHistory,
          shareWithExperts,
          title: question.trim(),
          language: responseLanguage === 'en' ? 'en' : 'te',
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

        const updatedState = await getScopedBootstrapState(actor, isDemoModeEnabled());
        return res.json({
          conversationId: savedConvId,
          persisted: persistHistory,
          expertEscalationForwarded: Boolean(aiResult.shouldEscalate && shareWithExperts),
          turn: aiResult,
          state: updatedState,
        });
      } catch (error) {
        return handleRouteError(
          res,
          error,
          'Unable to generate agricultural guidance right now. Please try again.'
        );
      }
    }
  );

  // Conversation deletion endpoints (Farmer privacy control)
  app.delete(
    '/api/conversations/:id',
    requireAuthenticatedActor,
    requireRole('farmer'),
    async (req: AuthRequest, res) => {
      try {
        const conversationId = Number(req.params.id);
        await deleteFarmerConversation(req.actor!, conversationId);
        const state = await getScopedBootstrapState(req.actor!, isDemoModeEnabled());
        return res.json(state);
      } catch (error) {
        return handleRouteError(res, error, 'Failed to delete conversation.');
      }
    }
  );

  app.delete(
    '/api/farmers/:id/conversations',
    requireAuthenticatedActor,
    requireRole('farmer'),
    async (req: AuthRequest, res) => {
      try {
        const farmerId = Number(req.params.id);
        await deleteAllFarmerConversations(req.actor!, farmerId);
        const state = await getScopedBootstrapState(req.actor!, isDemoModeEnabled());
        return res.json(state);
      } catch (error) {
        return handleRouteError(res, error, 'Failed to clear conversation history.');
      }
    }
  );

  // Server-side Telugu Audio Transcription (transient in-memory STT only — raw audio is NEVER stored)
  app.post(
    '/api/ai/transcribe',
    requireAuthenticatedActor,
    requireRole('farmer'),
    async (req: AuthRequest, res) => {
      try {
        const { audioBase64, mimeType, dialectProfile, farmerId } = req.body || {};
        if (!audioBase64 || typeof audioBase64 !== 'string') {
          return res.status(400).json({ error: 'Audio data is required for transcription.' });
        }

        const targetFarmerId = farmerId !== undefined ? Number(farmerId) : req.actor!.farmerId!;
        assertFarmerOwnership(req.actor!, targetFarmerId);

        const state = await getScopedBootstrapState(req.actor!, isDemoModeEnabled());
        const farmer = state.farmers.find((f) => f.id === targetFarmerId);
        const consentFlags = resolveConsentFlags(farmer?.consent);
        const shareWithAi = consentFlags.shareProfileWithAi;

        let customVocabulary: Array<{ term: string; meaning: string }> = [];
        if (shareWithAi && farmer?.customVocabularyJson) {
          try {
            customVocabulary = JSON.parse(farmer.customVocabularyJson);
          } catch {
            customVocabulary = [];
          }
        }

        const result = await transcribeRegionalTeluguAudio({
          audioBase64,
          mimeType: mimeType || 'audio/webm',
          dialectProfile:
            dialectProfile ||
            (shareWithAi ? farmer?.dialectProfile : undefined) ||
            'kakinada_coastal',
          profileShared: shareWithAi,
          customVocabulary,
        });

        return res.json(result);
      } catch (error) {
        return handleRouteError(res, error, 'Audio transcription failed.');
      }
    }
  );

  // Server-side Telugu Text-to-Speech
  app.post(
    '/api/ai/tts',
    requireAuthenticatedActor,
    requireRole('farmer', 'coordinator'),
    async (req: AuthRequest, res) => {
      try {
        const { text, language = 'te' } = req.body || {};
        if (!text || typeof text !== 'string') {
          return res.status(400).json({ error: 'Text is required for speech synthesis.' });
        }
        const result = await synthesizeTeluguSpeech({
          text: text.slice(0, 1400),
          language: language === 'en' ? 'en' : 'te',
        });
        return res.json(result);
      } catch (error) {
        return handleRouteError(res, error, 'Speech synthesis failed.');
      }
    }
  );

  // Produce Listings (Farmer only)
  app.post(
    '/api/listings',
    requireAuthenticatedActor,
    requireRole('farmer'),
    async (req: AuthRequest, res) => {
      try {
        await createProduceListing(req.actor!, req.body || {});
        const state = await getScopedBootstrapState(req.actor!, isDemoModeEnabled());
        return res.json(state);
      } catch (error) {
        return handleRouteError(res, error, 'Failed to publish produce listing.');
      }
    }
  );

  // Save/bookmark listing (Merchant only)
  app.post(
    '/api/merchants/:id/toggle-save-listing',
    requireAuthenticatedActor,
    requireRole('merchant'),
    async (req: AuthRequest, res) => {
      try {
        const merchantId = Number(req.params.id);
        const listingId = Number(req.body?.listingId);
        const savedIds = await toggleMerchantSavedListing(req.actor!, merchantId, listingId);
        return res.json({ savedListingIds: savedIds });
      } catch (error) {
        return handleRouteError(res, error, 'Failed to update saved listings.');
      }
    }
  );

  // Merchant Procurement Demand (Merchant only)
  app.post(
    '/api/demands',
    requireAuthenticatedActor,
    requireRole('merchant'),
    async (req: AuthRequest, res) => {
      try {
        await createMerchantDemandRecord(req.actor!, req.body || {});
        const state = await getScopedBootstrapState(req.actor!, isDemoModeEnabled());
        return res.json(state);
      } catch (error) {
        return handleRouteError(res, error, 'Failed to publish procurement requirement.');
      }
    }
  );

  // Purchase Enquiries (Merchant -> Farmer Listing)
  app.post(
    '/api/enquiries',
    requireAuthenticatedActor,
    requireRole('merchant'),
    async (req: AuthRequest, res) => {
      try {
        await createPurchaseEnquiryRecord(req.actor!, req.body || {});
        const state = await getScopedBootstrapState(req.actor!, isDemoModeEnabled());
        return res.json(state);
      } catch (error) {
        return handleRouteError(res, error, 'Failed to submit purchase enquiry.');
      }
    }
  );

  app.patch(
    '/api/enquiries/:id/status',
    requireAuthenticatedActor,
    requireRole('farmer', 'merchant'),
    async (req: AuthRequest, res) => {
      try {
        const enquiryId = Number(req.params.id);
        const status = req.body?.status;
        if (!status || typeof status !== 'string') {
          return res.status(400).json({ error: 'Status is required.' });
        }
        await updatePurchaseEnquiryStatus(req.actor!, enquiryId, status);
        const state = await getScopedBootstrapState(req.actor!, isDemoModeEnabled());
        return res.json(state);
      } catch (error) {
        return handleRouteError(res, error, 'Failed to update enquiry status.');
      }
    }
  );

  // Farmer Offers (Farmer -> Merchant Demand)
  app.post(
    '/api/offers',
    requireAuthenticatedActor,
    requireRole('farmer'),
    async (req: AuthRequest, res) => {
      try {
        await createFarmerOfferRecord(req.actor!, req.body || {});
        const state = await getScopedBootstrapState(req.actor!, isDemoModeEnabled());
        return res.json(state);
      } catch (error) {
        return handleRouteError(res, error, 'Failed to submit offer.');
      }
    }
  );

  app.patch(
    '/api/offers/:id/status',
    requireAuthenticatedActor,
    requireRole('farmer', 'merchant'),
    async (req: AuthRequest, res) => {
      try {
        const offerId = Number(req.params.id);
        const status = req.body?.status;
        if (!status || typeof status !== 'string') {
          return res.status(400).json({ error: 'Status is required.' });
        }
        await updateFarmerOfferStatus(req.actor!, offerId, status);
        const state = await getScopedBootstrapState(req.actor!, isDemoModeEnabled());
        return res.json(state);
      } catch (error) {
        return handleRouteError(res, error, 'Failed to update offer status.');
      }
    }
  );

  // Order Status & Farmer Feedback
  app.patch(
    '/api/orders/:id/status',
    requireAuthenticatedActor,
    requireRole('farmer', 'merchant', 'coordinator'),
    async (req: AuthRequest, res) => {
      try {
        const orderId = Number(req.params.id);
        const { orderStatus, farmerFeedback } = req.body || {};
        if (!orderStatus || typeof orderStatus !== 'string') {
          return res.status(400).json({ error: 'Order status is required.' });
        }
        await updateOrderRecordStatus(req.actor!, orderId, orderStatus, farmerFeedback);
        const state = await getScopedBootstrapState(req.actor!, isDemoModeEnabled());
        return res.json(state);
      } catch (error) {
        return handleRouteError(res, error, 'Failed to update order status.');
      }
    }
  );

  // Agricultural Supply Product Enquiry (Farmer only)
  app.post(
    '/api/supplies/enquiry',
    requireAuthenticatedActor,
    requireRole('farmer'),
    async (req: AuthRequest, res) => {
      try {
        await createSupplyProductEnquiryNotification(req.actor!, req.body || {});
        const state = await getScopedBootstrapState(req.actor!, isDemoModeEnabled());
        return res.json(state);
      } catch (error) {
        return handleRouteError(res, error, 'Failed to log supply enquiry.');
      }
    }
  );

  // AGRIROUTE Harvest Input & Destination Comparison (Farmer only)
  app.post(
    '/api/agriroute/evaluate',
    requireAuthenticatedActor,
    requireRole('farmer'),
    async (req: AuthRequest, res) => {
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
        } = req.body || {};

        const targetFarmerId = farmerId !== undefined ? Number(farmerId) : req.actor!.farmerId!;
        assertFarmerOwnership(req.actor!, targetFarmerId);

        const state = await getScopedBootstrapState(req.actor!, isDemoModeEnabled());
        const farmer = state.farmers.find((f) => f.id === targetFarmerId);
        if (!farmer) {
          return res.status(404).json({ error: 'Farmer profile not found.' });
        }

        const resolvedLocation =
          location && String(location).trim()
            ? String(location).trim()
            : `${farmer.village}, ${farmer.district}`;
        const isKakinada = `${farmer.region} ${resolvedLocation}`
          .toLowerCase()
          .includes('kakinada');

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

        const parsedQty = Number(quantityHarvestedQuintals);
        if (!Number.isFinite(parsedQty) || parsedQty <= 0) {
          return res
            .status(400)
            .json({ error: 'Harvested quantity must be a positive number.' });
        }

        const routingInput = {
          farmerRegion: farmer.region || 'Kakinada',
          cropName: String(cropName || ''),
          quantityQuintals: parsedQty,
          harvestDate: String(harvestDate || ''),
          qualityGrade: String(qualityGrade || ''),
          expectedShelfLifeDays: Number(expectedShelfLifeDays) || 7,
          location: resolvedLocation,
          storageAvailable: Boolean(storageAvailable),
          additionalInfo: additionalInfo ? String(additionalInfo) : '',
        };

        const inputDiagnostics = inspectAgriRouteInputs({
          ...routingInput,
          location: location ? String(location) : '',
          expectedShelfLifeDays: expectedShelfLifeDays ? Number(expectedShelfLifeDays) : undefined,
        });

        const evaluated = evaluateAgriRouteDestinations(routingInput, candidateChannels);

        const harvestId = await createHarvestAndRoutes(
          req.actor!,
          {
            farmerId: targetFarmerId,
            cropName: String(cropName || ''),
            quantityHarvestedQuintals: String(quantityHarvestedQuintals || ''),
            harvestDate: String(harvestDate || ''),
            qualityGrade: String(qualityGrade || ''),
            expectedShelfLifeDays: Number(expectedShelfLifeDays) || 7,
            location: resolvedLocation,
            storageAvailable: Boolean(storageAvailable),
            additionalInfo: additionalInfo ? String(additionalInfo) : '',
          },
          evaluated
        );

        const updatedState = await getScopedBootstrapState(req.actor!, isDemoModeEnabled());
        return res.json({
          harvestId,
          missingInformation: inputDiagnostics.missingInformation,
          methodologyNote: inputDiagnostics.methodologyNote,
          state: updatedState,
        });
      } catch (error) {
        return handleRouteError(res, error, 'Failed to evaluate AGRIROUTE destinations.');
      }
    }
  );

  app.post(
    '/api/agriroute/select',
    requireAuthenticatedActor,
    requireRole('farmer'),
    async (req: AuthRequest, res) => {
      try {
        const recommendationId = Number(req.body?.recommendationId);
        const harvestId = Number(req.body?.harvestId);
        if (!recommendationId || !harvestId) {
          return res
            .status(400)
            .json({ error: 'Recommendation ID and Harvest ID are required.' });
        }
        await selectAgriRouteDestination(req.actor!, recommendationId, harvestId);
        const state = await getScopedBootstrapState(req.actor!, isDemoModeEnabled());
        return res.json(state);
      } catch (error) {
        return handleRouteError(res, error, 'Failed to select route destination.');
      }
    }
  );

  // Manual Expert Escalation (Farmer only, requires explicit expert-sharing consent)
  app.post(
    '/api/escalations',
    requireAuthenticatedActor,
    requireRole('farmer'),
    async (req: AuthRequest, res) => {
      try {
        await createManualEscalationRecord(req.actor!, req.body || {});
        const state = await getScopedBootstrapState(req.actor!, isDemoModeEnabled());
        return res.json(state);
      } catch (error) {
        return handleRouteError(res, error, 'Failed to submit escalation request.');
      }
    }
  );

  // Coordinator-only Operations (Strictly forbidden for farmers and merchants)
  app.patch(
    '/api/escalations/:id',
    requireAuthenticatedActor,
    requireRole('coordinator'),
    async (req: AuthRequest, res) => {
      try {
        const escalationId = Number(req.params.id);
        await updateEscalationResolution(req.actor!, escalationId, req.body || {});
        const state = await getScopedBootstrapState(req.actor!, isDemoModeEnabled());
        return res.json(state);
      } catch (error) {
        return handleRouteError(res, error, 'Failed to update escalation case.');
      }
    }
  );

  app.post(
    '/api/coordinator/knowledge',
    requireAuthenticatedActor,
    requireRole('coordinator'),
    async (req: AuthRequest, res) => {
      try {
        await upsertKnowledgeDocument(req.actor!, req.body || {});
        const state = await getScopedBootstrapState(req.actor!, isDemoModeEnabled());
        return res.json(state);
      } catch (error) {
        return handleRouteError(res, error, 'Failed to save knowledge document.');
      }
    }
  );

  app.post(
    '/api/coordinator/schemes',
    requireAuthenticatedActor,
    requireRole('coordinator'),
    async (req: AuthRequest, res) => {
      try {
        await upsertSchemeRecord(req.actor!, req.body || {});
        const state = await getScopedBootstrapState(req.actor!, isDemoModeEnabled());
        return res.json(state);
      } catch (error) {
        return handleRouteError(res, error, 'Failed to save government scheme record.');
      }
    }
  );

  // Notifications (Scoped strictly to authenticated actor)
  app.patch(
    '/api/notifications/:id/read',
    requireAuthenticatedActor,
    async (req: AuthRequest, res) => {
      try {
        await markNotificationRead(req.actor!, Number(req.params.id));
        const state = await getScopedBootstrapState(req.actor!, isDemoModeEnabled());
        return res.json(state);
      } catch (error) {
        return handleRouteError(res, error, 'Failed to mark notification read.');
      }
    }
  );

  app.post(
    '/api/notifications/read-all',
    requireAuthenticatedActor,
    async (req: AuthRequest, res) => {
      try {
        await markAllNotificationsReadForActor(req.actor!);
        const state = await getScopedBootstrapState(req.actor!, isDemoModeEnabled());
        return res.json(state);
      } catch (error) {
        return handleRouteError(res, error, 'Failed to mark notifications read.');
      }
    }
  );

  return app;
}

async function startServer() {
  const app = createApiApp();
  const PORT = 3000;

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

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  startServer();
}
