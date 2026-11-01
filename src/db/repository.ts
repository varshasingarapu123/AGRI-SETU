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
import { desc, eq } from 'drizzle-orm';

function wrapDbError(context: string, error: unknown): never {
  console.error(`[DB Error] ${context}:`, error);
  throw new Error(`Database operation failed (${context}). Please try again.`, {
    cause: error,
  });
}

export async function getOrCreateAuthUser(uid: string, email: string, displayName?: string) {
  try {
    const result = await db
      .insert(users)
      .values({
        uid,
        email,
        displayName: displayName || email.split('@')[0],
        role: 'farmer',
        isDemo: false,
      })
      .onConflictDoUpdate({
        target: users.uid,
        set: {
          email,
          displayName: displayName || email.split('@')[0],
        },
      })
      .returning();
    return result[0];
  } catch (error) {
    wrapDbError('syncing authenticated user', error);
  }
}

export async function getFullBootstrapState() {
  try {
    const [
      allFarmers,
      allConsents,
      allFarms,
      allSoils,
      allCrops,
      allKnowledge,
      allConvs,
      allMessages,
      allSchemes,
      allListings,
      allMerchants,
      allDemands,
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
      db.select().from(agrirouteRecommendations).orderBy(desc(agrirouteRecommendations.suitabilityScore)),
      db.select().from(expertEscalations).orderBy(desc(expertEscalations.id)),
      db.select().from(notifications).orderBy(desc(notifications.id)),
    ]);

    const enrichedFarmers = allFarmers.map((f) => {
      const consent = allConsents.find((c) => c.farmerId === f.id) || null;
      const farm = allFarms.find((fd) => fd.farmerId === f.id) || null;
      const soils = allSoils.filter((s) => s.farmerId === f.id);
      const crops = allCrops.filter((c) => c.farmerId === f.id);
      return {
        ...f,
        consent,
        farmDetails: farm,
        latestSoil: soils[0] || null,
        soilRecords: soils,
        cropRecords: crops,
        currentCrop: crops.find((c) => c.status === 'current')?.cropName || 'Not set',
        previousCrop: crops.find((c) => c.status === 'previous')?.cropName || 'Not set',
      };
    });

    // Respect farmer consent & privacy settings on public/merchant produce listings
    const enrichedListings = allListings.map((listing) => {
      const owner = enrichedFarmers.find((f) => f.id === listing.farmerId);
      const allowsMerchantShare = owner?.consent?.shareProfileWithMerchants ?? true;
      const allowsContactShare = owner?.consent?.shareContactOnEnquiry ?? false;
      const showName = Boolean(listing.privacyShowName && allowsMerchantShare);
      return {
        ...listing,
        farmerDisplayName: showName
          ? `${owner?.name || 'Farmer'} (${owner?.farmerCode || `FARM-${listing.farmerId}`})`
          : `Protected Farmer ID: ${owner?.farmerCode || `FARM-${listing.farmerId}`}`,
        farmerContactNote: allowsContactShare
          ? owner?.phoneMasked || 'Shared via Coordinator'
          : 'Contact protected — connect via AGRISETU Purchase Enquiry',
        farmerConsentAllowsShare: allowsMerchantShare,
      };
    });

    const enrichedDemands = allDemands.map((d) => {
      const merchant = allMerchants.find((m) => m.id === d.merchantId);
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

    const enrichedConversations = allConvs.map((c) => ({
      ...c,
      messages: allMessages.filter((m) => m.conversationId === c.id),
    }));

    const enrichedHarvests = allHarvests.map((h) => ({
      ...h,
      recommendations: allRoutes.filter((r) => r.harvestId === h.id),
    }));

    return {
      farmers: enrichedFarmers,
      knowledge: allKnowledge,
      schemes: allSchemes,
      listings: enrichedListings,
      merchants: allMerchants,
      demands: enrichedDemands,
      enquiries: allEnquiries,
      offers: allOffers,
      orders: allOrders,
      suppliers: allSuppliers,
      supplyProducts: enrichedProducts,
      conversations: enrichedConversations,
      harvests: enrichedHarvests,
      escalations: allEscalations,
      notifications: allNotifications,
    };
  } catch (error) {
    wrapDbError('loading platform state', error);
  }
}

export async function updateFarmerProfileAndFarm(
  farmerId: number,
  payload: {
    name: string;
    nameTe?: string;
    village: string;
    mandal: string;
    district: string;
    region: string;
    preferredLanguage: string;
    dialectProfile: string;
    farmAreaAcres: string;
    irrigationType: string;
    waterAvailability: string;
    climateZone: string;
    storageAvailable: boolean;
    storageDetails?: string;
    cropInterests?: string;
    constraints?: string;
    soilType: string;
    phLevel?: string;
    organicCarbon?: string;
    salinityNote?: string;
    currentCrop: string;
    previousCrop: string;
    shareProfileWithAi: boolean;
    shareProfileWithMerchants: boolean;
    shareContactOnEnquiry: boolean;
    shareConversationWithExperts: boolean;
    customVocabularyJson?: string;
    savedKnowledgeIds?: string;
  }
) {
  try {
    await db
      .update(farmerProfiles)
      .set({
        name: payload.name,
        nameTe: payload.nameTe,
        village: payload.village,
        mandal: payload.mandal,
        district: payload.district,
        region: payload.region,
        preferredLanguage: payload.preferredLanguage,
        dialectProfile: payload.dialectProfile,
        ...(payload.customVocabularyJson !== undefined
          ? { customVocabularyJson: payload.customVocabularyJson }
          : {}),
        ...(payload.savedKnowledgeIds !== undefined
          ? { savedKnowledgeIds: payload.savedKnowledgeIds }
          : {}),
        updatedAt: new Date(),
      })
      .where(eq(farmerProfiles.id, farmerId));

    await db
      .insert(farmerConsent)
      .values({
        farmerId,
        shareProfileWithAi: payload.shareProfileWithAi,
        shareProfileWithMerchants: payload.shareProfileWithMerchants,
        shareContactOnEnquiry: payload.shareContactOnEnquiry,
        shareConversationWithExperts: payload.shareConversationWithExperts,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: farmerConsent.farmerId,
        set: {
          shareProfileWithAi: payload.shareProfileWithAi,
          shareProfileWithMerchants: payload.shareProfileWithMerchants,
          shareContactOnEnquiry: payload.shareContactOnEnquiry,
          shareConversationWithExperts: payload.shareConversationWithExperts,
          updatedAt: new Date(),
        },
      });

    await db
      .insert(farmDetails)
      .values({
        farmerId,
        farmAreaAcres: payload.farmAreaAcres,
        irrigationType: payload.irrigationType,
        waterAvailability: payload.waterAvailability,
        climateZone: payload.climateZone,
        storageAvailable: payload.storageAvailable,
        storageDetails: payload.storageDetails || '',
        cropInterests: payload.cropInterests || '',
        constraints: payload.constraints || '',
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: farmDetails.farmerId,
        set: {
          farmAreaAcres: payload.farmAreaAcres,
          irrigationType: payload.irrigationType,
          waterAvailability: payload.waterAvailability,
          climateZone: payload.climateZone,
          storageAvailable: payload.storageAvailable,
          storageDetails: payload.storageDetails || '',
          cropInterests: payload.cropInterests || '',
          constraints: payload.constraints || '',
          updatedAt: new Date(),
        },
      });

    const existingSoils = await db
      .select()
      .from(soilRecords)
      .where(eq(soilRecords.farmerId, farmerId))
      .orderBy(desc(soilRecords.id));

    if (existingSoils[0]) {
      await db
        .update(soilRecords)
        .set({
          soilType: payload.soilType,
          phLevel: payload.phLevel || '',
          organicCarbon: payload.organicCarbon || '',
          salinityNote: payload.salinityNote || '',
        })
        .where(eq(soilRecords.id, existingSoils[0].id));
    } else {
      await db.insert(soilRecords).values({
        farmerId,
        soilType: payload.soilType,
        phLevel: payload.phLevel || '',
        organicCarbon: payload.organicCarbon || '',
        salinityNote: payload.salinityNote || '',
        isVerifiedLabTest: false,
      });
    }

    const existingCrops = await db
      .select()
      .from(cropRecords)
      .where(eq(cropRecords.farmerId, farmerId));
    const currentRec = existingCrops.find((c) => c.status === 'current');
    const prevRec = existingCrops.find((c) => c.status === 'previous');

    if (currentRec) {
      await db
        .update(cropRecords)
        .set({ cropName: payload.currentCrop, areaAcres: payload.farmAreaAcres })
        .where(eq(cropRecords.id, currentRec.id));
    } else {
      await db.insert(cropRecords).values({
        farmerId,
        season: 'Current Season',
        cropName: payload.currentCrop,
        status: 'current',
        areaAcres: payload.farmAreaAcres,
      });
    }

    if (prevRec) {
      await db
        .update(cropRecords)
        .set({ cropName: payload.previousCrop })
        .where(eq(cropRecords.id, prevRec.id));
    } else {
      await db.insert(cropRecords).values({
        farmerId,
        season: 'Previous Season',
        cropName: payload.previousCrop,
        status: 'previous',
        areaAcres: payload.farmAreaAcres,
      });
    }
  } catch (error) {
    wrapDbError('updating farmer profile and farm details', error);
  }
}

export async function toggleFarmerSavedKnowledge(farmerId: number, knowledgeId: number) {
  try {
    const rows = await db.select().from(farmerProfiles).where(eq(farmerProfiles.id, farmerId));
    if (!rows[0]) throw new Error('Farmer profile not found');
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
  farmerId: number,
  vocabList: Array<{ term: string; meaning: string }>
) {
  try {
    await db
      .update(farmerProfiles)
      .set({ customVocabularyJson: JSON.stringify(vocabList), updatedAt: new Date() })
      .where(eq(farmerProfiles.id, farmerId));
  } catch (error) {
    wrapDbError('updating regional dialect vocabulary', error);
  }
}

export async function toggleMerchantSavedListing(merchantId: number, listingId: number) {
  try {
    const rows = await db
      .select()
      .from(merchantProfiles)
      .where(eq(merchantProfiles.id, merchantId));
    if (!rows[0]) throw new Error('Merchant profile not found');
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

export async function createProduceListing(data: {
  farmerId: number;
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
}) {
  try {
    const farmerRows = await db
      .select()
      .from(farmerProfiles)
      .where(eq(farmerProfiles.id, Number(data.farmerId)));
    const fallbackFarmer = farmerRows[0];

    const village = data.village || fallbackFarmer?.village || 'Pilot Village';
    const mandal = data.mandal || fallbackFarmer?.mandal || 'Kakinada Rural';
    const district = data.district || fallbackFarmer?.district || 'Kakinada';

    const inserted = await db
      .insert(farmerProduceListings)
      .values({
        farmerId: Number(data.farmerId),
        cropName: data.cropName,
        variety: data.variety || '',
        imageKey: data.imageKey || 'crop_paddy_harvest',
        quantityQuintals: String(data.quantityQuintals),
        expectedHarvestDate: data.expectedHarvestDate,
        availabilityType: data.availabilityType || 'available_now',
        qualityGrade: data.qualityGrade,
        qualityVerification: 'Self-reported',
        productionMethod: data.productionMethod || 'Standard Cultivation',
        askingPricePerQuintal: data.askingPricePerQuintal || '',
        village,
        mandal,
        district,
        listingStatus: 'Active',
        privacyShowName: data.privacyShowName ?? true,
        isDemo: true,
      })
      .returning();

    await db.insert(notifications).values({
      recipientRole: 'coordinator',
      eventType: 'new_listing',
      title: `New Produce Listing: ${data.cropName}`,
      message: `Farmer #${data.farmerId} published ${data.quantityQuintals} quintals of ${data.cropName} in ${district}.`,
      relatedTab: 'merchant_market',
    });

    return inserted[0];
  } catch (error) {
    wrapDbError('creating produce listing', error);
  }
}

export async function createMerchantDemandRecord(data: {
  merchantId: number;
  cropName: string;
  quantityRequiredQuintals: string;
  qualitySpecifications: string;
  acceptsCosmeticImperfect?: boolean;
  procurementPeriod: string;
  deliveryLocation: string;
  district?: string;
  offeredPriceRange?: string;
  additionalRequirements?: string;
}) {
  try {
    const district = data.district || 'Kakinada';
    const inserted = await db
      .insert(merchantDemand)
      .values({
        merchantId: Number(data.merchantId),
        cropName: data.cropName,
        quantityRequiredQuintals: String(data.quantityRequiredQuintals),
        qualitySpecifications: data.qualitySpecifications,
        acceptsCosmeticImperfect: Boolean(data.acceptsCosmeticImperfect),
        procurementPeriod: data.procurementPeriod,
        deliveryLocation: data.deliveryLocation,
        district,
        offeredPriceRange: data.offeredPriceRange || 'Market-linked negotiation',
        additionalRequirements: data.additionalRequirements || '',
        demandStatus: 'Open',
        distanceKmFromKakinada: district.toLowerCase().includes('kakinada') ? 18 : 55,
        distanceKmFromGodavari: district.toLowerCase().includes('kakinada') ? 52 : 16,
        isDemo: true,
      })
      .returning();

    await db.insert(notifications).values({
      recipientRole: 'farmer',
      eventType: 'new_merchant_demand',
      title: `New Buyer Requirement: ${data.cropName}`,
      message: `A merchant published procurement demand for ${data.quantityRequiredQuintals} quintals of ${data.cropName} (${data.offeredPriceRange || 'Negotiable'}/qtl).`,
      relatedTab: 'farmer_market',
    });

    return inserted[0];
  } catch (error) {
    wrapDbError('creating merchant demand', error);
  }
}

export async function createPurchaseEnquiryRecord(data: {
  listingId: number;
  merchantId: number;
  farmerId: number;
  requiredQuantityQuintals: string;
  proposedPricePerQuintal: string;
  qualityRequirements?: string;
  logisticsPreference?: string;
  procurementDate: string;
  message?: string;
}) {
  try {
    const inserted = await db
      .insert(purchaseEnquiries)
      .values({
        listingId: Number(data.listingId),
        merchantId: Number(data.merchantId),
        farmerId: Number(data.farmerId),
        requiredQuantityQuintals: String(data.requiredQuantityQuintals),
        proposedPricePerQuintal: String(data.proposedPricePerQuintal),
        qualityRequirements: data.qualityRequirements || 'Standard FAQ moisture & grading check',
        logisticsPreference: data.logisticsPreference || 'Farmgate pickup',
        procurementDate: data.procurementDate,
        message: data.message || '',
        status: 'Enquiry received',
      })
      .returning();

    await db.insert(notifications).values({
      recipientRole: 'farmer',
      recipientFarmerId: Number(data.farmerId),
      eventType: 'enquiry_received',
      title: 'New Merchant Purchase Enquiry Received',
      message: `Enquiry for ${data.requiredQuantityQuintals} qtl at ₹${data.proposedPricePerQuintal}/qtl. Review and respond in My Farm.`,
      relatedTab: 'my_farm',
    });

    return inserted[0];
  } catch (error) {
    wrapDbError('submitting purchase enquiry', error);
  }
}

export async function updatePurchaseEnquiryStatus(
  enquiryId: number,
  nextStatus: string
) {
  try {
    const normalizedStatus =
      nextStatus.toLowerCase() === 'confirmed_order' ? 'Confirmed order' : nextStatus;

    const updated = await db
      .update(purchaseEnquiries)
      .set({ status: normalizedStatus, updatedAt: new Date() })
      .where(eq(purchaseEnquiries.id, enquiryId))
      .returning();

    const enq = updated[0];
    if (!enq) throw new Error('Enquiry not found');

    // Only create an Order when status explicitly reaches 'Confirmed order'
    if (normalizedStatus === 'Confirmed order') {
      const listingRows = await db
        .select()
        .from(farmerProduceListings)
        .where(eq(farmerProduceListings.id, enq.listingId));
      const cropName = listingRows[0]?.cropName || 'Agricultural Produce';
      const orderCode = `ORD-${Date.now().toString().slice(-6)}`;

      await db.insert(orders).values({
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
        isDemo: true,
      });

      await db.insert(notifications).values([
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
    } else {
      await db.insert(notifications).values({
        recipientRole: 'merchant',
        recipientMerchantId: enq.merchantId,
        eventType: 'enquiry_status_updated',
        title: `Enquiry #${enq.id} Status: ${normalizedStatus}`,
        message: `Purchase enquiry status updated to "${normalizedStatus}".`,
        relatedTab: 'merchant_market',
      });
    }

    return enq;
  } catch (error) {
    wrapDbError('updating enquiry status', error);
  }
}

export async function createFarmerOfferRecord(data: {
  demandId: number;
  farmerId: number;
  merchantId: number;
  quantityOfferedQuintals: string;
  expectedPricePerQuintal: string;
  expectedHarvestDate: string;
  qualityDetails?: string;
  message?: string;
}) {
  try {
    const inserted = await db
      .insert(farmerOffers)
      .values({
        demandId: Number(data.demandId),
        farmerId: Number(data.farmerId),
        merchantId: Number(data.merchantId),
        quantityOfferedQuintals: String(data.quantityOfferedQuintals),
        expectedPricePerQuintal: String(data.expectedPricePerQuintal),
        expectedHarvestDate: data.expectedHarvestDate,
        qualityDetails: data.qualityDetails || 'Self-reported FAQ harvest lot',
        message: data.message || '',
        status: 'Offer made',
      })
      .returning();

    await db.insert(notifications).values({
      recipientRole: 'merchant',
      recipientMerchantId: Number(data.merchantId),
      eventType: 'offer_submitted',
      title: 'New Farmer Produce Offer Received',
      message: `Farmer #${data.farmerId} offered ${data.quantityOfferedQuintals} qtl at ₹${data.expectedPricePerQuintal}/qtl.`,
      relatedTab: 'merchant_market',
    });

    return inserted[0];
  } catch (error) {
    wrapDbError('submitting farmer offer', error);
  }
}

export async function updateFarmerOfferStatus(offerId: number, nextStatus: string) {
  try {
    const updated = await db
      .update(farmerOffers)
      .set({ status: nextStatus, updatedAt: new Date() })
      .where(eq(farmerOffers.id, offerId))
      .returning();

    const offer = updated[0];
    if (!offer) throw new Error('Offer not found');

    if (nextStatus === 'Confirmed order') {
      const demandRows = await db
        .select()
        .from(merchantDemand)
        .where(eq(merchantDemand.id, offer.demandId));
      const cropName = demandRows[0]?.cropName || 'Farm Produce';
      const deliveryMode = demandRows[0]?.deliveryLocation || 'As mutually scheduled';
      const orderCode = `ORD-${Date.now().toString().slice(-6)}`;

      await db.insert(orders).values({
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
        isDemo: true,
      });

      await db.insert(notifications).values([
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
    } else {
      await db.insert(notifications).values({
        recipientRole: 'farmer',
        recipientFarmerId: offer.farmerId,
        eventType: 'offer_response',
        title: `Merchant Responded to Offer #${offer.id}`,
        message: `Your offer status is now "${nextStatus}".`,
        relatedTab: 'my_farm',
      });
    }

    return offer;
  } catch (error) {
    wrapDbError('updating farmer offer status', error);
  }
}

export async function updateOrderRecordStatus(
  orderId: number,
  orderStatus: string,
  farmerFeedback?: string
) {
  try {
    const updated = await db
      .update(orders)
      .set({
        orderStatus,
        ...(farmerFeedback !== undefined ? { farmerFeedback } : {}),
        updatedAt: new Date(),
      })
      .where(eq(orders.id, orderId))
      .returning();

    const ord = updated[0];
    if (!ord) throw new Error('Order not found');

    await db.insert(notifications).values([
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

    return ord;
  } catch (error) {
    wrapDbError('updating order status', error);
  }
}

export async function saveConversationTurn(params: {
  conversationId?: number | null;
  farmerId: number;
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
}) {
  try {
    let convId = params.conversationId || null;
    if (!convId) {
      const createdConv = await db
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
    } else {
      await db
        .update(conversations)
        .set({
          status: params.shouldEscalate ? 'Escalated' : 'Resolved',
          updatedAt: new Date(),
        })
        .where(eq(conversations.id, convId));
    }

    await db.insert(conversationMessages).values([
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

    if (params.shouldEscalate) {
      await db.insert(expertEscalations).values({
        farmerId: params.farmerId,
        conversationId: convId,
        questionText: params.questionText,
        category: params.escalationCategory || 'Agronomic Escalation',
        conversationContext: params.conversationContextForExpert || 'Farmer consent withheld for context.',
        escalationReason: params.escalationReason || 'Flagged for agricultural expert review.',
        status: 'Pending Expert Review',
        assignedExpert: 'Unassigned — Coordinator Queue',
      });

      await db.insert(notifications).values([
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
    }

    return convId;
  } catch (error) {
    wrapDbError('saving AI conversation turn', error);
  }
}

export async function createManualEscalationRecord(data: {
  farmerId: number;
  questionText: string;
  category: string;
  conversationContext: string;
  escalationReason: string;
}) {
  try {
    const inserted = await db
      .insert(expertEscalations)
      .values({
        farmerId: data.farmerId,
        questionText: data.questionText,
        category: data.category,
        conversationContext: data.conversationContext,
        escalationReason: data.escalationReason,
        status: 'Pending Expert Review',
        assignedExpert: 'Agronomy Desk (Pending)',
      })
      .returning();

    await db.insert(notifications).values({
      recipientRole: 'coordinator',
      eventType: 'expert_review_requested',
      title: `Expert Review Requested: ${data.category}`,
      message: `Farmer #${data.farmerId} requested expert review.`,
      relatedTab: 'coordinator',
    });

    return inserted[0];
  } catch (error) {
    wrapDbError('creating expert escalation', error);
  }
}

export async function updateEscalationResolution(
  escalationId: number,
  data: {
    status: string;
    assignedExpert: string;
    resolutionNotes: string;
  }
) {
  try {
    const updated = await db
      .update(expertEscalations)
      .set({
        status: data.status,
        assignedExpert: data.assignedExpert,
        resolutionNotes: data.resolutionNotes,
        updatedAt: new Date(),
      })
      .where(eq(expertEscalations.id, escalationId))
      .returning();

    const esc = updated[0];
    if (!esc) throw new Error('Escalation case not found');

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

export async function upsertKnowledgeDocument(data: {
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
}) {
  try {
    if (data.id) {
      const updated = await db
        .update(agriculturalKnowledge)
        .set({
          category: data.category,
          title: data.title,
          titleTe: data.titleTe || '',
          summary: data.summary,
          content: data.content,
          applicableRegions: data.applicableRegions,
          applicableCrops: data.applicableCrops || '',
          sourceName: data.sourceName,
          sourceUrl: data.sourceUrl || '',
          verificationStatus: data.verificationStatus,
          lastVerifiedDate: data.lastVerifiedDate,
          isOutdated: data.isOutdated,
        })
        .where(eq(agriculturalKnowledge.id, data.id))
        .returning();
      return updated[0];
    }
    const inserted = await db
      .insert(agriculturalKnowledge)
      .values({
        category: data.category,
        title: data.title,
        titleTe: data.titleTe || '',
        summary: data.summary,
        content: data.content,
        applicableRegions: data.applicableRegions,
        applicableCrops: data.applicableCrops || '',
        sourceName: data.sourceName,
        sourceUrl: data.sourceUrl || '',
        verificationStatus: data.verificationStatus,
        lastVerifiedDate: data.lastVerifiedDate,
        isOutdated: data.isOutdated,
      })
      .returning();
    return inserted[0];
  } catch (error) {
    wrapDbError('saving agricultural knowledge document', error);
  }
}

export async function upsertSchemeRecord(data: {
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
  verificationStatus: string;
  lastVerifiedDate: string;
  isOutdated: boolean;
}) {
  try {
    if (data.id) {
      const updated = await db
        .update(schemeRecords)
        .set({
          schemeName: data.schemeName,
          schemeNameTe: data.schemeNameTe || '',
          level: data.level,
          applicableState: data.applicableState,
          purpose: data.purpose,
          eligibilityConditions: data.eligibilityConditions,
          benefits: data.benefits,
          requiredDocuments: data.requiredDocuments,
          applicationProcedure: data.applicationProcedure,
          officialPortal: data.officialPortal,
          relevantOffice: data.relevantOffice,
          importantDates: data.importantDates,
          officialSource: data.officialSource,
          verificationStatus: data.verificationStatus,
          lastVerifiedDate: data.lastVerifiedDate,
          isOutdated: data.isOutdated,
        })
        .where(eq(schemeRecords.id, data.id))
        .returning();
      return updated[0];
    }
    const inserted = await db
      .insert(schemeRecords)
      .values({
        schemeCode: data.schemeCode,
        schemeName: data.schemeName,
        schemeNameTe: data.schemeNameTe || '',
        level: data.level,
        applicableState: data.applicableState,
        purpose: data.purpose,
        eligibilityConditions: data.eligibilityConditions,
        benefits: data.benefits,
        requiredDocuments: data.requiredDocuments,
        applicationProcedure: data.applicationProcedure,
        officialPortal: data.officialPortal,
        relevantOffice: data.relevantOffice,
        importantDates: data.importantDates,
        officialSource: data.officialSource,
        verificationStatus: data.verificationStatus,
        lastVerifiedDate: data.lastVerifiedDate,
        isOutdated: data.isOutdated,
      })
      .returning();
    return inserted[0];
  } catch (error) {
    wrapDbError('saving government scheme record', error);
  }
}

export async function createHarvestAndRoutes(
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
    const insertedHarvest = await db
      .insert(harvestRecords)
      .values({
        farmerId: harvestData.farmerId,
        cropName: harvestData.cropName,
        quantityHarvestedQuintals: harvestData.quantityHarvestedQuintals,
        harvestDate: harvestData.harvestDate,
        qualityGrade: harvestData.qualityGrade,
        expectedShelfLifeDays: harvestData.expectedShelfLifeDays,
        location: harvestData.location,
        storageAvailable: harvestData.storageAvailable,
        additionalInfo: harvestData.additionalInfo || '',
        outcomeStatus: 'Destinations Evaluated',
      })
      .returning();

    const harvestId = insertedHarvest[0].id;

    if (evaluatedRoutes.length > 0) {
      await db.insert(agrirouteRecommendations).values(
        evaluatedRoutes.map((r) => ({
          harvestId,
          farmerId: harvestData.farmerId,
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
  } catch (error) {
    wrapDbError('saving harvest and AGRIROUTE evaluation', error);
  }
}

export async function selectAgriRouteDestination(
  recommendationId: number,
  harvestId: number
) {
  try {
    const recRows = await db
      .select()
      .from(agrirouteRecommendations)
      .where(eq(agrirouteRecommendations.id, recommendationId));
    const rec = recRows[0];
    if (!rec) throw new Error('Route recommendation not found');

    await db
      .update(agrirouteRecommendations)
      .set({ isSelected: true })
      .where(eq(agrirouteRecommendations.id, recommendationId));

    await db
      .update(harvestRecords)
      .set({
        selectedDestinationName: rec.destinationName,
        outcomeStatus: `Selected Destination: ${rec.destinationName} (Pending Buyer Dispatch Confirmation)`,
      })
      .where(eq(harvestRecords.id, harvestId));

    await db.insert(notifications).values({
      recipientRole: 'coordinator',
      eventType: 'agriroute_selected',
      title: `AGRIROUTE Destination Selected`,
      message: `Farmer #${rec.farmerId} selected "${rec.destinationName}" (${rec.destinationType}) for harvest #${harvestId}.`,
      relatedTab: 'agriroute',
    });

    return rec;
  } catch (error) {
    wrapDbError('selecting AGRIROUTE destination', error);
  }
}

export async function createSupplyProductEnquiryNotification(data: {
  farmerId: number;
  productName: string;
  supplierName: string;
  quantityNote: string;
}) {
  try {
    await db.insert(notifications).values([
      {
        recipientRole: 'farmer',
        recipientFarmerId: data.farmerId,
        eventType: 'supply_enquiry_logged',
        title: `Supply Enquiry Sent: ${data.productName}`,
        message: `Your enquiry (${data.quantityNote}) to ${data.supplierName} is logged for pilot coordinator follow-up. No online payment collected.`,
        relatedTab: 'farmer_market',
      },
      {
        recipientRole: 'coordinator',
        eventType: 'supply_enquiry_logged',
        title: `Farm Input Enquiry: ${data.productName}`,
        message: `Farmer #${data.farmerId} requested availability for ${data.productName} from ${data.supplierName} (${data.quantityNote}).`,
        relatedTab: 'coordinator',
      },
    ]);
  } catch (error) {
    wrapDbError('logging supply product enquiry', error);
  }
}

export async function markNotificationRead(notificationId: number) {
  try {
    await db
      .update(notifications)
      .set({ isRead: true })
      .where(eq(notifications.id, notificationId));
  } catch (error) {
    wrapDbError('marking notification read', error);
  }
}

export async function markAllNotificationsReadForRole(role: string, farmerId?: number, merchantId?: number) {
  try {
    const all = await db.select().from(notifications);
    const matchingIds = all
      .filter((n) => {
        if (role === 'coordinator') return n.recipientRole === 'coordinator';
        if (role === 'merchant') {
          return (
            n.recipientRole === 'merchant' &&
            (!n.recipientMerchantId || !merchantId || n.recipientMerchantId === merchantId)
          );
        }
        return (
          n.recipientRole === 'farmer' &&
          (!n.recipientFarmerId || !farmerId || n.recipientFarmerId === farmerId)
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
