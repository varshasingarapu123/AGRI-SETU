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
import { count } from 'drizzle-orm';

let seedingInProgress: Promise<void> | null = null;

export async function ensureDemoSeedData(): Promise<void> {
  if (seedingInProgress) {
    return seedingInProgress;
  }

  seedingInProgress = (async () => {
    try {
      const existing = await db.select({ total: count() }).from(farmerProfiles);
      if ((existing[0]?.total ?? 0) > 0) {
        return;
      }

      // 1. Seed Demo Users
      const insertedUsers = await db
        .insert(users)
        .values([
          {
            uid: 'demo-farmer-ramu',
            email: 'ramu.demo@agrisetu.example',
            displayName: 'Ramu (Demo Farmer)',
            role: 'farmer',
            isDemo: true,
          },
          {
            uid: 'demo-farmer-lakshmi',
            email: 'lakshmi.demo@agrisetu.example',
            displayName: 'Lakshmi (Demo Farmer)',
            role: 'farmer',
            isDemo: true,
          },
          {
            uid: 'demo-merchant-satya',
            email: 'satya.traders@agrisetu.example',
            displayName: 'Sri Satyanarayana Agro Traders (Demo)',
            role: 'merchant',
            isDemo: true,
          },
          {
            uid: 'demo-merchant-godavari',
            email: 'godavari.fresh@agrisetu.example',
            displayName: 'Godavari Fresh Retail Supply (Demo)',
            role: 'merchant',
            isDemo: true,
          },
          {
            uid: 'demo-coordinator-pilot',
            email: 'coordinator.pilot@agrisetu.example',
            displayName: 'AGRISETU Pilot Coordinator',
            role: 'coordinator',
            isDemo: true,
          },
        ])
        .onConflictDoNothing()
        .returning();

      const ramuUserId = insertedUsers[0]?.id ?? null;
      const lakshmiUserId = insertedUsers[1]?.id ?? null;
      const merch1UserId = insertedUsers[2]?.id ?? null;
      const merch2UserId = insertedUsers[3]?.id ?? null;

      // 2. Seed Two Fictional Demo Farmer Profiles (Ramu & Lakshmi)
      const insertedFarmers = await db
        .insert(farmerProfiles)
        .values([
          {
            userId: ramuUserId,
            farmerCode: 'FARM-DEMO-001',
            name: 'Ramu',
            nameTe: 'రాము (డెమో ప్రొఫైల్)',
            village: 'Gollaprolu',
            mandal: 'Gollaprolu',
            district: 'Kakinada',
            region: 'Kakinada',
            preferredLanguage: 'te',
            dialectProfile: 'kakinada_coastal',
            phoneMasked: '+91 98XXX-X4102 (Demo)',
            savedKnowledgeIds: JSON.stringify([1, 6]),
            customVocabularyJson: JSON.stringify([
              { term: 'చేను', meaning: 'Cultivated crop field (Kakinada coastal usage)' },
              { term: 'బోదె', meaning: 'Field irrigation / drainage channel' },
              { term: 'దోమపోటు', meaning: 'Brown planthopper (BPH) pest damage in paddy' },
              { term: 'పొల్లు', meaning: 'Unfilled / chaffy paddy grains' },
              { term: 'నారుమడి', meaning: 'Paddy seedbed / nursery plot' },
            ]),
            isDemo: true,
          },
          {
            userId: lakshmiUserId,
            farmerCode: 'FARM-DEMO-002',
            name: 'Lakshmi',
            nameTe: 'లక్ష్మి (డెమో ప్రొఫైల్)',
            village: 'Atreyapuram',
            mandal: 'Atreyapuram',
            district: 'Dr. B.R. Ambedkar Konaseema',
            region: 'Godavari region',
            preferredLanguage: 'te',
            dialectProfile: 'godavari_delta',
            phoneMasked: '+91 94XXX-X8821 (Demo)',
            savedKnowledgeIds: JSON.stringify([4, 8]),
            customVocabularyJson: JSON.stringify([
              { term: 'లంక భూమి', meaning: 'Fertile Godavari riverine alluvial silt land' },
              { term: 'గెల', meaning: 'Harvestable banana bunch' },
              { term: 'కొమ్ము', meaning: 'Turmeric finger rhizome' },
              { term: 'దుంప కుళ్ళు', meaning: 'Rhizome rot in turmeric or corm rot in banana' },
              { term: 'పిలకలు', meaning: 'Side suckers around banana mat' },
            ]),
            isDemo: true,
          },
        ])
        .returning();

      const ramu = insertedFarmers[0];
      const lakshmi = insertedFarmers[1];

      // 3. Farmer Consent
      await db.insert(farmerConsent).values([
        {
          farmerId: ramu.id,
          shareProfileWithAi: true,
          shareProfileWithMerchants: true,
          shareContactOnEnquiry: false,
          shareConversationWithExperts: true,
        },
        {
          farmerId: lakshmi.id,
          shareProfileWithAi: true,
          shareProfileWithMerchants: true,
          shareContactOnEnquiry: true,
          shareConversationWithExperts: true,
        },
      ]);

      // 4. Farm Details
      await db.insert(farmDetails).values([
        {
          farmerId: ramu.id,
          farmAreaAcres: '3.5',
          irrigationType: 'Canal + Borewell supplement',
          waterAvailability: 'Seasonal canal water; mild borewell salinity in late Rabi',
          climateZone: 'Coastal Humid Delta (Kakinada)',
          storageAvailable: false,
          storageDetails: 'Open concrete drying floor with tarpaulin cover only (Demo)',
          cropInterests: 'Low-water Rabi pulses (Black Gram / Green Gram), lodging-tolerant paddy',
          constraints: 'Northeast monsoon wind lodging risk; limited covered storage after harvest',
        },
        {
          farmerId: lakshmi.id,
          farmAreaAcres: '5.0',
          irrigationType: 'Godavari Canal + Drip Irrigation',
          waterAvailability: 'Assured Godavari delta canal with inline drip system',
          climateZone: 'Godavari Riverine Delta',
          storageAvailable: true,
          storageDetails: 'Ventilated bamboo-slat curing & sorting shed (80 quintals capacity — Demo)',
          cropInterests: 'Karpura Chakkarakeli banana, high-curcumin turmeric intercrop, processing buyers',
          constraints: 'High monsoon humidity leaf-spot pressure; cosmetic bruising during bunch transport',
        },
      ]);

      // 5. Soil Records
      await db.insert(soilRecords).values([
        {
          farmerId: ramu.id,
          soilType: 'Coastal Alluvial Clay Loam',
          phLevel: '7.4',
          organicCarbon: '0.56%',
          nitrogenStatus: 'Low',
          phosphorusStatus: 'Medium',
          potassiumStatus: 'High',
          salinityNote: 'EC 1.5 dS/m — mild coastal borewell salinity in summer months',
          testDate: '2026-05-18',
          isVerifiedLabTest: false,
          expertReviewed: false,
        },
        {
          farmerId: lakshmi.id,
          soilType: 'Godavari Riverine Silt Loam (Lanka Soil)',
          phLevel: '6.8',
          organicCarbon: '0.84%',
          nitrogenStatus: 'Medium',
          phosphorusStatus: 'High',
          potassiumStatus: 'High',
          salinityNote: 'EC 0.6 dS/m — non-saline fertile delta silt',
          testDate: '2026-06-04',
          isVerifiedLabTest: true,
          expertReviewed: true,
        },
      ]);

      // 6. Crop Records
      await db.insert(cropRecords).values([
        {
          farmerId: ramu.id,
          season: 'Rabi 2025-26',
          cropName: 'Black Gram (Minumu)',
          variety: 'LBG-752',
          status: 'previous',
          areaAcres: '3.5',
          sowingDate: '2025-11-28',
          expectedHarvestDate: '2026-02-18',
          notes: 'Grown on residual moisture after Kharif paddy (Demo record).',
        },
        {
          farmerId: ramu.id,
          season: 'Kharif 2026',
          cropName: 'Paddy (MTU-1061 Indra)',
          variety: 'MTU-1061',
          status: 'current',
          areaAcres: '3.5',
          sowingDate: '2026-07-12',
          expectedHarvestDate: '2026-11-18',
          notes: 'Grain filling stage; monitoring lower leaf sheaths after coastal showers (Demo record).',
        },
        {
          farmerId: lakshmi.id,
          season: 'Rabi 2025-26',
          cropName: 'Maize',
          variety: 'DHM-117',
          status: 'previous',
          areaAcres: '2.0',
          sowingDate: '2025-12-05',
          expectedHarvestDate: '2026-03-22',
          notes: 'Rotated prior to turmeric planting (Demo record).',
        },
        {
          farmerId: lakshmi.id,
          season: 'Annual 2026',
          cropName: 'Banana (Karpura Chakkarakeli) + Turmeric Intercrop',
          variety: 'Karpura Chakkarakeli & Roma',
          status: 'current',
          areaAcres: '5.0',
          sowingDate: '2026-01-15',
          expectedHarvestDate: '2026-11-08',
          notes: 'First banana harvest ready; turmeric intercrop maturing in December (Demo record).',
        },
      ]);

      // 7. Agricultural Knowledge Base (All 12 Required Categories!)
      await db.insert(agriculturalKnowledge).values([
        {
          category: 'Crop cultivation',
          title: 'Paddy-Pulse Relay Cropping in Coastal Andhra Delta',
          titleTe: 'తీరప్రాంత ఆంధ్రాలో వరి తర్వాత అపరాల సాగు పద్ధతులు',
          summary:
            'Sowing YMV-tolerant Black Gram (LBG-752 / PU-31) 7–10 days before paddy harvest or into moist stubble conserves soil moisture and adds biological nitrogen.',
          content:
            'In Kakinada and Godavari delta tracts, broadcasting certified Black Gram or Green Gram seeds in standing paddy fields at physiological maturity utilizes residual soil moisture without heavy tillage. Ensure field drainage channels (బోదెలు) are cleared to prevent post-sowing rain stagnation, and treat seed with Rhizobium culture.',
          contentTe:
            'కాకినాడ మరియు గోదావరి డెల్టా ప్రాంతాల్లో ఖరీఫ్ వరి కోతకు 7–10 రోజుల ముందు తేమ ఉన్న నేలలో మినుము (LBG-752) లేదా పెసర విత్తుకోవడం వల్ల నేలలోని తేమ సద్వినియోగం అవుతుంది మరియు భూమి సారం పెరుగుతుంది.',
          applicableRegions: 'Kakinada, Konaseema, East & West Godavari',
          applicableCrops: 'Paddy, Black Gram, Green Gram',
          sourceName: 'ANGRAU Vyavasaya Panchangam & APRRI Maruteru Advisory',
          sourceUrl: 'https://angrau.ac.in',
          verificationStatus: 'Verified',
          lastVerifiedDate: '2026-09-15',
          isOutdated: false,
        },
        {
          category: 'Soil health',
          title: 'Managing Mild Coastal Salinity & Low Organic Carbon',
          titleTe: 'తీరప్రాంత చౌడు/ఉప్పు నేలల యాజమాన్యం మరియు సేంద్రియ కర్బనం',
          summary:
            'Coastal clay loams irrigated with summer borewells can accumulate soluble salts (EC > 1.5 dS/m). Green manuring (Sunhemp/Dhaincha) and canal flushing protect root health.',
          content:
            'Before transplanting Kharif paddy, incorporate Dhaincha (జీలుగ) or Sunhemp (జనుము) at flowering stage to raise soil organic carbon above 0.7%. Avoid using high-EC borewell water on salt-sensitive crops like banana or chilli without testing water EC at the Mandal Soil Testing Lab.',
          applicableRegions: 'Kakinada Coastal, Coastal Andhra',
          applicableCrops: 'Paddy, Pulses, Banana',
          sourceName: 'ICAR-CSSRI Coastal Salinity Bulletin & AP Soil Health Programme',
          sourceUrl: 'https://soilhealth.dac.gov.in',
          verificationStatus: 'Verified',
          lastVerifiedDate: '2026-08-20',
          isOutdated: false,
        },
        {
          category: 'Seeds and varieties',
          title: 'Lodging-Tolerant Paddy & YMV-Resistant Pulse Varieties for AP Delta',
          titleTe: 'డెల్టా ప్రాంతానికి అనువైన వరి మరియు మినుము వంగడాలు',
          summary:
            'MTU-1061 (Indra) offers submergence/lodging resilience for coastal Kharif; BPT-5204 commands fine-grain demand in well-drained plots; LBG-752 suits Rabi relay.',
          content:
            'Select varieties matched to drainage: MTU-1061 (150 days) tolerates intermittent coastal inundation better than BPT-5204, which is susceptible to blast and cyclone lodging in low-lying pockets. Purchase tagged Truthfully Labelled or Certified seeds with lot bills.',
          applicableRegions: 'Andhra Pradesh Coastal & Godavari Districts',
          applicableCrops: 'Paddy, Black Gram',
          sourceName: 'Regional Agricultural Research Station (RARS), Maruteru — ANGRAU',
          sourceUrl: 'https://angrau.ac.in',
          verificationStatus: 'Verified',
          lastVerifiedDate: '2026-09-01',
          isOutdated: false,
        },
        {
          category: 'Irrigation',
          title: 'Alternate Wetting & Drying (AWD) in Paddy and Drip Scheduling in Banana',
          titleTe: 'వరిలో ఆరుతడి నీటి యాజమాన్యం మరియు అరటిలో డ్రిప్ సాగు',
          summary:
            'Keeping thin 2–5 cm water during tillering and draining excess water before panicle maturity lowers planthopper humidity and saves 20–25% water.',
          content:
            'Continuous deep flooding encourages basal stem softness and brown planthopper buildup. Maintain saturation to 3 cm depth, and drain fields 10–12 days prior to harvest for uniform ripening. For Godavari banana, daily or alternate-day inline drip prevents moisture shock and bunch splitting.',
          applicableRegions: 'Kakinada, Godavari region',
          applicableCrops: 'Paddy, Banana, Turmeric',
          sourceName: 'ICAR Indian Institute of Water Management Guidelines',
          sourceUrl: 'https://icar.org.in',
          verificationStatus: 'Verified',
          lastVerifiedDate: '2026-09-10',
          isOutdated: false,
        },
        {
          category: 'Fertiliser management',
          title: 'Diagnosing Yellowing Leaves & Balanced Nutrient Timing',
          titleTe: 'ఆకులు పసుపు రంగులోకి మారడం — పోషక లోపమా లేక తెగులా?',
          summary:
            'Uniform yellowing of older lower leaves often signals nitrogen deficiency, whereas rusty brown spots on lower leaves with stunted tillers in paddy can indicate zinc deficiency.',
          content:
            'Before applying top-dress urea, inspect whether yellowing starts on older leaves (nitrogen), younger interveinal leaves (iron/micronutrient), or circular hopperburn patches at plant bases (pest). Avoid excess nitrogen during cloudy humid weather, as lush foliage attracts planthoppers and bacterial leaf blight.',
          applicableRegions: 'All AP & Telangana Districts',
          applicableCrops: 'Paddy, Maize, Banana, Turmeric',
          sourceName: 'ANGRAU Integrated Nutrient Management Manual',
          sourceUrl: 'https://angrau.ac.in',
          verificationStatus: 'Verified',
          lastVerifiedDate: '2026-10-02',
          isOutdated: false,
        },
        {
          category: 'Pest and disease management',
          title: 'Safe Field Scouting for Paddy Planthopper (దోమపోటు) & Turmeric Rhizome Rot',
          titleTe: 'వరిలో దోమపోటు మరియు పసుపులో దుంప కుళ్ళు — సురక్షిత గుర్తింపు',
          summary:
            'Part paddy hills to inspect water-level stems for nymphs, form alleyways (కాలిబాటలు) for sunlight, and consult an Agricultural Officer before any chemical spray.',
          content:
            'For Brown Planthopper (దోమపోటు), drain standing water for 3–4 days, create 20 cm alleyways every 2 meters to improve aeration, and install light traps for monitoring. Never spray broad-spectrum synthetic pyrethroids, which trigger pest resurgence. For exact chemical selection and dosage, obtain a field prescription from your Rythu Seva Kendra / Mandal Agricultural Officer.',
          applicableRegions: 'Kakinada, Konaseema, Godavari Delta',
          applicableCrops: 'Paddy, Turmeric, Banana',
          sourceName: 'NIPHM Hyderabad Integrated Pest Management Package',
          sourceUrl: 'https://niphm.gov.in',
          verificationStatus: 'Verified',
          lastVerifiedDate: '2026-10-10',
          isOutdated: false,
        },
        {
          category: 'Harvesting',
          title: 'Maturity Indices for Paddy, Banana Bunches & Turmeric',
          titleTe: 'వరి, అరటి గెలలు మరియు పసుపు కోతకు సరైన దశ',
          summary:
            'Harvest paddy when 80–85% of grains turn straw-golden (~20% field moisture) and dry down to <14% for storage and FAQ procurement.',
          content:
            'Delaying paddy harvest causes grain shattering and sun-checks during milling. Harvest Karpura Chakkarakeli banana at 75–80% finger fullness (ridges rounding off) for distant wholesale/retail markets, leaving 15 cm peduncle cushion to prevent crown rot.',
          applicableRegions: 'Coastal Andhra & Godavari Region',
          applicableCrops: 'Paddy, Banana, Turmeric',
          sourceName: 'ICAR-CIPHET Post-Harvest Engineering Advisory',
          sourceUrl: 'https://ciphet.icar.gov.in',
          verificationStatus: 'Verified',
          lastVerifiedDate: '2026-08-28',
          isOutdated: false,
        },
        {
          category: 'Post-harvest handling',
          title: 'Sorting, Moisture Testing & Value Routing for Imperfect Produce',
          titleTe: 'కోత అనంతర గ్రేడింగ్ మరియు మచ్చలున్న పంటకు ప్రాసెసింగ్ మార్గాలు',
          summary:
            'Separating bruised or cosmetically spotted banana hands from Grade-A bunches preserves retail price while routing edible Grade-B fruit to pulp/puree processors.',
          content:
            'Retail buyers reject mixed lots if >5% of fruit shows skin rub. Sort at the farm shed using cushioned crates: send clean uniform hands to retail/wholesale buyers, and route ripe or skin-blemished (but internally sound) hands to food processing units via AGRIROUTE.',
          applicableRegions: 'Godavari Region, Kakinada',
          applicableCrops: 'Banana, Turmeric, Chilli, Paddy',
          sourceName: 'Directorate of Marketing & Inspection (AGMARK Grading Standards)',
          sourceUrl: 'https://dmi.gov.in',
          verificationStatus: 'Verified',
          lastVerifiedDate: '2026-09-19',
          isOutdated: false,
        },
        {
          category: 'Storage',
          title: 'Hermetic Storage & Safe Moisture Limits for Grains and Pulses',
          titleTe: 'ధాన్యం మరియు అపరాల సురక్షిత నిల్వ (తేమ శాతం నియమాలు)',
          summary:
            'Dry paddy below 14% moisture and pulses (Black Gram/Green Gram) below 11–12% before stacking on wooden pallets away from damp walls.',
          content:
            'Bruchid beetles (పురుగు) rapidly damage stored pulses above 12% moisture. Use multi-layer hermetic liner bags placed on dunnage/pallets 15 cm above floor level with clear aisle ventilation. Never mix chemical fumigants directly into food grain bags.',
          applicableRegions: 'All Regions',
          applicableCrops: 'Paddy, Black Gram, Green Gram, Chilli',
          sourceName: 'Indian Grain Storage Management & Research Institute (IGMRI)',
          sourceUrl: 'https://dfpd.gov.in',
          verificationStatus: 'Verified',
          lastVerifiedDate: '2026-09-05',
          isOutdated: false,
        },
        {
          category: 'Weather-related agricultural guidance',
          title: 'Northeast Monsoon & Cyclone Field Precautions for Coastal Crops',
          titleTe: 'ఈశాన్య రుతుపవనాలు మరియు తుఫాను సమయంలో పంట రక్షణ',
          summary:
            'Clear perimeter drainage channels prior to heavy rain forecasts, tie maturing paddy in small bundles if lodged in water, and prop fruiting banana pseudostems.',
          content:
            'If heavy coastal rain hits mature paddy, drain standing water immediately to prevent viviparous germination (గింజ మొలకెత్తడం). A 5% common salt spray on lodged panicles is sometimes advised by KVKs — confirm exact field applicability with local extension staff.',
          applicableRegions: 'Kakinada Coastal, Konaseema',
          applicableCrops: 'Paddy, Banana',
          sourceName: 'IMD Agromet Field Unit (AMFU) Coastal Andhra Bulletin',
          sourceUrl: 'https://mausam.imd.gov.in',
          verificationStatus: 'Verified',
          lastVerifiedDate: '2026-10-18',
          isOutdated: false,
        },
        {
          category: 'Market information',
          title: 'Understanding FAQ Moisture Norms, Tare Weight & Written Buyer Terms',
          titleTe: 'మార్కెట్ నాణ్యత ప్రమాణాలు (FAQ) మరియు కొనుగోలు ఒప్పంద జాగ్రత్తలు',
          summary:
            'An enquiry on AGRISETU is an expression of interest, not a confirmed sale. Confirm moisture tolerance, gunny bag weight deduction, and payment timeline before loading.',
          content:
            'Standard Fair Average Quality (FAQ) paddy allows up to 14% moisture and minimal foreign matter. Always record agreed quantity, price per quintal, transport responsibility (ex-farm vs buyer gate), and weighbridge slip verification in a Confirmed Order.',
          applicableRegions: 'All Regions',
          applicableCrops: 'All Crops',
          sourceName: 'e-NAM & AGMARKNET Farmer Trade Literacy Guidelines',
          sourceUrl: 'https://enam.gov.in',
          verificationStatus: 'Verified',
          lastVerifiedDate: '2026-10-05',
          isOutdated: false,
        },
        {
          category: 'Government schemes',
          title: 'Crop Loss Intimation & Farmer Scheme Verification Checklist',
          titleTe: 'ప్రభుత్వ వ్యవసాయ పథకాలు మరియు పంట నష్ట సమాచారం ఇచ్చే విధానం',
          summary:
            'For insured crops under PMFBY, localized hailstorm/inundation/cyclone post-harvest loss must be intimated within 72 hours via official helpline or app.',
          content:
            'Keep Aadhaar-seeded bank passbook, e-Panta / e-Crop booking receipt, and land Pattadar Passbook (1B/Adangal) updated at your village Rythu Seva Kendra. Because state scheme names and installment schedules change by notification, always check official portals.',
          applicableRegions: 'Andhra Pradesh & Telangana',
          applicableCrops: 'Notified Crops',
          sourceName: 'Ministry of Agriculture & Farmers Welfare Portal',
          sourceUrl: 'https://agriwelfare.gov.in',
          verificationStatus: 'Verified',
          lastVerifiedDate: '2026-10-12',
          isOutdated: false,
        },
      ]);

      // 8. Government Scheme Records (Section 5F — Central + AP/TG State with explicit verification status)
      await db.insert(schemeRecords).values([
        {
          schemeCode: 'PM-KISAN',
          schemeName: 'Pradhan Mantri Kisan Samman Nidhi (PM-KISAN)',
          schemeNameTe: 'ప్రధాన మంత్రి కిసాన్ సమ్మాన్ నిధి (PM-KISAN)',
          level: 'Central',
          applicableState: 'All India (Applicable in Andhra Pradesh & Telangana)',
          purpose:
            'Provides direct income support to landholding farmer families to help meet agricultural input and domestic expenses.',
          eligibilityConditions:
            'Cultivable landholding farmer families with land records in their name, subject to standard exclusion categories (institutional landholders, income tax payers, specified constitutional/government posts). e-KYC and Aadhaar-seeded bank account are mandatory.',
          benefits:
            '₹6,000 per year transferred via Direct Benefit Transfer (DBT) in three equal installments of ₹2,000 every four months.',
          requiredDocuments:
            'Aadhaar Card (linked to mobile), Landholding Record (1B / Adangal / Pattadar Passbook), Active Aadhaar-seeded Bank Account (NPCI DBT enabled).',
          applicationProcedure:
            'Register or complete e-KYC online on the official PM-KISAN portal, through Common Service Centres (CSC), or via the Village Revenue / Rythu Seva Kendra nodal officer.',
          officialPortal: 'https://pmkisan.gov.in',
          relevantOffice: 'Village Rythu Seva Kendra / Mandal Revenue & Agriculture Office / CSC',
          importantDates:
            'Ongoing registration; e-KYC must be active prior to each four-monthly installment release cycle.',
          officialSource: 'Ministry of Agriculture & Farmers Welfare, Government of India (pmkisan.gov.in)',
          verificationStatus: 'Verified',
          lastVerifiedDate: '2026-10-01',
          isOutdated: false,
        },
        {
          schemeCode: 'PMFBY',
          schemeName: 'Pradhan Mantri Fasal Bima Yojana (PMFBY)',
          schemeNameTe: 'ప్రధాన మంత్రి ఫసల్ బీమా యోజన (పంటల బీమా)',
          level: 'Central',
          applicableState: 'Central Scheme (Subject to State/District Season Notification in AP)',
          purpose:
            'Provides comprehensive crop insurance protection against non-preventable natural risks from pre-sowing to post-harvest.',
          eligibilityConditions:
            'Farmers growing notified crops in notified mandals/villages during Kharif or Rabi (both loanee and non-loanee farmers, including tenant farmers where notified by State Government).',
          benefits:
            'Uniform maximum farmer premium share: 2% of Sum Insured for Kharif food & oilseed crops, 1.5% for Rabi food & oilseed crops, and 5% for annual commercial/horticultural crops; actuarial balance shared by Central & State Governments.',
          requiredDocuments:
            'Aadhaar Card, Land Possession / Cultivation Certificate (e-Panta / e-Crop booking), Bank Account Details, Sowing Declaration.',
          applicationProcedure:
            'Enrol before seasonal cut-off through lending bank (KCC), CSC, insurance intermediary, or official PMFBY portal. Intimate localized calamity / post-harvest cyclonic loss within 72 hours via Crop Insurance App or toll-free helpline 14447.',
          officialPortal: 'https://pmfby.gov.in',
          relevantOffice: 'Village Rythu Seva Kendra / Mandal Agricultural Officer / Lending Bank Branch',
          importantDates:
            'Seasonal enrolment cut-offs vary by State Kharif/Rabi notification — verify current district notification before applying.',
          officialSource: 'Ministry of Agriculture & Farmers Welfare, Govt. of India (pmfby.gov.in)',
          verificationStatus: 'Verified',
          lastVerifiedDate: '2026-09-25',
          isOutdated: false,
        },
        {
          schemeCode: 'KCC',
          schemeName: 'Kisan Credit Card (KCC)',
          schemeNameTe: 'కిసాన్ క్రెడిట్ కార్డ్ (KCC పంట రుణం)',
          level: 'Central',
          applicableState: 'All India (Scheduled Commercial, Regional Rural & Cooperative Banks)',
          purpose:
            'Offers timely, adequate revolving institutional credit for crop cultivation, post-harvest expenses, farm asset maintenance, and allied activities.',
          eligibilityConditions:
            'Owner-cultivators, joint borrowers, tenant farmers, oral lessees, sharecroppers, and Self-Help Groups (SHGs) / Joint Liability Groups (JLGs) of farmers meeting bank KYC and scale-of-finance norms.',
          benefits:
            'Revolving short-term crop credit limit based on Scale of Finance and cropped area; Interest Subvention and Prompt Repayment Incentive apply on short-term crop loans up to ₹3 lakh as per prevailing RBI/GoI norms.',
          requiredDocuments:
            'Completed KCC Application Form, Aadhaar & Identity Proof, Land Record / Tenancy Proof (1B / Adangal), Passport-size Photographs.',
          applicationProcedure:
            'Apply at your nearest Commercial Bank, Andhra Pragathi / Chaitanya Godavari Grameena Bank, District Cooperative Central Bank (DCCB), or CSC.',
          officialPortal: 'https://www.myscheme.gov.in/schemes/kcc',
          relevantOffice: 'Local Bank Branch / Primary Agricultural Cooperative Society (PACS)',
          importantDates: 'Open year-round aligned with Kharif and Rabi crop seasons.',
          officialSource: 'NABARD / Department of Financial Services & Ministry of Agriculture (myscheme.gov.in)',
          verificationStatus: 'Verified',
          lastVerifiedDate: '2026-10-04',
          isOutdated: false,
        },
        {
          schemeCode: 'AP-STATE-SUPPORT',
          schemeName: 'Andhra Pradesh State Farmer Investment & e-Panta Support (Annadata Sukhibhava / State Top-Up)',
          schemeNameTe: 'ఆంధ్రప్రదేశ్ రాష్ట్ర రైతు పెట్టుబడి సహాయం & ఇ-పంట నమోదు',
          level: 'State',
          applicableState: 'Andhra Pradesh (Kakinada, Konaseema & all AP Districts)',
          purpose:
            'State-level top-up investment assistance alongside PM-KISAN and mandatory seasonal e-Panta (e-Crop) digital crop booking for input, procurement, and relief eligibility.',
          eligibilityConditions:
            'Eligible Andhra Pradesh landholding / notified tenant cultivators registered in Webland and seasonal e-Panta digital crop booking; exact disbursement tranches require verification against current AP Government G.O.',
          benefits:
            'State top-up financial support announced alongside PM-KISAN plus eligibility for MSP paddy procurement at Rythu Seva Kendras (exact current financial year disbursement schedule requires verification).',
          requiredDocuments:
            'Aadhaar Card, Webland 1B / Pattadar Passbook or CCR Card (for tenant farmers), Biometric e-Panta acknowledgement.',
          applicationProcedure:
            'Complete seasonal e-Panta crop booking and biometric e-KYC with the Village Agriculture / Horticulture Assistant at your local Rythu Seva Kendra.',
          officialPortal: 'https://karshak.ap.gov.in',
          relevantOffice: 'Village Rythu Seva Kendra (RSK) / Commissionerate of Agriculture, AP',
          importantDates:
            'Requires Verification — Verify current Kharif/Rabi e-Panta window and tranche dates at your Village Rythu Seva Kendra.',
          officialSource: 'Department of Agriculture, Government of Andhra Pradesh',
          verificationStatus: 'Requires Verification',
          lastVerifiedDate: '2026-07-10',
          isOutdated: false,
        },
        {
          schemeCode: 'TG-RYTHU-BHAROSA',
          schemeName: 'Telangana State Crop Investment Support (Rythu Bharosa)',
          schemeNameTe: 'తెలంగాణ రైతు భరోసా పథకం',
          level: 'State',
          applicableState: 'Telangana',
          purpose:
            'Seasonal agricultural investment support per acre for cultivable agricultural land in Telangana.',
          eligibilityConditions:
            'Telangana pattadar cultivators as per current state operational guidelines (requires verification for latest seasonal guidelines and ceiling criteria).',
          benefits:
            'Per-acre seasonal investment assistance via DBT (verify current notified per-acre rate for the ongoing agricultural season with Mandal Agriculture Officer).',
          requiredDocuments: 'Aadhaar Card, Dharani / Bhu Bharati Pattadar Passbook, Active Bank Account.',
          applicationProcedure:
            'Verify land passbook linkage with Agriculture Extension Officer (AEO) at the Rythu Vedika / Mandal Agriculture Office.',
          officialPortal: 'https://agri.telangana.gov.in',
          relevantOffice: 'Cluster AEO / Mandal Agricultural Officer, Telangana',
          importantDates: 'Requires Verification — Seasonal release dates notified by Govt. of Telangana.',
          officialSource: 'Department of Agriculture, Government of Telangana',
          verificationStatus: 'Requires Verification',
          lastVerifiedDate: '2026-06-20',
          isOutdated: false,
        },
      ]);

      // 9. Merchant Profiles (4 Buyer Channels)
      const insertedMerchants = await db
        .insert(merchantProfiles)
        .values([
          {
            userId: merch1UserId,
            merchantCode: 'MERCH-DEMO-001',
            businessName: 'Sri Satyanarayana Agro Traders (Demo)',
            buyerType: 'Wholesaler',
            contactPerson: 'K. Satyanarayana',
            district: 'Kakinada',
            mandal: 'Samalkot',
            locationDetail: 'Samalkot Canal Road Grain Yard, Kakinada District',
            savedListingIds: JSON.stringify([1, 2]),
            verificationStatus: 'Demo Account',
            isDemo: true,
          },
          {
            userId: merch2UserId,
            merchantCode: 'MERCH-DEMO-002',
            businessName: 'Godavari Fresh Retail Supply Co. (Demo)',
            buyerType: 'Retail Procurement',
            contactPerson: 'P.iharika',
            district: 'East Godavari',
            mandal: 'Rajamahendravaram',
            locationDetail: 'Morampudi Cold-Chain Collection Hub, Rajamahendravaram',
            savedListingIds: JSON.stringify([2]),
            verificationStatus: 'Demo Account',
            isDemo: true,
          },
          {
            userId: null,
            merchantCode: 'MERCH-DEMO-003',
            businessName: 'Konaseema Fruit & Spice Processing Pvt. Ltd. (Demo)',
            buyerType: 'Food Processing Unit',
            contactPerson: 'V.Subba Rao',
            district: 'Dr. B.R. Ambedkar Konaseema',
            mandal: 'Ravulapalem',
            locationDetail: 'Ravulapalem Industrial Estate, Konaseema',
            savedListingIds: JSON.stringify([]),
            verificationStatus: 'Demo Account',
            isDemo: true,
          },
          {
            userId: null,
            merchantCode: 'MERCH-DEMO-004',
            businessName: 'Coromandel Pulse & Spice Millers (Demo)',
            buyerType: 'Direct Merchant',
            contactPerson: 'M. Venkata Ramana',
            district: 'Kakinada',
            mandal: 'Peddapuram',
            locationDetail: 'Peddapuram ADB Road Dal Mill Cluster, Kakinada',
            savedListingIds: JSON.stringify([4]),
            verificationStatus: 'Demo Account',
            isDemo: true,
          },
        ])
        .returning();

      const mSatya = insertedMerchants[0];
      const mGodavari = insertedMerchants[1];
      const mProcessing = insertedMerchants[2];
      const mCoromandel = insertedMerchants[3];

      // 10. Merchant Demand
      const insertedDemands = await db
        .insert(merchantDemand)
        .values([
          {
            merchantId: mSatya.id,
            cropName: 'Paddy (MTU-1061 / BPT-5204)',
            quantityRequiredQuintals: '150',
            qualitySpecifications: 'Moisture <= 14%, foreign matter < 1%, chaffy grain < 3% (FAQ)',
            acceptsCosmeticImperfect: false,
            procurementPeriod: '2026-11-10 to 2026-11-30',
            deliveryLocation: 'Samalkot Grain Yard or Ex-Farm >= 50 qtl',
            district: 'Kakinada',
            offeredPriceRange: '₹2,300 – ₹2,420',
            additionalRequirements: 'Electronic weighbridge slip mandatory; gunny bags provided by buyer.',
            demandStatus: 'Open',
            distanceKmFromKakinada: 14,
            distanceKmFromGodavari: 52,
            isDemo: true,
          },
          {
            merchantId: mGodavari.id,
            cropName: 'Banana (Karpura Chakkarakeli)',
            quantityRequiredQuintals: '60',
            qualitySpecifications: 'Grade A uniform green hands, 75–80% maturity, bruise-free skin',
            acceptsCosmeticImperfect: false,
            procurementPeriod: '2026-11-01 to 2026-11-20',
            deliveryLocation: 'Atreyapuram / Ravulapalem Crate Pickup',
            district: 'East Godavari',
            offeredPriceRange: '₹1,900 – ₹2,150',
            additionalRequirements: 'Plastic crate loading; no stem stacking without foam liner.',
            demandStatus: 'Open',
            distanceKmFromKakinada: 64,
            distanceKmFromGodavari: 16,
            isDemo: true,
          },
          {
            merchantId: mProcessing.id,
            cropName: 'Banana (Ripe / Processing Grade) & Turmeric',
            quantityRequiredQuintals: '120',
            qualitySpecifications:
              'Edible residue-safe fruit; accepts cosmetically spotted, small-finger, or ripe bunches for puree/dehydration',
            acceptsCosmeticImperfect: true,
            procurementPeriod: '2026-11-01 to 2026-12-15',
            deliveryLocation: 'Ravulapalem Processing Gate',
            district: 'Dr. B.R. Ambedkar Konaseema',
            offeredPriceRange: '₹1,180 – ₹1,420',
            additionalRequirements: 'Zero chemical ripening agents; internal pulp must be sound.',
            demandStatus: 'Open',
            distanceKmFromKakinada: 68,
            distanceKmFromGodavari: 11,
            isDemo: true,
          },
          {
            merchantId: mCoromandel.id,
            cropName: 'Black Gram (Minumu LBG-752)',
            quantityRequiredQuintals: '80',
            qualitySpecifications: 'Moisture <= 12%, bold whole grain, zero bruchid damage',
            acceptsCosmeticImperfect: false,
            procurementPeriod: '2026-11-01 to 2026-11-25',
            deliveryLocation: 'Peddapuram Dal Mill Gate, Kakinada',
            district: 'Kakinada',
            offeredPriceRange: '₹6,950 – ₹7,300',
            additionalRequirements: 'Sample sieving check at mill gate.',
            demandStatus: 'Open',
            distanceKmFromKakinada: 19,
            distanceKmFromGodavari: 48,
            isDemo: true,
          },
        ])
        .returning();

      // 11. Farmer Produce Listings
      const insertedListings = await db
        .insert(farmerProduceListings)
        .values([
          {
            farmerId: ramu.id,
            cropName: 'Paddy (MTU-1061 Indra)',
            variety: 'MTU-1061',
            imageKey: 'crop_paddy_harvest',
            quantityQuintals: '85',
            expectedHarvestDate: '2026-11-18',
            availabilityType: 'upcoming_harvest',
            qualityGrade: 'Expected Grade A FAQ (Sun-dried <14% moisture)',
            qualityVerification: 'Self-reported',
            productionMethod: 'IPM Guided Low-Spray Cultivation',
            askingPricePerQuintal: '2360',
            village: 'Gollaprolu',
            mandal: 'Gollaprolu',
            district: 'Kakinada',
            listingStatus: 'Active',
            privacyShowName: true,
            isDemo: true,
          },
          {
            farmerId: lakshmi.id,
            cropName: 'Banana (Karpura Chakkarakeli)',
            variety: 'Karpura Chakkarakeli',
            imageKey: 'crop_turmeric_banana',
            quantityQuintals: '45',
            expectedHarvestDate: '2026-11-04',
            availabilityType: 'available_now',
            qualityGrade: 'Grade A Sorted Hands (38 qtl) + Grade B Cosmetic Spotted (7 qtl)',
            qualityVerification: 'Coordinator inspected',
            productionMethod: 'Drip-Irrigated Residue-Conscious',
            askingPricePerQuintal: '2050',
            village: 'Atreyapuram',
            mandal: 'Atreyapuram',
            district: 'Dr. B.R. Ambedkar Konaseema',
            listingStatus: 'Active',
            privacyShowName: true,
            isDemo: true,
          },
          {
            farmerId: lakshmi.id,
            cropName: 'Turmeric (Roma Cured Finger)',
            variety: 'Roma',
            imageKey: 'crop_turmeric_banana',
            quantityQuintals: '28',
            expectedHarvestDate: '2026-12-14',
            availabilityType: 'upcoming_harvest',
            qualityGrade: 'Whole Boiled & Sun-Cured Rhizomes',
            qualityVerification: 'Self-reported',
            productionMethod: 'Natural Mulch Intercrop',
            askingPricePerQuintal: '7600',
            village: 'Atreyapuram',
            mandal: 'Atreyapuram',
            district: 'Dr. B.R. Ambedkar Konaseema',
            listingStatus: 'Active',
            privacyShowName: true,
            isDemo: true,
          },
          {
            farmerId: ramu.id,
            cropName: 'Black Gram (Minumu LBG-752)',
            variety: 'LBG-752',
            imageKey: 'crop_chilli_pulses',
            quantityQuintals: '18',
            expectedHarvestDate: '2026-10-22',
            availabilityType: 'available_now',
            qualityGrade: 'Clean Sun-Dried Whole Grain (11.5% moisture)',
            qualityVerification: 'Self-reported',
            productionMethod: 'Residual Moisture Relay Crop',
            askingPricePerQuintal: '7150',
            village: 'Gollaprolu',
            mandal: 'Gollaprolu',
            district: 'Kakinada',
            listingStatus: 'Active',
            privacyShowName: true,
            isDemo: true,
          },
        ])
        .returning();

      // 12. Purchase Enquiries & Farmer Offers & Orders
      const insertedEnquiries = await db
        .insert(purchaseEnquiries)
        .values([
          {
            listingId: insertedListings[0].id,
            merchantId: mSatya.id,
            farmerId: ramu.id,
            requiredQuantityQuintals: '60',
            proposedPricePerQuintal: '2340',
            qualityRequirements: 'Moisture <= 14% at harvest; buyer provides gunny bags.',
            logisticsPreference: 'Farmgate pickup at Gollaprolu',
            procurementDate: '2026-11-20',
            message: 'Interested in 60 quintals of MTU-1061 once threshed and dried. Please share sample moisture.',
            status: 'Enquiry received',
          },
          {
            listingId: insertedListings[1].id,
            merchantId: mGodavari.id,
            farmerId: lakshmi.id,
            requiredQuantityQuintals: '35',
            proposedPricePerQuintal: '2020',
            qualityRequirements: 'Uniform green Grade A hands in plastic crates.',
            logisticsPreference: 'Buyer crate van pickup at Atreyapuram',
            procurementDate: '2026-11-05',
            message: 'Confirmed after coordinator bunch inspection photo.',
            status: 'Confirmed order',
          },
        ])
        .returning();

      await db.insert(farmerOffers).values([
        {
          demandId: insertedDemands[3].id,
          farmerId: ramu.id,
          merchantId: mCoromandel.id,
          quantityOfferedQuintals: '18',
          expectedPricePerQuintal: '7150',
          expectedHarvestDate: '2026-10-22',
          qualityDetails: 'Clean LBG-752 whole grain, 11.5% moisture, stored in lined sacks.',
          message: 'Available immediately at Gollaprolu; can deliver to Peddapuram mill gate.',
          status: 'Offer made',
        },
        {
          demandId: insertedDemands[2].id,
          farmerId: lakshmi.id,
          merchantId: mProcessing.id,
          quantityOfferedQuintals: '7',
          expectedPricePerQuintal: '1320',
          expectedHarvestDate: '2026-11-04',
          qualityDetails: 'Edible ripe / minor skin-rubbed Karpura Chakkarakeli hands sorted out from retail lot.',
          message: 'Sorted cleanly in ventilated shed; zero chemical ripener.',
          status: 'Accepted',
        },
      ]);

      await db.insert(orders).values([
        {
          orderCode: 'ORD-DEMO-1001',
          farmerId: lakshmi.id,
          merchantId: mGodavari.id,
          sourceType: 'enquiry',
          sourceId: insertedEnquiries[1].id,
          cropName: 'Banana (Karpura Chakkarakeli)',
          agreedQuantityQuintals: '35',
          agreedPricePerQuintal: '2020',
          deliveryMode: 'Buyer Crate Van Pickup — Atreyapuram',
          scheduledDate: '2026-11-05',
          orderStatus: 'Confirmed order',
          notes: 'Plastic crates supplied by buyer; weighment at Atreyapuram Dharam Kanta.',
          isDemo: true,
        },
        {
          orderCode: 'ORD-DEMO-0994',
          farmerId: ramu.id,
          merchantId: mCoromandel.id,
          sourceType: 'offer',
          sourceId: 1,
          cropName: 'Black Gram (Previous Lot — Demo)',
          agreedQuantityQuintals: '12',
          agreedPricePerQuintal: '7050',
          deliveryMode: 'Delivered to Peddapuram Mill Gate',
          scheduledDate: '2026-10-18',
          orderStatus: 'Completed',
          notes: 'Settled via bank transfer within 24 hours of weighbridge slip.',
          farmerFeedback: 'Fair moisture check and timely settlement (Demo pilot feedback).',
          isDemo: true,
        },
      ]);

      // 13. Suppliers & Supply Products (All 7 Categories — Explicitly Marked Demo Unverified)
      const insertedSuppliers = await db
        .insert(supplierProfiles)
        .values([
          {
            supplierCode: 'SUP-DEMO-01',
            supplierName: 'Kakinada Rythu Agro Inputs (Demo)',
            district: 'Kakinada',
            mandal: 'Samalkot',
            address: 'Main Canal Road, Near Market Yard, Samalkot',
            contactInfo: '+91 90XXX-X1120 (Demo Enquiry Desk)',
            verificationStatus: 'Demo Supplier — Unverified',
            isDemo: true,
          },
          {
            supplierCode: 'SUP-DEMO-02',
            supplierName: 'Konaseema Micro-Irrigation & Tools Co. (Demo)',
            district: 'Dr. B.R. Ambedkar Konaseema',
            mandal: 'Ravulapalem',
            address: 'NH-16 Bypass Junction, Ravulapalem',
            contactInfo: '+91 91XXX-X3345 (Demo Enquiry Desk)',
            verificationStatus: 'Demo Supplier — Unverified',
            isDemo: true,
          },
          {
            supplierCode: 'SUP-DEMO-03',
            supplierName: 'Godavari Bio-Soil & Post-Harvest Store (Demo)',
            district: 'East Godavari',
            mandal: 'Rajahmundry Rural',
            address: 'Dowleswaram Road, East Godavari',
            contactInfo: '+91 93XXX-X7789 (Demo Enquiry Desk)',
            verificationStatus: 'Demo Supplier — Unverified',
            isDemo: true,
          },
        ])
        .returning();

      await db.insert(supplyProducts).values([
        {
          supplierId: insertedSuppliers[0].id,
          productName: 'Certified LBG-752 Black Gram & MTU-1061 Paddy Seed Packs',
          category: 'Seeds and saplings',
          imageKey: 'supply_seeds_fertilizer',
          description: 'Truthfully labelled / certified delta-adapted seed bags with germination tag (Demo listing).',
          specifications: 'Paddy 25 kg bag | Black Gram 8 kg bag | Lot tag & bill provided',
          priceInr: '1150',
          unit: 'per bag',
          availabilityStatus: 'In Stock (Demo)',
          isDemo: true,
        },
        {
          supplierId: insertedSuppliers[2].id,
          productName: 'Enriched Vermicompost (50 kg) & Zinc Sulphate Basal Kit',
          category: 'Fertilisers',
          imageKey: 'supply_seeds_fertilizer',
          description: 'Organic soil conditioner for coastal low-carbon soils paired with agricultural grade Zinc Sulphate.',
          specifications: '50 kg Sieved Vermicompost + 5 kg ZnSO4 Heptahydrate (21% Zn)',
          priceInr: '890',
          unit: 'per combo kit',
          availabilityStatus: 'In Stock (Demo)',
          isDemo: true,
        },
        {
          supplierId: insertedSuppliers[1].id,
          productName: 'Inline 16mm Drip Irrigation Lateral Kit (1 Acre Layout)',
          category: 'Irrigation equipment',
          imageKey: 'supply_drip_irrigation',
          description: 'UV-stabilized 16mm inline drip laterals, screen filter, and brass control valves for banana & turmeric.',
          specifications: '4 LPH emitters at 40 cm spacing | ISI marked LLDPE pipe',
          priceInr: '18500',
          unit: 'per 1-acre kit',
          availabilityStatus: 'Available on Order (Demo)',
          isDemo: true,
        },
        {
          supplierId: insertedSuppliers[1].id,
          productName: 'Digital Grain Moisture Meter & Stainless Sampling Probe',
          category: 'Farming tools',
          imageKey: 'supply_drip_irrigation',
          description: 'Portable moisture tester for paddy, maize, and pulses to check <14% FAQ threshold before sale.',
          specifications: 'Range 8%–35% moisture | Digital backlit LCD | Brass/Steel probe',
          priceInr: '3200',
          unit: 'per unit',
          availabilityStatus: 'In Stock (Demo)',
          isDemo: true,
        },
        {
          supplierId: insertedSuppliers[1].id,
          productName: '16L Rechargeable Battery Knapsack Agricultural Sprayer',
          category: 'Agricultural machinery',
          imageKey: 'supply_drip_irrigation',
          description: '12V 8Ah battery sprayer with adjustable brass/hollow-cone nozzles and pressure regulator.',
          specifications: '16 Litre HDPE tank | 4-nozzle kit | Charger included',
          priceInr: '2850',
          unit: 'per unit',
          availabilityStatus: 'In Stock (Demo)',
          isDemo: true,
        },
        {
          supplierId: insertedSuppliers[0].id,
          productName: 'Azadirachtin 1500 ppm Neem Formulation & Stem-Borer Pheromone Traps',
          category: 'Crop protection products',
          imageKey: 'supply_seeds_fertilizer',
          description: 'Botanical IPM input and monitoring pheromone traps; consult local agronomist for field timing.',
          specifications: '1 Litre Neem Extract + 8 Funnel Traps with lures',
          priceInr: '940',
          unit: 'per IPM pack',
          availabilityStatus: 'In Stock (Demo)',
          isDemo: true,
        },
        {
          supplierId: insertedSuppliers[2].id,
          productName: 'Hermetic Multi-Layer Grain Storage Liner Bags (Pack of 10)',
          category: 'Other farm essentials',
          imageKey: 'supply_seeds_fertilizer',
          description: 'Airtight 50 kg storage liners protecting dried pulses and seed grain against moisture and bruchids.',
          specifications: '80-micron gas-barrier inner liner | 50 kg capacity x 10 bags',
          priceInr: '750',
          unit: 'per pack of 10',
          availabilityStatus: 'In Stock (Demo)',
          isDemo: true,
        },
      ]);

      // 14. Seeded Conversations & Expert Escalation
      const insertedConvs = await db
        .insert(conversations)
        .values([
          {
            farmerId: ramu.id,
            title: 'వరి చేనులో ఆకులు పసుపు రంగు & దోమపోటు అనుమానం (Paddy Leaf Yellowing)',
            language: 'te',
            dialectProfile: 'kakinada_coastal',
            mode: 'voice_call',
            status: 'Escalated',
          },
          {
            farmerId: lakshmi.id,
            title: 'అరటి గెలల గ్రేడింగ్ మరియు ప్రాసెసింగ్ కొనుగోలుదారులు (Banana Grading & Buyers)',
            language: 'te',
            dialectProfile: 'godavari_delta',
            mode: 'voice_call',
            status: 'Resolved',
          },
        ])
        .returning();

      await db.insert(conversationMessages).values([
        {
          conversationId: insertedConvs[0].id,
          sender: 'farmer',
          messageText:
            'మా గొల్లప్రోలు చేనులో వరి దుబ్బుల అడుగున ఆకులు ఎర్రబడి పసుపుగా మారుతున్నాయి, దోమపోటు మందు ఎంత మోతాదు కొట్టాలి?',
          transcribedFromVoice: true,
          citationsJson: '[]',
        },
        {
          conversationId: insertedConvs[0].id,
          sender: 'assistant',
          messageText:
            'నమస్కారం రాము గారు. వరి దుబ్బుల అడుగు భాగంలో ఆకులు ఎర్రబడి ఎండిపోవడం దోమపోటు (Brown Planthopper) లక్షణం కావచ్చు, కానీ ఖచ్చితంగా నిర్ధారించకుండా పురుగుమందు మోతాదును నేను అంచనాతో చెప్పకూడదు. ముందుగా చేనులో నిల్వ ఉన్న నీటిని బోదెల ద్వారా బయటకు తీసి, గాలి వెలుతురు తగిలేలా కాలిబాటలు (alleyways) తీయండి. మీ ప్రశ్నను వెంటనే వ్యవసాయ నిపుణుల పరిశీలనకు పంపాను.',
          transcribedFromVoice: false,
          citationsJson: JSON.stringify([
            {
              type: 'knowledge',
              idOrCode: '6',
              title: 'Safe Field Scouting for Paddy Planthopper (దోమపోటు)',
              source: 'NIPHM Hyderabad Integrated Pest Management Package (Verified: 2026-10-10)',
              verifiedStatus: 'Verified',
            },
          ]),
          confidenceNote:
            'High-risk pesticide dosage query escalated to Agricultural Expert; non-chemical drainage step shared from NIPHM IPM guide.',
          escalated: true,
        },
        {
          conversationId: insertedConvs[1].id,
          sender: 'farmer',
          messageText:
            'మా ఆత్రేయపురం లంక భూమిలో కర్పూర చక్కెరకేళి అరటి కోతకు వచ్చింది. కొన్ని గెలలపై గాలికి మచ్చలు వచ్చాయి, ఎక్కడ అమ్మితే బాగుంటుంది?',
          transcribedFromVoice: true,
          citationsJson: '[]',
        },
        {
          conversationId: insertedConvs[1].id,
          sender: 'assistant',
          messageText:
            'నమస్కారం లక్ష్మి గారు. మచ్చలు లేని మొదటి రకం (Grade A) గెలలను ప్లాస్టిక్ క్రేట్లలో వేరు చేసి రిటైల్ లేదా హోల్‌సేల్ వ్యాపారులకు పంపండి. తినడానికి బాగుండి కేవలం తొక్కపై మచ్చలున్న గెలలను రిటైల్ లాట్‌లో కలపకుండా, AGRIROUTE ద్వారా రావులపాలెంలోని ఫ్రూట్ ప్రాసెసింగ్ యూనిట్‌కు పంపితే తిరస్కరణ లేకుండా విలువ పొందవచ్చు.',
          transcribedFromVoice: false,
          citationsJson: JSON.stringify([
            {
              type: 'knowledge',
              idOrCode: '8',
              title: 'Sorting, Moisture Testing & Value Routing for Imperfect Produce',
              source: 'Directorate of Marketing & Inspection (Verified: 2026-09-19)',
              verifiedStatus: 'Verified',
            },
          ]),
          confidenceNote: 'Grounded in AGMARK post-harvest grading guidelines and AGRISETU pilot demand records.',
          escalated: false,
        },
      ]);

      await db.insert(expertEscalations).values([
        {
          farmerId: ramu.id,
          conversationId: insertedConvs[0].id,
          questionText:
            'మా గొల్లప్రోలు చేనులో వరి దుబ్బుల అడుగున ఆకులు ఎర్రబడి పసుపుగా మారుతున్నాయి, దోమపోటు మందు ఎంత మోతాదు కొట్టాలి?',
          category: 'Pest & Chemical Safety',
          conversationContext:
            'Farmer: Ramu (FARM-DEMO-001), Gollaprolu, Kakinada. Crop: Paddy MTU-1061 (3.5 acres, grain filling stage). Consented conversation context shared.',
          escalationReason:
            'Farmer requested specific chemical pesticide dosage for suspected Brown Planthopper / basal leaf yellowing; AI abstained from prescribing dosage per safety policy.',
          status: 'Pending Expert Review',
          assignedExpert: 'Dr. K. Srinivas Rao (Agronomy Pilot Advisor — Demo)',
          resolutionNotes: '',
        },
      ]);

      // 15. Seeded Harvest Record & AGRIROUTE Recommendations
      const insertedHarvests = await db
        .insert(harvestRecords)
        .values([
          {
            farmerId: lakshmi.id,
            cropName: 'Banana (Karpura Chakkarakeli)',
            quantityHarvestedQuintals: '45',
            harvestDate: '2026-11-04',
            qualityGrade: 'Mixed harvest: 38 qtl Grade A + 7 qtl cosmetically spotted ripe hands',
            expectedShelfLifeDays: 5,
            location: 'Atreyapuram, Dr. B.R. Ambedkar Konaseema',
            storageAvailable: true,
            additionalInfo: 'Sorted in ventilated bamboo shed; plastic crates available for loading.',
            selectedDestinationName:
              'Split Route: Godavari Fresh Retail Supply (Grade A) + Konaseema Fruit Processing Unit (Spotted Lot)',
            outcomeStatus: 'Route Selected (35 qtl Confirmed Order + 7 qtl Accepted Offer)',
          },
        ])
        .returning();

      await db.insert(agrirouteRecommendations).values([
        {
          harvestId: insertedHarvests[0].id,
          farmerId: lakshmi.id,
          merchantId: mProcessing.id,
          destinationName: 'Konaseema Fruit & Spice Processing Pvt. Ltd. (Demo)',
          destinationType: 'Food Processing Unit',
          suitabilityScore: 91,
          quantityAcceptedQuintals: '45 qtl (of 120 qtl cap)',
          qualityMatchLabel: 'Strong Match (Accepts Edible Imperfect / Ripe Produce)',
          distanceKm: 11,
          estimatedLogisticsCostInr: '₹2,184 (Illustrative Estimate)',
          isIllustrativeEstimate: true,
          procurementTiming: '2026-11-01 to 2026-12-15',
          demandStatus: 'Open · ₹1,180 – ₹1,420',
          rankingReason:
            'Short 11 km transit protects 5-day perishable shelf life and accepts cosmetically spotted hands with zero retail rejection risk (ideal for the 7 qtl Grade B portion).',
          isSelected: true,
        },
        {
          harvestId: insertedHarvests[0].id,
          farmerId: lakshmi.id,
          merchantId: mGodavari.id,
          destinationName: 'Godavari Fresh Retail Supply Co. (Demo)',
          destinationType: 'Retail Procurement',
          suitabilityScore: 86,
          quantityAcceptedQuintals: '45 qtl (of 60 qtl cap)',
          qualityMatchLabel: 'Grade A Only (Sort Out 7 qtl Spotted Hands First)',
          distanceKm: 16,
          estimatedLogisticsCostInr: '₹2,404 (Illustrative Estimate)',
          isIllustrativeEstimate: true,
          procurementTiming: '2026-11-01 to 2026-11-20',
          demandStatus: 'Open · ₹1,900 – ₹2,150',
          rankingReason:
            'Strong retail price range and nearby 16 km crate pickup for the 38 qtl clean Grade A bunches; requires pre-sorting out cosmetically spotted fruit.',
          isSelected: true,
        },
        {
          harvestId: insertedHarvests[0].id,
          farmerId: lakshmi.id,
          merchantId: null,
          destinationName: 'Ravulapalem Regional Banana Wholesale Yard (Demo)',
          destinationType: 'Wholesaler',
          suitabilityScore: 78,
          quantityAcceptedQuintals: '45 qtl (of 200 qtl cap)',
          qualityMatchLabel: 'Moderate Match (Auction Grade Deduction Possible)',
          distanceKm: 12,
          estimatedLogisticsCostInr: '₹2,228 (Illustrative Estimate)',
          isIllustrativeEstimate: true,
          procurementTiming: 'Daily morning auction window (Demo estimate)',
          demandStatus: 'Indicative Open Yard · Subject to daily auction',
          rankingReason:
            'Accepts full 45 qtl lot nearby (12 km), though mixed cosmetic blemishes may reduce auction bid across the entire batch.',
          isSelected: false,
        },
      ]);

      // 16. Seeded Notifications
      await db.insert(notifications).values([
        {
          recipientRole: 'farmer',
          recipientFarmerId: ramu.id,
          eventType: 'enquiry_received',
          title: 'New Purchase Enquiry on Paddy (MTU-1061)',
          message:
            'Sri Satyanarayana Agro Traders (Demo) sent an enquiry for 60 quintals at ₹2,340/qtl. An enquiry is not a confirmed sale until accepted and confirmed.',
          relatedTab: 'my_farm',
          isRead: false,
        },
        {
          recipientRole: 'farmer',
          recipientFarmerId: ramu.id,
          eventType: 'question_escalated',
          title: 'Query Escalated to Agricultural Expert',
          message:
            'Your paddy basal leaf yellowing & dosage question was routed to Dr. K. Srinivas Rao (Demo) for safe agronomic review.',
          relatedTab: 'assistant',
          isRead: false,
        },
        {
          recipientRole: 'farmer',
          recipientFarmerId: ramu.id,
          eventType: 'harvest_approaching',
          title: 'Upcoming Harvest Preparation Reminder',
          message:
            'Your Paddy (MTU-1061) harvest date (2026-11-18) is approaching. Drain standing water 10–12 days prior to harvest.',
          relatedTab: 'agriroute',
          isRead: false,
        },
        {
          recipientRole: 'farmer',
          recipientFarmerId: lakshmi.id,
          eventType: 'order_confirmed',
          title: 'Confirmed Order ORD-DEMO-1001',
          message:
            'Order confirmed with Godavari Fresh Retail Supply Co. (Demo) for 35 quintals of Karpura Chakkarakeli Banana.',
          relatedTab: 'my_farm',
          isRead: false,
        },
        {
          recipientRole: 'merchant',
          recipientMerchantId: mCoromandel.id,
          eventType: 'offer_submitted',
          title: 'New Farmer Offer on Black Gram Requirement',
          message:
            'Ramu (Gollaprolu, Kakinada — Demo) offered 18 quintals of LBG-752 Black Gram at ₹7,150/qtl.',
          relatedTab: 'merchant_market',
          isRead: false,
        },
        {
          recipientRole: 'coordinator',
          eventType: 'escalation_pending',
          title: 'Pending Expert Escalation: Paddy Pest Dosage',
          message:
            'Ramu (FARM-DEMO-001) asked a chemical dosage question escalated by AI Safety Filter.',
          relatedTab: 'coordinator',
          isRead: false,
        },
      ]);
    } catch (error) {
      console.error('Demo seed initialization error:', error);
      throw new Error('Failed to initialize demo pilot seed records.', { cause: error });
    } finally {
      seedingInProgress = null;
    }
  })();

  return seedingInProgress;
}
