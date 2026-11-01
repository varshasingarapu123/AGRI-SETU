import { db } from './index.ts';
import {
  users,
  farmerProfiles,
  farmerConsent,
  farmDetails,
  soilRecords,
  cropRecords,
  agriculturalKnowledge,
  conversations,
  conversationMessages,
  schemeRecords,
  farmerProduceListings,
  merchantProfiles,
  merchantDemand,
  purchaseEnquiries,
  farmerOffers,
  orders,
  supplierProfiles,
  supplyProducts,
  harvestRecords,
  agrirouteRecommendations,
  expertEscalations,
  notifications,
} from './schema.ts';
import { and, desc, eq, inArray } from 'drizzle-orm';

export class ValidationError extends Error {
  readonly statusCode = 400;
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

export class ForbiddenError extends Error {
  readonly statusCode = 403;
  constructor(message: string) {
    super(message);
    this.name = 'ForbiddenError';
  }
}

export class NotFoundError extends Error {
  readonly statusCode = 404;
  constructor(message: string) {
    super(message);
    this.name = 'NotFoundError';
  }
}

export interface ResolvedActor {
  userId: number;
  uid: string;
  email: string;
  displayName: string;
  role: 'farmer' | 'merchant' | 'coordinator';
  farmerId: number | null;
  merchantId: number | null;
  isDemo: boolean;
}

export interface NormalizedConsentFlags {
  shareProfileWithAi: boolean;
  shareProfileWithMerchants: boolean;
  shareContactOnEnquiry: boolean;
  shareConversationWithExperts: boolean;
  saveConversationHistory: boolean;
}

/**
 * Missing consent always defaults strictly to false — never true.
 */
export function resolveConsentFlags(
  consent?: Partial<typeof farmerConsent.$inferSelect> | null
): NormalizedConsentFlags {
  return {
    shareProfileWithAi: consent?.shareProfileWithAi === true,
    shareProfileWithMerchants: consent?.shareProfileWithMerchants === true,
    shareContactOnEnquiry: consent?.shareContactOnEnquiry === true,
    shareConversationWithExperts: consent?.shareConversationWithExperts === true,
    saveConversationHistory: consent?.saveConversationHistory === true,
  };
}

function wrapDbError(context: string, error: unknown): never {
  if (
    error instanceof ValidationError ||
    error instanceof ForbiddenError ||
    error instanceof NotFoundError
  ) {
    throw error;
  }
  console.error(`[DB Error] ${context}:`, error);
  throw new Error(`Database operation failed (${context}). Please try again.`, {
    cause: error,
  });
}

function getConfiguredCoordinatorEmails(): Set<string> {
  const raw = process.env.COORDINATOR_EMAILS || '';
  return new Set(
    raw
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean)
  );
}

export function assertFarmerOwnership(actor: ResolvedActor, targetFarmerId: number) {
  if (actor.role !== 'farmer' || !actor.farmerId || actor.farmerId !== Number(targetFarmerId)) {
    throw new ForbiddenError('Forbidden: You can only access or modify your own farmer records.');
  }
}

export function assertMerchantOwnership(actor: ResolvedActor, targetMerchantId: number) {
  if (
    actor.role !== 'merchant' ||
    !actor.merchantId ||
    actor.merchantId !== Number(targetMerchantId)
  ) {
    throw new ForbiddenError(
      'Forbidden: You can only access or modify your own merchant records.'
    );
  }
}

export function validateNonEmptyText(
  rawValue: unknown,
  fieldLabel: string,
  maxLength = 240
): string {
  if (typeof rawValue !== 'string') {
    throw new ValidationError(`${fieldLabel} is required.`);
  }
  const trimmed = rawValue.trim();
  if (trimmed.length < 2) {
    throw new ValidationError(`${fieldLabel} must be at least 2 characters.`);
  }
  if (trimmed.length > maxLength) {
    throw new ValidationError(`${fieldLabel} must be ${maxLength} characters or fewer.`);
  }
  return trimmed;
}

export function validatePositiveDecimalInput(
  rawValue: unknown,
  fieldLabel: string,
  opts: { min?: number; max?: number } = {}
): string {
  const min = opts.min ?? 0.01;
  const max = opts.max ?? 100000;
  const str = String(rawValue ?? '').trim();
  if (!str || !/^\d+(\.\d{1,2})?$/.test(str)) {
    throw new ValidationError(`${fieldLabel} must be a valid positive number.`);
  }
  const parsed = Number(str);
  if (!Number.isFinite(parsed) || parsed < min || parsed > max) {
    throw new ValidationError(`${fieldLabel} must be between ${min} and ${max}.`);
  }
  return str;
}

export function validateOptionalPositiveDecimalInput(
  rawValue: unknown,
  fieldLabel: string,
  opts: { min?: number; max?: number } = {}
): string {
  const str = String(rawValue ?? '').trim();
  if (!str) return '';
  return validatePositiveDecimalInput(str, fieldLabel, opts);
}

export function validateIsoDateInput(rawDate: unknown, fieldLabel: string): string {
  if (typeof rawDate !== 'string') {
    throw new ValidationError(`${fieldLabel} must be a valid YYYY-MM-DD date.`);
  }
  const trimmed = rawDate.trim();
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
  if (!match) {
    throw new ValidationError(`${fieldLabel} must use YYYY-MM-DD format.`);
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (year < 2020 || year > 2035 || month < 1 || month > 12 || day < 1 || day > 31) {
    throw new ValidationError(`${fieldLabel} is out of valid calendar range.`);
  }
  const check = new Date(Date.UTC(year, month - 1, day));
  if (
    check.getUTCFullYear() !== year ||
    check.getUTCMonth() !== month - 1 ||
    check.getUTCDate() !== day
  ) {
    throw new ValidationError(`${fieldLabel} is not a real calendar date.`);
  }
  return trimmed;
}

const VALID_ENQUIRY_STATUSES = new Set([
  'Enquiry received',
  'Under discussion',
  'Accepted',
  'Confirmed order',
  'Rejected',
  'Cancelled',
]);

const VALID_OFFER_STATUSES = new Set([
  'Offer made',
  'Under discussion',
  'Accepted',
  'Confirmed order',
  'Rejected',
  'Cancelled',
]);

const VALID_ORDER_STATUSES = new Set([
  'Confirmed order',
  'In transit / Scheduled',
  'Completed',
  'Cancelled',
]);

export function validateMarketplaceStatusTransition(
  entityType: 'enquiry' | 'offer' | 'order',
  currentStatus: string,
  nextStatus: string,
  actorRole: 'farmer' | 'merchant' | 'coordinator'
): void {
  if (entityType === 'enquiry') {
    if (!VALID_ENQUIRY_STATUSES.has(nextStatus)) {
      throw new ValidationError(
        `Invalid enquiry status "${nextStatus}". Completed transactions are tracked separately on Confirmed Orders.`
      );
    }
    if (currentStatus === nextStatus) {
      return; // Idempotent repeat allowed
    }
    if (
      currentStatus === 'Confirmed order' ||
      currentStatus === 'Rejected' ||
      currentStatus === 'Cancelled'
    ) {
      throw new ValidationError(
        `Cannot change enquiry status from terminal state "${currentStatus}" to "${nextStatus}".`
      );
    }
    if (currentStatus === 'Enquiry received') {
      if (actorRole === 'merchant') {
        if (nextStatus !== 'Under discussion' && nextStatus !== 'Cancelled') {
          throw new ForbiddenError(
            'A merchant cannot unilaterally accept or confirm an unresponded enquiry before the farmer responds.'
          );
        }
      }
      return;
    }
    if (currentStatus === 'Under discussion') {
      if (actorRole === 'merchant' && (nextStatus === 'Accepted' || nextStatus === 'Confirmed order')) {
        throw new ForbiddenError(
          'Only the listing farmer can accept terms on an enquiry under discussion.'
        );
      }
      return;
    }
    if (currentStatus === 'Accepted') {
      if (nextStatus !== 'Confirmed order' && nextStatus !== 'Cancelled') {
        throw new ValidationError(
          `Accepted enquiry can only transition to "Confirmed order" or "Cancelled".`
        );
      }
      return;
    }
  }

  if (entityType === 'offer') {
    if (!VALID_OFFER_STATUSES.has(nextStatus)) {
      throw new ValidationError(
        `Invalid offer status "${nextStatus}". Completed transactions are tracked separately on Confirmed Orders.`
      );
    }
    if (currentStatus === nextStatus) {
      return;
    }
    if (
      currentStatus === 'Confirmed order' ||
      currentStatus === 'Rejected' ||
      currentStatus === 'Cancelled'
    ) {
      throw new ValidationError(
        `Cannot change offer status from terminal state "${currentStatus}" to "${nextStatus}".`
      );
    }
    if (currentStatus === 'Offer made' || currentStatus === 'Under discussion') {
      if (actorRole === 'farmer' && (nextStatus === 'Accepted' || nextStatus === 'Confirmed order')) {
        throw new ForbiddenError(
          'A farmer cannot unilaterally accept or confirm their own offer without buyer approval.'
        );
      }
      return;
    }
    if (currentStatus === 'Accepted') {
      if (nextStatus !== 'Confirmed order' && nextStatus !== 'Cancelled') {
        throw new ValidationError(
          `Accepted offer can only transition to "Confirmed order" or "Cancelled".`
        );
      }
      return;
    }
  }

  if (entityType === 'order') {
    if (!VALID_ORDER_STATUSES.has(nextStatus)) {
      throw new ValidationError(`Invalid order status "${nextStatus}".`);
    }
    if (currentStatus === nextStatus) {
      return;
    }
    if (currentStatus === 'Completed' || currentStatus === 'Cancelled') {
      throw new ValidationError(
        `Cannot transition order from terminal status "${currentStatus}" to "${nextStatus}".`
      );
    }
  }
}

/**
 * Resolves a verified Firebase user strictly from PostgreSQL, creating an isolated non-demo
 * farmer profile with default-false privacy consents if signing in for the first time.
 */
export async function resolveRealAuthenticatedActor(params: {
  uid: string;
  email: string;
  name?: string;
  emailVerified: boolean;
}): Promise<ResolvedActor> {
  try {
    const coordinatorAllowlist = getConfiguredCoordinatorEmails();
    const isAllowlistedCoordinator =
      params.emailVerified && coordinatorAllowlist.has(params.email.toLowerCase());

    const existingUsers = await db.select().from(users).where(eq(users.uid, params.uid));
    let dbUser = existingUsers[0];

    if (dbUser && dbUser.isDemo) {
      throw new ForbiddenError('Demo user UID cannot be used with live Firebase authentication.');
    }

    if (!dbUser) {
      const inserted = await db
        .insert(users)
        .values({
          uid: params.uid,
          email: params.email,
          displayName: params.name || params.email.split('@')[0],
          role: isAllowlistedCoordinator ? 'coordinator' : 'farmer',
          isDemo: false,
        })
        .returning();
      dbUser = inserted[0];
    } else {
      const targetRole =
        isAllowlistedCoordinator && dbUser.role !== 'coordinator' ? 'coordinator' : dbUser.role;
      const updated = await db
        .update(users)
        .set({
          email: params.email,
          displayName: params.name || dbUser.displayName,
          role: targetRole,
        })
        .where(eq(users.id, dbUser.id))
        .returning();
      dbUser = updated[0];
    }

    const normalizedRole =
      dbUser.role === 'coordinator' || dbUser.role === 'merchant' ? dbUser.role : 'farmer';

    let farmerId: number | null = null;
    let merchantId: number | null = null;

    if (normalizedRole === 'farmer') {
      const existingFarmer = await db
        .select()
        .from(farmerProfiles)
        .where(eq(farmerProfiles.userId, dbUser.id));

      if (existingFarmer[0]) {
        farmerId = existingFarmer[0].id;
      } else {
        const safeFarmerName =
          dbUser.displayName || params.name || params.email.split('@')[0] || 'Farmer';
        const createdFarmer = await db
          .insert(farmerProfiles)
          .values({
            userId: dbUser.id,
            farmerCode: `FARM-AUTH-${dbUser.id}`,
            name: safeFarmerName,
            nameTe: '',
            village: 'Not set',
            mandal: 'Not set',
            district: 'Kakinada',
            region: 'Kakinada Coastal',
            preferredLanguage: 'te',
            dialectProfile: 'kakinada_coastal',
            phoneMasked: null,
            savedKnowledgeIds: '[]',
            customVocabularyJson: '[]',
            isDemo: false,
          })
          .returning();
        farmerId = createdFarmer[0].id;

        // Strictly default every consent flag to false for new real users
        await db.insert(farmerConsent).values({
          farmerId,
          shareProfileWithAi: false,
          shareProfileWithMerchants: false,
          shareContactOnEnquiry: false,
          shareConversationWithExperts: false,
          saveConversationHistory: false,
        });

        await db.insert(farmDetails).values({
          farmerId,
          farmAreaAcres: '1.0',
          irrigationType: 'Canal',
          waterAvailability: 'Seasonal',
          climateZone: 'Coastal Delta',
          storageAvailable: false,
          storageDetails: '',
          cropInterests: '',
          constraints: '',
        });

        await db.insert(soilRecords).values({
          farmerId,
          soilType: 'Alluvial Loam',
          phLevel: '',
          organicCarbon: '',
          salinityNote: '',
          isVerifiedLabTest: false,
          expertReviewed: false,
        });
      }
    } else if (normalizedRole === 'merchant') {
      const existingMerchant = await db
        .select()
        .from(merchantProfiles)
        .where(eq(merchantProfiles.userId, dbUser.id));

      if (existingMerchant[0]) {
        merchantId = existingMerchant[0].id;
      } else {
        const safeMerchantName =
          dbUser.displayName || params.name || params.email.split('@')[0] || 'Merchant';
        const createdMerchant = await db
          .insert(merchantProfiles)
          .values({
            userId: dbUser.id,
            merchantCode: `MERCH-AUTH-${dbUser.id}`,
            businessName: safeMerchantName,
            buyerType: 'Direct Merchant',
            contactPerson: safeMerchantName,
            district: 'Kakinada',
            mandal: 'Kakinada Urban',
            locationDetail: 'Andhra Pradesh',
            savedListingIds: '[]',
            verificationStatus: 'Pending Verification',
            isDemo: false,
          })
          .returning();
        merchantId = createdMerchant[0].id;
      }
    }

    return {
      userId: dbUser.id,
      uid: dbUser.uid,
      email: dbUser.email,
      displayName: dbUser.displayName || params.name || dbUser.email,
      role: normalizedRole,
      farmerId,
      merchantId,
      isDemo: false,
    };
  } catch (error) {
    wrapDbError('resolving authenticated user', error);
  }
}

export async function getOrCreateAuthUser(uid: string, email: string, displayName?: string) {
  const actor = await resolveRealAuthenticatedActor({
    uid,
    email,
    name: displayName,
    emailVerified: true,
  });
  const rows = await db.select().from(users).where(eq(users.id, actor.userId));
  return rows[0];
}

/**
 * Resolves a demo actor by UID strictly from users/profiles where is_demo = true.
 */
export async function resolveDemoActorByUid(uid: string): Promise<ResolvedActor | null> {
  try {
    const userRows = await db
      .select()
      .from(users)
      .where(and(eq(users.uid, uid), eq(users.isDemo, true)));
    const u = userRows[0];
    if (!u || !u.isDemo) return null;

    const role = u.role === 'coordinator' || u.role === 'merchant' ? u.role : 'farmer';
    let farmerId: number | null = null;
    let merchantId: number | null = null;

    if (role === 'farmer') {
      const fRows = await db
        .select()
        .from(farmerProfiles)
        .where(and(eq(farmerProfiles.userId, u.id), eq(farmerProfiles.isDemo, true)));
      if (!fRows[0]) return null;
      farmerId = fRows[0].id;
    } else if (role === 'merchant') {
      const mRows = await db
        .select()
        .from(merchantProfiles)
        .where(and(eq(merchantProfiles.userId, u.id), eq(merchantProfiles.isDemo, true)));
      if (!mRows[0]) return null;
      merchantId = mRows[0].id;
    }

    return {
      userId: u.id,
      uid: u.uid,
      email: u.email,
      displayName: u.displayName || u.email,
      role,
      farmerId,
      merchantId,
      isDemo: true,
    };
  } catch (error) {
    wrapDbError('resolving demo actor', error);
  }
}

/**
 * Resolves a requested fictional demo persona strictly against is_demo = true database rows.
 * Rejects any attempt to select a real user's farmerId or merchantId.
 */
export async function resolveDemoPersonaForSession(params: {
  role: 'farmer' | 'merchant' | 'coordinator';
  farmerId?: number;
  merchantId?: number;
}): Promise<ResolvedActor> {
  try {
    if (params.role === 'coordinator') {
      const actor = await resolveDemoActorByUid('demo-coordinator-pilot');
      if (!actor) {
        throw new NotFoundError('Demo coordinator persona not seeded.');
      }
      return actor;
    }

    if (params.role === 'farmer') {
      const demoFarmers = await db
        .select()
        .from(farmerProfiles)
        .where(eq(farmerProfiles.isDemo, true))
        .orderBy(farmerProfiles.id);

      if (demoFarmers.length === 0) {
        throw new NotFoundError('No demo farmer personas available.');
      }

      let targetFarmer = demoFarmers[0];
      if (params.farmerId !== undefined) {
        const match = demoFarmers.find((f) => f.id === Number(params.farmerId));
        if (!match) {
          throw new ForbiddenError('Requested farmer ID is not an authorized demo persona.');
        }
        targetFarmer = match;
      }

      if (!targetFarmer.userId) {
        throw new ForbiddenError('Demo farmer persona has no linked demo user record.');
      }

      const userRows = await db
        .select()
        .from(users)
        .where(and(eq(users.id, targetFarmer.userId), eq(users.isDemo, true)));
      if (!userRows[0]) {
        throw new ForbiddenError('Demo farmer user record is invalid.');
      }

      return {
        userId: userRows[0].id,
        uid: userRows[0].uid,
        email: userRows[0].email,
        displayName: userRows[0].displayName || targetFarmer.name || userRows[0].email,
        role: 'farmer',
        farmerId: targetFarmer.id,
        merchantId: null,
        isDemo: true,
      };
    }

    if (params.role === 'merchant') {
      const demoMerchants = await db
        .select()
        .from(merchantProfiles)
        .where(eq(merchantProfiles.isDemo, true))
        .orderBy(merchantProfiles.id);

      if (demoMerchants.length === 0) {
        throw new NotFoundError('No demo merchant personas available.');
      }

      let targetMerchant = demoMerchants[0];
      if (params.merchantId !== undefined) {
        const match = demoMerchants.find((m) => m.id === Number(params.merchantId));
        if (!match) {
          throw new ForbiddenError('Requested merchant ID is not an authorized demo persona.');
        }
        targetMerchant = match;
      }

      if (!targetMerchant.userId) {
        throw new ForbiddenError('Demo merchant persona has no linked demo user record.');
      }

      const userRows = await db
        .select()
        .from(users)
        .where(and(eq(users.id, targetMerchant.userId), eq(users.isDemo, true)));
      if (!userRows[0]) {
        throw new ForbiddenError('Demo merchant user record is invalid.');
      }

      return {
        userId: userRows[0].id,
        uid: userRows[0].uid,
        email: userRows[0].email,
        displayName: userRows[0].displayName || targetMerchant.businessName || userRows[0].email,
        role: 'merchant',
        farmerId: null,
        merchantId: targetMerchant.id,
        isDemo: true,
      };
    }

    throw new ValidationError('Invalid demo role requested.');
  } catch (error) {
    wrapDbError('resolving demo persona session', error);
  }
}

/**
 * Strict role-scoped and ownership-scoped bootstrap loader.
 * - Farmers ONLY receive their own farmer profile, soil/farm records, consents, conversations,
 *   harvests, listings, enquiries, offers, orders, escalations, and notifications.
 * - Merchants NEVER receive farmer profiles, consents, soil records, conversations, or harvests;
 *   they receive ONLY their own merchant profile, own demands/enquiries/offers/orders, and
 *   consent-masked active marketplace listings.
 * - Coordinators receive operational oversight with non-consented private conversation messages
 *   and unconsented expert escalation contexts redacted.
 * - Demo personas (actor.isDemo === true) are strictly isolated from non-demo real user records.
 */
export async function getScopedBootstrapState(
  actor: ResolvedActor,
  includeDemoPersonas = false
) {
  try {
    const [
      allFarmersRaw,
      allConsents,
      allFarms,
      allSoils,
      allCrops,
      allKnowledge,
      allConvs,
      allMessages,
      allSchemes,
      allListingsRaw,
      allMerchantsRaw,
      allDemandsRaw,
      allEnquiries,
      allOffers,
      allOrders,
      allSuppliers,
      allProducts,
      allHarvests,
      allRoutes,
      allEscalations,
      allNotifications,
    ] = await Promise.all([
      db.select().from(farmerProfiles).orderBy(farmerProfiles.id),
      db.select().from(farmerConsent),
      db.select().from(farmDetails),
      db.select().from(soilRecords).orderBy(desc(soilRecords.id)),
      db.select().from(cropRecords).orderBy(desc(cropRecords.id)),
      db.select().from(agriculturalKnowledge).orderBy(agriculturalKnowledge.id),
      db.select().from(conversations).orderBy(desc(conversations.updatedAt)),
      db.select().from(conversationMessages).orderBy(conversationMessages.id),
      db.select().from(schemeRecords).orderBy(schemeRecords.id),
      db.select().from(farmerProduceListings).orderBy(desc(farmerProduceListings.id)),
      db.select().from(merchantProfiles).orderBy(merchantProfiles.id),
      db.select().from(merchantDemand).orderBy(desc(merchantDemand.id)),
      db.select().from(purchaseEnquiries).orderBy(desc(purchaseEnquiries.id)),
      db.select().from(farmerOffers).orderBy(desc(farmerOffers.id)),
      db.select().from(orders).orderBy(desc(orders.id)),
      db.select().from(supplierProfiles).orderBy(supplierProfiles.id),
      db.select().from(supplyProducts).orderBy(supplyProducts.id),
      db.select().from(harvestRecords).orderBy(desc(harvestRecords.id)),
      db
        .select()
        .from(agrirouteRecommendations)
        .orderBy(desc(agrirouteRecommendations.suitabilityScore)),
      db.select().from(expertEscalations).orderBy(desc(expertEscalations.id)),
      db.select().from(notifications).orderBy(desc(notifications.id)),
    ]);

    // Isolate demo access from real user data: demo sessions can never inspect real (isDemo=false) profiles/records
    const visibleFarmersPool = actor.isDemo
      ? allFarmersRaw.filter((f) => f.isDemo)
      : allFarmersRaw;
    const visibleMerchantsPool = actor.isDemo
      ? allMerchantsRaw.filter((m) => m.isDemo)
      : allMerchantsRaw;
    const visibleFarmerIds = new Set(visibleFarmersPool.map((f) => f.id));
    const visibleMerchantIds = new Set(visibleMerchantsPool.map((m) => m.id));

    const buildEnrichedFarmer = (f: typeof farmerProfiles.$inferSelect) => {
      const rawConsent = allConsents.find((c) => c.farmerId === f.id) || null;
      const flags = resolveConsentFlags(rawConsent);
      const normalizedConsent = {
        id: rawConsent?.id ?? 0,
        farmerId: f.id,
        ...flags,
      };
      const farm = allFarms.find((fd) => fd.farmerId === f.id) || null;
      const soils = allSoils.filter((s) => s.farmerId === f.id);
      const crops = allCrops.filter((c) => c.farmerId === f.id);
      return {
        ...f,
        consent: normalizedConsent,
        farmDetails: farm,
        latestSoil: soils[0] || null,
        soilRecords: soils,
        cropRecords: crops,
        currentCrop: crops.find((c) => c.status === 'current')?.cropName || 'Not set',
        previousCrop: crops.find((c) => c.status === 'previous')?.cropName || 'Not set',
      };
    };

    const enrichedPoolByFarmerId = new Map(
      visibleFarmersPool.map((f) => [f.id, buildEnrichedFarmer(f)])
    );

    const enrichListing = (listing: typeof farmerProduceListings.$inferSelect) => {
      const owner = enrichedPoolByFarmerId.get(listing.farmerId);
      const flags = resolveConsentFlags(owner?.consent);
      const showName = Boolean(listing.privacyShowName && flags.shareProfileWithMerchants);
      return {
        ...listing,
        farmerDisplayName: showName
          ? `${owner?.name || 'Farmer'} (${owner?.farmerCode || `FARM-${listing.farmerId}`})`
          : `Protected Farmer ID: ${owner?.farmerCode || `FARM-${listing.farmerId}`}`,
        farmerContactNote: flags.shareContactOnEnquiry
          ? owner?.phoneMasked || 'Shared via Coordinator'
          : 'Contact protected — connect via AGRISETU Purchase Enquiry',
        farmerConsentAllowsShare: flags.shareProfileWithMerchants,
      };
    };

    const enrichOffer = (offer: typeof farmerOffers.$inferSelect) => {
      const owner = enrichedPoolByFarmerId.get(offer.farmerId);
      const flags = resolveConsentFlags(owner?.consent);
      const farmerDisplayName = flags.shareProfileWithMerchants
        ? `${owner?.name || 'Farmer'} (${owner?.village || ''})`
        : `Protected Farmer (${owner?.farmerCode || `FARM-${offer.farmerId}`})`;
      return {
        ...offer,
        farmerDisplayName,
      };
    };

    const enrichedDemandsPool = allDemandsRaw
      .filter((d) => visibleMerchantIds.has(d.merchantId))
      .map((d) => {
        const merchant = visibleMerchantsPool.find((m) => m.id === d.merchantId);
        return {
          ...d,
          merchantName: merchant?.businessName || `Merchant #${d.merchantId}`,
          buyerType: merchant?.buyerType || 'Merchant',
          merchantVerification: merchant?.verificationStatus || 'Demo Account',
        };
      });

    const enrichedProducts = allProducts.map((p) => {
      const supplier = allSuppliers.find((s) => s.id === p.supplierId);
      return {
        ...p,
        supplierName: supplier?.supplierName || 'Demo Supplier',
        supplierLocation: supplier ? `${supplier.mandal}, ${supplier.district}` : 'Andhra Pradesh',
        supplierAddress: supplier?.address || '',
        supplierContact: supplier?.contactInfo || '',
        supplierVerification: supplier?.verificationStatus || 'Demo Supplier — Unverified',
      };
    });

    const demoPersonas =
      includeDemoPersonas && actor.isDemo
        ? {
            farmers: allFarmersRaw
              .filter((f) => f.isDemo)
              .map((f) => ({
                id: f.id,
                name: f.name,
                nameTe: f.nameTe,
                region: f.region,
                district: f.district,
              })),
            merchants: allMerchantsRaw
              .filter((m) => m.isDemo)
              .map((m) => ({
                id: m.id,
                businessName: m.businessName,
                buyerType: m.buyerType,
                district: m.district,
              })),
          }
        : undefined;

    if (actor.role === 'farmer') {
      const ownFarmer = actor.farmerId ? enrichedPoolByFarmerId.get(actor.farmerId) : undefined;
      const ownFarmerId = ownFarmer?.id ?? -1;

      const ownConvs = allConvs
        .filter((c) => c.farmerId === ownFarmerId)
        .map((c) => ({
          ...c,
          messages: allMessages.filter((m) => m.conversationId === c.id),
        }));

      const ownHarvests = allHarvests
        .filter((h) => h.farmerId === ownFarmerId)
        .map((h) => ({
          ...h,
          recommendations: allRoutes.filter((r) => r.harvestId === h.id),
        }));

      const publicMerchants = visibleMerchantsPool.map((m) => ({
        ...m,
        savedListingIds: '[]', // Strip merchant private saved bookmarks
      }));

      return {
        farmers: ownFarmer ? [ownFarmer] : [],
        knowledge: allKnowledge,
        schemes: allSchemes,
        listings: allListingsRaw.filter((l) => l.farmerId === ownFarmerId).map(enrichListing),
        merchants: publicMerchants,
        demands: enrichedDemandsPool.filter((d) => d.demandStatus === 'Open'),
        enquiries: allEnquiries.filter((e) => e.farmerId === ownFarmerId),
        offers: allOffers.filter((o) => o.farmerId === ownFarmerId).map(enrichOffer),
        orders: allOrders.filter((ord) => ord.farmerId === ownFarmerId),
        suppliers: allSuppliers,
        supplyProducts: enrichedProducts,
        conversations: ownConvs,
        harvests: ownHarvests,
        escalations: allEscalations.filter((esc) => esc.farmerId === ownFarmerId),
        notifications: allNotifications.filter(
          (n) =>
            n.recipientRole === 'farmer' &&
            (n.recipientFarmerId === ownFarmerId || (n.recipientFarmerId === null && actor.isDemo))
        ),
        ...(demoPersonas ? { demoPersonas } : {}),
      };
    }

    if (actor.role === 'merchant') {
      const ownMerchant = visibleMerchantsPool.find((m) => m.id === actor.merchantId);
      const ownMerchantId = ownMerchant?.id ?? -1;

      const marketplaceListings = allListingsRaw
        .filter((l) => l.listingStatus === 'Active' && visibleFarmerIds.has(l.farmerId))
        .map(enrichListing);

      return {
        farmers: [], // Never expose farmer personal/soil/consent records to merchants
        knowledge: [],
        schemes: [],
        listings: marketplaceListings,
        merchants: ownMerchant ? [ownMerchant] : [],
        demands: enrichedDemandsPool.filter((d) => d.merchantId === ownMerchantId),
        enquiries: allEnquiries.filter((e) => e.merchantId === ownMerchantId),
        offers: allOffers
          .filter((o) => o.merchantId === ownMerchantId && visibleFarmerIds.has(o.farmerId))
          .map(enrichOffer),
        orders: allOrders.filter((ord) => ord.merchantId === ownMerchantId),
        suppliers: [],
        supplyProducts: [],
        conversations: [], // Never expose farmer conversations to merchants
        harvests: [],
        escalations: [],
        notifications: allNotifications.filter(
          (n) =>
            n.recipientRole === 'merchant' &&
            (n.recipientMerchantId === ownMerchantId ||
              (n.recipientMerchantId === null && actor.isDemo))
        ),
        ...(demoPersonas ? { demoPersonas } : {}),
      };
    }

    // Coordinator role: authorized pilot oversight, with non-consented conversation text protected
    const coordinatorFarmers = Array.from(enrichedPoolByFarmerId.values()).map((f) => ({
      ...f,
      customVocabularyJson: f.consent.shareProfileWithAi ? f.customVocabularyJson : '[]',
    }));

    const escalatedConvIdsWithExpertConsent = new Set(
      allEscalations
        .filter((esc) => {
          if (!esc.conversationId || !visibleFarmerIds.has(esc.farmerId)) return false;
          const owner = enrichedPoolByFarmerId.get(esc.farmerId);
          return resolveConsentFlags(owner?.consent).shareConversationWithExperts;
        })
        .map((esc) => esc.conversationId as number)
    );

    const coordinatorConversations = allConvs
      .filter((c) => visibleFarmerIds.has(c.farmerId))
      .map((c) => ({
        ...c,
        messages: escalatedConvIdsWithExpertConsent.has(c.id)
          ? allMessages.filter((m) => m.conversationId === c.id)
          : [], // Redact private non-escalated / non-consented farmer transcripts
      }));

    const coordinatorEscalations = allEscalations
      .filter((esc) => visibleFarmerIds.has(esc.farmerId))
      .map((esc) => {
        const owner = enrichedPoolByFarmerId.get(esc.farmerId);
        const allowsExpertContext = resolveConsentFlags(owner?.consent).shareConversationWithExperts;
        return {
          ...esc,
          conversationContext: allowsExpertContext
            ? esc.conversationContext
            : 'Conversation context withheld per farmer privacy settings.',
        };
      });

    return {
      farmers: coordinatorFarmers,
      knowledge: allKnowledge,
      schemes: allSchemes,
      listings: allListingsRaw
        .filter((l) => visibleFarmerIds.has(l.farmerId))
        .map(enrichListing),
      merchants: visibleMerchantsPool.map((m) => ({ ...m, savedListingIds: '[]' })),
      demands: enrichedDemandsPool,
      enquiries: allEnquiries.filter(
        (e) => visibleFarmerIds.has(e.farmerId) && visibleMerchantIds.has(e.merchantId)
      ),
      offers: allOffers
        .filter((o) => visibleFarmerIds.has(o.farmerId) && visibleMerchantIds.has(o.merchantId))
        .map(enrichOffer),
      orders: allOrders.filter(
        (ord) => visibleFarmerIds.has(ord.farmerId) && visibleMerchantIds.has(ord.merchantId)
      ),
      suppliers: allSuppliers,
      supplyProducts: enrichedProducts,
      conversations: coordinatorConversations,
      harvests: allHarvests
        .filter((h) => visibleFarmerIds.has(h.farmerId))
        .map((h) => ({
          ...h,
          recommendations: allRoutes.filter((r) => r.harvestId === h.id),
        })),
      escalations: coordinatorEscalations,
      notifications: allNotifications.filter((n) => n.recipientRole === 'coordinator'),
      ...(demoPersonas ? { demoPersonas } : {}),
    };
  } catch (error) {
    wrapDbError('loading scoped platform state', error);
  }
}

export async function updateFarmerProfileAndFarm(
  actor: ResolvedActor,
  farmerId: number,
  payload: {
    name?: string;
    nameTe?: string;
    village?: string;
    mandal?: string;
    district?: string;
    region?: string;
    preferredLanguage?: string;
    dialectProfile?: string;
    farmAreaAcres?: string;
    irrigationType?: string;
    waterAvailability?: string;
    climateZone?: string;
    storageAvailable?: boolean;
    storageDetails?: string;
    cropInterests?: string;
    constraints?: string;
    soilType?: string;
    phLevel?: string;
    organicCarbon?: string;
    salinityNote?: string;
    currentCrop?: string;
    previousCrop?: string;
    shareProfileWithAi?: boolean;
    shareProfileWithMerchants?: boolean;
    shareContactOnEnquiry?: boolean;
    shareConversationWithExperts?: boolean;
    saveConversationHistory?: boolean;
    customVocabularyJson?: string;
    savedKnowledgeIds?: string;
  }
) {
  try {
    assertFarmerOwnership(actor, farmerId);

    const existingFarmerRows = await db
      .select()
      .from(farmerProfiles)
      .where(eq(farmerProfiles.id, farmerId));
    const existingFarmer = existingFarmerRows[0];
    if (!existingFarmer) {
      throw new NotFoundError('Farmer profile not found.');
    }

    const existingFarmRows = await db
      .select()
      .from(farmDetails)
      .where(eq(farmDetails.farmerId, farmerId));
    const existingFarm = existingFarmRows[0];

    const cleanName =
      payload.name !== undefined
        ? validateNonEmptyText(payload.name, 'Farmer name', 120)
        : existingFarmer.name;
    const cleanVillage =
      payload.village !== undefined
        ? validateNonEmptyText(payload.village, 'Village', 120)
        : existingFarmer.village;
    const cleanDistrict =
      payload.district !== undefined
        ? validateNonEmptyText(payload.district, 'District', 120)
        : existingFarmer.district;
    const cleanFarmArea =
      payload.farmAreaAcres !== undefined
        ? validatePositiveDecimalInput(payload.farmAreaAcres, 'Farm area (acres)', {
            min: 0.1,
            max: 5000,
          })
        : existingFarm?.farmAreaAcres || '1.0';

    const existingConsentRows = await db
      .select()
      .from(farmerConsent)
      .where(eq(farmerConsent.farmerId, farmerId));
    const currentConsent = resolveConsentFlags(existingConsentRows[0]);

    const nextConsent: NormalizedConsentFlags = {
      shareProfileWithAi:
        payload.shareProfileWithAi !== undefined
          ? payload.shareProfileWithAi === true
          : currentConsent.shareProfileWithAi,
      shareProfileWithMerchants:
        payload.shareProfileWithMerchants !== undefined
          ? payload.shareProfileWithMerchants === true
          : currentConsent.shareProfileWithMerchants,
      shareContactOnEnquiry:
        payload.shareContactOnEnquiry !== undefined
          ? payload.shareContactOnEnquiry === true
          : currentConsent.shareContactOnEnquiry,
      shareConversationWithExperts:
        payload.shareConversationWithExperts !== undefined
          ? payload.shareConversationWithExperts === true
          : currentConsent.shareConversationWithExperts,
      saveConversationHistory:
        payload.saveConversationHistory !== undefined
          ? payload.saveConversationHistory === true
          : currentConsent.saveConversationHistory,
    };

    const nextIrrigation =
      payload.irrigationType !== undefined
        ? payload.irrigationType || 'Canal'
        : existingFarm?.irrigationType || 'Canal';
    const nextWaterAvailability =
      payload.waterAvailability !== undefined
        ? payload.waterAvailability || 'Seasonal'
        : existingFarm?.waterAvailability || 'Seasonal';
    const nextClimateZone =
      payload.climateZone !== undefined
        ? payload.climateZone || 'Coastal Delta'
        : existingFarm?.climateZone || 'Coastal Delta';
    const nextStorageAvailable =
      payload.storageAvailable !== undefined
        ? Boolean(payload.storageAvailable)
        : Boolean(existingFarm?.storageAvailable);
    const nextStorageDetails =
      payload.storageDetails !== undefined
        ? payload.storageDetails
        : existingFarm?.storageDetails || '';
    const nextCropInterests =
      payload.cropInterests !== undefined
        ? payload.cropInterests
        : existingFarm?.cropInterests || '';
    const nextConstraints =
      payload.constraints !== undefined ? payload.constraints : existingFarm?.constraints || '';

    await db.transaction(async (tx) => {
      await tx
        .update(farmerProfiles)
        .set({
          name: cleanName,
          nameTe: payload.nameTe !== undefined ? payload.nameTe : existingFarmer.nameTe || '',
          village: cleanVillage,
          mandal:
            payload.mandal !== undefined
              ? payload.mandal.trim() || cleanVillage
              : existingFarmer.mandal || cleanVillage,
          district: cleanDistrict,
          region:
            payload.region !== undefined
              ? payload.region.trim() || cleanDistrict
              : existingFarmer.region || cleanDistrict,
          preferredLanguage:
            payload.preferredLanguage !== undefined
              ? payload.preferredLanguage === 'en'
                ? 'en'
                : 'te'
              : existingFarmer.preferredLanguage,
          dialectProfile:
            payload.dialectProfile !== undefined
              ? payload.dialectProfile || 'kakinada_coastal'
              : existingFarmer.dialectProfile,
          ...(payload.customVocabularyJson !== undefined
            ? { customVocabularyJson: payload.customVocabularyJson }
            : {}),
          ...(payload.savedKnowledgeIds !== undefined
            ? { savedKnowledgeIds: payload.savedKnowledgeIds }
            : {}),
          updatedAt: new Date(),
        })
        .where(eq(farmerProfiles.id, farmerId));

      await tx
        .insert(farmerConsent)
        .values({
          farmerId,
          ...nextConsent,
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: farmerConsent.farmerId,
          set: {
            ...nextConsent,
            updatedAt: new Date(),
          },
        });

      await tx
        .insert(farmDetails)
        .values({
          farmerId,
          farmAreaAcres: cleanFarmArea,
          irrigationType: nextIrrigation,
          waterAvailability: nextWaterAvailability,
          climateZone: nextClimateZone,
          storageAvailable: nextStorageAvailable,
          storageDetails: nextStorageDetails,
          cropInterests: nextCropInterests,
          constraints: nextConstraints,
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: farmDetails.farmerId,
          set: {
            farmAreaAcres: cleanFarmArea,
            irrigationType: nextIrrigation,
            waterAvailability: nextWaterAvailability,
            climateZone: nextClimateZone,
            storageAvailable: nextStorageAvailable,
            storageDetails: nextStorageDetails,
            cropInterests: nextCropInterests,
            constraints: nextConstraints,
            updatedAt: new Date(),
          },
        });

      const existingSoils = await tx
        .select()
        .from(soilRecords)
        .where(eq(soilRecords.farmerId, farmerId))
        .orderBy(desc(soilRecords.id));

      if (existingSoils[0]) {
        await tx
          .update(soilRecords)
          .set({
            soilType:
              payload.soilType !== undefined
                ? payload.soilType || 'Alluvial Loam'
                : existingSoils[0].soilType,
            phLevel:
              payload.phLevel !== undefined ? payload.phLevel : existingSoils[0].phLevel || '',
            organicCarbon:
              payload.organicCarbon !== undefined
                ? payload.organicCarbon
                : existingSoils[0].organicCarbon || '',
            salinityNote:
              payload.salinityNote !== undefined
                ? payload.salinityNote
                : existingSoils[0].salinityNote || '',
          })
          .where(eq(soilRecords.id, existingSoils[0].id));
      } else {
        await tx.insert(soilRecords).values({
          farmerId,
          soilType: payload.soilType || 'Alluvial Loam',
          phLevel: payload.phLevel || '',
          organicCarbon: payload.organicCarbon || '',
          salinityNote: payload.salinityNote || '',
          isVerifiedLabTest: false,
        });
      }

      const existingCrops = await tx
        .select()
        .from(cropRecords)
        .where(eq(cropRecords.farmerId, farmerId));
      const currentRec = existingCrops.find((c) => c.status === 'current');
      const prevRec = existingCrops.find((c) => c.status === 'previous');

      if (currentRec) {
        await tx
          .update(cropRecords)
          .set({
            cropName:
              payload.currentCrop !== undefined
                ? payload.currentCrop || 'Not set'
                : currentRec.cropName,
            areaAcres: cleanFarmArea,
          })
          .where(eq(cropRecords.id, currentRec.id));
      } else if (payload.currentCrop !== undefined) {
        await tx.insert(cropRecords).values({
          farmerId,
          season: 'Current Season',
          cropName: payload.currentCrop || 'Not set',
          status: 'current',
          areaAcres: cleanFarmArea,
        });
      }

      if (prevRec) {
        await tx
          .update(cropRecords)
          .set({
            cropName:
              payload.previousCrop !== undefined
                ? payload.previousCrop || 'Not set'
                : prevRec.cropName,
          })
          .where(eq(cropRecords.id, prevRec.id));
      } else if (payload.previousCrop !== undefined) {
        await tx.insert(cropRecords).values({
          farmerId,
          season: 'Previous Season',
          cropName: payload.previousCrop || 'Not set',
          status: 'previous',
          areaAcres: cleanFarmArea,
        });
      }
    });
  } catch (error) {
    wrapDbError('updating farmer profile and farm details', error);
  }
}

export async function toggleFarmerSavedKnowledge(
  actor: ResolvedActor,
  farmerId: number,
  knowledgeId: number
) {
  try {
    assertFarmerOwnership(actor, farmerId);
    if (!Number.isInteger(knowledgeId) || knowledgeId <= 0) {
      throw new ValidationError('Valid knowledge item ID is required.');
    }
    const rows = await db.select().from(farmerProfiles).where(eq(farmerProfiles.id, farmerId));
    if (!rows[0]) throw new NotFoundError('Farmer profile not found.');
    const current: number[] = JSON.parse(rows[0].savedKnowledgeIds || '[]');
    const next = current.includes(knowledgeId)
      ? current.filter((id) => id !== knowledgeId)
      : [...current, knowledgeId];
    await db
      .update(farmerProfiles)
      .set({ savedKnowledgeIds: JSON.stringify(next), updatedAt: new Date() })
      .where(eq(farmerProfiles.id, farmerId));
    return next;
  } catch (error) {
    wrapDbError('updating saved agricultural knowledge', error);
  }
}

export async function updateFarmerVocabulary(
  actor: ResolvedActor,
  farmerId: number,
  vocabList: Array<{ term: string; meaning: string }>
) {
  try {
    assertFarmerOwnership(actor, farmerId);
    const sanitized = vocabList
      .slice(0, 50)
      .map((item) => ({
        term: validateNonEmptyText(item?.term, 'Dialect term', 80),
        meaning: validateNonEmptyText(item?.meaning, 'Term meaning', 200),
      }));
    await db
      .update(farmerProfiles)
      .set({ customVocabularyJson: JSON.stringify(sanitized), updatedAt: new Date() })
      .where(eq(farmerProfiles.id, farmerId));
  } catch (error) {
    wrapDbError('updating regional dialect vocabulary', error);
  }
}

export async function toggleMerchantSavedListing(
  actor: ResolvedActor,
  merchantId: number,
  listingId: number
) {
  try {
    assertMerchantOwnership(actor, merchantId);
    if (!Number.isInteger(listingId) || listingId <= 0) {
      throw new ValidationError('Valid listing ID is required.');
    }
    const rows = await db
      .select()
      .from(merchantProfiles)
      .where(eq(merchantProfiles.id, merchantId));
    if (!rows[0]) throw new NotFoundError('Merchant profile not found.');
    const current: number[] = JSON.parse(rows[0].savedListingIds || '[]');
    const next = current.includes(listingId)
      ? current.filter((id) => id !== listingId)
      : [...current, listingId];
    await db
      .update(merchantProfiles)
      .set({ savedListingIds: JSON.stringify(next) })
      .where(eq(merchantProfiles.id, merchantId));
    return next;
  } catch (error) {
    wrapDbError('saving produce listing', error);
  }
}

export async function createProduceListing(
  actor: ResolvedActor,
  data: {
    farmerId?: number;
    cropName: string;
    variety?: string;
    imageKey?: string;
    quantityQuintals: string;
    expectedHarvestDate: string;
    availabilityType?: string;
    qualityGrade: string;
    productionMethod?: string;
    askingPricePerQuintal?: string;
    village?: string;
    mandal?: string;
    district?: string;
    privacyShowName?: boolean;
  }
) {
  try {
    if (actor.role !== 'farmer' || !actor.farmerId) {
      throw new ForbiddenError('Only authenticated farmers can publish produce listings.');
    }
    if (data.farmerId !== undefined && Number(data.farmerId) !== actor.farmerId) {
      throw new ForbiddenError('Cannot publish a produce listing on behalf of another farmer.');
    }

    const cropName = validateNonEmptyText(data.cropName, 'Crop name', 120);
    const quantityQuintals = validatePositiveDecimalInput(
      data.quantityQuintals,
      'Quantity (quintals)',
      { min: 0.1, max: 50000 }
    );
    const expectedHarvestDate = validateIsoDateInput(
      data.expectedHarvestDate,
      'Expected harvest date'
    );
    const qualityGrade = validateNonEmptyText(data.qualityGrade, 'Quality grade', 160);
    const askingPricePerQuintal = validateOptionalPositiveDecimalInput(
      data.askingPricePerQuintal,
      'Asking price per quintal',
      { min: 1, max: 500000 }
    );

    return await db.transaction(async (tx) => {
      const farmerRows = await tx
        .select()
        .from(farmerProfiles)
        .where(eq(farmerProfiles.id, actor.farmerId!));
      const ownerFarmer = farmerRows[0];
      if (!ownerFarmer) {
        throw new NotFoundError('Farmer profile not found.');
      }

      // Rapid-click / retry submission deduplication (15-second window)
      const recentListings = await tx
        .select()
        .from(farmerProduceListings)
        .where(eq(farmerProduceListings.farmerId, ownerFarmer.id))
        .orderBy(desc(farmerProduceListings.id));

      const duplicateRecent = recentListings.find(
        (l) =>
          l.cropName === cropName &&
          l.quantityQuintals === quantityQuintals &&
          l.expectedHarvestDate === expectedHarvestDate &&
          l.createdAt !== null &&
          Date.now() - new Date(l.createdAt).getTime() < 15000
      );
      if (duplicateRecent) {
        return duplicateRecent;
      }

      const village = (data.village || '').trim() || ownerFarmer.village || 'Pilot Village';
      const mandal = (data.mandal || '').trim() || ownerFarmer.mandal || 'Kakinada Rural';
      const district = (data.district || '').trim() || ownerFarmer.district || 'Kakinada';

      const inserted = await tx
        .insert(farmerProduceListings)
        .values({
          farmerId: ownerFarmer.id,
          cropName,
          variety: (data.variety || '').trim().slice(0, 120),
          imageKey: data.imageKey || 'crop_paddy_harvest',
          quantityQuintals,
          expectedHarvestDate,
          availabilityType:
            data.availabilityType === 'upcoming_harvest' ? 'upcoming_harvest' : 'available_now',
          qualityGrade,
          qualityVerification: 'Self-reported',
          productionMethod: (data.productionMethod || 'Standard Cultivation').trim().slice(0, 120),
          askingPricePerQuintal,
          village,
          mandal,
          district,
          listingStatus: 'Active',
          privacyShowName: data.privacyShowName ?? false,
          isDemo: actor.isDemo,
        })
        .returning();

      await tx.insert(notifications).values({
        recipientRole: 'coordinator',
        eventType: 'new_listing',
        title: `New Produce Listing: ${cropName}`,
        message: `Farmer #${ownerFarmer.id} published ${quantityQuintals} quintals of ${cropName} in ${district}.`,
        relatedTab: 'merchant_market',
      });

      return inserted[0];
    });
  } catch (error) {
    wrapDbError('creating produce listing', error);
  }
}

export async function createMerchantDemandRecord(
  actor: ResolvedActor,
  data: {
    merchantId?: number;
    cropName: string;
    quantityRequiredQuintals: string;
    qualitySpecifications: string;
    acceptsCosmeticImperfect?: boolean;
    procurementPeriod: string;
    deliveryLocation: string;
    district?: string;
    offeredPriceRange?: string;
    additionalRequirements?: string;
  }
) {
  try {
    if (actor.role !== 'merchant' || !actor.merchantId) {
      throw new ForbiddenError('Only authenticated merchants can publish procurement requirements.');
    }
    if (data.merchantId !== undefined && Number(data.merchantId) !== actor.merchantId) {
      throw new ForbiddenError(
        'Cannot publish a procurement requirement on behalf of another merchant.'
      );
    }

    const cropName = validateNonEmptyText(data.cropName, 'Crop name', 120);
    const quantityRequiredQuintals = validatePositiveDecimalInput(
      data.quantityRequiredQuintals,
      'Required quantity (quintals)',
      { min: 0.1, max: 100000 }
    );
    const qualitySpecifications = validateNonEmptyText(
      data.qualitySpecifications,
      'Quality specifications',
      400
    );
    const procurementPeriod = validateNonEmptyText(
      data.procurementPeriod,
      'Procurement period',
      140
    );
    const deliveryLocation = validateNonEmptyText(
      data.deliveryLocation,
      'Delivery location',
      200
    );
    const district = (data.district || 'Kakinada').trim().slice(0, 100);

    return await db.transaction(async (tx) => {
      const existingDemands = await tx
        .select()
        .from(merchantDemand)
        .where(eq(merchantDemand.merchantId, actor.merchantId!))
        .orderBy(desc(merchantDemand.id));

      const duplicateRecent = existingDemands.find(
        (d) =>
          d.cropName === cropName &&
          d.quantityRequiredQuintals === quantityRequiredQuintals &&
          d.procurementPeriod === procurementPeriod &&
          d.createdAt !== null &&
          Date.now() - new Date(d.createdAt).getTime() < 15000
      );
      if (duplicateRecent) {
        return duplicateRecent;
      }

      const inserted = await tx
        .insert(merchantDemand)
        .values({
          merchantId: actor.merchantId!,
          cropName,
          quantityRequiredQuintals,
          qualitySpecifications,
          acceptsCosmeticImperfect: Boolean(data.acceptsCosmeticImperfect),
          procurementPeriod,
          deliveryLocation,
          district,
          offeredPriceRange:
            (data.offeredPriceRange || '').trim().slice(0, 120) || 'Market-linked negotiation',
          additionalRequirements: (data.additionalRequirements || '').trim().slice(0, 300),
          demandStatus: 'Open',
          distanceKmFromKakinada: district.toLowerCase().includes('kakinada') ? 18 : 55,
          distanceKmFromGodavari: district.toLowerCase().includes('kakinada') ? 52 : 16,
          isDemo: actor.isDemo,
        })
        .returning();

      if (actor.isDemo) {
        await tx.insert(notifications).values({
          recipientRole: 'farmer',
          eventType: 'new_merchant_demand',
          title: `New Buyer Requirement: ${cropName}`,
          message: `A merchant published procurement demand for ${quantityRequiredQuintals} quintals of ${cropName} (${data.offeredPriceRange || 'Negotiable'}/qtl).`,
          relatedTab: 'farmer_market',
        });
      }

      return inserted[0];
    });
  } catch (error) {
    wrapDbError('creating merchant demand', error);
  }
}

export async function createPurchaseEnquiryRecord(
  actor: ResolvedActor,
  data: {
    listingId: number;
    merchantId?: number;
    farmerId?: number;
    requiredQuantityQuintals: string;
    proposedPricePerQuintal: string;
    qualityRequirements?: string;
    logisticsPreference?: string;
    procurementDate: string;
    message?: string;
  }
) {
  try {
    if (actor.role !== 'merchant' || !actor.merchantId) {
      throw new ForbiddenError('Only authenticated merchants can send purchase enquiries.');
    }
    if (data.merchantId !== undefined && Number(data.merchantId) !== actor.merchantId) {
      throw new ForbiddenError('Cannot send purchase enquiry using another merchant identity.');
    }

    const listingId = Number(data.listingId);
    if (!Number.isInteger(listingId) || listingId <= 0) {
      throw new ValidationError('Valid produce listing ID is required.');
    }

    const requiredQuantityQuintals = validatePositiveDecimalInput(
      data.requiredQuantityQuintals,
      'Required quantity (quintals)',
      { min: 0.1, max: 50000 }
    );
    const proposedPricePerQuintal = validatePositiveDecimalInput(
      data.proposedPricePerQuintal,
      'Proposed price per quintal',
      { min: 1, max: 500000 }
    );
    const procurementDate = validateIsoDateInput(data.procurementDate, 'Procurement date');

    return await db.transaction(async (tx) => {
      const listingRows = await tx
        .select()
        .from(farmerProduceListings)
        .where(eq(farmerProduceListings.id, listingId));
      const listing = listingRows[0];
      if (!listing) {
        throw new NotFoundError('Target produce listing not found.');
      }
      if (actor.isDemo && !listing.isDemo) {
        throw new ForbiddenError('Demo merchant cannot enquire on a real farmer listing.');
      }
      if (data.farmerId !== undefined && Number(data.farmerId) !== listing.farmerId) {
        throw new ValidationError('Listing owner mismatch.');
      }

      // Deduplicate rapid double-clicks within 15 seconds
      const existingEnquiries = await tx
        .select()
        .from(purchaseEnquiries)
        .where(
          and(
            eq(purchaseEnquiries.listingId, listing.id),
            eq(purchaseEnquiries.merchantId, actor.merchantId!)
          )
        )
        .orderBy(desc(purchaseEnquiries.id));

      const duplicateRecent = existingEnquiries.find(
        (e) =>
          e.requiredQuantityQuintals === requiredQuantityQuintals &&
          e.proposedPricePerQuintal === proposedPricePerQuintal &&
          e.procurementDate === procurementDate &&
          e.createdAt !== null &&
          Date.now() - new Date(e.createdAt).getTime() < 15000
      );
      if (duplicateRecent) {
        return duplicateRecent;
      }

      const inserted = await tx
        .insert(purchaseEnquiries)
        .values({
          listingId: listing.id,
          merchantId: actor.merchantId!,
          farmerId: listing.farmerId,
          requiredQuantityQuintals,
          proposedPricePerQuintal,
          qualityRequirements:
            (data.qualityRequirements || '').trim().slice(0, 300) ||
            'Standard FAQ moisture & grading check',
          logisticsPreference:
            (data.logisticsPreference || '').trim().slice(0, 200) || 'Farmgate pickup',
          procurementDate,
          message: (data.message || '').trim().slice(0, 500),
          status: 'Enquiry received',
        })
        .returning();

      await tx.insert(notifications).values({
        recipientRole: 'farmer',
        recipientFarmerId: listing.farmerId,
        eventType: 'enquiry_received',
        title: 'New Merchant Purchase Enquiry Received',
        message: `Enquiry for ${requiredQuantityQuintals} qtl at ₹${proposedPricePerQuintal}/qtl. Review and respond in My Farm.`,
        relatedTab: 'my_farm',
      });

      return inserted[0];
    });
  } catch (error) {
    wrapDbError('submitting purchase enquiry', error);
  }
}

export async function updatePurchaseEnquiryStatus(
  actor: ResolvedActor,
  enquiryId: number,
  nextStatusInput: string
) {
  try {
    if (!Number.isInteger(enquiryId) || enquiryId <= 0) {
      throw new ValidationError('Valid enquiry ID is required.');
    }
    const normalizedStatus =
      nextStatusInput.trim().toLowerCase() === 'confirmed_order'
        ? 'Confirmed order'
        : nextStatusInput.trim();

    return await db.transaction(async (tx) => {
      const existingRows = await tx
        .select()
        .from(purchaseEnquiries)
        .where(eq(purchaseEnquiries.id, enquiryId));
      const existing = existingRows[0];
      if (!existing) {
        throw new NotFoundError('Purchase enquiry not found.');
      }

      const isOwningFarmer = actor.role === 'farmer' && actor.farmerId === existing.farmerId;
      const isOwningMerchant =
        actor.role === 'merchant' && actor.merchantId === existing.merchantId;
      if (!isOwningFarmer && !isOwningMerchant) {
        throw new ForbiddenError('Forbidden: You do not own this purchase enquiry.');
      }

      validateMarketplaceStatusTransition(
        'enquiry',
        existing.status,
        normalizedStatus,
        actor.role
      );

      // Idempotent handling if status is unchanged
      if (existing.status === normalizedStatus) {
        return existing;
      }

      const updatedRows = await tx
        .update(purchaseEnquiries)
        .set({ status: normalizedStatus, updatedAt: new Date() })
        .where(eq(purchaseEnquiries.id, enquiryId))
        .returning();
      const enq = updatedRows[0];

      if (normalizedStatus === 'Confirmed order') {
        // Idempotent check + unique index guard on (source_type, source_id)
        const existingOrderRows = await tx
          .select()
          .from(orders)
          .where(and(eq(orders.sourceType, 'enquiry'), eq(orders.sourceId, enq.id)));

        if (!existingOrderRows[0]) {
          const listingRows = await tx
            .select()
            .from(farmerProduceListings)
            .where(eq(farmerProduceListings.id, enq.listingId));
          const cropName = listingRows[0]?.cropName || 'Agricultural Produce';
          const orderCode = `ORD-ENQ-${enq.id}-${Date.now().toString().slice(-4)}`;

          const insertedOrder = await tx
            .insert(orders)
            .values({
              orderCode,
              farmerId: enq.farmerId,
              merchantId: enq.merchantId,
              sourceType: 'enquiry',
              sourceId: enq.id,
              cropName,
              agreedQuantityQuintals: enq.requiredQuantityQuintals,
              agreedPricePerQuintal: enq.proposedPricePerQuintal,
              deliveryMode: enq.logisticsPreference,
              scheduledDate: enq.procurementDate,
              orderStatus: 'Confirmed order',
              notes: enq.message || 'Confirmed from purchase enquiry.',
              isDemo: actor.isDemo,
            })
            .onConflictDoNothing()
            .returning();

          if (insertedOrder[0]) {
            await tx.insert(notifications).values([
              {
                recipientRole: 'farmer',
                recipientFarmerId: enq.farmerId,
                eventType: 'order_confirmed',
                title: `Order Confirmed (${orderCode})`,
                message: `Confirmed order for ${enq.requiredQuantityQuintals} qtl of ${cropName} at ₹${enq.proposedPricePerQuintal}/qtl.`,
                relatedTab: 'my_farm',
              },
              {
                recipientRole: 'merchant',
                recipientMerchantId: enq.merchantId,
                eventType: 'order_confirmed',
                title: `Order Confirmed (${orderCode})`,
                message: `Purchase enquiry #${enq.id} is now a Confirmed Order (${enq.requiredQuantityQuintals} qtl of ${cropName}).`,
                relatedTab: 'merchant_market',
              },
            ]);
          }
        }
      } else {
        await tx.insert(notifications).values({
          recipientRole: isOwningFarmer ? 'merchant' : 'farmer',
          recipientFarmerId: isOwningFarmer ? null : enq.farmerId,
          recipientMerchantId: isOwningFarmer ? enq.merchantId : null,
          eventType: 'enquiry_status_updated',
          title: `Enquiry #${enq.id} Status: ${normalizedStatus}`,
          message: `Purchase enquiry status updated to "${normalizedStatus}".`,
          relatedTab: isOwningFarmer ? 'merchant_market' : 'my_farm',
        });
      }

      return enq;
    });
  } catch (error) {
    wrapDbError('updating enquiry status', error);
  }
}

export async function createFarmerOfferRecord(
  actor: ResolvedActor,
  data: {
    demandId: number;
    farmerId?: number;
    merchantId?: number;
    quantityOfferedQuintals: string;
    expectedPricePerQuintal: string;
    expectedHarvestDate: string;
    qualityDetails?: string;
    message?: string;
  }
) {
  try {
    if (actor.role !== 'farmer' || !actor.farmerId) {
      throw new ForbiddenError('Only authenticated farmers can submit produce offers.');
    }
    if (data.farmerId !== undefined && Number(data.farmerId) !== actor.farmerId) {
      throw new ForbiddenError('Cannot submit a produce offer using another farmer identity.');
    }

    const demandId = Number(data.demandId);
    if (!Number.isInteger(demandId) || demandId <= 0) {
      throw new ValidationError('Valid buyer requirement ID is required.');
    }

    const quantityOfferedQuintals = validatePositiveDecimalInput(
      data.quantityOfferedQuintals,
      'Offered quantity (quintals)',
      { min: 0.1, max: 50000 }
    );
    const expectedPricePerQuintal = validatePositiveDecimalInput(
      data.expectedPricePerQuintal,
      'Expected price per quintal',
      { min: 1, max: 500000 }
    );
    const expectedHarvestDate = validateIsoDateInput(
      data.expectedHarvestDate,
      'Expected harvest date'
    );

    return await db.transaction(async (tx) => {
      const demandRows = await tx
        .select()
        .from(merchantDemand)
        .where(eq(merchantDemand.id, demandId));
      const demand = demandRows[0];
      if (!demand) {
        throw new NotFoundError('Target buyer procurement requirement not found.');
      }
      if (actor.isDemo && !demand.isDemo) {
        throw new ForbiddenError('Demo farmer cannot submit an offer to a non-demo requirement.');
      }
      if (data.merchantId !== undefined && Number(data.merchantId) !== demand.merchantId) {
        throw new ValidationError('Requirement merchant mismatch.');
      }

      // Deduplicate rapid double-clicks within 15 seconds
      const existingOffers = await tx
        .select()
        .from(farmerOffers)
        .where(
          and(
            eq(farmerOffers.demandId, demand.id),
            eq(farmerOffers.farmerId, actor.farmerId!)
          )
        )
        .orderBy(desc(farmerOffers.id));

      const duplicateRecent = existingOffers.find(
        (o) =>
          o.quantityOfferedQuintals === quantityOfferedQuintals &&
          o.expectedPricePerQuintal === expectedPricePerQuintal &&
          o.expectedHarvestDate === expectedHarvestDate &&
          o.createdAt !== null &&
          Date.now() - new Date(o.createdAt).getTime() < 15000
      );
      if (duplicateRecent) {
        return duplicateRecent;
      }

      const inserted = await tx
        .insert(farmerOffers)
        .values({
          demandId: demand.id,
          farmerId: actor.farmerId!,
          merchantId: demand.merchantId,
          quantityOfferedQuintals,
          expectedPricePerQuintal,
          expectedHarvestDate,
          qualityDetails:
            (data.qualityDetails || '').trim().slice(0, 300) || 'Self-reported FAQ harvest lot',
          message: (data.message || '').trim().slice(0, 500),
          status: 'Offer made',
        })
        .returning();

      await tx.insert(notifications).values({
        recipientRole: 'merchant',
        recipientMerchantId: demand.merchantId,
        eventType: 'offer_submitted',
        title: 'New Farmer Produce Offer Received',
        message: `Farmer #${actor.farmerId} offered ${quantityOfferedQuintals} qtl at ₹${expectedPricePerQuintal}/qtl.`,
        relatedTab: 'merchant_market',
      });

      return inserted[0];
    });
  } catch (error) {
    wrapDbError('submitting farmer offer', error);
  }
}

export async function updateFarmerOfferStatus(
  actor: ResolvedActor,
  offerId: number,
  nextStatusInput: string
) {
  try {
    if (!Number.isInteger(offerId) || offerId <= 0) {
      throw new ValidationError('Valid offer ID is required.');
    }
    const nextStatus =
      nextStatusInput.trim().toLowerCase() === 'confirmed_order'
        ? 'Confirmed order'
        : nextStatusInput.trim();

    return await db.transaction(async (tx) => {
      const existingRows = await tx
        .select()
        .from(farmerOffers)
        .where(eq(farmerOffers.id, offerId));
      const existing = existingRows[0];
      if (!existing) {
        throw new NotFoundError('Farmer offer not found.');
      }

      const isOwningMerchant =
        actor.role === 'merchant' && actor.merchantId === existing.merchantId;
      const isOwningFarmer = actor.role === 'farmer' && actor.farmerId === existing.farmerId;
      if (!isOwningMerchant && !isOwningFarmer) {
        throw new ForbiddenError('Forbidden: You do not own this produce offer.');
      }

      validateMarketplaceStatusTransition('offer', existing.status, nextStatus, actor.role);

      if (existing.status === nextStatus) {
        return existing;
      }

      const updated = await tx
        .update(farmerOffers)
        .set({ status: nextStatus, updatedAt: new Date() })
        .where(eq(farmerOffers.id, offerId))
        .returning();

      const offer = updated[0];

      if (nextStatus === 'Confirmed order') {
        const existingOrderRows = await tx
          .select()
          .from(orders)
          .where(and(eq(orders.sourceType, 'offer'), eq(orders.sourceId, offer.id)));

        if (!existingOrderRows[0]) {
          const demandRows = await tx
            .select()
            .from(merchantDemand)
            .where(eq(merchantDemand.id, offer.demandId));
          const cropName = demandRows[0]?.cropName || 'Farm Produce';
          const deliveryMode = demandRows[0]?.deliveryLocation || 'As mutually scheduled';
          const orderCode = `ORD-OFF-${offer.id}-${Date.now().toString().slice(-4)}`;

          const insertedOrder = await tx
            .insert(orders)
            .values({
              orderCode,
              farmerId: offer.farmerId,
              merchantId: offer.merchantId,
              sourceType: 'offer',
              sourceId: offer.id,
              cropName,
              agreedQuantityQuintals: offer.quantityOfferedQuintals,
              agreedPricePerQuintal: offer.expectedPricePerQuintal,
              deliveryMode,
              scheduledDate: offer.expectedHarvestDate,
              orderStatus: 'Confirmed order',
              notes: offer.message || 'Confirmed from farmer offer.',
              isDemo: actor.isDemo,
            })
            .onConflictDoNothing()
            .returning();

          if (insertedOrder[0]) {
            await tx.insert(notifications).values([
              {
                recipientRole: 'farmer',
                recipientFarmerId: offer.farmerId,
                eventType: 'order_confirmed',
                title: `Offer Confirmed as Order (${orderCode})`,
                message: `Your offer of ${offer.quantityOfferedQuintals} qtl of ${cropName} is now a Confirmed Order.`,
                relatedTab: 'my_farm',
              },
              {
                recipientRole: 'merchant',
                recipientMerchantId: offer.merchantId,
                eventType: 'order_confirmed',
                title: `Order Confirmed (${orderCode})`,
                message: `Farmer offer #${offer.id} converted to Confirmed Order (${cropName}).`,
                relatedTab: 'merchant_market',
              },
            ]);
          }
        }
      } else {
        await tx.insert(notifications).values({
          recipientRole: isOwningMerchant ? 'farmer' : 'merchant',
          recipientFarmerId: isOwningMerchant ? offer.farmerId : null,
          recipientMerchantId: isOwningMerchant ? null : offer.merchantId,
          eventType: 'offer_response',
          title: `Offer #${offer.id} Updated: ${nextStatus}`,
          message: `Produce offer status is now "${nextStatus}".`,
          relatedTab: isOwningMerchant ? 'my_farm' : 'merchant_market',
        });
      }

      return offer;
    });
  } catch (error) {
    wrapDbError('updating farmer offer status', error);
  }
}

export async function updateOrderRecordStatus(
  actor: ResolvedActor,
  orderId: number,
  orderStatusInput: string,
  farmerFeedback?: string
) {
  try {
    if (!Number.isInteger(orderId) || orderId <= 0) {
      throw new ValidationError('Valid order ID is required.');
    }
    const orderStatus = orderStatusInput.trim();

    return await db.transaction(async (tx) => {
      const existingRows = await tx.select().from(orders).where(eq(orders.id, orderId));
      const existing = existingRows[0];
      if (!existing) {
        throw new NotFoundError('Order not found.');
      }

      const isOwningFarmer = actor.role === 'farmer' && actor.farmerId === existing.farmerId;
      const isOwningMerchant =
        actor.role === 'merchant' && actor.merchantId === existing.merchantId;
      const isAuthorizedCoordinator =
        actor.role === 'coordinator' && (!actor.isDemo || existing.isDemo);

      if (!isOwningFarmer && !isOwningMerchant && !isAuthorizedCoordinator) {
        throw new ForbiddenError('Forbidden: You are not a party to this order.');
      }

      validateMarketplaceStatusTransition('order', existing.orderStatus, orderStatus, actor.role);

      if (farmerFeedback !== undefined && !isOwningFarmer) {
        throw new ForbiddenError('Only the owning farmer can record farmer outcome feedback.');
      }

      const cleanFeedback =
        farmerFeedback !== undefined ? String(farmerFeedback).trim().slice(0, 500) : undefined;

      if (
        existing.orderStatus === orderStatus &&
        (cleanFeedback === undefined || cleanFeedback === (existing.farmerFeedback || ''))
      ) {
        return existing;
      }

      const updated = await tx
        .update(orders)
        .set({
          orderStatus,
          ...(cleanFeedback !== undefined ? { farmerFeedback: cleanFeedback } : {}),
          updatedAt: new Date(),
        })
        .where(eq(orders.id, orderId))
        .returning();

      const ord = updated[0];

      if (existing.orderStatus !== orderStatus) {
        await tx.insert(notifications).values([
          {
            recipientRole: 'farmer',
            recipientFarmerId: ord.farmerId,
            eventType: 'order_status_changed',
            title: `Order ${ord.orderCode} Updated: ${orderStatus}`,
            message: `Order for ${ord.cropName} (${ord.agreedQuantityQuintals} qtl) is now marked "${orderStatus}".`,
            relatedTab: 'my_farm',
          },
          {
            recipientRole: 'merchant',
            recipientMerchantId: ord.merchantId,
            eventType: 'order_status_changed',
            title: `Order ${ord.orderCode} Updated: ${orderStatus}`,
            message: `Order for ${ord.cropName} is now marked "${orderStatus}".`,
            relatedTab: 'merchant_market',
          },
        ]);
      }

      return ord;
    });
  } catch (error) {
    wrapDbError('updating order status', error);
  }
}

export async function saveConversationTurn(params: {
  conversationId?: number | null;
  farmerId: number;
  persistHistory: boolean;
  shareWithExperts: boolean;
  title: string;
  language: string;
  dialectProfile: string;
  mode: string;
  questionText: string;
  transcribedFromVoice: boolean;
  replyText: string;
  citationsJson: string;
  confidenceNote: string;
  shouldEscalate: boolean;
  escalationCategory: string;
  escalationReason: string;
  conversationContextForExpert?: string;
}): Promise<number | null> {
  try {
    return await db.transaction(async (tx) => {
      let convId: number | null = null;

      if (params.persistHistory) {
        if (params.conversationId) {
          const existingConvRows = await tx
            .select()
            .from(conversations)
            .where(eq(conversations.id, params.conversationId));
          const existingConv = existingConvRows[0];
          if (!existingConv) {
            throw new NotFoundError('Conversation not found.');
          }
          if (existingConv.farmerId !== params.farmerId) {
            throw new ForbiddenError('Forbidden: Conversation belongs to another farmer.');
          }
          convId = existingConv.id;
          await tx
            .update(conversations)
            .set({
              status: params.shouldEscalate ? 'Escalated' : 'Resolved',
              updatedAt: new Date(),
            })
            .where(eq(conversations.id, convId));
        } else {
          const createdConv = await tx
            .insert(conversations)
            .values({
              farmerId: params.farmerId,
              title: params.title.slice(0, 90),
              language: params.language,
              dialectProfile: params.dialectProfile,
              mode: params.mode,
              status: params.shouldEscalate ? 'Escalated' : 'Resolved',
            })
            .returning();
          convId = createdConv[0].id;
        }

        await tx.insert(conversationMessages).values([
          {
            conversationId: convId,
            sender: 'farmer',
            messageText: params.questionText,
            transcribedFromVoice: params.transcribedFromVoice,
            citationsJson: '[]',
            escalated: false,
          },
          {
            conversationId: convId,
            sender: 'assistant',
            messageText: params.replyText,
            transcribedFromVoice: false,
            citationsJson: params.citationsJson,
            confidenceNote: params.confidenceNote,
            escalated: params.shouldEscalate,
          },
        ]);
      }

      if (params.shouldEscalate) {
        if (params.shareWithExperts) {
          await tx.insert(expertEscalations).values({
            farmerId: params.farmerId,
            conversationId: convId,
            questionText: params.questionText,
            category: params.escalationCategory || 'Agronomic Escalation',
            conversationContext:
              params.conversationContextForExpert ||
              'Explicit expert-sharing consent granted for this question.',
            escalationReason:
              params.escalationReason || 'Flagged for agricultural expert review.',
            status: 'Pending Expert Review',
            assignedExpert: 'Unassigned — Coordinator Queue',
          });

          await tx.insert(notifications).values([
            {
              recipientRole: 'farmer',
              recipientFarmerId: params.farmerId,
              eventType: 'question_escalated',
              title: 'Question Escalated to Agricultural Expert',
              message:
                'Your agricultural query involves field-specific safety/diagnostic judgement and has been sent to an Agricultural Expert.',
              relatedTab: 'assistant',
            },
            {
              recipientRole: 'coordinator',
              eventType: 'question_escalated',
              title: `New AI Escalation: ${params.escalationCategory}`,
              message: `Farmer #${params.farmerId}: "${params.questionText.slice(0, 80)}"`,
              relatedTab: 'coordinator',
            },
          ]);
        } else {
          // Do NOT forward conversation content to expert_escalations or coordinator when consent is false
          await tx.insert(notifications).values({
            recipientRole: 'farmer',
            recipientFarmerId: params.farmerId,
            eventType: 'safety_advisory_local',
            title: 'Agronomist Consultation Advised (Privacy Protected)',
            message:
              'Your query requires field specialist guidance. Because "Share Conversation with Agricultural Experts" is off, your message was not forwarded to the expert queue—please consult your Mandal Agricultural Officer directly or enable expert sharing in Profile Settings.',
            relatedTab: 'assistant',
          });
        }
      }

      return convId;
    });
  } catch (error) {
    wrapDbError('saving AI conversation turn', error);
  }
}

export async function deleteFarmerConversation(actor: ResolvedActor, conversationId: number) {
  try {
    if (actor.role !== 'farmer' || !actor.farmerId) {
      throw new ForbiddenError('Only authenticated farmers can delete their conversations.');
    }
    if (!Number.isInteger(conversationId) || conversationId <= 0) {
      throw new ValidationError('Valid conversation ID is required.');
    }

    await db.transaction(async (tx) => {
      const rows = await tx
        .select()
        .from(conversations)
        .where(eq(conversations.id, conversationId));
      const conv = rows[0];
      if (!conv) {
        throw new NotFoundError('Conversation not found.');
      }
      if (conv.farmerId !== actor.farmerId) {
        throw new ForbiddenError('Forbidden: You can only delete your own conversations.');
      }

      await tx
        .update(expertEscalations)
        .set({ conversationId: null })
        .where(eq(expertEscalations.conversationId, conversationId));

      await tx
        .delete(conversationMessages)
        .where(eq(conversationMessages.conversationId, conversationId));

      await tx.delete(conversations).where(eq(conversations.id, conversationId));
    });
  } catch (error) {
    wrapDbError('deleting conversation', error);
  }
}

export async function deleteAllFarmerConversations(actor: ResolvedActor, farmerId: number) {
  try {
    assertFarmerOwnership(actor, farmerId);

    await db.transaction(async (tx) => {
      const ownConvs = await tx
        .select({ id: conversations.id })
        .from(conversations)
        .where(eq(conversations.farmerId, farmerId));

      const ids = ownConvs.map((c) => c.id);
      if (ids.length === 0) return;

      await tx
        .update(expertEscalations)
        .set({ conversationId: null })
        .where(inArray(expertEscalations.conversationId, ids));

      await tx
        .delete(conversationMessages)
        .where(inArray(conversationMessages.conversationId, ids));

      await tx.delete(conversations).where(eq(conversations.farmerId, farmerId));
    });
  } catch (error) {
    wrapDbError('clearing farmer conversation history', error);
  }
}

export async function createManualEscalationRecord(
  actor: ResolvedActor,
  data: {
    farmerId?: number;
    questionText: string;
    category: string;
    conversationContext?: string;
    escalationReason: string;
  }
) {
  try {
    if (actor.role !== 'farmer' || !actor.farmerId) {
      throw new ForbiddenError('Only authenticated farmers can submit expert review requests.');
    }
    if (data.farmerId !== undefined && Number(data.farmerId) !== actor.farmerId) {
      throw new ForbiddenError('Cannot create an expert escalation for another farmer.');
    }

    const consentRows = await db
      .select()
      .from(farmerConsent)
      .where(eq(farmerConsent.farmerId, actor.farmerId));
    const flags = resolveConsentFlags(consentRows[0]);

    if (!flags.shareConversationWithExperts) {
      throw new ForbiddenError(
        'Explicit consent is required before sharing conversation or farm context with agricultural experts. Please enable "Share Conversation with Agricultural Experts" in Profile & Privacy Settings first.'
      );
    }

    const questionText = validateNonEmptyText(data.questionText, 'Question summary', 1000);

    const inserted = await db
      .insert(expertEscalations)
      .values({
        farmerId: actor.farmerId,
        questionText,
        category: (data.category || 'Crop Suitability Review').trim().slice(0, 120),
        conversationContext: (data.conversationContext || '').trim().slice(0, 1500),
        escalationReason:
          (data.escalationReason || 'Farmer requested human agricultural expert review.')
            .trim()
            .slice(0, 400),
        status: 'Pending Expert Review',
        assignedExpert: 'Agronomy Desk (Pending)',
      })
      .returning();

    await db.insert(notifications).values({
      recipientRole: 'coordinator',
      eventType: 'expert_review_requested',
      title: `Expert Review Requested: ${data.category || 'Agronomy'}`,
      message: `Farmer #${actor.farmerId} requested expert review.`,
      relatedTab: 'coordinator',
    });

    return inserted[0];
  } catch (error) {
    wrapDbError('creating expert escalation', error);
  }
}

export async function updateEscalationResolution(
  actor: ResolvedActor,
  escalationId: number,
  data: {
    status: string;
    assignedExpert: string;
    resolutionNotes: string;
  }
) {
  try {
    if (actor.role !== 'coordinator') {
      throw new ForbiddenError('Only authorized coordinators can resolve expert escalations.');
    }
    if (!Number.isInteger(escalationId) || escalationId <= 0) {
      throw new ValidationError('Valid escalation ID is required.');
    }

    const existingEscRows = await db
      .select()
      .from(expertEscalations)
      .where(eq(expertEscalations.id, escalationId));
    if (!existingEscRows[0]) {
      throw new NotFoundError('Escalation case not found.');
    }

    if (actor.isDemo) {
      const fRows = await db
        .select()
        .from(farmerProfiles)
        .where(eq(farmerProfiles.id, existingEscRows[0].farmerId));
      if (fRows[0] && !fRows[0].isDemo) {
        throw new ForbiddenError('Demo coordinator cannot modify real farmer escalations.');
      }
    }

    const updated = await db
      .update(expertEscalations)
      .set({
        status: (data.status || 'Resolved').trim().slice(0, 80),
        assignedExpert: (data.assignedExpert || 'Agronomy Coordinator').trim().slice(0, 140),
        resolutionNotes: (data.resolutionNotes || '').trim().slice(0, 2000),
        updatedAt: new Date(),
      })
      .where(eq(expertEscalations.id, escalationId))
      .returning();

    const esc = updated[0];

    if (esc.conversationId && data.resolutionNotes.trim()) {
      await db.insert(conversationMessages).values({
        conversationId: esc.conversationId,
        sender: 'expert',
        messageText: `[Agricultural Expert — ${data.assignedExpert}]: ${data.resolutionNotes}`,
        transcribedFromVoice: false,
        citationsJson: '[]',
        confidenceNote: 'Reviewed by human agricultural specialist.',
        escalated: false,
      });

      if (data.status === 'Resolved') {
        await db
          .update(conversations)
          .set({ status: 'Resolved', updatedAt: new Date() })
          .where(eq(conversations.id, esc.conversationId));
      }
    }

    await db.insert(notifications).values({
      recipientRole: 'farmer',
      recipientFarmerId: esc.farmerId,
      eventType: 'expert_responded',
      title: 'Agricultural Expert Responded to Your Query',
      message: `${data.assignedExpert} provided guidance (${data.status}): "${data.resolutionNotes.slice(0, 90)}"`,
      relatedTab: 'assistant',
    });

    return esc;
  } catch (error) {
    wrapDbError('resolving expert escalation', error);
  }
}

export async function upsertKnowledgeDocument(
  actor: ResolvedActor,
  data: {
    id?: number;
    category: string;
    title: string;
    titleTe?: string;
    summary: string;
    content: string;
    applicableRegions: string;
    applicableCrops?: string;
    sourceName: string;
    sourceUrl?: string;
    verificationStatus: string;
    lastVerifiedDate: string;
    isOutdated: boolean;
  }
) {
  try {
    if (actor.role !== 'coordinator') {
      throw new ForbiddenError('Only authorized coordinators can manage agricultural knowledge.');
    }

    const category = validateNonEmptyText(data.category, 'Category', 100);
    const title = validateNonEmptyText(data.title, 'Title', 200);
    const summary = validateNonEmptyText(data.summary, 'Summary', 600);
    const content = validateNonEmptyText(data.content, 'Content', 4000);
    const sourceName = validateNonEmptyText(data.sourceName, 'Source name', 200);
    const lastVerifiedDate = validateIsoDateInput(data.lastVerifiedDate, 'Last verified date');

    if (data.id) {
      const updated = await db
        .update(agriculturalKnowledge)
        .set({
          category,
          title,
          titleTe: data.titleTe || '',
          summary,
          content,
          applicableRegions: (data.applicableRegions || 'Andhra Pradesh').trim(),
          applicableCrops: (data.applicableCrops || '').trim(),
          sourceName,
          sourceUrl: (data.sourceUrl || '').trim(),
          verificationStatus: data.verificationStatus || 'Verified Advisory',
          lastVerifiedDate,
          isOutdated: Boolean(data.isOutdated),
        })
        .where(eq(agriculturalKnowledge.id, Number(data.id)))
        .returning();
      if (!updated[0]) throw new NotFoundError('Knowledge document not found.');
      return updated[0];
    }

    const inserted = await db
      .insert(agriculturalKnowledge)
      .values({
        category,
        title,
        titleTe: data.titleTe || '',
        summary,
        content,
        applicableRegions: (data.applicableRegions || 'Andhra Pradesh').trim(),
        applicableCrops: (data.applicableCrops || '').trim(),
        sourceName,
        sourceUrl: (data.sourceUrl || '').trim(),
        verificationStatus: data.verificationStatus || 'Verified Advisory',
        lastVerifiedDate,
        isOutdated: Boolean(data.isOutdated),
      })
      .returning();
    return inserted[0];
  } catch (error) {
    wrapDbError('saving agricultural knowledge document', error);
  }
}

export async function upsertSchemeRecord(
  actor: ResolvedActor,
  data: {
    id?: number;
    schemeCode: string;
    schemeName: string;
    schemeNameTe?: string;
    level: string;
    applicableState: string;
    purpose: string;
    eligibilityConditions: string;
    benefits: string;
    requiredDocuments: string;
    applicationProcedure: string;
    officialPortal: string;
    relevantOffice: string;
    importantDates: string;
    officialSource: string;
    officialSourceUrl?: string;
    verificationStatus: string;
    lastVerifiedDate: string;
    isOutdated: boolean;
  }
) {
  try {
    if (actor.role !== 'coordinator') {
      throw new ForbiddenError('Only authorized coordinators can manage government scheme records.');
    }

    const schemeCode = validateNonEmptyText(data.schemeCode, 'Scheme code', 60);
    const schemeName = validateNonEmptyText(data.schemeName, 'Scheme name', 200);
    const purpose = validateNonEmptyText(data.purpose, 'Scheme purpose', 800);
    const officialPortal = validateNonEmptyText(data.officialPortal, 'Official portal', 300);
    const officialSource = validateNonEmptyText(data.officialSource, 'Official source', 300);
    const lastVerifiedDate = validateIsoDateInput(data.lastVerifiedDate, 'Last verified date');
    const officialSourceUrl = (data.officialSourceUrl || data.officialPortal || '').trim();

    if (data.id) {
      const updated = await db
        .update(schemeRecords)
        .set({
          schemeName,
          schemeNameTe: data.schemeNameTe || '',
          level: data.level || 'State',
          applicableState: data.applicableState || 'Andhra Pradesh',
          purpose,
          eligibilityConditions: data.eligibilityConditions || '',
          benefits: data.benefits || '',
          requiredDocuments: data.requiredDocuments || '',
          applicationProcedure: data.applicationProcedure || '',
          officialPortal,
          relevantOffice: data.relevantOffice || '',
          importantDates: data.importantDates || '',
          officialSource,
          officialSourceUrl,
          verificationStatus: data.verificationStatus || 'Requires Verification',
          lastVerifiedDate,
          isOutdated: Boolean(data.isOutdated),
        })
        .where(eq(schemeRecords.id, Number(data.id)))
        .returning();
      if (!updated[0]) throw new NotFoundError('Scheme record not found.');
      return updated[0];
    }

    const inserted = await db
      .insert(schemeRecords)
      .values({
        schemeCode,
        schemeName,
        schemeNameTe: data.schemeNameTe || '',
        level: data.level || 'State',
        applicableState: data.applicableState || 'Andhra Pradesh',
        purpose,
        eligibilityConditions: data.eligibilityConditions || '',
        benefits: data.benefits || '',
        requiredDocuments: data.requiredDocuments || '',
        applicationProcedure: data.applicationProcedure || '',
        officialPortal,
        relevantOffice: data.relevantOffice || '',
        importantDates: data.importantDates || '',
        officialSource,
        officialSourceUrl,
        verificationStatus: data.verificationStatus || 'Requires Verification',
        lastVerifiedDate,
        isOutdated: Boolean(data.isOutdated),
      })
      .returning();
    return inserted[0];
  } catch (error) {
    wrapDbError('saving government scheme record', error);
  }
}

export async function createHarvestAndRoutes(
  actor: ResolvedActor,
  harvestData: {
    farmerId: number;
    cropName: string;
    quantityHarvestedQuintals: string;
    harvestDate: string;
    qualityGrade: string;
    expectedShelfLifeDays: number;
    location: string;
    storageAvailable: boolean;
    additionalInfo?: string;
  },
  evaluatedRoutes: Array<{
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
  }>
) {
  try {
    assertFarmerOwnership(actor, harvestData.farmerId);

    const cropName = validateNonEmptyText(harvestData.cropName, 'Harvested crop name', 120);
    const quantityHarvestedQuintals = validatePositiveDecimalInput(
      harvestData.quantityHarvestedQuintals,
      'Harvested quantity (quintals)',
      { min: 0.1, max: 50000 }
    );
    const harvestDate = validateIsoDateInput(harvestData.harvestDate, 'Harvest date');
    const qualityGrade = validateNonEmptyText(harvestData.qualityGrade, 'Quality grade', 160);
    const shelfLife = Number(harvestData.expectedShelfLifeDays);
    if (!Number.isFinite(shelfLife) || shelfLife < 1 || shelfLife > 365) {
      throw new ValidationError('Expected shelf life must be between 1 and 365 days.');
    }

    return await db.transaction(async (tx) => {
      const insertedHarvest = await tx
        .insert(harvestRecords)
        .values({
          farmerId: actor.farmerId!,
          cropName,
          quantityHarvestedQuintals,
          harvestDate,
          qualityGrade,
          expectedShelfLifeDays: Math.round(shelfLife),
          location: (harvestData.location || '').trim().slice(0, 200) || 'Andhra Pradesh',
          storageAvailable: Boolean(harvestData.storageAvailable),
          additionalInfo: (harvestData.additionalInfo || '').trim().slice(0, 500),
          outcomeStatus:
            'Suggested Destinations Evaluated (Indicative Demo Estimate — Unconfirmed)',
        })
        .returning();

      const harvestId = insertedHarvest[0].id;

      if (evaluatedRoutes.length > 0) {
        await tx.insert(agrirouteRecommendations).values(
          evaluatedRoutes.map((r) => ({
            harvestId,
            farmerId: actor.farmerId!,
            merchantId: r.merchantId,
            destinationName: r.destinationName,
            destinationType: r.destinationType,
            suitabilityScore: r.suitabilityScore,
            quantityAcceptedQuintals: r.quantityAcceptedQuintals,
            qualityMatchLabel: r.qualityMatchLabel,
            distanceKm: r.distanceKm,
            estimatedLogisticsCostInr: r.estimatedLogisticsCostInr,
            isIllustrativeEstimate: r.isIllustrativeEstimate,
            procurementTiming: r.procurementTiming,
            demandStatus: r.demandStatus,
            rankingReason: r.rankingReason,
            isSelected: false,
          }))
        );
      }

      return harvestId;
    });
  } catch (error) {
    wrapDbError('saving harvest and AGRIROUTE evaluation', error);
  }
}

export async function selectAgriRouteDestination(
  actor: ResolvedActor,
  recommendationId: number,
  harvestId: number
) {
  try {
    if (actor.role !== 'farmer' || !actor.farmerId) {
      throw new ForbiddenError('Only authenticated farmers can select AGRIROUTE destinations.');
    }

    return await db.transaction(async (tx) => {
      const recRows = await tx
        .select()
        .from(agrirouteRecommendations)
        .where(eq(agrirouteRecommendations.id, recommendationId));
      const rec = recRows[0];
      if (!rec) throw new NotFoundError('Route recommendation not found.');
      if (rec.farmerId !== actor.farmerId || rec.harvestId !== harvestId) {
        throw new ForbiddenError('Forbidden: Route recommendation does not belong to this harvest.');
      }

      const harvestRows = await tx
        .select()
        .from(harvestRecords)
        .where(eq(harvestRecords.id, harvestId));
      if (!harvestRows[0] || harvestRows[0].farmerId !== actor.farmerId) {
        throw new ForbiddenError('Forbidden: Harvest record does not belong to you.');
      }

      await tx
        .update(agrirouteRecommendations)
        .set({ isSelected: false })
        .where(eq(agrirouteRecommendations.harvestId, harvestId));

      await tx
        .update(agrirouteRecommendations)
        .set({ isSelected: true })
        .where(eq(agrirouteRecommendations.id, recommendationId));

      await tx
        .update(harvestRecords)
        .set({
          selectedDestinationName: rec.destinationName,
          outcomeStatus: `Shortlisted Destination: ${rec.destinationName} (Suggested Route Only — Send Enquiry/Offer to Confirm Buyer Slot)`,
        })
        .where(eq(harvestRecords.id, harvestId));

      await tx.insert(notifications).values({
        recipientRole: 'coordinator',
        eventType: 'agriroute_selected',
        title: `AGRIROUTE Destination Shortlisted`,
        message: `Farmer #${rec.farmerId} shortlisted "${rec.destinationName}" (${rec.destinationType}) for harvest #${harvestId}.`,
        relatedTab: 'agriroute',
      });

      return rec;
    });
  } catch (error) {
    wrapDbError('selecting AGRIROUTE destination', error);
  }
}

export async function createSupplyProductEnquiryNotification(
  actor: ResolvedActor,
  data: {
    farmerId?: number;
    productName: string;
    supplierName: string;
    quantityNote: string;
  }
) {
  try {
    if (actor.role !== 'farmer' || !actor.farmerId) {
      throw new ForbiddenError('Only authenticated farmers can log supply product enquiries.');
    }
    if (data.farmerId !== undefined && Number(data.farmerId) !== actor.farmerId) {
      throw new ForbiddenError('Cannot log a supply enquiry on behalf of another farmer.');
    }

    const productName = validateNonEmptyText(data.productName, 'Product name', 140);
    const supplierName = validateNonEmptyText(data.supplierName, 'Supplier name', 140);
    const quantityNote = (data.quantityNote || 'Standard pack enquiry').trim().slice(0, 200);

    await db.insert(notifications).values([
      {
        recipientRole: 'farmer',
        recipientFarmerId: actor.farmerId,
        eventType: 'supply_enquiry_logged',
        title: `Supply Enquiry Sent: ${productName}`,
        message: `Your enquiry (${quantityNote}) to ${supplierName} is logged for pilot coordinator follow-up. No online payment collected.`,
        relatedTab: 'farmer_market',
      },
      {
        recipientRole: 'coordinator',
        eventType: 'supply_enquiry_logged',
        title: `Farm Input Enquiry: ${productName}`,
        message: `Farmer #${actor.farmerId} requested availability for ${productName} from ${supplierName} (${quantityNote}).`,
        relatedTab: 'coordinator',
      },
    ]);
  } catch (error) {
    wrapDbError('logging supply product enquiry', error);
  }
}

export async function markNotificationRead(actor: ResolvedActor, notificationId: number) {
  try {
    if (!Number.isInteger(notificationId) || notificationId <= 0) {
      throw new ValidationError('Valid notification ID is required.');
    }
    const rows = await db
      .select()
      .from(notifications)
      .where(eq(notifications.id, notificationId));
    const notif = rows[0];
    if (!notif) {
      throw new NotFoundError('Notification not found.');
    }

    const ownsNotification =
      (actor.role === 'coordinator' && notif.recipientRole === 'coordinator') ||
      (actor.role === 'farmer' &&
        notif.recipientRole === 'farmer' &&
        (notif.recipientFarmerId === actor.farmerId ||
          (notif.recipientFarmerId === null && actor.isDemo))) ||
      (actor.role === 'merchant' &&
        notif.recipientRole === 'merchant' &&
        (notif.recipientMerchantId === actor.merchantId ||
          (notif.recipientMerchantId === null && actor.isDemo)));

    if (!ownsNotification) {
      throw new ForbiddenError('Forbidden: Notification does not belong to your account.');
    }

    await db
      .update(notifications)
      .set({ isRead: true })
      .where(eq(notifications.id, notificationId));
  } catch (error) {
    wrapDbError('marking notification read', error);
  }
}

export async function markAllNotificationsReadForActor(actor: ResolvedActor) {
  try {
    const all = await db.select().from(notifications);
    const matchingIds = all
      .filter((n) => {
        if (actor.role === 'coordinator') return n.recipientRole === 'coordinator';
        if (actor.role === 'merchant') {
          return (
            n.recipientRole === 'merchant' &&
            (n.recipientMerchantId === actor.merchantId ||
              (n.recipientMerchantId === null && actor.isDemo))
          );
        }
        return (
          n.recipientRole === 'farmer' &&
          (n.recipientFarmerId === actor.farmerId ||
            (n.recipientFarmerId === null && actor.isDemo))
        );
      })
      .map((n) => n.id);

    await Promise.all(
      matchingIds.map((id) =>
        db.update(notifications).set({ isRead: true }).where(eq(notifications.id, id))
      )
    );
  } catch (error) {
    wrapDbError('marking notifications read', error);
  }
}
