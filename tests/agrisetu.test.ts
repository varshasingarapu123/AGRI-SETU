import 'dotenv/config';
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { eq } from 'drizzle-orm';
import { createApiApp } from '../server.ts';
import { db, createPool } from '../src/db/index.ts';
import {
  conversationMessages,
  conversations,
  cropRecords,
  expertEscalations,
  farmDetails,
  farmerConsent,
  farmerProduceListings,
  farmerProfiles,
  notifications,
  orders,
  purchaseEnquiries,
  soilRecords,
  users,
} from '../src/db/schema.ts';
import { ensureDemoSeedData } from '../src/db/seed.ts';
import {
  resolveConsentFlags,
  validateMarketplaceStatusTransition,
} from '../src/db/repository.ts';
import {
  isDemoModeEnabled,
  issueDemoSessionToken,
  setFirebaseTokenVerifierForTests,
} from '../src/middleware/auth.ts';
import {
  MIN_KNOWLEDGE_RELEVANCE_SCORE,
  evaluateAgriculturalSafety,
  retrieveRelevantKnowledge,
  retrieveRelevantSchemes,
} from '../src/services/knowledgeRetrieval.ts';
import { generateAgriculturalGuidance } from '../src/services/aiService.ts';
import { evaluateCropSuitability } from '../src/services/cropSuitabilityEngine.ts';
import {
  evaluateAgriRouteDestinations,
  inspectAgriRouteInputs,
} from '../src/services/agrirouteEngine.ts';

let server: Server;
let baseUrl = '';

const TEST_REAL_UID = 'test-real-firebase-farmer-uid-991';
const TEST_COORDINATOR_UID = 'test-real-firebase-coord-uid-992';
const TEST_COORDINATOR_EMAIL = 'verified.coord.test@agrisetu.example';

async function apiJson(
  path: string,
  options: {
    method?: string;
    token?: string;
    headers?: Record<string, string>;
    body?: unknown;
  } = {}
): Promise<{ status: number; body: any }> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers || {}),
  };
  if (options.token) {
    headers.Authorization = `Bearer ${options.token}`;
  }
  const res = await fetch(`${baseUrl}${path}`, {
    method: options.method || 'GET',
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });
  const text = await res.text();
  let parsed: any = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = text;
  }
  return { status: res.status, body: parsed };
}

before(async () => {
  process.env.NODE_ENV = 'test';
  process.env.ENABLE_DEMO_MODE = 'true';
  process.env.COORDINATOR_EMAILS = TEST_COORDINATOR_EMAIL;

  await ensureDemoSeedData();

  setFirebaseTokenVerifierForTests(async (token: string) => {
    if (token === 'valid-firebase-farmer-token') {
      return {
        uid: TEST_REAL_UID,
        email: 'realfarmer.test@agrisetu.example',
        name: 'Suryanarayana Test Farmer',
        email_verified: true,
      } as any;
    }
    if (token === 'valid-firebase-coord-token') {
      return {
        uid: TEST_COORDINATOR_UID,
        email: TEST_COORDINATOR_EMAIL,
        name: 'Verified Coordinator',
        email_verified: true,
      } as any;
    }
    throw new Error('Invalid Firebase token');
  });

  const app = createApiApp();
  server = await new Promise<Server>((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  const addr = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${addr.port}`;
});

after(async () => {
  setFirebaseTokenVerifierForTests(null);

  // Clean up test real-user records created during test execution
  const testUsers = await db
    .select()
    .from(users)
    .where(eq(users.uid, TEST_REAL_UID));
  for (const u of testUsers) {
    const fps = await db
      .select()
      .from(farmerProfiles)
      .where(eq(farmerProfiles.userId, u.id));
    for (const fp of fps) {
      const fpConvs = await db
        .select()
        .from(conversations)
        .where(eq(conversations.farmerId, fp.id));
      for (const c of fpConvs) {
        await db.delete(conversationMessages).where(eq(conversationMessages.conversationId, c.id));
      }
      await db.delete(expertEscalations).where(eq(expertEscalations.farmerId, fp.id));
      await db.delete(conversations).where(eq(conversations.farmerId, fp.id));
      await db.delete(notifications).where(eq(notifications.recipientFarmerId, fp.id));
      await db.delete(farmerProduceListings).where(eq(farmerProduceListings.farmerId, fp.id));
      await db.delete(cropRecords).where(eq(cropRecords.farmerId, fp.id));
      await db.delete(soilRecords).where(eq(soilRecords.farmerId, fp.id));
      await db.delete(farmDetails).where(eq(farmDetails.farmerId, fp.id));
      await db.delete(farmerConsent).where(eq(farmerConsent.farmerId, fp.id));
      await db.delete(farmerProfiles).where(eq(farmerProfiles.id, fp.id));
    }
    await db.delete(users).where(eq(users.id, u.id));
  }

  const coordUsers = await db
    .select()
    .from(users)
    .where(eq(users.uid, TEST_COORDINATOR_UID));
  for (const cu of coordUsers) {
    await db.delete(users).where(eq(users.id, cu.id));
  }

  if (server) {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
  await createPool().end();
});

// ============================================================================
// 1. AUTHENTICATION, RBAC, OWNERSHIP & SCOPED BOOTSTRAP TESTS
// ============================================================================

test('Open Access & Header Spoofing Protection: anyone can access bootstrap without sign-in while forged role headers are ignored', async () => {
  // Anyone can access /api/bootstrap directly without signing in
  const openBootstrap = await apiJson('/api/bootstrap');
  assert.equal(openBootstrap.status, 200);
  assert.equal(openBootstrap.body.currentActor.role, 'farmer');
  assert.equal(openBootstrap.body.farmers.length, 1);

  // Forged coordinator role headers are strictly ignored (resolves default farmer, never coordinator)
  const forgedCoordinator = await apiJson('/api/bootstrap', {
    headers: {
      'x-agrisetu-demo-role': 'coordinator',
      'x-agrisetu-farmer-id': '1',
    },
  });
  assert.equal(forgedCoordinator.status, 200);
  assert.equal(forgedCoordinator.body.currentActor.role, 'farmer');

  // Forged coordinator header cannot write coordinator schemes -> 403 Forbidden
  const forgedSchemeWrite = await apiJson('/api/coordinator/schemes', {
    method: 'POST',
    headers: {
      'x-agrisetu-demo-role': 'coordinator',
    },
    body: { schemeCode: 'FORGED' },
  });
  assert.equal(forgedSchemeWrite.status, 403);

  // Tampered Bearer tokens are still rejected with 401
  const tamperedBearer = await apiJson('/api/bootstrap', {
    token: 'agrisetu_demo.invalidpayload.invalidsig',
  });
  assert.equal(tamperedBearer.status, 401);
});

test('Scoped Bootstrap & Ownership: farmers only receive their own profile/records and cannot access another farmer', async () => {
  const demoSession1 = await apiJson('/api/session', {
    method: 'POST',
    body: { role: 'farmer', farmerId: 1 },
  });
  assert.equal(demoSession1.status, 200);
  const farmer1Token = demoSession1.body.token as string;
  const farmer1Id = demoSession1.body.actor.farmerId as number;

  const demoSession2 = await apiJson('/api/session', {
    method: 'POST',
    body: { role: 'farmer', farmerId: 2 },
  });
  assert.equal(demoSession2.status, 200);
  const farmer2Id = demoSession2.body.actor.farmerId as number;
  assert.notEqual(farmer1Id, farmer2Id);

  const bootstrap1 = await apiJson('/api/bootstrap', { token: farmer1Token });
  assert.equal(bootstrap1.status, 200);
  assert.equal(bootstrap1.body.farmers.length, 1);
  assert.equal(bootstrap1.body.farmers[0].id, farmer1Id);
  for (const esc of bootstrap1.body.escalations) {
    assert.equal(esc.farmerId, farmer1Id);
  }
  for (const conv of bootstrap1.body.conversations) {
    assert.equal(conv.farmerId, farmer1Id);
  }

  // Farmer 1 attempting to modify Farmer 2's profile -> 403 Forbidden
  const crossFarmerUpdate = await apiJson(`/api/farmers/${farmer2Id}`, {
    method: 'PUT',
    token: farmer1Token,
    body: { name: 'Unauthorized Overwrite' },
  });
  assert.equal(crossFarmerUpdate.status, 403);

  // Farmer 1 attempting to run crop suitability on Farmer 2 -> 403 Forbidden
  const crossSuitability = await apiJson(`/api/farmers/${farmer2Id}/crop-suitability`, {
    method: 'POST',
    token: farmer1Token,
    body: {},
  });
  assert.equal(crossSuitability.status, 403);

  // Farmer 1 attempting to clear Farmer 2's conversations -> 403 Forbidden
  const crossDeleteConvs = await apiJson(`/api/farmers/${farmer2Id}/conversations`, {
    method: 'DELETE',
    token: farmer1Token,
  });
  assert.equal(crossDeleteConvs.status, 403);
});

test('RBAC: farmers and merchants are strictly blocked from coordinator endpoints and cross-merchant actions', async () => {
  const farmerSession = await apiJson('/api/session', {
    method: 'POST',
    body: { role: 'farmer', farmerId: 1 },
  });
  const farmerToken = farmerSession.body.token as string;

  const merchantSession1 = await apiJson('/api/session', {
    method: 'POST',
    body: { role: 'merchant', merchantId: 1 },
  });
  const merchant1Token = merchantSession1.body.token as string;
  const merchant1Id = merchantSession1.body.actor.merchantId as number;

  // Merchant bootstrap never exposes private farmer profiles, conversations, or escalations
  const merchantBootstrap = await apiJson('/api/bootstrap', { token: merchant1Token });
  assert.equal(merchantBootstrap.status, 200);
  assert.deepEqual(merchantBootstrap.body.farmers, []);
  assert.deepEqual(merchantBootstrap.body.conversations, []);
  assert.deepEqual(merchantBootstrap.body.escalations, []);
  assert.equal(merchantBootstrap.body.merchants.length, 1);
  assert.equal(merchantBootstrap.body.merchants[0].id, merchant1Id);

  // Farmer blocked from coordinator endpoints
  const farmerCoordKnowledge = await apiJson('/api/coordinator/knowledge', {
    method: 'POST',
    token: farmerToken,
    body: { title: 'Blocked' },
  });
  assert.equal(farmerCoordKnowledge.status, 403);

  const farmerCoordScheme = await apiJson('/api/coordinator/schemes', {
    method: 'POST',
    token: farmerToken,
    body: { schemeCode: 'BLOCKED' },
  });
  assert.equal(farmerCoordScheme.status, 403);

  // Merchant blocked from coordinator endpoints and farmer endpoints
  const merchantCoordEscalation = await apiJson('/api/escalations/1', {
    method: 'PATCH',
    token: merchant1Token,
    body: { status: 'Resolved' },
  });
  assert.equal(merchantCoordEscalation.status, 403);

  const merchantFarmerEdit = await apiJson('/api/farmers/1', {
    method: 'PUT',
    token: merchant1Token,
    body: { name: 'Blocked' },
  });
  assert.equal(merchantFarmerEdit.status, 403);

  // Merchant 1 blocked from modifying Merchant 2's saved listings
  const crossMerchantSave = await apiJson('/api/merchants/2/toggle-save-listing', {
    method: 'POST',
    token: merchant1Token,
    body: { listingId: 1 },
  });
  assert.equal(crossMerchantSave.status, 403);
});

test('Production Open Access & Default-False Consent: anyone can access workspaces in production without sign-in', async () => {
  // New profile onboarding still defaults all consents strictly to false
  const realBootstrap = await apiJson('/api/bootstrap', {
    token: 'valid-firebase-farmer-token',
  });
  assert.equal(realBootstrap.status, 200);
  const realFarmer = realBootstrap.body.farmers[0];
  assert.equal(realFarmer.consent.shareProfileWithAi, false);
  assert.equal(realFarmer.consent.shareProfileWithMerchants, false);
  assert.equal(realFarmer.consent.shareContactOnEnquiry, false);
  assert.equal(realFarmer.consent.shareConversationWithExperts, false);
  assert.equal(realFarmer.consent.saveConversationHistory, false);

  // Verify NODE_ENV=production allows open workspace sessions and unauthenticated access so anyone can utilize the deployed app
  const validWorkspaceToken = issueDemoSessionToken('demo-coordinator-pilot');
  const prevNodeEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = 'production';
  try {
    assert.equal(isDemoModeEnabled(), true);

    const prodOpenBootstrap = await apiJson('/api/bootstrap');
    assert.equal(prodOpenBootstrap.status, 200);

    const prodWorkspaceSession = await apiJson('/api/session', {
      method: 'POST',
      body: { role: 'coordinator' },
    });
    assert.equal(prodWorkspaceSession.status, 200);
    assert.ok(prodWorkspaceSession.body.token);

    const prodBearerBootstrap = await apiJson('/api/bootstrap', {
      token: validWorkspaceToken,
    });
    assert.equal(prodBearerBootstrap.status, 200);
    assert.equal(prodBearerBootstrap.body.currentActor.role, 'coordinator');
  } finally {
    process.env.NODE_ENV = prevNodeEnv;
  }
});

// ============================================================================
// 2. CONSENT, PRIVACY & CONVERSATION STORAGE TESTS
// ============================================================================

test('Consent Enforcement: missing consent defaults to false, withholds profile/history/escalation when disabled, and supports deletion', async () => {
  const emptyDefaults = resolveConsentFlags(null);
  assert.deepEqual(emptyDefaults, {
    shareProfileWithAi: false,
    shareProfileWithMerchants: false,
    shareContactOnEnquiry: false,
    shareConversationWithExperts: false,
    saveConversationHistory: false,
  });

  // Get real test farmer profile (all consents currently false)
  const initial = await apiJson('/api/bootstrap', { token: 'valid-firebase-farmer-token' });
  const realFarmer = initial.body.farmers[0];

  // Set distinctive private profile fields + vocabulary while keeping all consents FALSE
  await apiJson(`/api/farmers/${realFarmer.id}`, {
    method: 'PUT',
    token: 'valid-firebase-farmer-token',
    body: {
      name: 'ConfidentialRythuName',
      village: 'SecretVillageX',
      soilType: 'DistinctiveVolcanicSilt',
      shareProfileWithAi: false,
      shareConversationWithExperts: false,
      saveConversationHistory: false,
    },
  });

  // Ask a high-risk pesticide dosage question while shareProfileWithAi=false, saveConversationHistory=false, shareConversationWithExperts=false
  const prevKey = process.env.GEMINI_API_KEY;
  process.env.GEMINI_API_KEY = '';
  try {
    const chatRes = await apiJson('/api/ai/chat', {
      method: 'POST',
      token: 'valid-firebase-farmer-token',
      body: {
        farmerId: realFarmer.id,
        question: 'How many ml per litre of chlorpyrifos pesticide should I spray?',
        responseLanguage: 'en',
      },
    });
    assert.equal(chatRes.status, 200);
    assert.equal(chatRes.body.persisted, false);
    assert.equal(chatRes.body.conversationId, null);
    assert.equal(chatRes.body.turn.shouldEscalate, true);
    assert.equal(chatRes.body.expertEscalationForwarded, false);

    // Private profile fields must NOT appear in AI response when shareProfileWithAi === false
    assert.equal(chatRes.body.turn.replyText.includes('ConfidentialRythuName'), false);
    assert.equal(chatRes.body.turn.replyText.includes('SecretVillageX'), false);

    // Zero conversations and zero escalations persisted in DB for this farmer
    const dbConvs = await db
      .select()
      .from(conversations)
      .where(eq(conversations.farmerId, realFarmer.id));
    assert.equal(dbConvs.length, 0);

    const dbEscs = await db
      .select()
      .from(expertEscalations)
      .where(eq(expertEscalations.farmerId, realFarmer.id));
    assert.equal(dbEscs.length, 0);

    // Manual escalation without shareConversationWithExperts consent -> 403
    const blockedManualEsc = await apiJson('/api/escalations', {
      method: 'POST',
      token: 'valid-firebase-farmer-token',
      body: {
        farmerId: realFarmer.id,
        questionText: 'Need expert check',
      },
    });
    assert.equal(blockedManualEsc.status, 403);

    // Enable saveConversationHistory = true, ask question, verify saved, then delete it
    await apiJson(`/api/farmers/${realFarmer.id}`, {
      method: 'PUT',
      token: 'valid-firebase-farmer-token',
      body: {
        shareProfileWithAi: false,
        shareConversationWithExperts: false,
        saveConversationHistory: true,
      },
    });

    const savedChatRes = await apiJson('/api/ai/chat', {
      method: 'POST',
      token: 'valid-firebase-farmer-token',
      body: {
        farmerId: realFarmer.id,
        question: 'How should I dry paddy grain before storage?',
        responseLanguage: 'en',
      },
    });
    assert.equal(savedChatRes.status, 200);
    assert.equal(savedChatRes.body.persisted, true);
    assert.ok(savedChatRes.body.conversationId > 0);

    const deleteRes = await apiJson(`/api/conversations/${savedChatRes.body.conversationId}`, {
      method: 'DELETE',
      token: 'valid-firebase-farmer-token',
    });
    assert.equal(deleteRes.status, 200);
    assert.equal(deleteRes.body.conversations.length, 0);
  } finally {
    process.env.GEMINI_API_KEY = prevKey;
  }
});

// ============================================================================
// 3. KNOWLEDGE RETRIEVAL & SAFETY ESCALATION TESTS
// ============================================================================

test('RAG Retrieval & Safety: matches relevant items, returns empty on unrelated queries (never random fallback), excludes outdated records, and escalates bilingual hazards', async () => {
  const sampleDocs = [
    {
      id: 101,
      category: 'Irrigation',
      title: 'Alternate Wetting and Drying (AWD) in Paddy',
      titleTe: 'వరిలో విడతల వారీగా నీటి తడి (AWD)',
      summary: 'Reduces paddy irrigation water use while maintaining healthy tillers.',
      content: 'Maintain 5 cm shallow water only at critical flowering stages in paddy.',
      applicableRegions: 'Kakinada, Godavari region',
      applicableCrops: 'Paddy',
      sourceName: 'ANGRAU Water Management Cell',
      verificationStatus: 'Verified',
      lastVerifiedDate: '2026-08-15',
      isOutdated: false,
    },
    {
      id: 102,
      category: 'Fertiliser management',
      title: 'Legacy Outdated Fertiliser Note',
      titleTe: null,
      summary: 'Old paddy note.',
      content: 'Outdated paddy water and fertiliser schedule.',
      applicableRegions: 'Kakinada',
      applicableCrops: 'Paddy',
      sourceName: 'Archive',
      verificationStatus: 'Verified',
      lastVerifiedDate: '2021-01-01',
      isOutdated: true,
    },
  ];

  // Relevant query matches verified doc #101 and skips outdated #102
  const matched = retrieveRelevantKnowledge(
    'వరిలో నీటి యాజమాన్యం AWD ఎలా చేయాలి?',
    sampleDocs,
    { profileShared: true, district: 'Kakinada', currentCrop: 'Paddy' }
  );
  assert.equal(matched.length, 1);
  assert.equal(matched[0].doc.id, 101);
  assert.ok(matched[0].score >= MIN_KNOWLEDGE_RELEVANCE_SCORE);

  // Unrelated query MUST return 0 documents even when farmer grows Paddy in Kakinada
  const unrelated = retrieveRelevantKnowledge(
    'How do I repair a diesel tractor clutch plate and gearbox?',
    sampleDocs,
    { profileShared: true, district: 'Kakinada', currentCrop: 'Paddy' }
  );
  assert.equal(unrelated.length, 0);

  // Scheme retrieval excludes Telangana-only scheme when explicitly querying Kakinada/AP
  const schemes = retrieveRelevantSchemes(
    'What schemes apply in Kakinada Andhra Pradesh?',
    [
      {
        schemeCode: 'RYTHU-BHAROSA-TG',
        schemeName: 'Telangana Rythu Bharosa',
        level: 'State',
        applicableState: 'Telangana',
        purpose: 'Telangana state farm support',
        eligibilityConditions: 'Telangana landowners',
        benefits: 'Per acre support',
        officialPortal: 'https://rythubharosa.telangana.gov.in',
        officialSource: 'Dept of Agriculture Telangana',
        verificationStatus: 'Requires Verification',
        lastVerifiedDate: '2026-08-01',
        isOutdated: false,
      },
    ],
    { profileShared: true, district: 'Kakinada' }
  );
  assert.equal(schemes.length, 0);

  // AI fallback on zero matched docs produces honest no-match disclosure and empty citations
  const prevKey = process.env.GEMINI_API_KEY;
  process.env.GEMINI_API_KEY = '';
  try {
    const noMatchGuidance = await generateAgriculturalGuidance({
      question: 'How do I repair a diesel tractor clutch plate?',
      responseLanguage: 'en',
      farmerContext: {
        profileShared: false,
        preferredLanguage: 'en',
        dialectProfile: 'kakinada_coastal',
        customVocabulary: [],
      },
      history: [],
      knowledgeDocs: [],
      schemes: [],
    });
    assert.equal(noMatchGuidance.citations.length, 0);
    assert.equal(noMatchGuidance.evidenceBasis, 'general_ai_explanation');
    assert.match(
      noMatchGuidance.replyText,
      /does not currently have a verified knowledge-base advisory or scheme record matching/i
    );
  } finally {
    process.env.GEMINI_API_KEY = prevKey;
  }

  // Bilingual English & Telugu safety triggers
  assert.equal(
    evaluateAgriculturalSafety('What pesticide ml per litre should I spray?').isHighRisk,
    true
  );
  assert.equal(
    evaluateAgriculturalSafety('పురుగుమందు ఎంత మోతాదు కొట్టాలి?').isHighRisk,
    true
  );
  assert.equal(
    evaluateAgriculturalSafety('చేనులో దోమపోటు తీవ్రంగా ఉంది మొత్తం చేను ఎండిపోతోంది').isHighRisk,
    true
  );
  assert.equal(
    evaluateAgriculturalSafety('How do I dry harvested paddy safely before storage?').isHighRisk,
    false
  );
});

// ============================================================================
// 4. MARKETPLACE VALIDATION, STATE TRANSITIONS & IDEMPOTENT ORDER CREATION
// ============================================================================

test('Marketplace Reliability: rejects invalid inputs & illegal transitions, and guarantees idempotent order creation', async () => {
  const farmerSession = await apiJson('/api/auth/demo-session', {
    method: 'POST',
    body: { role: 'farmer', farmerId: 1 },
  });
  const farmer1Token = farmerSession.body.token as string;
  const farmer1Id = farmerSession.body.actor.farmerId as number;

  const merchantSession = await apiJson('/api/auth/demo-session', {
    method: 'POST',
    body: { role: 'merchant', merchantId: 1 },
  });
  const merchant1Token = merchantSession.body.token as string;
  const merchant1Id = merchantSession.body.actor.merchantId as number;

  // Negative quantity and invalid calendar date rejected with 400
  const badListing = await apiJson('/api/listings', {
    method: 'POST',
    token: farmer1Token,
    body: {
      farmerId: farmer1Id,
      cropName: 'Paddy',
      quantityQuintals: '-25',
      expectedHarvestDate: '2026-11-20',
    },
  });
  assert.equal(badListing.status, 400);

  const badDateListing = await apiJson('/api/listings', {
    method: 'POST',
    token: farmer1Token,
    body: {
      farmerId: farmer1Id,
      cropName: 'Paddy',
      quantityQuintals: '30',
      expectedHarvestDate: '2026-02-30',
    },
  });
  assert.equal(badDateListing.status, 400);

  // Create a fresh valid listing as Farmer 1
  const createdListingState = await apiJson('/api/listings', {
    method: 'POST',
    token: farmer1Token,
    body: {
      farmerId: farmer1Id,
      cropName: 'Paddy (Idempotency Test Lot)',
      quantityQuintals: '42',
      expectedHarvestDate: '2026-12-01',
      qualityGrade: 'Grade A FAQ',
      askingPricePerQuintal: '2390',
    },
  });
  assert.equal(createdListingState.status, 200);
  const newListing = createdListingState.body.listings.find(
    (l: any) => l.cropName === 'Paddy (Idempotency Test Lot)'
  );
  assert.ok(newListing);

  // Merchant 1 creates a valid enquiry on that listing
  const enquiryRes = await apiJson('/api/enquiries', {
    method: 'POST',
    token: merchant1Token,
    body: {
      listingId: newListing.id,
      merchantId: merchant1Id,
      requiredQuantityQuintals: '40',
      proposedPricePerQuintal: '2380',
      qualityRequirements: 'FAQ <= 14% moisture',
      logisticsPreference: 'Farmgate pickup',
      procurementDate: '2026-12-03',
    },
  });
  assert.equal(enquiryRes.status, 200);
  const createdEnquiry = enquiryRes.body.enquiries.find(
    (e: any) => e.listingId === newListing.id
  );
  assert.ok(createdEnquiry);

  // Invalid state transitions:
  // 1) Merchant cannot unilaterally confirm an unaccepted 'Enquiry received' -> 403
  const unilateralConfirm = await apiJson(`/api/enquiries/${createdEnquiry.id}/status`, {
    method: 'PATCH',
    token: merchant1Token,
    body: { status: 'Confirmed order' },
  });
  assert.equal(unilateralConfirm.status, 403);

  // 2) Setting 'Completed' directly on an enquiry is rejected -> 400 (Completed belongs to Orders)
  const invalidCompletedOnEnquiry = await apiJson(`/api/enquiries/${createdEnquiry.id}/status`, {
    method: 'PATCH',
    token: farmer1Token,
    body: { status: 'Completed' },
  });
  assert.equal(invalidCompletedOnEnquiry.status, 400);

  // Farmer accepts enquiry, then confirms order TWICE to test idempotency
  const acceptRes = await apiJson(`/api/enquiries/${createdEnquiry.id}/status`, {
    method: 'PATCH',
    token: farmer1Token,
    body: { status: 'Accepted' },
  });
  assert.equal(acceptRes.status, 200);

  const confirm1 = await apiJson(`/api/enquiries/${createdEnquiry.id}/status`, {
    method: 'PATCH',
    token: farmer1Token,
    body: { status: 'Confirmed order' },
  });
  assert.equal(confirm1.status, 200);

  // Repeated confirmation call MUST be idempotent and NOT create a duplicate order
  const confirm2 = await apiJson(`/api/enquiries/${createdEnquiry.id}/status`, {
    method: 'PATCH',
    token: farmer1Token,
    body: { status: 'Confirmed order' },
  });
  assert.equal(confirm2.status, 200);

  const matchingOrders = await db
    .select()
    .from(orders)
    .where(eq(orders.sourceId, createdEnquiry.id));
  const enquiryOrders = matchingOrders.filter((o) => o.sourceType === 'enquiry');
  assert.equal(enquiryOrders.length, 1);

  // Terminal enquiry cannot be reverted to 'Rejected' -> 400
  const illegalRevert = await apiJson(`/api/enquiries/${createdEnquiry.id}/status`, {
    method: 'PATCH',
    token: farmer1Token,
    body: { status: 'Rejected' },
  });
  assert.equal(illegalRevert.status, 400);

  // Clean up test marketplace records
  await db.delete(orders).where(eq(orders.id, enquiryOrders[0].id));
  await db.delete(purchaseEnquiries).where(eq(purchaseEnquiries.id, createdEnquiry.id));
  await db.delete(farmerProduceListings).where(eq(farmerProduceListings.id, newListing.id));

  // Unit check on transition helper for offers
  assert.throws(() =>
    validateMarketplaceStatusTransition('offer', 'Offer made', 'Confirmed order', 'farmer')
  );
});

// ============================================================================
// 5. AGRICULTURAL LOGIC TRANSPARENCY TESTS (SUITABILITY & AGRIROUTE)
// ============================================================================

test('Crop Suitability & AGRIROUTE Transparency: flags missing inputs, explains factors, and avoids guaranteed yield/profit claims', () => {
  const suitability = evaluateCropSuitability({
    district: 'Kakinada',
    region: 'Kakinada Coastal',
    soilType: 'Not set',
    phLevel: null,
    organicCarbon: null,
    salinityNote: null,
    isVerifiedLabTest: false,
    farmAreaAcres: '2.5',
    irrigationType: 'Canal',
    waterAvailability: 'Seasonal',
    previousCrop: 'Paddy',
    climateZone: 'Coastal Delta',
    activeDemands: [],
  });

  assert.equal(
    suitability.evaluationMethod,
    'Deterministic Rule-Based Agronomic Matrix (Not a Predictive Yield/Profit AI Model)'
  );
  assert.ok(suitability.missingInformation.length >= 4);
  assert.ok(suitability.options.length >= 3);
  for (const opt of suitability.options) {
    assert.ok(Array.isArray(opt.keyFactors) && opt.keyFactors.length > 0);
    assert.equal(/guaranteed yield|guaranteed profit/i.test(opt.whySuitable), false);
  }

  const routeDiag = inspectAgriRouteInputs({
    cropName: 'Banana',
    quantityQuintals: 20,
    location: '',
    additionalInfo: '',
    expectedShelfLifeDays: undefined,
  });
  assert.equal(routeDiag.missingInformation.length, 3);

  const routes = evaluateAgriRouteDestinations(
    {
      farmerRegion: 'Godavari region',
      cropName: 'Banana (Chakkarakeli)',
      quantityQuintals: 25,
      harvestDate: '2026-11-15',
      qualityGrade: 'Edible Grade B — Cosmetically Imperfect / Ripe Lot',
      expectedShelfLifeDays: 4,
      location: 'Atreyapuram, East Godavari',
      storageAvailable: false,
    },
    []
  );

  assert.ok(routes.length >= 2);
  for (const r of routes) {
    assert.equal(r.isIllustrativeEstimate, true);
    assert.match(r.estimatedLogisticsCostInr, /Illustrative Demo Formula/i);
    assert.ok(r.rankingFactors.illustrativeLogisticsNote.length > 0);
  }
});
