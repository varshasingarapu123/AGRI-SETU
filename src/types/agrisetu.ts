export type MainTabId =
  | 'assistant'
  | 'merchant_market'
  | 'farmer_market'
  | 'agriroute'
  | 'my_farm'
  | 'coordinator';

export interface FarmerConsentRecord {
  id: number;
  farmerId: number;
  shareProfileWithAi: boolean;
  shareProfileWithMerchants: boolean;
  shareContactOnEnquiry: boolean;
  shareConversationWithExperts: boolean;
}

export interface FarmDetailsRecord {
  id: number;
  farmerId: number;
  farmAreaAcres: string;
  irrigationType: string;
  waterAvailability: string;
  climateZone: string;
  storageAvailable: boolean;
  storageDetails: string | null;
  cropInterests: string | null;
  constraints: string | null;
}

export interface SoilRecord {
  id: number;
  farmerId: number;
  soilType: string;
  phLevel: string | null;
  organicCarbon: string | null;
  nitrogenStatus: string | null;
  phosphorusStatus: string | null;
  potassiumStatus: string | null;
  salinityNote: string | null;
  testDate: string | null;
  isVerifiedLabTest: boolean;
  expertReviewed: boolean;
}

export interface CropRecord {
  id: number;
  farmerId: number;
  season: string;
  cropName: string;
  variety: string | null;
  status: string;
  areaAcres: string | null;
  sowingDate: string | null;
  expectedHarvestDate: string | null;
  notes: string | null;
}

export interface EnrichedFarmerProfile {
  id: number;
  userId: number | null;
  farmerCode: string;
  name: string;
  nameTe: string | null;
  village: string;
  mandal: string;
  district: string;
  region: string;
  preferredLanguage: string;
  dialectProfile: string;
  phoneMasked: string | null;
  savedKnowledgeIds: string;
  customVocabularyJson: string;
  isDemo: boolean;
  consent: FarmerConsentRecord | null;
  farmDetails: FarmDetailsRecord | null;
  latestSoil: SoilRecord | null;
  soilRecords: SoilRecord[];
  cropRecords: CropRecord[];
  currentCrop: string;
  previousCrop: string;
}

export interface KnowledgeRecord {
  id: number;
  category: string;
  title: string;
  titleTe: string | null;
  summary: string;
  content: string;
  contentTe: string | null;
  applicableRegions: string;
  applicableCrops: string | null;
  sourceName: string;
  sourceUrl: string | null;
  verificationStatus: string;
  lastVerifiedDate: string;
  isOutdated: boolean;
}

export interface SchemeRecord {
  id: number;
  schemeCode: string;
  schemeName: string;
  schemeNameTe: string | null;
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
}

export interface ProduceListingRecord {
  id: number;
  farmerId: number;
  cropName: string;
  variety: string | null;
  imageKey: string | null;
  quantityQuintals: string;
  expectedHarvestDate: string;
  availabilityType: string;
  qualityGrade: string;
  qualityVerification: string;
  productionMethod: string;
  askingPricePerQuintal: string | null;
  village: string;
  mandal: string;
  district: string;
  listingStatus: string;
  privacyShowName: boolean;
  isDemo: boolean;
  farmerDisplayName: string;
  farmerContactNote: string;
  farmerConsentAllowsShare: boolean;
  createdAt: string;
}

export interface MerchantProfileRecord {
  id: number;
  merchantCode: string;
  businessName: string;
  buyerType: string;
  contactPerson: string;
  district: string;
  mandal: string;
  locationDetail: string;
  savedListingIds: string;
  verificationStatus: string;
  isDemo: boolean;
}

export interface MerchantDemandRecord {
  id: number;
  merchantId: number;
  cropName: string;
  quantityRequiredQuintals: string;
  qualitySpecifications: string;
  acceptsCosmeticImperfect: boolean;
  procurementPeriod: string;
  deliveryLocation: string;
  district: string;
  offeredPriceRange: string;
  additionalRequirements: string | null;
  demandStatus: string;
  distanceKmFromKakinada: number;
  distanceKmFromGodavari: number;
  isDemo: boolean;
  merchantName: string;
  buyerType: string;
  merchantVerification: string;
}

export interface PurchaseEnquiryRecord {
  id: number;
  listingId: number;
  merchantId: number;
  farmerId: number;
  requiredQuantityQuintals: string;
  proposedPricePerQuintal: string;
  qualityRequirements: string;
  logisticsPreference: string;
  procurementDate: string;
  message: string | null;
  status: string;
  createdAt: string;
}

export interface FarmerOfferRecord {
  id: number;
  demandId: number;
  farmerId: number;
  merchantId: number;
  quantityOfferedQuintals: string;
  expectedPricePerQuintal: string;
  expectedHarvestDate: string;
  qualityDetails: string;
  message: string | null;
  status: string;
  createdAt: string;
}

export interface OrderRecord {
  id: number;
  orderCode: string;
  farmerId: number;
  merchantId: number;
  sourceType: string;
  sourceId: number | null;
  cropName: string;
  agreedQuantityQuintals: string;
  agreedPricePerQuintal: string;
  deliveryMode: string;
  scheduledDate: string;
  orderStatus: string;
  notes: string | null;
  farmerFeedback: string | null;
  isDemo: boolean;
  createdAt: string;
}

export interface SupplyProductRecord {
  id: number;
  supplierId: number;
  productName: string;
  category: string;
  imageKey: string | null;
  description: string;
  specifications: string;
  priceInr: string;
  unit: string;
  availabilityStatus: string;
  isDemo: boolean;
  supplierName: string;
  supplierLocation: string;
  supplierAddress: string;
  supplierContact: string;
  supplierVerification: string;
}

export interface ConversationMessageRecord {
  id: number;
  conversationId: number;
  sender: 'farmer' | 'assistant' | 'expert';
  messageText: string;
  transcribedFromVoice: boolean;
  citationsJson: string;
  confidenceNote: string | null;
  escalated: boolean;
  createdAt: string;
}

export interface ConversationRecord {
  id: number;
  farmerId: number;
  title: string;
  language: string;
  dialectProfile: string | null;
  mode: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  messages: ConversationMessageRecord[];
}

export interface AgrirouteRecommendationRecord {
  id: number;
  harvestId: number;
  farmerId: number;
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
  isSelected: boolean;
}

export interface HarvestRecord {
  id: number;
  farmerId: number;
  cropName: string;
  quantityHarvestedQuintals: string;
  harvestDate: string;
  qualityGrade: string;
  expectedShelfLifeDays: number;
  location: string;
  storageAvailable: boolean;
  additionalInfo: string | null;
  selectedDestinationName: string | null;
  outcomeStatus: string;
  createdAt: string;
  recommendations: AgrirouteRecommendationRecord[];
}

export interface ExpertEscalationRecord {
  id: number;
  farmerId: number;
  conversationId: number | null;
  questionText: string;
  category: string;
  conversationContext: string | null;
  escalationReason: string;
  status: string;
  assignedExpert: string | null;
  resolutionNotes: string | null;
  createdAt: string;
}

export interface NotificationRecord {
  id: number;
  recipientRole: string;
  recipientFarmerId: number | null;
  recipientMerchantId: number | null;
  eventType: string;
  title: string;
  message: string;
  relatedTab: string;
  isRead: boolean;
  createdAt: string;
}

export interface AiRuntimeStatus {
  aiConfigured: boolean;
  isDemoMode: boolean;
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

export interface BootstrapData {
  farmers: EnrichedFarmerProfile[];
  knowledge: KnowledgeRecord[];
  schemes: SchemeRecord[];
  listings: ProduceListingRecord[];
  merchants: MerchantProfileRecord[];
  demands: MerchantDemandRecord[];
  enquiries: PurchaseEnquiryRecord[];
  offers: FarmerOfferRecord[];
  orders: OrderRecord[];
  supplyProducts: SupplyProductRecord[];
  conversations: ConversationRecord[];
  harvests: HarvestRecord[];
  escalations: ExpertEscalationRecord[];
  notifications: NotificationRecord[];
  aiRuntime: AiRuntimeStatus;
}

