import { relations } from 'drizzle-orm';
import {
  boolean,
  integer,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';

// 1. users
export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  uid: text('uid').notNull().unique(),
  email: text('email').notNull(),
  displayName: text('display_name'),
  role: text('role').notNull().default('farmer'), // 'farmer' | 'merchant' | 'coordinator'
  isDemo: boolean('is_demo').notNull().default(false),
  createdAt: timestamp('created_at').defaultNow(),
});

// 2. farmer_profiles
export const farmerProfiles = pgTable('farmer_profiles', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').references(() => users.id),
  farmerCode: text('farmer_code').notNull().unique(),
  name: text('name').notNull(),
  nameTe: text('name_te'),
  village: text('village').notNull(),
  mandal: text('mandal').notNull(),
  district: text('district').notNull(),
  region: text('region').notNull(),
  preferredLanguage: text('preferred_language').notNull().default('te'), // 'te' | 'en'
  dialectProfile: text('dialect_profile').notNull(), // 'kakinada_coastal' | 'godavari_delta'
  phoneMasked: text('phone_masked'),
  savedKnowledgeIds: text('saved_knowledge_ids').notNull().default('[]'),
  customVocabularyJson: text('custom_vocabulary_json').notNull().default('[]'),
  isDemo: boolean('is_demo').notNull().default(true),
  updatedAt: timestamp('updated_at').defaultNow(),
  createdAt: timestamp('created_at').defaultNow(),
});

// 3. farmer_consent
export const farmerConsent = pgTable('farmer_consent', {
  id: serial('id').primaryKey(),
  farmerId: integer('farmer_id')
    .references(() => farmerProfiles.id)
    .notNull()
    .unique(),
  shareProfileWithAi: boolean('share_profile_with_ai').notNull().default(false),
  shareProfileWithMerchants: boolean('share_profile_with_merchants').notNull().default(false),
  shareContactOnEnquiry: boolean('share_contact_on_enquiry').notNull().default(false),
  shareConversationWithExperts: boolean('share_conversation_with_experts').notNull().default(false),
  saveConversationHistory: boolean('save_conversation_history').notNull().default(false),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// 4. farm_details
export const farmDetails = pgTable('farm_details', {
  id: serial('id').primaryKey(),
  farmerId: integer('farmer_id')
    .references(() => farmerProfiles.id)
    .notNull()
    .unique(),
  farmAreaAcres: text('farm_area_acres').notNull(),
  irrigationType: text('irrigation_type').notNull(),
  waterAvailability: text('water_availability').notNull(),
  climateZone: text('climate_zone').notNull(),
  storageAvailable: boolean('storage_available').notNull().default(false),
  storageDetails: text('storage_details'),
  cropInterests: text('crop_interests'),
  constraints: text('constraints'),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// 5. soil_records
export const soilRecords = pgTable('soil_records', {
  id: serial('id').primaryKey(),
  farmerId: integer('farmer_id')
    .references(() => farmerProfiles.id)
    .notNull(),
  soilType: text('soil_type').notNull(),
  phLevel: text('ph_level'),
  organicCarbon: text('organic_carbon'),
  nitrogenStatus: text('nitrogen_status'),
  phosphorusStatus: text('phosphorus_status'),
  potassiumStatus: text('potassium_status'),
  salinityNote: text('salinity_note'),
  testDate: text('test_date'),
  isVerifiedLabTest: boolean('is_verified_lab_test').notNull().default(false),
  expertReviewed: boolean('expert_reviewed').notNull().default(false),
  createdAt: timestamp('created_at').defaultNow(),
});

// 6. crop_records
export const cropRecords = pgTable('crop_records', {
  id: serial('id').primaryKey(),
  farmerId: integer('farmer_id')
    .references(() => farmerProfiles.id)
    .notNull(),
  season: text('season').notNull(),
  cropName: text('crop_name').notNull(),
  variety: text('variety'),
  status: text('status').notNull(), // 'current' | 'previous' | 'planned'
  areaAcres: text('area_acres'),
  sowingDate: text('sowing_date'),
  expectedHarvestDate: text('expected_harvest_date'),
  notes: text('notes'),
  createdAt: timestamp('created_at').defaultNow(),
});

// 7. agricultural_knowledge
export const agriculturalKnowledge = pgTable('agricultural_knowledge', {
  id: serial('id').primaryKey(),
  category: text('category').notNull(),
  title: text('title').notNull(),
  titleTe: text('title_te'),
  summary: text('summary').notNull(),
  content: text('content').notNull(),
  contentTe: text('content_te'),
  applicableRegions: text('applicable_regions').notNull(),
  applicableCrops: text('applicable_crops'),
  sourceName: text('source_name').notNull(),
  sourceUrl: text('source_url'),
  verificationStatus: text('verification_status').notNull(), // 'Verified' | 'Requires Verification'
  lastVerifiedDate: text('last_verified_date').notNull(),
  isOutdated: boolean('is_outdated').notNull().default(false),
  createdAt: timestamp('created_at').defaultNow(),
});

// 8. conversations
export const conversations = pgTable('conversations', {
  id: serial('id').primaryKey(),
  farmerId: integer('farmer_id')
    .references(() => farmerProfiles.id)
    .notNull(),
  title: text('title').notNull(),
  language: text('language').notNull().default('te'),
  dialectProfile: text('dialect_profile'),
  mode: text('mode').notNull().default('voice_call'),
  status: text('status').notNull().default('Resolved'), // 'Active' | 'Resolved' | 'Escalated' | 'Unresolved'
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// 9. conversation_messages
export const conversationMessages = pgTable('conversation_messages', {
  id: serial('id').primaryKey(),
  conversationId: integer('conversation_id')
    .references(() => conversations.id)
    .notNull(),
  sender: text('sender').notNull(), // 'farmer' | 'assistant' | 'expert'
  messageText: text('message_text').notNull(),
  transcribedFromVoice: boolean('transcribed_from_voice').notNull().default(false),
  citationsJson: text('citations_json').notNull().default('[]'),
  confidenceNote: text('confidence_note'),
  escalated: boolean('escalated').notNull().default(false),
  createdAt: timestamp('created_at').defaultNow(),
});

// 10. scheme_records
export const schemeRecords = pgTable('scheme_records', {
  id: serial('id').primaryKey(),
  schemeCode: text('scheme_code').notNull().unique(),
  schemeName: text('scheme_name').notNull(),
  schemeNameTe: text('scheme_name_te'),
  level: text('level').notNull(), // 'Central' | 'State'
  applicableState: text('applicable_state').notNull(),
  purpose: text('purpose').notNull(),
  eligibilityConditions: text('eligibility_conditions').notNull(),
  benefits: text('benefits').notNull(),
  requiredDocuments: text('required_documents').notNull(),
  applicationProcedure: text('application_procedure').notNull(),
  officialPortal: text('official_portal').notNull(),
  relevantOffice: text('relevant_office').notNull(),
  importantDates: text('important_dates').notNull(),
  officialSource: text('official_source').notNull(),
  officialSourceUrl: text('official_source_url'),
  verificationStatus: text('verification_status').notNull(), // 'Verified' | 'Requires Verification'
  lastVerifiedDate: text('last_verified_date').notNull(),
  isOutdated: boolean('is_outdated').notNull().default(false),
  createdAt: timestamp('created_at').defaultNow(),
});

// 11. farmer_produce_listings
export const farmerProduceListings = pgTable('farmer_produce_listings', {
  id: serial('id').primaryKey(),
  farmerId: integer('farmer_id')
    .references(() => farmerProfiles.id)
    .notNull(),
  cropName: text('crop_name').notNull(),
  variety: text('variety'),
  imageKey: text('image_key'),
  quantityQuintals: text('quantity_quintals').notNull(),
  expectedHarvestDate: text('expected_harvest_date').notNull(),
  availabilityType: text('availability_type').notNull(), // 'available_now' | 'upcoming_harvest'
  qualityGrade: text('quality_grade').notNull(),
  qualityVerification: text('quality_verification').notNull().default('Self-reported'),
  productionMethod: text('production_method').notNull(),
  askingPricePerQuintal: text('asking_price_per_quintal'),
  village: text('village').notNull(),
  mandal: text('mandal').notNull(),
  district: text('district').notNull(),
  listingStatus: text('listing_status').notNull().default('Active'),
  privacyShowName: boolean('privacy_show_name').notNull().default(true),
  isDemo: boolean('is_demo').notNull().default(true),
  createdAt: timestamp('created_at').defaultNow(),
});

// 12. merchant_profiles
export const merchantProfiles = pgTable('merchant_profiles', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').references(() => users.id),
  merchantCode: text('merchant_code').notNull().unique(),
  businessName: text('business_name').notNull(),
  buyerType: text('buyer_type').notNull(), // 'Direct Merchant' | 'Wholesaler' | 'Retail Procurement' | 'Food Processing Unit'
  contactPerson: text('contact_person').notNull(),
  district: text('district').notNull(),
  mandal: text('mandal').notNull(),
  locationDetail: text('location_detail').notNull(),
  savedListingIds: text('saved_listing_ids').notNull().default('[]'),
  verificationStatus: text('verification_status').notNull().default('Demo Account'),
  isDemo: boolean('is_demo').notNull().default(true),
  createdAt: timestamp('created_at').defaultNow(),
});

// 13. merchant_demand
export const merchantDemand = pgTable('merchant_demand', {
  id: serial('id').primaryKey(),
  merchantId: integer('merchant_id')
    .references(() => merchantProfiles.id)
    .notNull(),
  cropName: text('crop_name').notNull(),
  quantityRequiredQuintals: text('quantity_required_quintals').notNull(),
  qualitySpecifications: text('quality_specifications').notNull(),
  acceptsCosmeticImperfect: boolean('accepts_cosmetic_imperfect').notNull().default(false),
  procurementPeriod: text('procurement_period').notNull(),
  deliveryLocation: text('delivery_location').notNull(),
  district: text('district').notNull(),
  offeredPriceRange: text('offered_price_range').notNull(),
  additionalRequirements: text('additional_requirements'),
  demandStatus: text('demand_status').notNull().default('Open'),
  distanceKmFromKakinada: integer('distance_km_from_kakinada').notNull().default(25),
  distanceKmFromGodavari: integer('distance_km_from_godavari').notNull().default(30),
  isDemo: boolean('is_demo').notNull().default(true),
  createdAt: timestamp('created_at').defaultNow(),
});

// 14. purchase_enquiries
export const purchaseEnquiries = pgTable('purchase_enquiries', {
  id: serial('id').primaryKey(),
  listingId: integer('listing_id')
    .references(() => farmerProduceListings.id)
    .notNull(),
  merchantId: integer('merchant_id')
    .references(() => merchantProfiles.id)
    .notNull(),
  farmerId: integer('farmer_id')
    .references(() => farmerProfiles.id)
    .notNull(),
  requiredQuantityQuintals: text('required_quantity_quintals').notNull(),
  proposedPricePerQuintal: text('proposed_price_per_quintal').notNull(),
  qualityRequirements: text('quality_requirements').notNull(),
  logisticsPreference: text('logistics_preference').notNull(),
  procurementDate: text('procurement_date').notNull(),
  message: text('message'),
  status: text('status').notNull().default('Enquiry received'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// 15. farmer_offers
export const farmerOffers = pgTable('farmer_offers', {
  id: serial('id').primaryKey(),
  demandId: integer('demand_id')
    .references(() => merchantDemand.id)
    .notNull(),
  farmerId: integer('farmer_id')
    .references(() => farmerProfiles.id)
    .notNull(),
  merchantId: integer('merchant_id')
    .references(() => merchantProfiles.id)
    .notNull(),
  quantityOfferedQuintals: text('quantity_offered_quintals').notNull(),
  expectedPricePerQuintal: text('expected_price_per_quintal').notNull(),
  expectedHarvestDate: text('expected_harvest_date').notNull(),
  qualityDetails: text('quality_details').notNull(),
  message: text('message'),
  status: text('status').notNull().default('Offer made'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// 16. orders
export const orders = pgTable(
  'orders',
  {
    id: serial('id').primaryKey(),
    orderCode: text('order_code').notNull().unique(),
    farmerId: integer('farmer_id')
      .references(() => farmerProfiles.id)
      .notNull(),
    merchantId: integer('merchant_id')
      .references(() => merchantProfiles.id)
      .notNull(),
    sourceType: text('source_type').notNull(), // 'enquiry' | 'offer' | 'agriroute'
    sourceId: integer('source_id'),
    cropName: text('crop_name').notNull(),
    agreedQuantityQuintals: text('agreed_quantity_quintals').notNull(),
    agreedPricePerQuintal: text('agreed_price_per_quintal').notNull(),
    deliveryMode: text('delivery_mode').notNull(),
    scheduledDate: text('scheduled_date').notNull(),
    orderStatus: text('order_status').notNull().default('Confirmed order'), // 'Confirmed order' | 'Completed' | 'Cancelled'
    notes: text('notes'),
    farmerFeedback: text('farmer_feedback'),
    isDemo: boolean('is_demo').notNull().default(false),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
  },
  (table) => [uniqueIndex('orders_source_unique_idx').on(table.sourceType, table.sourceId)]
);

// 17. supplier_profiles
export const supplierProfiles = pgTable('supplier_profiles', {
  id: serial('id').primaryKey(),
  supplierCode: text('supplier_code').notNull().unique(),
  supplierName: text('supplier_name').notNull(),
  district: text('district').notNull(),
  mandal: text('mandal').notNull(),
  address: text('address').notNull(),
  contactInfo: text('contact_info').notNull(),
  verificationStatus: text('verification_status').notNull().default('Demo Supplier — Unverified'),
  isDemo: boolean('is_demo').notNull().default(true),
  createdAt: timestamp('created_at').defaultNow(),
});

// 18. supply_products
export const supplyProducts = pgTable('supply_products', {
  id: serial('id').primaryKey(),
  supplierId: integer('supplier_id')
    .references(() => supplierProfiles.id)
    .notNull(),
  productName: text('product_name').notNull(),
  category: text('category').notNull(),
  imageKey: text('image_key'),
  description: text('description').notNull(),
  specifications: text('specifications').notNull(),
  priceInr: text('price_inr').notNull(),
  unit: text('unit').notNull(),
  availabilityStatus: text('availability_status').notNull(),
  isDemo: boolean('is_demo').notNull().default(true),
  createdAt: timestamp('created_at').defaultNow(),
});

// 19. harvest_records
export const harvestRecords = pgTable('harvest_records', {
  id: serial('id').primaryKey(),
  farmerId: integer('farmer_id')
    .references(() => farmerProfiles.id)
    .notNull(),
  cropName: text('crop_name').notNull(),
  quantityHarvestedQuintals: text('quantity_harvested_quintals').notNull(),
  harvestDate: text('harvest_date').notNull(),
  qualityGrade: text('quality_grade').notNull(),
  expectedShelfLifeDays: integer('expected_shelf_life_days').notNull(),
  location: text('location').notNull(),
  storageAvailable: boolean('storage_available').notNull().default(false),
  additionalInfo: text('additional_info'),
  selectedDestinationName: text('selected_destination_name'),
  outcomeStatus: text('outcome_status').notNull().default('Destinations Evaluated'),
  createdAt: timestamp('created_at').defaultNow(),
});

// 20. agriroute_recommendations
export const agrirouteRecommendations = pgTable('agriroute_recommendations', {
  id: serial('id').primaryKey(),
  harvestId: integer('harvest_id')
    .references(() => harvestRecords.id)
    .notNull(),
  farmerId: integer('farmer_id')
    .references(() => farmerProfiles.id)
    .notNull(),
  merchantId: integer('merchant_id').references(() => merchantProfiles.id),
  destinationName: text('destination_name').notNull(),
  destinationType: text('destination_type').notNull(),
  suitabilityScore: integer('suitability_score').notNull(),
  quantityAcceptedQuintals: text('quantity_accepted_quintals').notNull(),
  qualityMatchLabel: text('quality_match_label').notNull(),
  distanceKm: integer('distance_km').notNull(),
  estimatedLogisticsCostInr: text('estimated_logistics_cost_inr').notNull(),
  isIllustrativeEstimate: boolean('is_illustrative_estimate').notNull().default(true),
  procurementTiming: text('procurement_timing').notNull(),
  demandStatus: text('demand_status').notNull(),
  rankingReason: text('ranking_reason').notNull(),
  isSelected: boolean('is_selected').notNull().default(false),
  createdAt: timestamp('created_at').defaultNow(),
});

// 21. expert_escalations
export const expertEscalations = pgTable('expert_escalations', {
  id: serial('id').primaryKey(),
  farmerId: integer('farmer_id')
    .references(() => farmerProfiles.id)
    .notNull(),
  conversationId: integer('conversation_id').references(() => conversations.id),
  questionText: text('question_text').notNull(),
  category: text('category').notNull(),
  conversationContext: text('conversation_context'),
  escalationReason: text('escalation_reason').notNull(),
  status: text('status').notNull().default('Pending Expert Review'), // 'Pending Expert Review' | 'Assigned' | 'Resolved'
  assignedExpert: text('assigned_expert'),
  resolutionNotes: text('resolution_notes'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// 22. notifications
export const notifications = pgTable('notifications', {
  id: serial('id').primaryKey(),
  recipientRole: text('recipient_role').notNull(), // 'farmer' | 'merchant' | 'coordinator'
  recipientFarmerId: integer('recipient_farmer_id').references(() => farmerProfiles.id),
  recipientMerchantId: integer('recipient_merchant_id').references(() => merchantProfiles.id),
  eventType: text('event_type').notNull(),
  title: text('title').notNull(),
  message: text('message').notNull(),
  relatedTab: text('related_tab').notNull(),
  isRead: boolean('is_read').notNull().default(false),
  createdAt: timestamp('created_at').defaultNow(),
});

// Relations
export const farmerProfilesRelations = relations(farmerProfiles, ({ one, many }) => ({
  user: one(users, { fields: [farmerProfiles.userId], references: [users.id] }),
  consent: one(farmerConsent, { fields: [farmerProfiles.id], references: [farmerConsent.farmerId] }),
  farmDetails: one(farmDetails, { fields: [farmerProfiles.id], references: [farmDetails.farmerId] }),
  soilRecords: many(soilRecords),
  cropRecords: many(cropRecords),
  conversations: many(conversations),
  listings: many(farmerProduceListings),
  harvestRecords: many(harvestRecords),
}));

export const conversationsRelations = relations(conversations, ({ one, many }) => ({
  farmer: one(farmerProfiles, { fields: [conversations.farmerId], references: [farmerProfiles.id] }),
  messages: many(conversationMessages),
}));

export const conversationMessagesRelations = relations(conversationMessages, ({ one }) => ({
  conversation: one(conversations, {
    fields: [conversationMessages.conversationId],
    references: [conversations.id],
  }),
}));

export const merchantProfilesRelations = relations(merchantProfiles, ({ one, many }) => ({
  user: one(users, { fields: [merchantProfiles.userId], references: [users.id] }),
  demands: many(merchantDemand),
}));
