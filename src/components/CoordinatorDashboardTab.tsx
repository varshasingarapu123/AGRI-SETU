import React, { useState } from 'react';
import {
  AlertTriangle,
  BarChart3,
  BookOpen,
  Users,
  Store,
  Plus,
} from 'lucide-react';
import { useAgriSetu } from '../context/AgriSetuContext.tsx';
import type {
  BootstrapData,
  KnowledgeRecord,
  SchemeRecord,
} from '../types/agrisetu.ts';

type CoordSubTab =
  | 'overview_analytics'
  | 'escalations'
  | 'farmers_merchants'
  | 'knowledge_schemes';

const KNOWLEDGE_CATEGORIES = [
  'Crop cultivation',
  'Soil health',
  'Seeds and varieties',
  'Irrigation',
  'Fertiliser management',
  'Pest and disease management',
  'Harvesting',
  'Post-harvest handling',
  'Storage',
  'Weather-related agricultural guidance',
  'Market information',
  'Government schemes',
];

export const CoordinatorDashboardTab: React.FC = () => {
  const { data, apiFetch, updateBootstrapState, pushToast } = useAgriSetu();
  const [subTab, setSubTab] = useState<CoordSubTab>('overview_analytics');

  // Escalation editor state
  const [escalationEdits, setEscalationEdits] = useState<
    Record<number, { assignedExpert: string; status: string; resolutionNotes: string }>
  >({});

  // Knowledge add/edit form
  const [knowledgeForm, setKnowledgeForm] = useState({
    id: undefined as number | undefined,
    category: 'Crop cultivation',
    title: '',
    titleTe: '',
    summary: '',
    content: '',
    applicableRegions: 'Kakinada, Godavari region',
    applicableCrops: '',
    sourceName: '',
    sourceUrl: '',
    verificationStatus: 'Verified',
    lastVerifiedDate: '2026-10-31',
    isOutdated: false,
  });

  // Scheme update/add form
  const [schemeForm, setSchemeForm] = useState({
    id: undefined as number | undefined,
    schemeCode: '',
    schemeName: '',
    schemeNameTe: '',
    level: 'Central',
    applicableState: 'Andhra Pradesh & Telangana',
    purpose: '',
    eligibilityConditions: '',
    benefits: '',
    requiredDocuments: '',
    applicationProcedure: '',
    officialPortal: 'https://',
    relevantOffice: 'Village Rythu Seva Kendra',
    importantDates: 'Verify seasonal notification',
    officialSource: '',
    officialSourceUrl: 'https://',
    verificationStatus: 'Requires Verification',
    lastVerifiedDate: '2026-10-31',
    isOutdated: false,
  });

  if (!data) {
    return (
      <div className="p-8 text-center text-sm text-[#4B5E52]">
        Loading Coordinator Dashboard...
      </div>
    );
  }

  // Compute real connected metrics from PostgreSQL state
  const totalFarmers = data.farmers.length;
  const consentedFarmers = data.farmers.filter(
    (f) => f.consent?.shareProfileWithAi || f.consent?.shareProfileWithMerchants
  ).length;
  const activeFarmers = data.farmers.filter(
    (f) =>
      data.conversations.some((c) => c.farmerId === f.id) ||
      data.listings.some((l) => l.farmerId === f.id)
  ).length;
  const activeListings = data.listings.filter((l) => l.listingStatus === 'Active').length;
  const activeRequirements = data.demands.filter((d) => d.demandStatus === 'Open').length;
  const incomingEnquiries = data.enquiries.length;
  const confirmedOrders = data.orders.filter((o) => o.orderStatus === 'Confirmed order').length;
  const completedTransactions = data.orders.filter((o) => o.orderStatus === 'Completed').length;

  const resolvedQueries = data.conversations.filter((c) => c.status === 'Resolved').length;
  const escalatedQueries = data.escalations.length;
  const unresolvedQueries = data.escalations.filter((e) => e.status !== 'Resolved').length;

  const expertReviewedReports = data.farmers.reduce(
    (acc, f) => acc + (f.latestSoil?.expertReviewed ? 1 : 0),
    0
  );
  const indicativeBuyerMatches = data.enquiries.length + data.offers.length;
  const confirmedBuyerMatches = data.orders.length;
  const verifiedFeedbackCount = data.orders.filter(
    (o) => o.farmerFeedback && o.farmerFeedback.trim() !== ''
  ).length;
  const repeatUsersCount = data.farmers.filter((f) => {
    const activityCount =
      data.conversations.filter((c) => c.farmerId === f.id).length +
      data.listings.filter((l) => l.farmerId === f.id).length +
      data.offers.filter((o) => o.farmerId === f.id).length;
    return activityCount >= 2;
  }).length;

  const handleSaveEscalation = async (escId: number) => {
    const current = data.escalations.find((e) => e.id === escId);
    const draft = escalationEdits[escId] || {
      assignedExpert: current?.assignedExpert || 'Dr. K. Srinivas Rao (Agronomy Advisor)',
      status: 'Resolved',
      resolutionNotes: current?.resolutionNotes || '',
    };
    try {
      const nextState = await apiFetch<BootstrapData>(`/api/escalations/${escId}`, {
        method: 'PATCH',
        body: JSON.stringify(draft),
      });
      updateBootstrapState(nextState);
      pushToast(
        'success',
        `Updated escalation #${escId} (${draft.status}) and notified the farmer.`
      );
    } catch (err: any) {
      pushToast('error', err.message || 'Failed to update escalation.');
    }
  };

  const handleSaveKnowledge = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const nextState = await apiFetch<BootstrapData>('/api/coordinator/knowledge', {
        method: 'POST',
        body: JSON.stringify(knowledgeForm),
      });
      updateBootstrapState(nextState);
      pushToast('success', 'Saved agricultural knowledge document to RAG catalogue.');
      setKnowledgeForm({
        id: undefined,
        category: 'Crop cultivation',
        title: '',
        titleTe: '',
        summary: '',
        content: '',
        applicableRegions: 'Kakinada, Godavari region',
        applicableCrops: '',
        sourceName: '',
        sourceUrl: '',
        verificationStatus: 'Verified',
        lastVerifiedDate: '2026-10-31',
        isOutdated: false,
      });
    } catch (err: any) {
      pushToast('error', err.message || 'Failed to save knowledge document.');
    }
  };

  const loadKnowledgeForEdit = (doc: KnowledgeRecord) => {
    setKnowledgeForm({
      id: doc.id,
      category: doc.category,
      title: doc.title,
      titleTe: doc.titleTe || '',
      summary: doc.summary,
      content: doc.content,
      applicableRegions: doc.applicableRegions,
      applicableCrops: doc.applicableCrops || '',
      sourceName: doc.sourceName,
      sourceUrl: doc.sourceUrl || '',
      verificationStatus: doc.verificationStatus,
      lastVerifiedDate: doc.lastVerifiedDate,
      isOutdated: doc.isOutdated,
    });
  };

  const handleSaveScheme = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const nextState = await apiFetch<BootstrapData>('/api/coordinator/schemes', {
        method: 'POST',
        body: JSON.stringify(schemeForm),
      });
      updateBootstrapState(nextState);
      pushToast('success', `Saved scheme record (${schemeForm.schemeCode}).`);
      setSchemeForm({
        id: undefined,
        schemeCode: '',
        schemeName: '',
        schemeNameTe: '',
        level: 'Central',
        applicableState: 'Andhra Pradesh & Telangana',
        purpose: '',
        eligibilityConditions: '',
        benefits: '',
        requiredDocuments: '',
        applicationProcedure: '',
        officialPortal: 'https://',
        relevantOffice: 'Village Rythu Seva Kendra',
        importantDates: 'Verify seasonal notification',
        officialSource: '',
        officialSourceUrl: 'https://',
        verificationStatus: 'Requires Verification',
        lastVerifiedDate: '2026-10-31',
        isOutdated: false,
      });
    } catch (err: any) {
      pushToast('error', err.message || 'Failed to save scheme record.');
    }
  };

  const loadSchemeForEdit = (s: SchemeRecord) => {
    setSchemeForm({
      id: s.id,
      schemeCode: s.schemeCode,
      schemeName: s.schemeName,
      schemeNameTe: s.schemeNameTe || '',
      level: s.level,
      applicableState: s.applicableState,
      purpose: s.purpose,
      eligibilityConditions: s.eligibilityConditions,
      benefits: s.benefits,
      requiredDocuments: s.requiredDocuments,
      applicationProcedure: s.applicationProcedure,
      officialPortal: s.officialPortal,
      relevantOffice: s.relevantOffice,
      importantDates: s.importantDates,
      officialSource: s.officialSource,
      officialSourceUrl: s.officialSourceUrl || s.officialPortal || 'https://',
      verificationStatus: s.verificationStatus,
      lastVerifiedDate: s.lastVerifiedDate,
      isOutdated: s.isOutdated,
    });
  };

  return (
    <div className="space-y-6">
      {/* Header & Overview Metrics Grid */}
      <section className="bg-white border border-[#E3E7E1] rounded-xl p-6 space-y-5">
        <div className="pb-4 border-b border-[#E8ECE6]">
          <p className="text-xs text-[#4B5E52]">
            AGRISETU Pilot Administration · Operations, Escalations, Knowledge & Outcome Governance
          </p>
          <h2 className="text-xl font-semibold text-[#14241B] mt-0.5">
            Coordinator Dashboard
          </h2>
        </div>

        {/* All 11 Required Overview Metrics */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4 text-sm">
          <div>
            <p className="text-xs text-[#5A6D60]">Registered Farmers</p>
            <p className="text-xl font-semibold font-mono-num text-[#14241B]">{totalFarmers}</p>
          </div>
          <div>
            <p className="text-xs text-[#5A6D60]">Consented Farmers</p>
            <p className="text-xl font-semibold font-mono-num text-[#16A34A]">
              {consentedFarmers}
            </p>
          </div>
          <div>
            <p className="text-xs text-[#5A6D60]">Active Farmers</p>
            <p className="text-xl font-semibold font-mono-num text-[#14241B]">{activeFarmers}</p>
          </div>
          <div>
            <p className="text-xs text-[#5A6D60]">Active Produce Listings</p>
            <p className="text-xl font-semibold font-mono-num text-[#14241B]">{activeListings}</p>
          </div>
          <div>
            <p className="text-xs text-[#5A6D60]">Merchant Requirements</p>
            <p className="text-xl font-semibold font-mono-num text-[#14241B]">
              {activeRequirements}
            </p>
          </div>
          <div>
            <p className="text-xs text-[#5A6D60]">Incoming Enquiries</p>
            <p className="text-xl font-semibold font-mono-num text-[#14241B]">
              {incomingEnquiries}
            </p>
          </div>
          <div>
            <p className="text-xs text-[#5A6D60]">Confirmed Orders</p>
            <p className="text-xl font-semibold font-mono-num text-[#1B4332]">
              {confirmedOrders}
            </p>
          </div>
          <div>
            <p className="text-xs text-[#5A6D60]">Completed Transactions</p>
            <p className="text-xl font-semibold font-mono-num text-[#16A34A]">
              {completedTransactions}
            </p>
          </div>
          <div>
            <p className="text-xs text-[#5A6D60]">AI Queries Resolved</p>
            <p className="text-xl font-semibold font-mono-num text-[#14241B]">
              {resolvedQueries}
            </p>
          </div>
          <div>
            <p className="text-xs text-[#5A6D60]">AI Queries Escalated</p>
            <p className="text-xl font-semibold font-mono-num text-[#B45309]">
              {escalatedQueries}
            </p>
          </div>
          <div>
            <p className="text-xs text-[#5A6D60]">Unresolved Queries</p>
            <p className="text-xl font-semibold font-mono-num text-[#B91C1C]">
              {unresolvedQueries}
            </p>
          </div>
        </div>
      </section>

      {/* Coordinator Sub-Navigation */}
      <div className="flex flex-wrap items-center gap-1 p-1 bg-[#EFF2ED] rounded-lg w-fit">
        <button
          type="button"
          onClick={() => setSubTab('overview_analytics')}
          className={`inline-flex items-center gap-2 px-3.5 py-2 text-xs sm:text-sm font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
            subTab === 'overview_analytics'
              ? 'bg-white text-[#14241B] shadow-xs'
              : 'text-[#4B5E52] hover:text-[#14241B]'
          }`}
        >
          <BarChart3 className="w-4 h-4 text-[#1B4332]" />
          <span>Pilot Outcome Analytics</span>
        </button>
        <button
          type="button"
          onClick={() => setSubTab('escalations')}
          className={`inline-flex items-center gap-2 px-3.5 py-2 text-xs sm:text-sm font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
            subTab === 'escalations'
              ? 'bg-white text-[#14241B] shadow-xs'
              : 'text-[#4B5E52] hover:text-[#14241B]'
          }`}
        >
          <AlertTriangle className="w-4 h-4 text-[#B45309]" />
          <span>Expert Escalation Queue ({unresolvedQueries} Open)</span>
        </button>
        <button
          type="button"
          onClick={() => setSubTab('farmers_merchants')}
          className={`inline-flex items-center gap-2 px-3.5 py-2 text-xs sm:text-sm font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
            subTab === 'farmers_merchants'
              ? 'bg-white text-[#14241B] shadow-xs'
              : 'text-[#4B5E52] hover:text-[#14241B]'
          }`}
        >
          <Users className="w-4 h-4 text-[#1B4332]" />
          <span>Farmer & Merchant Management</span>
        </button>
        <button
          type="button"
          onClick={() => setSubTab('knowledge_schemes')}
          className={`inline-flex items-center gap-2 px-3.5 py-2 text-xs sm:text-sm font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
            subTab === 'knowledge_schemes'
              ? 'bg-white text-[#14241B] shadow-xs'
              : 'text-[#4B5E52] hover:text-[#14241B]'
          }`}
        >
          <BookOpen className="w-4 h-4 text-[#1B4332]" />
          <span>Scheme & Knowledge Governance</span>
        </button>
      </div>

      {/* SUB-TAB 1: PILOT OUTCOME ANALYTICS */}
      {subTab === 'overview_analytics' && (
        <div className="bg-white border border-[#E3E7E1] rounded-xl p-6 space-y-5">
          <div>
            <p className="text-xs text-[#4B5E52]">
              Pilot Coordination Summary · Distinguishing Indicative Interest from Confirmed Outcomes
            </p>
            <h3 className="text-base font-semibold text-[#14241B] mt-0.5">
              Measurable Pilot Outcomes Matrix
            </h3>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="border-b border-[#E3E7E1] text-xs text-[#5A6D60]">
                  <th className="py-2.5 pr-4">Pilot Indicator</th>
                  <th className="py-2.5 px-3 text-right">Count</th>
                  <th className="py-2.5 pl-4">Measurement Definition & Data Source</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#EEF1EC]">
                <tr>
                  <td className="py-3 pr-4 font-medium">Consented Farmers Onboarded</td>
                  <td className="py-3 px-3 text-right font-mono-num">{consentedFarmers}</td>
                  <td className="py-3 pl-4 text-xs text-[#4B5E52]">
                    Farmers with active explicit consent flags in farmer_consent table
                  </td>
                </tr>
                <tr>
                  <td className="py-3 pr-4 font-medium">Active Pilot Users (Farmers + Merchants)</td>
                  <td className="py-3 px-3 text-right font-mono-num">
                    {activeFarmers + data.merchants.length}
                  </td>
                  <td className="py-3 pl-4 text-xs text-[#4B5E52]">
                    Profiles actively participating in guidance, listings, or procurement
                  </td>
                </tr>
                <tr>
                  <td className="py-3 pr-4 font-medium">
                    AI Queries (Resolved / Escalated / Unresolved)
                  </td>
                  <td className="py-3 px-3 text-right font-mono-num">
                    {resolvedQueries} / {escalatedQueries} / {unresolvedQueries}
                  </td>
                  <td className="py-3 pl-4 text-xs text-[#4B5E52]">
                    Tracked across conversations and expert_escalations tables
                  </td>
                </tr>
                <tr>
                  <td className="py-3 pr-4 font-medium">Expert-Reviewed Soil/Crop Reports</td>
                  <td className="py-3 px-3 text-right font-mono-num">{expertReviewedReports}</td>
                  <td className="py-3 pl-4 text-xs text-[#4B5E52]">
                    Soil & suitability profiles verified by an agricultural specialist
                  </td>
                </tr>
                <tr>
                  <td className="py-3 pr-4 font-medium">
                    Indicative Buyer Matches (Enquiries + Offers)
                  </td>
                  <td className="py-3 px-3 text-right font-mono-num">{indicativeBuyerMatches}</td>
                  <td className="py-3 pl-4 text-xs text-[#4B5E52]">
                    Expressions of interest prior to formal order confirmation
                  </td>
                </tr>
                <tr>
                  <td className="py-3 pr-4 font-medium">Confirmed Buyer Matches (Orders)</td>
                  <td className="py-3 px-3 text-right font-mono-num">{confirmedBuyerMatches}</td>
                  <td className="py-3 pl-4 text-xs text-[#4B5E52]">
                    Mutually confirmed orders recorded in orders table
                  </td>
                </tr>
                <tr>
                  <td className="py-3 pr-4 font-medium">Completed Transactions</td>
                  <td className="py-3 px-3 text-right font-mono-num">{completedTransactions}</td>
                  <td className="py-3 pl-4 text-xs text-[#4B5E52]">
                    Orders delivered and settled (`order_status = Completed`)
                  </td>
                </tr>
                <tr>
                  <td className="py-3 pr-4 font-medium">Verified Outcomes / Farmer Feedback</td>
                  <td className="py-3 px-3 text-right font-mono-num">{verifiedFeedbackCount}</td>
                  <td className="py-3 pl-4 text-xs text-[#4B5E52]">
                    Completed orders with recorded post-settlement farmer feedback
                  </td>
                </tr>
                <tr>
                  <td className="py-3 pr-4 font-medium">Repeat Farmer Engagement</td>
                  <td className="py-3 px-3 text-right font-mono-num">{repeatUsersCount}</td>
                  <td className="py-3 pl-4 text-xs text-[#4B5E52]">
                    Farmers engaging across 2+ sessions, listings, or market offers
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* SUB-TAB 2: AGRICULTURAL EXPERT ESCALATION QUEUE */}
      {subTab === 'escalations' && (
        <div className="bg-white border border-[#E3E7E1] rounded-xl p-6 space-y-5">
          <div>
            <p className="text-xs text-[#4B5E52]">
              Human-in-the-Loop Agronomic Safety · Responses post directly back to the farmer's thread
            </p>
            <h3 className="text-base font-semibold text-[#14241B] mt-0.5">
              Agricultural Expert Escalation Queue ({data.escalations.length})
            </h3>
          </div>

          {data.escalations.map((esc) => {
            const farmer = data.farmers.find((f) => f.id === esc.farmerId);
            const editState = escalationEdits[esc.id] || {
              assignedExpert:
                esc.assignedExpert || 'Dr. K. Srinivas Rao (Agronomy Pilot Specialist)',
              status: esc.status,
              resolutionNotes: esc.resolutionNotes || '',
            };

            return (
              <div
                key={esc.id}
                className="border border-[#E3E7E1] rounded-xl p-5 space-y-3 text-sm"
              >
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                  <span className="text-[#4B5E52]">
                    Case #{esc.id} · Farmer:{' '}
                    <strong className="text-[#14241B]">
                      {farmer ? `${farmer.name} (${farmer.farmerCode})` : `ID #${esc.farmerId}`}
                    </strong>{' '}
                    · Category: <strong>{esc.category}</strong>
                  </span>
                  <span
                    className={`font-medium ${
                      esc.status === 'Resolved' ? 'text-[#16A34A]' : 'text-[#B45309]'
                    }`}
                  >
                    Status: {esc.status}
                  </span>
                </div>

                <p className="font-medium text-[#14241B]">Question: "{esc.questionText}"</p>
                <p className="text-xs text-[#4B5E52]">
                  <strong>Reason for Escalation:</strong> {esc.escalationReason}
                </p>
                <p className="text-xs text-[#5A6D60]">
                  <strong>Consented Context:</strong>{' '}
                  {farmer?.consent?.shareConversationWithExperts
                    ? esc.conversationContext
                    : 'Farmer withheld conversation context sharing — evaluate question standalone.'}
                </p>

                <div className="pt-3 border-t border-[#EEF1EC] grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-[#4B5E52] mb-1">
                      Assigned Expert
                    </label>
                    <input
                      type="text"
                      value={editState.assignedExpert}
                      onChange={(e) =>
                        setEscalationEdits({
                          ...escalationEdits,
                          [esc.id]: { ...editState, assignedExpert: e.target.value },
                        })
                      }
                      className="w-full px-3 py-1.5 text-xs border border-[#D4DCD2] rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-[#4B5E52] mb-1">Status</label>
                    <select
                      value={editState.status}
                      onChange={(e) =>
                        setEscalationEdits({
                          ...escalationEdits,
                          [esc.id]: { ...editState, status: e.target.value },
                        })
                      }
                      className="w-full px-3 py-1.5 text-xs border border-[#D4DCD2] rounded-lg bg-white"
                    >
                      <option value="Pending Expert Review">Pending Expert Review</option>
                      <option value="Assigned">Assigned</option>
                      <option value="Resolved">Resolved</option>
                    </select>
                  </div>
                  <div className="flex items-end">
                    <button
                      type="button"
                      onClick={() => handleSaveEscalation(esc.id)}
                      className="w-full px-3 py-1.5 text-xs font-medium bg-[#1B4332] text-white rounded-lg hover:bg-[#143326]"
                    >
                      Save & Send Expert Reply
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-[#4B5E52] mb-1">
                    Expert Resolution Notes (Sent to Farmer Conversation & Notifications)
                  </label>
                  <textarea
                    rows={2}
                    placeholder="Enter field inspection recommendation or safe agronomic guidance..."
                    value={editState.resolutionNotes}
                    onChange={(e) =>
                      setEscalationEdits({
                        ...escalationEdits,
                        [esc.id]: { ...editState, resolutionNotes: e.target.value },
                      })
                    }
                    className="w-full px-3 py-2 text-xs border border-[#D4DCD2] rounded-lg"
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* SUB-TAB 3: FARMER & MERCHANT MANAGEMENT */}
      {subTab === 'farmers_merchants' && (
        <div className="space-y-6">
          {/* Farmer Management */}
          <div className="bg-white border border-[#E3E7E1] rounded-xl p-6 space-y-4">
            <h3 className="text-base font-semibold text-[#14241B]">
              Farmer Profiles & Consent Status ({data.farmers.length})
            </h3>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-sm">
                <thead>
                  <tr className="border-b border-[#E3E7E1] text-xs text-[#5A6D60]">
                    <th className="py-2.5 pr-4">Farmer</th>
                    <th className="py-2.5 px-3">Location</th>
                    <th className="py-2.5 px-3">Current Crop & Area</th>
                    <th className="py-2.5 px-3">Consent (AI / Market / Expert)</th>
                    <th className="py-2.5 px-3 text-right">Listings / Enquiries</th>
                    <th className="py-2.5 pl-3">Manage</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#EEF1EC]">
                  {data.farmers.map((f) => {
                    const fListings = data.listings.filter((l) => l.farmerId === f.id).length;
                    const fEnquiries = data.enquiries.filter((e) => e.farmerId === f.id).length;
                    return (
                      <tr key={f.id}>
                        <td className="py-3 pr-4">
                          <p className="font-medium text-[#14241B]">{f.name}</p>
                          <p className="text-xs font-mono-num text-[#4B5E52]">{f.farmerCode}</p>
                        </td>
                        <td className="py-3 px-3 text-xs text-[#4B5E52]">
                          {f.village}, {f.district}
                        </td>
                        <td className="py-3 px-3 text-xs">
                          {f.currentCrop} ({f.farmDetails?.farmAreaAcres} ac)
                        </td>
                        <td className="py-3 px-3 text-xs text-[#4B5E52]">
                          {f.consent?.shareProfileWithAi ? 'Yes' : 'No'} /{' '}
                          {f.consent?.shareProfileWithMerchants ? 'Yes' : 'No'} /{' '}
                          {f.consent?.shareConversationWithExperts ? 'Yes' : 'No'}
                        </td>
                        <td className="py-3 px-3 text-right font-mono-num text-xs">
                          {fListings} / {fEnquiries}
                        </td>
                        <td className="py-3 pl-3 text-xs text-[#5A6D60]">
                          Farmer-Controlled Consent
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Merchant & Order Tracking */}
          <div className="bg-white border border-[#E3E7E1] rounded-xl p-6 space-y-4">
            <div className="flex items-center gap-2">
              <Store className="w-4 h-4 text-[#1B4332]" />
              <h3 className="text-base font-semibold text-[#14241B]">
                Merchants, Procurement Requirements & Orders ({data.merchants.length} Merchants ·{' '}
                {data.orders.length} Orders)
              </h3>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-sm">
                <thead>
                  <tr className="border-b border-[#E3E7E1] text-xs text-[#5A6D60]">
                    <th className="py-2.5 pr-4">Merchant</th>
                    <th className="py-2.5 px-3">Buyer Channel</th>
                    <th className="py-2.5 px-3">District</th>
                    <th className="py-2.5 px-3 text-right">Open Demands</th>
                    <th className="py-2.5 px-3 text-right">Farmer Offers</th>
                    <th className="py-2.5 pl-3 text-right">Orders</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#EEF1EC]">
                  {data.merchants.map((m) => {
                    const mDemands = data.demands.filter((d) => d.merchantId === m.id).length;
                    const mOffers = data.offers.filter((o) => o.merchantId === m.id).length;
                    const mOrders = data.orders.filter((ord) => ord.merchantId === m.id).length;
                    return (
                      <tr key={m.id}>
                        <td className="py-3 pr-4">
                          <p className="font-medium text-[#14241B]">{m.businessName}</p>
                          <p className="text-xs text-[#4B5E52]">{m.verificationStatus}</p>
                        </td>
                        <td className="py-3 px-3 text-xs">{m.buyerType}</td>
                        <td className="py-3 px-3 text-xs text-[#4B5E52]">{m.district}</td>
                        <td className="py-3 px-3 text-right font-mono-num">{mDemands}</td>
                        <td className="py-3 px-3 text-right font-mono-num">{mOffers}</td>
                        <td className="py-3 pl-3 text-right font-mono-num">{mOrders}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* SUB-TAB 4: SCHEME & KNOWLEDGE GOVERNANCE */}
      {subTab === 'knowledge_schemes' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
          {/* Knowledge Base Governance */}
          <div className="bg-white border border-[#E3E7E1] rounded-xl p-6 space-y-5">
            <div>
              <p className="text-xs text-[#4B5E52]">RAG Document Store</p>
              <h3 className="text-base font-semibold text-[#14241B]">
                {knowledgeForm.id
                  ? `Editing Knowledge Document #${knowledgeForm.id}`
                  : 'Add Agricultural Knowledge Document'}
              </h3>
            </div>

            <form onSubmit={handleSaveKnowledge} className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium text-[#4B5E52] mb-1">Category</label>
                  <select
                    value={knowledgeForm.category}
                    onChange={(e) =>
                      setKnowledgeForm({ ...knowledgeForm, category: e.target.value })
                    }
                    className="w-full px-2.5 py-2 border border-[#D4DCD2] rounded-lg bg-white"
                  >
                    {KNOWLEDGE_CATEGORIES.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block font-medium text-[#4B5E52] mb-1">
                    Verification Date
                  </label>
                  <input
                    type="date"
                    required
                    value={knowledgeForm.lastVerifiedDate}
                    onChange={(e) =>
                      setKnowledgeForm({ ...knowledgeForm, lastVerifiedDate: e.target.value })
                    }
                    className="w-full px-2.5 py-2 font-mono-num border border-[#D4DCD2] rounded-lg"
                  />
                </div>
              </div>

              <div>
                <label className="block font-medium text-[#4B5E52] mb-1">Title</label>
                <input
                  type="text"
                  required
                  value={knowledgeForm.title}
                  onChange={(e) => setKnowledgeForm({ ...knowledgeForm, title: e.target.value })}
                  className="w-full px-2.5 py-2 border border-[#D4DCD2] rounded-lg"
                />
              </div>

              <div>
                <label className="block font-medium text-[#4B5E52] mb-1">Concise Summary</label>
                <input
                  type="text"
                  required
                  value={knowledgeForm.summary}
                  onChange={(e) => setKnowledgeForm({ ...knowledgeForm, summary: e.target.value })}
                  className="w-full px-2.5 py-2 border border-[#D4DCD2] rounded-lg"
                />
              </div>

              <div>
                <label className="block font-medium text-[#4B5E52] mb-1">
                  Guidance Content (Used by AI RAG)
                </label>
                <textarea
                  rows={3}
                  required
                  value={knowledgeForm.content}
                  onChange={(e) => setKnowledgeForm({ ...knowledgeForm, content: e.target.value })}
                  className="w-full px-2.5 py-2 border border-[#D4DCD2] rounded-lg"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium text-[#4B5E52] mb-1">
                    Authoritative Source
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. ANGRAU / ICAR"
                    value={knowledgeForm.sourceName}
                    onChange={(e) =>
                      setKnowledgeForm({ ...knowledgeForm, sourceName: e.target.value })
                    }
                    className="w-full px-2.5 py-2 border border-[#D4DCD2] rounded-lg"
                  />
                </div>
                <div>
                  <label className="block font-medium text-[#4B5E52] mb-1">Source URL</label>
                  <input
                    type="text"
                    placeholder="https://..."
                    value={knowledgeForm.sourceUrl}
                    onChange={(e) =>
                      setKnowledgeForm({ ...knowledgeForm, sourceUrl: e.target.value })
                    }
                    className="w-full px-2.5 py-2 border border-[#D4DCD2] rounded-lg"
                  />
                </div>
              </div>

              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={knowledgeForm.isOutdated}
                  onChange={(e) =>
                    setKnowledgeForm({ ...knowledgeForm, isOutdated: e.target.checked })
                  }
                  className="accent-[#1B4332]"
                />
                <span>Mark document as Outdated (excludes from active AI RAG retrieval)</span>
              </label>

              <div className="flex items-center justify-end gap-2">
                {knowledgeForm.id && (
                  <button
                    type="button"
                    onClick={() =>
                      setKnowledgeForm({ ...knowledgeForm, id: undefined, title: '', summary: '', content: '' })
                    }
                    className="px-3 py-1.5 text-[#4B5E52]"
                  >
                    Clear Edit
                  </button>
                )}
                <button
                  type="submit"
                  className="inline-flex items-center gap-1 px-4 py-2 font-medium bg-[#1B4332] text-white rounded-lg"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>{knowledgeForm.id ? 'Update Document' : 'Add Knowledge Document'}</span>
                </button>
              </div>
            </form>

            <div className="pt-4 border-t border-[#E8ECE6] space-y-2 max-h-60 overflow-y-auto">
              <p className="text-xs font-semibold text-[#14241B]">
                Existing Knowledge Documents (Click Edit to update or mark outdated):
              </p>
              {data.knowledge.map((doc) => (
                <div
                  key={doc.id}
                  className="flex items-center justify-between gap-2 text-xs py-1.5 border-b border-[#EEF1EC]"
                >
                  <span className="truncate">
                    {doc.isOutdated ? '[OUTDATED] ' : ''}
                    {doc.title}
                  </span>
                  <button
                    type="button"
                    onClick={() => loadKnowledgeForEdit(doc)}
                    className="text-[#1B4332] font-medium hover:underline shrink-0"
                  >
                    Edit
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Government Scheme Governance */}
          <div className="bg-white border border-[#E3E7E1] rounded-xl p-6 space-y-5">
            <div>
              <p className="text-xs text-[#4B5E52]">Scheme Verification Governance</p>
              <h3 className="text-base font-semibold text-[#14241B]">
                {schemeForm.id
                  ? `Updating Scheme: ${schemeForm.schemeCode}`
                  : 'Add / Update Government Scheme Record'}
              </h3>
            </div>

            <form onSubmit={handleSaveScheme} className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium text-[#4B5E52] mb-1">Scheme Code</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. PM-KISAN"
                    value={schemeForm.schemeCode}
                    onChange={(e) => setSchemeForm({ ...schemeForm, schemeCode: e.target.value })}
                    className="w-full px-2.5 py-2 border border-[#D4DCD2] rounded-lg"
                  />
                </div>
                <div>
                  <label className="block font-medium text-[#4B5E52] mb-1">
                    Verification Status
                  </label>
                  <select
                    value={schemeForm.verificationStatus}
                    onChange={(e) =>
                      setSchemeForm({ ...schemeForm, verificationStatus: e.target.value })
                    }
                    className="w-full px-2.5 py-2 border border-[#D4DCD2] rounded-lg bg-white"
                  >
                    <option value="Verified">Verified</option>
                    <option value="Requires Verification">Requires Verification</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block font-medium text-[#4B5E52] mb-1">Scheme Name</label>
                <input
                  type="text"
                  required
                  value={schemeForm.schemeName}
                  onChange={(e) => setSchemeForm({ ...schemeForm, schemeName: e.target.value })}
                  className="w-full px-2.5 py-2 border border-[#D4DCD2] rounded-lg"
                />
              </div>

              <div>
                <label className="block font-medium text-[#4B5E52] mb-1">Purpose & Benefits</label>
                <textarea
                  rows={2}
                  required
                  value={schemeForm.purpose}
                  onChange={(e) =>
                    setSchemeForm({
                      ...schemeForm,
                      purpose: e.target.value,
                      benefits: schemeForm.benefits || e.target.value,
                    })
                  }
                  className="w-full px-2.5 py-2 border border-[#D4DCD2] rounded-lg"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium text-[#4B5E52] mb-1">
                    Official Portal Link
                  </label>
                  <input
                    type="text"
                    required
                    value={schemeForm.officialPortal}
                    onChange={(e) =>
                      setSchemeForm({ ...schemeForm, officialPortal: e.target.value })
                    }
                    className="w-full px-2.5 py-2 border border-[#D4DCD2] rounded-lg"
                  />
                </div>
                <div>
                  <label className="block font-medium text-[#4B5E52] mb-1">
                    Last Verification Date
                  </label>
                  <input
                    type="date"
                    required
                    value={schemeForm.lastVerifiedDate}
                    onChange={(e) =>
                      setSchemeForm({ ...schemeForm, lastVerifiedDate: e.target.value })
                    }
                    className="w-full px-2.5 py-2 font-mono-num border border-[#D4DCD2] rounded-lg"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium text-[#4B5E52] mb-1">Official Source</label>
                  <input
                    type="text"
                    required
                    value={schemeForm.officialSource}
                    onChange={(e) =>
                      setSchemeForm({ ...schemeForm, officialSource: e.target.value })
                    }
                    className="w-full px-2.5 py-2 border border-[#D4DCD2] rounded-lg"
                  />
                </div>
                <div>
                  <label className="block font-medium text-[#4B5E52] mb-1">
                    Official Source URL
                  </label>
                  <input
                    type="text"
                    required
                    value={schemeForm.officialSourceUrl}
                    onChange={(e) =>
                      setSchemeForm({ ...schemeForm, officialSourceUrl: e.target.value })
                    }
                    className="w-full px-2.5 py-2 border border-[#D4DCD2] rounded-lg"
                  />
                </div>
              </div>

              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={schemeForm.isOutdated}
                  onChange={(e) => setSchemeForm({ ...schemeForm, isOutdated: e.target.checked })}
                  className="accent-[#1B4332]"
                />
                <span>Mark scheme record as Outdated</span>
              </label>

              <div className="flex justify-end gap-2">
                <button
                  type="submit"
                  className="px-4 py-2 font-medium bg-[#1B4332] text-white rounded-lg"
                >
                  {schemeForm.id ? 'Update Scheme Record' : 'Save Scheme Record'}
                </button>
              </div>
            </form>

            <div className="pt-4 border-t border-[#E8ECE6] space-y-2 max-h-60 overflow-y-auto">
              <p className="text-xs font-semibold text-[#14241B]">
                Current Scheme Records (Click Edit to update verification date/source):
              </p>
              {data.schemes.map((s) => (
                <div
                  key={s.id}
                  className="flex items-center justify-between gap-2 text-xs py-1.5 border-b border-[#EEF1EC]"
                >
                  <span className="truncate">
                    {s.schemeCode} · {s.verificationStatus} ({s.lastVerifiedDate})
                  </span>
                  <button
                    type="button"
                    onClick={() => loadSchemeForEdit(s)}
                    className="text-[#1B4332] font-medium hover:underline shrink-0"
                  >
                    Edit
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
