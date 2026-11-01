import React, { useEffect, useRef, useState } from 'react';
import {
  Mic,
  MicOff,
  PhoneCall,
  PhoneOff,
  Volume2,
  Send,
  UserCog,
  BookOpen,
  Landmark,
  Sprout,
  AlertTriangle,
  Bookmark,
  ExternalLink,
  Plus,
  Trash2,
} from 'lucide-react';
import { useAgriSetu } from '../context/AgriSetuContext.tsx';
import { FarmerProfileModal } from './FarmerProfileModal.tsx';
import type {
  BootstrapData,
  CropSuitabilityResult,
  SchemeRecord,
} from '../types/agrisetu.ts';

type AssistantSubView = 'call' | 'suitability' | 'schemes' | 'knowledge';

const SAMPLE_QUESTIONS = [
  {
    labelTe: 'నా నేలకు ఏ పంట అనుకూలం?',
    textTe: 'మా పొలం నేల మరియు నీటి వసతికి రబీలో ఏ పంట వేస్తే అనుకూలంగా ఉంటుంది?',
    textEn: 'Which crop is suitable for my soil and irrigation in the upcoming season?',
  },
  {
    labelTe: 'ఆకులు పసుపు రంగులోకి మారుతున్నాయి',
    textTe: 'మా చేనులో మొక్కల కింది ఆకులు పసుపు రంగులోకి మారుతున్నాయి, కారణం ఏమిటి? ఏమి గమనించాలి?',
    textEn: 'Why are the lower leaves of my crop turning yellow, and what should I check before applying fertiliser?',
  },
  {
    labelTe: 'ప్రభుత్వ పథకాలు (PM-KISAN / బీమా)',
    textTe: 'నా ప్రాంతానికి వర్తించే PM-KISAN మరియు పంటల బీమా పథకాల అర్హత, పత్రాలు చెప్పండి.',
    textEn: 'What government schemes like PM-KISAN or crop insurance apply to my region and what documents are needed?',
  },
  {
    labelTe: 'కోత తర్వాత నిల్వ & కొనుగోలుదారులు',
    textTe: 'కోత తర్వాత పంటను తేమ లేకుండా ఎలా నిల్వ చేయాలి మరియు కొనుగోలుదారులను ఎక్కడ కనుగొనాలి?',
    textEn: 'How can I safely store harvested produce and find suitable buyers?',
  },
];

const KNOWLEDGE_CATEGORIES = [
  'All',
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

export const AssistantTab: React.FC = () => {
  const {
    data,
    selectedFarmerId,
    setSelectedFarmerId,
    activeConversationId,
    setActiveConversationId,
    pendingAssistantPrompt,
    setPendingAssistantPrompt,
    setActiveTab,
    apiFetch,
    updateBootstrapState,
    pushToast,
  } = useAgriSetu();

  const [subView, setSubView] = useState<AssistantSubView>('call');
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [vocabPanelOpen, setVocabPanelOpen] = useState(false);

  // Voice & Call states
  const [inCallSession, setInCallSession] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [callStatusText, setCallStatusText] = useState('Ready for Voice or Text');
  const [liveTranscript, setLiveTranscript] = useState('');
  const [textInput, setTextInput] = useState('');
  const [responseLang, setResponseLang] = useState<'te' | 'en'>('te');
  const [dialectOverride, setDialectOverride] = useState<string>('kakinada_coastal');
  const [sendingChat, setSendingChat] = useState(false);
  const [speakingAudio, setSpeakingAudio] = useState(false);
  const [autoSpeakReplies, setAutoSpeakReplies] = useState(true);
  const [lastFollowUps, setLastFollowUps] = useState<string[]>([]);
  const [ephemeralTurn, setEphemeralTurn] = useState<{
    question: string;
    replyText: string;
    citations: Array<{
      type: string;
      title: string;
      source: string;
      verifiedStatus: string;
      lastVerifiedDate?: string;
    }>;
    confidenceNote: string;
    escalated: boolean;
    transcribedFromVoice: boolean;
  } | null>(null);

  // Vocabulary editor state
  const [newVocabTerm, setNewVocabTerm] = useState('');
  const [newVocabMeaning, setNewVocabMeaning] = useState('');

  // Crop suitability state
  const [suitabilityResult, setSuitabilityResult] = useState<CropSuitabilityResult | null>(null);
  const [loadingSuitability, setLoadingSuitability] = useState(false);

  // Scheme modal state
  const [selectedScheme, setSelectedScheme] = useState<SchemeRecord | null>(null);

  // Knowledge filter
  const [knowledgeCategory, setKnowledgeCategory] = useState('All');
  const [knowledgeSearch, setKnowledgeSearch] = useState('');

  // Audio & Recording refs
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const speechRecRef = useRef<any>(null);
  const audioPlayerRef = useRef<HTMLAudioElement | null>(null);

  const farmers = data?.farmers || [];
  const activeFarmer = farmers.find((f) => f.id === selectedFarmerId) || farmers[0];
  const demoFarmerOptions = data?.demoPersonas?.farmers || farmers;

  useEffect(() => {
    if (activeFarmer) {
      setDialectOverride(activeFarmer.dialectProfile || 'kakinada_coastal');
      setResponseLang(activeFarmer.preferredLanguage === 'en' ? 'en' : 'te');
      setEphemeralTurn(null);
    }
  }, [activeFarmer?.id]);

  // Select most recent conversation for farmer if none active
  const farmerConversations = (data?.conversations || []).filter(
    (c) => c.farmerId === activeFarmer?.id
  );
  const currentConversation =
    farmerConversations.find((c) => c.id === activeConversationId) ||
    farmerConversations[0] ||
    null;

  useEffect(() => {
    if (pendingAssistantPrompt) {
      setSubView('call');
      setTextInput(pendingAssistantPrompt);
      setPendingAssistantPrompt(null);
    }
  }, [pendingAssistantPrompt, setPendingAssistantPrompt]);

  const stopAudioPlayback = () => {
    if (audioPlayerRef.current) {
      audioPlayerRef.current.pause();
      audioPlayerRef.current = null;
    }
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    setSpeakingAudio(false);
  };

  const speakResponseText = async (text: string, lang: 'te' | 'en') => {
    stopAudioPlayback();
    try {
      setSpeakingAudio(true);
      if (data?.aiRuntime.aiConfigured) {
        const ttsRes = await apiFetch<{
          audioBase64: string | null;
          mimeType: string;
          demoFallback: boolean;
        }>('/api/ai/tts', {
          method: 'POST',
          body: JSON.stringify({ text, language: lang }),
        });

        if (ttsRes.audioBase64) {
          const audio = new Audio(`data:${ttsRes.mimeType};base64,${ttsRes.audioBase64}`);
          audioPlayerRef.current = audio;
          audio.onended = () => setSpeakingAudio(false);
          audio.onerror = () => setSpeakingAudio(false);
          await audio.play();
          return;
        }
      }

      // Browser Web Speech Synthesis fallback when server TTS is in demo mode
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = lang === 'te' ? 'te-IN' : 'en-IN';
        utterance.rate = 0.95;
        utterance.onend = () => setSpeakingAudio(false);
        utterance.onerror = () => setSpeakingAudio(false);
        window.speechSynthesis.speak(utterance);
      } else {
        setSpeakingAudio(false);
      }
    } catch {
      setSpeakingAudio(false);
    }
  };

  const submitQuestionToAssistant = async (
    questionText: string,
    fromVoice: boolean
  ) => {
    if (!activeFarmer || !questionText.trim()) return;
    setSendingChat(true);
    setCallStatusText('Consulting Agricultural Knowledge Base...');
    try {
      const response = await apiFetch<{
        conversationId: number;
        persisted?: boolean;
        turn: {
          replyText: string;
          followUpQuestions: string[];
          shouldEscalate: boolean;
          citations?: Array<{
            type: string;
            title: string;
            source: string;
            verifiedStatus: string;
            lastVerifiedDate?: string;
          }>;
          confidenceNote?: string;
        };
        state: BootstrapData;
      }>('/api/ai/chat', {
        method: 'POST',
        body: JSON.stringify({
          farmerId: activeFarmer.id,
          conversationId: activeFarmer.consent?.saveConversationHistory
            ? currentConversation?.id || null
            : null,
          question: questionText.trim(),
          responseLanguage: responseLang,
          transcribedFromVoice: fromVoice,
          dialectOverride,
        }),
      });

      updateBootstrapState(response.state);
      if (response.persisted !== false && response.conversationId > 0) {
        setEphemeralTurn(null);
        setActiveConversationId(response.conversationId);
      } else {
        setActiveConversationId(null);
        setEphemeralTurn({
          question: questionText.trim(),
          replyText: response.turn.replyText,
          citations: response.turn.citations || [],
          confidenceNote: response.turn.confidenceNote || '',
          escalated: Boolean(response.turn.shouldEscalate),
          transcribedFromVoice: fromVoice,
        });
      }
      setLastFollowUps(response.turn.followUpQuestions || []);
      setTextInput('');
      setLiveTranscript('');
      setCallStatusText(
        response.turn.shouldEscalate
          ? 'Response Ready · Safety Escalation Triggered'
          : 'Response Ready'
      );

      if (autoSpeakReplies) {
        await speakResponseText(response.turn.replyText, responseLang);
      }
    } catch (err: any) {
      setCallStatusText('Unable to complete request');
      pushToast('error', err.message || 'Failed to generate agricultural response.');
    } finally {
      setSendingChat(false);
    }
  };

  const handleDeleteCurrentConversation = async () => {
    if (!currentConversation) return;
    try {
      const nextState = await apiFetch<BootstrapData>(
        `/api/conversations/${currentConversation.id}`,
        { method: 'DELETE' }
      );
      updateBootstrapState(nextState);
      setActiveConversationId(null);
      pushToast('success', 'Deleted saved conversation thread.');
    } catch (err: any) {
      pushToast('error', err.message || 'Failed to delete conversation.');
    }
  };

  const startVoiceCapture = async () => {
    stopAudioPlayback();
    setInCallSession(true);
    setLiveTranscript('');

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      pushToast(
        'error',
        'Microphone access is not supported in this browser context. Please use the text input below.'
      );
      setCallStatusText('Microphone unavailable — Text mode active');
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioChunksRef.current = [];
      const mimeType = MediaRecorder.isTypeSupported('audio/webm')
        ? 'audio/webm'
        : MediaRecorder.isTypeSupported('audio/mp4')
          ? 'audio/mp4'
          : '';

      const recorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      // Optional live interim captioning via browser SpeechRecognition if available
      const SpeechRecognitionCtor =
        (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      let browserTranscript = '';
      if (SpeechRecognitionCtor) {
        try {
          const rec = new SpeechRecognitionCtor();
          rec.lang = responseLang === 'te' ? 'te-IN' : 'en-IN';
          rec.interimResults = true;
          rec.continuous = true;
          rec.onresult = (ev: any) => {
            let interim = '';
            for (let i = 0; i < ev.results.length; i++) {
              interim += ev.results[i][0].transcript + ' ';
            }
            browserTranscript = interim.trim();
            setLiveTranscript(browserTranscript);
          };
          rec.start();
          speechRecRef.current = rec;
        } catch {
          // Ignore browser speech recognition errors; server Gemini STT handles audio
        }
      }

      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        if (speechRecRef.current) {
          try {
            speechRecRef.current.stop();
          } catch {
            // ignore
          }
          speechRecRef.current = null;
        }

        const audioBlob = new Blob(audioChunksRef.current, {
          type: recorder.mimeType || 'audio/webm',
        });

        if (audioBlob.size < 400) {
          setCallStatusText('No speech detected — tap microphone to speak again');
          return;
        }

        if (data?.aiRuntime.aiConfigured) {
          setCallStatusText('Transcribing regional Telugu speech...');
          try {
            const base64 = await new Promise<string>((resolve, reject) => {
              const reader = new FileReader();
              reader.onloadend = () => {
                const resStr = String(reader.result || '');
                resolve(resStr.split(',')[1] || '');
              };
              reader.onerror = reject;
              reader.readAsDataURL(audioBlob);
            });

            const sttRes = await apiFetch<{ transcript: string }>('/api/ai/transcribe', {
              method: 'POST',
              body: JSON.stringify({
                audioBase64: base64,
                mimeType: recorder.mimeType || 'audio/webm',
                dialectProfile: dialectOverride,
                farmerId: activeFarmer?.id,
              }),
            });

            const finalSpoken = sttRes.transcript || browserTranscript;
            if (finalSpoken.trim()) {
              setLiveTranscript(finalSpoken);
              await submitQuestionToAssistant(finalSpoken, true);
            } else {
              setCallStatusText('Could not recognize clear speech — please try again or type below');
            }
            return;
          } catch (sttErr: any) {
            if (browserTranscript.trim()) {
              await submitQuestionToAssistant(browserTranscript, true);
              return;
            }
            pushToast('error', sttErr.message || 'Server speech transcription unavailable.');
          }
        } else if (browserTranscript.trim()) {
          await submitQuestionToAssistant(browserTranscript, true);
        } else {
          setCallStatusText(
            'Demo Mode: Select a sample question or use text input below'
          );
          pushToast(
            'info',
            'Demo Mode active: Please use browser speech recognition, a sample prompt, or text input below.'
          );
        }
      };

      recorder.start();
      setIsRecording(true);
      setCallStatusText(
        responseLang === 'te'
          ? 'వింటున్నాను... మాట్లాడిన తర్వాత "Stop & Send" నొక్కండి (Listening...)'
          : 'Listening... Tap "Stop & Send" when finished speaking'
      );
    } catch (permErr: any) {
      setIsRecording(false);
      setCallStatusText('Microphone permission declined — Text fallback ready');
      pushToast(
        'info',
        'Microphone permission was not granted. You can continue using text input or sample Telugu prompts.'
      );
    }
  };

  const stopVoiceCapture = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    setIsRecording(false);
  };

  const endCallConversation = () => {
    stopVoiceCapture();
    stopAudioPlayback();
    setInCallSession(false);
    setLiveTranscript('');
    setCallStatusText('Call Ended');
  };

  // Load Crop Suitability when opening suitability subview
  const runSuitabilityEvaluation = async () => {
    if (!activeFarmer) return;
    setLoadingSuitability(true);
    try {
      const res = await apiFetch<CropSuitabilityResult>(
        `/api/farmers/${activeFarmer.id}/crop-suitability`,
        {
          method: 'POST',
          body: JSON.stringify({}),
        }
      );
      setSuitabilityResult(res);
    } catch (err: any) {
      pushToast('error', err.message || 'Failed to evaluate crop suitability.');
    } finally {
      setLoadingSuitability(false);
    }
  };

  useEffect(() => {
    if (subView === 'suitability' && activeFarmer) {
      runSuitabilityEvaluation();
    }
  }, [subView, activeFarmer?.id]);

  if (!activeFarmer) {
    return (
      <div className="p-8 text-center text-sm text-[#4B5E52]">
        Loading farmer profiles...
      </div>
    );
  }

  let customVocab: Array<{ term: string; meaning: string }> = [];
  try {
    customVocab = JSON.parse(activeFarmer.customVocabularyJson || '[]');
  } catch {
    customVocab = [];
  }

  let savedKnowledgeIds: number[] = [];
  try {
    savedKnowledgeIds = JSON.parse(activeFarmer.savedKnowledgeIds || '[]');
  } catch {
    savedKnowledgeIds = [];
  }

  const handleAddVocabulary = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newVocabTerm.trim() || !newVocabMeaning.trim()) return;
    const updated = [
      ...customVocab,
      { term: newVocabTerm.trim(), meaning: newVocabMeaning.trim() },
    ];
    try {
      const nextState = await apiFetch<BootstrapData>(
        `/api/farmers/${activeFarmer.id}/vocabulary`,
        {
          method: 'PUT',
          body: JSON.stringify({ vocabulary: updated }),
        }
      );
      updateBootstrapState(nextState);
      setNewVocabTerm('');
      setNewVocabMeaning('');
      pushToast('success', 'Added phrase to regional Telugu dictionary.');
    } catch (err: any) {
      pushToast('error', err.message || 'Failed to save vocabulary.');
    }
  };

  const handleRemoveVocabulary = async (idx: number) => {
    const updated = customVocab.filter((_, i) => i !== idx);
    try {
      const nextState = await apiFetch<BootstrapData>(
        `/api/farmers/${activeFarmer.id}/vocabulary`,
        {
          method: 'PUT',
          body: JSON.stringify({ vocabulary: updated }),
        }
      );
      updateBootstrapState(nextState);
    } catch (err: any) {
      pushToast('error', err.message || 'Failed to update dictionary.');
    }
  };

  const handleToggleBookmarkKnowledge = async (knowledgeId: number) => {
    try {
      const res = await apiFetch<{ savedKnowledgeIds: number[] }>(
        `/api/farmers/${activeFarmer.id}/toggle-knowledge`,
        {
          method: 'POST',
          body: JSON.stringify({ knowledgeId }),
        }
      );
      const updatedFarmers = farmers.map((f) =>
        f.id === activeFarmer.id
          ? { ...f, savedKnowledgeIds: JSON.stringify(res.savedKnowledgeIds) }
          : f
      );
      updateBootstrapState({ farmers: updatedFarmers });
      pushToast('success', 'Updated saved agricultural guidance in My Farm.');
    } catch (err: any) {
      pushToast('error', err.message || 'Failed to bookmark item.');
    }
  };

  const handleRequestCropExpertReview = async () => {
    try {
      const nextState = await apiFetch<BootstrapData>('/api/escalations', {
        method: 'POST',
        body: JSON.stringify({
          farmerId: activeFarmer.id,
          questionText: `Expert review requested for Soil-to-Crop Suitability report (${activeFarmer.latestSoil?.soilType}, ${activeFarmer.farmDetails?.irrigationType}, after ${activeFarmer.previousCrop}).`,
          category: 'Crop Suitability Review',
          conversationContext: activeFarmer.consent?.shareConversationWithExperts
            ? `${activeFarmer.name} (${activeFarmer.farmerCode}), ${activeFarmer.village}, ${activeFarmer.district}, ${activeFarmer.farmDetails?.farmAreaAcres} acres.`
            : 'Farmer withheld detailed profile context.',
          escalationReason:
            'Farmer requested certified agronomist validation of rule-based seasonal crop shortlist.',
        }),
      });
      updateBootstrapState(nextState);
      pushToast('success', 'Sent crop suitability shortlist to Agricultural Expert queue.');
    } catch (err: any) {
      pushToast('error', err.message || 'Failed to request expert review.');
    }
  };

  const filteredKnowledge = (data?.knowledge || []).filter((k) => {
    const catMatch = knowledgeCategory === 'All' || k.category === knowledgeCategory;
    const q = knowledgeSearch.trim().toLowerCase();
    const searchMatch =
      !q ||
      k.title.toLowerCase().includes(q) ||
      (k.titleTe || '').toLowerCase().includes(q) ||
      k.summary.toLowerCase().includes(q) ||
      (k.applicableCrops || '').toLowerCase().includes(q);
    return catMatch && searchMatch;
  });

  return (
    <div className="space-y-6">
      {/* Section A: Farmer Profile Selection & Context Bar */}
      <section className="bg-white border border-[#E3E7E1] rounded-xl p-5">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 pb-4 border-b border-[#E8ECE6]">
          <div>
            <p className="text-xs text-[#4B5E52]">
              {activeFarmer.isDemo
                ? 'Demonstration Farmer Profiles · Fictional Pilot Records · Editable'
                : 'Authenticated Farmer Profile · Consent-Protected Personal Record'}
            </p>
            <h2 className="text-lg font-semibold text-[#14241B] mt-0.5">
              {activeFarmer.isDemo
                ? 'Select Farmer Profile for Personalized Guidance'
                : `Farmer Profile — ${activeFarmer.name}`}
            </h2>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {activeFarmer.isDemo && (
              <div className="flex items-center gap-1 p-1 bg-[#F1F4EF] rounded-lg">
                {demoFarmerOptions.map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => {
                      setSelectedFarmerId(f.id);
                      setActiveConversationId(null);
                    }}
                    className={`px-3.5 py-2 text-sm font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                      f.id === activeFarmer.id
                        ? 'bg-[#1B4332] text-white'
                        : 'text-[#374B3E] hover:text-[#14241B]'
                    }`}
                  >
                    {f.name} · {f.region} (Demo)
                  </button>
                ))}
              </div>
            )}

            <button
              type="button"
              onClick={() => setEditModalOpen(true)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-sm font-medium border border-[#CFD8CE] text-[#14241B] rounded-lg hover:bg-[#F3F5F1] transition-colors whitespace-nowrap shrink-0"
            >
              <UserCog className="w-4 h-4 text-[#1B4332]" />
              <span>Edit Profile & Consent</span>
            </button>
          </div>
        </div>

        {/* Clean Unboxed Metadata Grid */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 pt-4 text-sm">
          <div>
            <p className="text-xs text-[#5A6D60]">Farmer & Village</p>
            <p className="font-medium text-[#14241B] mt-0.5">
              {activeFarmer.name} ({activeFarmer.nameTe})
            </p>
            <p className="text-xs text-[#4B5E52]">
              {activeFarmer.village}, {activeFarmer.district}
            </p>
          </div>
          <div>
            <p className="text-xs text-[#5A6D60]">Farm Area</p>
            <p className="font-medium font-mono-num text-[#14241B] mt-0.5">
              {activeFarmer.farmDetails?.farmAreaAcres || '—'} Acres
            </p>
            <p className="text-xs text-[#4B5E52]">Demo Farm Record</p>
          </div>
          <div>
            <p className="text-xs text-[#5A6D60]">Soil Type</p>
            <p className="font-medium text-[#14241B] mt-0.5">
              {activeFarmer.latestSoil?.soilType || 'Not set'}
            </p>
            <p className="text-xs text-[#4B5E52] font-mono-num">
              pH {activeFarmer.latestSoil?.phLevel || 'N/A'} ·{' '}
              {activeFarmer.latestSoil?.isVerifiedLabTest ? 'Lab Verified' : 'Self-reported'}
            </p>
          </div>
          <div>
            <p className="text-xs text-[#5A6D60]">Irrigation</p>
            <p className="font-medium text-[#14241B] mt-0.5">
              {activeFarmer.farmDetails?.irrigationType || 'Canal'}
            </p>
            <p className="text-xs text-[#4B5E52] line-clamp-1">
              {activeFarmer.farmDetails?.waterAvailability}
            </p>
          </div>
          <div>
            <p className="text-xs text-[#5A6D60]">Current & Previous Crop</p>
            <p className="font-medium text-[#14241B] mt-0.5 line-clamp-1">
              {activeFarmer.currentCrop}
            </p>
            <p className="text-xs text-[#4B5E52] line-clamp-1">
              Prev: {activeFarmer.previousCrop}
            </p>
          </div>
          <div>
            <p className="text-xs text-[#5A6D60]">Language & Speech</p>
            <p className="font-medium text-[#14241B] mt-0.5">
              {activeFarmer.preferredLanguage === 'te' ? 'Telugu (తెలుగు)' : 'English'}
            </p>
            <p className="text-xs text-[#4B5E52]">
              {activeFarmer.dialectProfile === 'godavari_delta'
                ? 'Godavari Telugu'
                : 'Kakinada Coastal Telugu'}
            </p>
          </div>
        </div>
      </section>

      {/* Sub-module Segmented Navigation */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1 p-1 bg-[#EFF2ED] rounded-lg">
          <button
            type="button"
            onClick={() => setSubView('call')}
            className={`inline-flex items-center gap-2 px-3.5 py-2 text-sm font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
              subView === 'call'
                ? 'bg-white text-[#14241B] shadow-xs'
                : 'text-[#4B5E52] hover:text-[#14241B]'
            }`}
          >
            <PhoneCall className="w-4 h-4 text-[#1B4332]" />
            <span>Speak on Call & Chat</span>
          </button>
          <button
            type="button"
            onClick={() => setSubView('suitability')}
            className={`inline-flex items-center gap-2 px-3.5 py-2 text-sm font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
              subView === 'suitability'
                ? 'bg-white text-[#14241B] shadow-xs'
                : 'text-[#4B5E52] hover:text-[#14241B]'
            }`}
          >
            <Sprout className="w-4 h-4 text-[#1B4332]" />
            <span>Soil-to-Crop Suitability</span>
          </button>
          <button
            type="button"
            onClick={() => setSubView('schemes')}
            className={`inline-flex items-center gap-2 px-3.5 py-2 text-sm font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
              subView === 'schemes'
                ? 'bg-white text-[#14241B] shadow-xs'
                : 'text-[#4B5E52] hover:text-[#14241B]'
            }`}
          >
            <Landmark className="w-4 h-4 text-[#1B4332]" />
            <span>Government Schemes ({data?.schemes.length || 0})</span>
          </button>
          <button
            type="button"
            onClick={() => setSubView('knowledge')}
            className={`inline-flex items-center gap-2 px-3.5 py-2 text-sm font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
              subView === 'knowledge'
                ? 'bg-white text-[#14241B] shadow-xs'
                : 'text-[#4B5E52] hover:text-[#14241B]'
            }`}
          >
            <BookOpen className="w-4 h-4 text-[#1B4332]" />
            <span>Agricultural Knowledge Base ({data?.knowledge.length || 0})</span>
          </button>
        </div>

        {data?.aiRuntime.isDemoMode && (
          <p className="text-xs text-[#4B5E52]">Demo Mode Active</p>
        )}
      </div>

      {/* SUBVIEW 1: SPEAK ON CALL & CONVERSATION */}
      {subView === 'call' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Left Column: Phone-Call Voice Interface & Dialect Configuration */}
          <div className="lg:col-span-5 bg-white border border-[#E3E7E1] rounded-xl p-6 space-y-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs text-[#4B5E52]">
                  Voice-First Agricultural Support ·{' '}
                  {activeFarmer.consent?.shareProfileWithAi
                    ? 'Consented Profile Active'
                    : 'Profile Sharing Paused'}
                </p>
                <h3 className="text-lg font-semibold text-[#14241B] mt-0.5">
                  Speak on Call ({activeFarmer.name})
                </h3>
              </div>
              {inCallSession && (
                <button
                  type="button"
                  onClick={endCallConversation}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-[#B91C1C] text-white rounded-lg hover:bg-[#991B1B] whitespace-nowrap shrink-0"
                >
                  <PhoneOff className="w-3.5 h-3.5" />
                  <span>End Conversation</span>
                </button>
              )}
            </div>

            {/* Regional Speech & Response Language Controls */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-[#E8ECE6]">
              <div>
                <label className="block text-xs font-medium text-[#4B5E52] mb-1">
                  Regional Telugu Speech Profile
                </label>
                <select
                  value={dialectOverride}
                  onChange={(e) => setDialectOverride(e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-[#D4DCD2] rounded-lg bg-white focus:outline-none focus:border-[#1B4332]"
                >
                  <option value="kakinada_coastal">Kakinada coastal Telugu</option>
                  <option value="godavari_delta">Godavari regional Telugu</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-[#4B5E52] mb-1">
                  Response Language
                </label>
                <select
                  value={responseLang}
                  onChange={(e) => setResponseLang(e.target.value as 'te' | 'en')}
                  className="w-full px-3 py-2 text-xs border border-[#D4DCD2] rounded-lg bg-white focus:outline-none focus:border-[#1B4332]"
                >
                  <option value="te">Telugu (తెలుగు వాయిస్ & టెక్స్ట్)</option>
                  <option value="en">English</option>
                </select>
              </div>
            </div>

            {/* Call Centerpiece */}
            <div className="py-5 px-4 bg-[#F6F8F5] rounded-xl text-center space-y-4">
              <p className="text-xs font-medium text-[#2D6A4F]">{callStatusText}</p>

              <div className="flex justify-center">
                {!isRecording ? (
                  <button
                    type="button"
                    disabled={sendingChat}
                    onClick={startVoiceCapture}
                    className="w-24 h-24 rounded-full bg-[#1B4332] hover:bg-[#143326] disabled:opacity-50 text-white flex flex-col items-center justify-center gap-1.5 transition-transform active:scale-95 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#1B4332]"
                    aria-label="Speak on Call"
                  >
                    <Mic className="w-8 h-8" />
                    <span className="text-xs font-medium">Speak on Call</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={stopVoiceCapture}
                    className="w-24 h-24 rounded-full bg-[#B91C1C] hover:bg-[#991B1B] text-white flex flex-col items-center justify-center gap-1.5 transition-transform active:scale-95"
                    aria-label="Stop and send speech"
                  >
                    <MicOff className="w-8 h-8" />
                    <span className="text-xs font-medium">Stop & Send</span>
                  </button>
                )}
              </div>

              {liveTranscript && (
                <div className="text-left bg-white border border-[#E3E7E1] rounded-lg p-3">
                  <p className="text-[11px] text-[#5A6D60]">Recognized Transcription:</p>
                  <p className="text-sm text-[#14241B] mt-0.5">{liveTranscript}</p>
                </div>
              )}

              <div className="flex flex-wrap items-center justify-center gap-4 text-xs text-[#4B5E52]">
                <label className="inline-flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={autoSpeakReplies}
                    onChange={(e) => setAutoSpeakReplies(e.target.checked)}
                    className="accent-[#1B4332]"
                  />
                  <span>Read AI response aloud (Telugu TTS)</span>
                </label>

                {speakingAudio && (
                  <button
                    type="button"
                    onClick={stopAudioPlayback}
                    className="text-[#B91C1C] font-medium hover:underline"
                  >
                    Stop Audio Playback
                  </button>
                )}
              </div>
            </div>

            {/* Honest Dialect Notice & Configurable Phrase Dictionary */}
            <div className="pt-3 border-t border-[#E8ECE6] space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-[#14241B]">
                  Regional Vocabulary Dictionary ({customVocab.length} terms)
                </span>
                <button
                  type="button"
                  onClick={() => setVocabPanelOpen(!vocabPanelOpen)}
                  className="text-xs font-medium text-[#1B4332] hover:underline whitespace-nowrap shrink-0"
                >
                  {vocabPanelOpen ? 'Hide Dictionary' : 'Configure Terms'}
                </button>
              </div>
              <p className="text-xs text-[#5A6D60]">
                Note: Regional dialect recognition relies on configured speech hints and has not yet been field-validated across all local speaker recordings. Expand local phrases below.
              </p>

              {vocabPanelOpen && (
                <div className="pt-2 space-y-3">
                  <div className="space-y-1.5 max-h-40 overflow-y-auto">
                    {customVocab.map((item, idx) => (
                      <div
                        key={`${item.term}-${idx}`}
                        className="flex items-center justify-between gap-2 text-xs py-1.5 border-b border-[#EEF1EC]"
                      >
                        <div>
                          <span className="font-semibold text-[#14241B]">{item.term}</span>
                          <span className="text-[#5A6D60]"> — {item.meaning}</span>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleRemoveVocabulary(idx)}
                          className="p-1 text-[#5A6D60] hover:text-[#B91C1C]"
                          aria-label={`Remove ${item.term}`}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                  <form onSubmit={handleAddVocabulary} className="grid grid-cols-1 sm:grid-cols-5 gap-2">
                    <input
                      type="text"
                      placeholder="Telugu word (e.g. బోదె)"
                      value={newVocabTerm}
                      onChange={(e) => setNewVocabTerm(e.target.value)}
                      className="sm:col-span-2 px-2.5 py-1.5 text-xs border border-[#D4DCD2] rounded-lg"
                    />
                    <input
                      type="text"
                      placeholder="Agricultural meaning"
                      value={newVocabMeaning}
                      onChange={(e) => setNewVocabMeaning(e.target.value)}
                      className="sm:col-span-2 px-2.5 py-1.5 text-xs border border-[#D4DCD2] rounded-lg"
                    />
                    <button
                      type="submit"
                      className="inline-flex items-center justify-center gap-1 px-2.5 py-1.5 text-xs font-medium bg-[#1B4332] text-white rounded-lg hover:bg-[#143326]"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Add</span>
                    </button>
                  </form>
                </div>
              )}
            </div>

            {/* Quick Sample Questions */}
            <div className="pt-3 border-t border-[#E8ECE6] space-y-2">
              <p className="text-xs font-medium text-[#4B5E52]">
                Quick Agricultural Questions (Click to Ask):
              </p>
              <div className="grid grid-cols-1 gap-2">
                {SAMPLE_QUESTIONS.map((sq, i) => (
                  <button
                    key={i}
                    type="button"
                    disabled={sendingChat}
                    onClick={() =>
                      submitQuestionToAssistant(
                        responseLang === 'te' ? sq.textTe : sq.textEn,
                        false
                      )
                    }
                    className="text-left px-3 py-2 text-xs bg-[#F6F8F5] hover:bg-[#EBF0E9] text-[#14241B] rounded-lg transition-colors"
                  >
                    {responseLang === 'te' ? sq.labelTe : sq.textEn}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Right Column: Live Conversation Transcript, Citations, Audio Replay & History */}
          <div className="lg:col-span-7 bg-white border border-[#E3E7E1] rounded-xl p-6 flex flex-col min-h-[560px]">
            <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-[#E8ECE6]">
              <div>
                <p className="text-xs text-[#4B5E52]">
                  Conversation History · {farmerConversations.length} Saved Thread(s) ·{' '}
                  {activeFarmer.consent?.saveConversationHistory
                    ? 'History Saving Enabled'
                    : 'Ephemeral Mode (History Not Stored)'}
                </p>
                <h3 className="text-base font-semibold text-[#14241B]">
                  {ephemeralTurn
                    ? 'Ephemeral Agricultural Session (Not Stored)'
                    : currentConversation
                      ? currentConversation.title
                      : 'Start a New Agricultural Conversation'}
                </h3>
              </div>

              <div className="flex items-center gap-2">
                {farmerConversations.length > 0 && (
                  <select
                    value={currentConversation?.id || ''}
                    onChange={(e) => {
                      setEphemeralTurn(null);
                      setActiveConversationId(e.target.value ? Number(e.target.value) : null);
                    }}
                    className="px-2.5 py-1.5 text-xs border border-[#D4DCD2] rounded-lg bg-white max-w-[210px] truncate"
                  >
                    {farmerConversations.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.title} ({c.status})
                      </option>
                    ))}
                  </select>
                )}
                {currentConversation && !ephemeralTurn && (
                  <button
                    type="button"
                    onClick={handleDeleteCurrentConversation}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium border border-[#FECACA] text-[#B91C1C] rounded-lg hover:bg-[#FEF2F2] whitespace-nowrap shrink-0"
                    title="Delete this saved conversation"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Delete</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    setEphemeralTurn(null);
                    setActiveConversationId(null);
                  }}
                  className="px-3 py-1.5 text-xs font-medium border border-[#CFD8CE] text-[#14241B] rounded-lg hover:bg-[#F3F5F1] whitespace-nowrap shrink-0"
                >
                  New Chat
                </button>
              </div>
            </div>

            {/* Messages Stream */}
            <div className="flex-1 py-4 space-y-4 overflow-y-auto max-h-[420px]">
              {ephemeralTurn ? (
                <>
                  <div className="flex flex-col items-end">
                    <div className="max-w-[88%] rounded-xl px-4 py-3 text-sm bg-[#1B4332] text-white">
                      <div className="mb-1 text-[11px] opacity-80">
                        {activeFarmer.name}
                        {ephemeralTurn.transcribedFromVoice ? ' · Voice Call' : ''} · Ephemeral
                      </div>
                      <p className="whitespace-pre-line leading-relaxed">{ephemeralTurn.question}</p>
                    </div>
                  </div>
                  <div className="flex flex-col items-start">
                    <div className="max-w-[88%] rounded-xl px-4 py-3 text-sm bg-[#F4F7F3] text-[#14241B]">
                      <div className="flex items-center justify-between gap-4 mb-1 text-[11px] opacity-80">
                        <span>AGRISETU Advisor · Not Stored in Database</span>
                        <button
                          type="button"
                          onClick={() => speakResponseText(ephemeralTurn.replyText, responseLang)}
                          className="inline-flex items-center gap-1 font-medium text-[#1B4332] hover:underline"
                        >
                          <Volume2 className="w-3.5 h-3.5" />
                          <span>Listen</span>
                        </button>
                      </div>
                      <p className="whitespace-pre-line leading-relaxed">{ephemeralTurn.replyText}</p>
                      {ephemeralTurn.escalated && (
                        <div className="mt-2.5 pt-2 border-t border-[#D8E0D5] flex items-start gap-2 text-xs text-[#B45309]">
                          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                          <span>
                            High-risk or dosage-specific query detected — consult a certified agricultural officer before field action.
                          </span>
                        </div>
                      )}
                      {ephemeralTurn.citations.length > 0 && (
                        <div className="mt-2.5 pt-2 border-t border-[#DDE4DA] space-y-1 text-xs text-[#4B5E52]">
                          <p className="font-medium text-[#14241B]">Sources & Provenance:</p>
                          {ephemeralTurn.citations.map((cit, idx) => (
                            <p key={idx}>
                              {cit.title} · {cit.source}
                              {cit.lastVerifiedDate ? ` (Verified ${cit.lastVerifiedDate})` : ''}
                            </p>
                          ))}
                        </div>
                      )}
                      {ephemeralTurn.confidenceNote && (
                        <p className="mt-2 text-[11px] text-[#5A6D60]">
                          {ephemeralTurn.confidenceNote}
                        </p>
                      )}
                    </div>
                  </div>
                </>
              ) : !currentConversation || currentConversation.messages.length === 0 ? (
                <div className="py-12 text-center space-y-2">
                  <p className="text-sm font-medium text-[#14241B]">
                    నమస్కారం {activeFarmer.name} గారు — Ask any agricultural question by voice or text.
                  </p>
                  <p className="text-xs text-[#4B5E52] max-w-md mx-auto">
                    AGRISETU uses your consented soil, irrigation, and crop profile along with verified agricultural guidelines and government scheme records. Raw audio is never stored.
                  </p>
                </div>
              ) : (
                currentConversation.messages.map((msg) => {
                  let citations: Array<{
                    type: string;
                    title: string;
                    source: string;
                    verifiedStatus: string;
                    lastVerifiedDate?: string;
                  }> = [];
                  try {
                    citations = JSON.parse(msg.citationsJson || '[]');
                  } catch {
                    citations = [];
                  }

                  const isFarmer = msg.sender === 'farmer';
                  const isExpert = msg.sender === 'expert';

                  return (
                    <div
                      key={msg.id}
                      className={`flex flex-col ${isFarmer ? 'items-end' : 'items-start'}`}
                    >
                      <div
                        className={`max-w-[88%] rounded-xl px-4 py-3 text-sm ${
                          isFarmer
                            ? 'bg-[#1B4332] text-white'
                            : isExpert
                              ? 'bg-[#FEF3C7] text-[#14241B] border border-[#F59E0B]/40'
                              : 'bg-[#F4F7F3] text-[#14241B]'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-4 mb-1 text-[11px] opacity-80">
                          <span>
                            {isFarmer
                              ? `${activeFarmer.name}${msg.transcribedFromVoice ? ' · Voice Call' : ''}`
                              : isExpert
                                ? 'Human Agricultural Specialist'
                                : 'AGRISETU Advisor'}
                          </span>
                          {!isFarmer && (
                            <button
                              type="button"
                              onClick={() => speakResponseText(msg.messageText, responseLang)}
                              className="inline-flex items-center gap-1 font-medium text-[#1B4332] hover:underline"
                            >
                              <Volume2 className="w-3.5 h-3.5" />
                              <span>Listen</span>
                            </button>
                          )}
                        </div>

                        <p className="whitespace-pre-line leading-relaxed">{msg.messageText}</p>

                        {msg.escalated && (
                          <div className="mt-2.5 pt-2 border-t border-[#D8E0D5] flex items-start gap-2 text-xs text-[#B45309]">
                            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                            <span>
                              Escalated to Agricultural Expert Queue — High-risk or dosage-specific advice requires specialist verification.
                            </span>
                          </div>
                        )}

                        {citations.length > 0 && (
                          <div className="mt-2.5 pt-2 border-t border-[#DDE4DA] space-y-1 text-xs text-[#4B5E52]">
                            <p className="font-medium text-[#14241B]">Sources & Provenance:</p>
                            {citations.map((cit, idx) => (
                              <p key={idx}>
                                {cit.title} · {cit.source}
                                {cit.lastVerifiedDate ? ` (Verified ${cit.lastVerifiedDate})` : ''}
                              </p>
                            ))}
                          </div>
                        )}

                        {msg.confidenceNote && (
                          <p className="mt-2 text-[11px] text-[#5A6D60]">{msg.confidenceNote}</p>
                        )}
                      </div>
                    </div>
                  );
                })
              )}

              {sendingChat && (
                <div className="text-xs text-[#4B5E52] py-2">
                  Retrieving agricultural knowledge and generating response...
                </div>
              )}
            </div>

            {/* Suggested Follow-Up Chips */}
            {lastFollowUps.length > 0 && (
              <div className="py-2 border-t border-[#EEF1EC] flex flex-wrap items-center gap-2">
                <span className="text-xs text-[#5A6D60]">Clarify for better advice:</span>
                {lastFollowUps.map((fq, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => setTextInput(fq)}
                    className="text-xs text-[#1B4332] hover:underline text-left"
                  >
                    "{fq}"
                  </button>
                ))}
              </div>
            )}

            {/* Text Input Fallback */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                submitQuestionToAssistant(textInput, false);
              }}
              className="pt-3 border-t border-[#E8ECE6] flex items-center gap-2"
            >
              <input
                type="text"
                value={textInput}
                onChange={(e) => setTextInput(e.target.value)}
                placeholder={
                  responseLang === 'te'
                    ? 'మీ వ్యవసాయ ప్రశ్నను ఇక్కడ తెలుగు లేదా ఇంగ్లీష్‌లో టైప్ చేయండి...'
                    : 'Type your agricultural question in Telugu or English...'
                }
                className="flex-1 px-3.5 py-2.5 text-sm border border-[#D4DCD2] rounded-lg focus:outline-none focus:border-[#1B4332]"
              />
              <button
                type="submit"
                disabled={sendingChat || !textInput.trim()}
                className="inline-flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium bg-[#1B4332] text-white rounded-lg hover:bg-[#143326] disabled:opacity-50 transition-colors whitespace-nowrap shrink-0"
              >
                <Send className="w-4 h-4" />
                <span>Ask Advisor</span>
              </button>
            </form>
          </div>
        </div>
      )}

      {/* SUBVIEW 2: SOIL-TO-CROP SUITABILITY DECISION SUPPORT */}
      {subView === 'suitability' && (
        <div className="bg-white border border-[#E3E7E1] rounded-xl p-6 space-y-6">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 pb-4 border-b border-[#E8ECE6]">
            <div>
              <p className="text-xs text-[#4B5E52]">
                Transparent Rule-Based Agronomic Engine · Connected to Soil, Rotation & Market Demand
              </p>
              <h3 className="text-lg font-semibold text-[#14241B] mt-0.5">
                Soil-to-Crop Suitability Shortlist for {activeFarmer.name}
              </h3>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleRequestCropExpertReview}
                className="px-3.5 py-2 text-xs font-medium border border-[#CFD8CE] text-[#14241B] rounded-lg hover:bg-[#F3F5F1] whitespace-nowrap shrink-0"
              >
                Request Agricultural Expert Review
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('my_farm')}
                className="px-3.5 py-2 text-xs font-medium bg-[#1B4332] text-white rounded-lg hover:bg-[#143326] whitespace-nowrap shrink-0"
              >
                Publish Upcoming Harvest in My Farm
              </button>
            </div>
          </div>

          {loadingSuitability || !suitabilityResult ? (
            <div className="py-10 text-center text-sm text-[#4B5E52]">
              Evaluating soil, water, crop rotation, and market demand signals...
            </div>
          ) : (
            <>
              <div className="bg-[#F6F8F5] rounded-lg p-4 space-y-2 text-xs text-[#374B3E]">
                {suitabilityResult.evaluationMethod && (
                  <p className="font-semibold text-[#1B4332]">
                    Evaluation Method: {suitabilityResult.evaluationMethod}
                  </p>
                )}
                <p className="font-medium text-[#14241B]">
                  Evaluated Profile Inputs: {suitabilityResult.evaluatedInputsSummary}
                </p>
                <p>{suitabilityResult.disclaimer}</p>
                {suitabilityResult.missingInformation.length > 0 && (
                  <div className="pt-2 border-t border-[#E1E7DF] text-[#B45309] space-y-1">
                    <p className="font-semibold">Missing / Unverified Diagnostic Information:</p>
                    {suitabilityResult.missingInformation.map((info, i) => (
                      <p key={i}>• {info}</p>
                    ))}
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                {suitabilityResult.options.map((opt, idx) => (
                  <div
                    key={opt.cropName}
                    className="border border-[#E3E7E1] rounded-xl p-5 space-y-3 flex flex-col justify-between"
                  >
                    <div className="space-y-2.5">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-xs text-[#4B5E52]">
                            Option 0{idx + 1} · {opt.suitabilityBand} ·{' '}
                            {opt.recommendationStage ||
                              'Preliminary Rule-Based Shortlist — Not Expert-Validated'}
                          </p>
                          <h4 className="text-base font-semibold text-[#14241B] mt-0.5">
                            {opt.cropNameTe}
                          </h4>
                          <p className="text-xs text-[#4B5E52]">
                            Varieties: {opt.recommendedVarieties}
                          </p>
                        </div>
                        <div className="text-right shrink-0">
                          <span className="text-lg font-semibold font-mono-num text-[#1B4332]">
                            {opt.ruleScore}/100
                          </span>
                          <p className="text-[11px] text-[#5A6D60]">Rule Fit</p>
                        </div>
                      </div>

                      <p className="text-sm text-[#14241B]">{opt.whySuitable}</p>

                      {opt.keyFactors && opt.keyFactors.length > 0 && (
                        <div className="bg-[#F6F8F5] rounded-lg p-2.5 space-y-1 text-xs text-[#374B3E]">
                          <p className="font-semibold text-[#14241B]">
                            Key Factors Influencing This Rule Score:
                          </p>
                          {opt.keyFactors.map((kf, kIdx) => (
                            <p key={kIdx}>• {kf}</p>
                          ))}
                        </div>
                      )}

                      <div className="pt-2 border-t border-[#EEF1EC] space-y-1.5 text-xs text-[#4B5E52]">
                        <p>
                          <strong className="text-[#14241B]">Soil Requirement:</strong>{' '}
                          {opt.soilRequirements}
                        </p>
                        <p>
                          <strong className="text-[#14241B]">Irrigation:</strong>{' '}
                          {opt.irrigationConsiderations}
                        </p>
                        <p>
                          <strong className="text-[#14241B]">Crop Rotation:</strong>{' '}
                          {opt.rotationBenefit}
                        </p>
                        <p>
                          <strong className="text-[#14241B]">Important Constraints:</strong>{' '}
                          {opt.importantConstraints}
                        </p>
                        <p>
                          <strong className="text-[#14241B]">Indicative Market Signal:</strong>{' '}
                          {opt.marketDemandSignal}
                        </p>
                      </div>
                    </div>

                    <div className="pt-3 border-t border-[#EEF1EC] flex items-center justify-between gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setSubView('call');
                          setTextInput(
                            responseLang === 'te'
                              ? `మా ${activeFarmer.district} పొలంలో ${opt.cropNameTe} సాగు చేయడానికి విత్తన శుద్ధి మరియు నీటి యాజమాన్యం వివరాలు చెప్పండి.`
                              : `What seed treatment and water management steps should I follow for ${opt.cropName} on my farm?`
                          );
                        }}
                        className="text-xs font-medium text-[#1B4332] hover:underline"
                      >
                        Ask AI Advisor About {opt.cropName.split(' ')[0]}
                      </button>
                      <button
                        type="button"
                        onClick={() => setActiveTab('farmer_market')}
                        className="text-xs font-medium text-[#4B5E52] hover:text-[#14241B]"
                      >
                        View Buyer Demand →
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {/* SUBVIEW 3: GOVERNMENT SCHEMES ASSISTANT */}
      {subView === 'schemes' && (
        <div className="bg-white border border-[#E3E7E1] rounded-xl p-6 space-y-5">
          <div className="pb-4 border-b border-[#E8ECE6]">
            <p className="text-xs text-[#4B5E52]">
              Central & State Agricultural Schemes · Never Fabricated · Explicit Verification Dates
            </p>
            <h3 className="text-lg font-semibold text-[#14241B] mt-0.5">
              Government Schemes Relevant to {activeFarmer.district} & Regional Farmers
            </h3>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {(data?.schemes || []).map((scheme) => {
              const isVerified = scheme.verificationStatus === 'Verified' && !scheme.isOutdated;
              return (
                <div
                  key={scheme.id}
                  className="border border-[#E3E7E1] rounded-xl p-5 flex flex-col justify-between space-y-4"
                >
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-2 text-xs">
                      <span className="text-[#4B5E52]">
                        {scheme.level} Scheme · {scheme.schemeCode}
                      </span>
                      <span
                        className={`font-medium ${
                          isVerified ? 'text-[#16A34A]' : 'text-[#B45309]'
                        }`}
                      >
                        {scheme.isOutdated ? 'Marked Outdated' : scheme.verificationStatus} ·{' '}
                        <span className="font-mono-num">{scheme.lastVerifiedDate}</span>
                      </span>
                    </div>

                    <h4 className="text-base font-semibold text-[#14241B]">
                      {scheme.schemeName}
                    </h4>
                    {scheme.schemeNameTe && (
                      <p className="text-xs text-[#4B5E52]">{scheme.schemeNameTe}</p>
                    )}

                    <p className="text-sm text-[#374B3E]">{scheme.purpose}</p>

                    <div className="pt-2 border-t border-[#EEF1EC] space-y-1 text-xs text-[#4B5E52]">
                      <p>
                        <strong className="text-[#14241B]">Region:</strong> {scheme.applicableState}
                      </p>
                      <p>
                        <strong className="text-[#14241B]">Benefits:</strong> {scheme.benefits}
                      </p>
                      <p>
                        <strong className="text-[#14241B]">Official Source:</strong>{' '}
                        {scheme.officialSource}
                        {(scheme.officialSourceUrl || scheme.officialPortal) && (
                          <span className="text-[#5A6D60]">
                            {' '}
                            ({scheme.officialSourceUrl || scheme.officialPortal})
                          </span>
                        )}
                      </p>
                    </div>
                  </div>

                  <div className="pt-3 border-t border-[#EEF1EC] flex flex-wrap items-center justify-between gap-2">
                    <button
                      type="button"
                      onClick={() => setSelectedScheme(scheme)}
                      className="px-3 py-1.5 text-xs font-medium border border-[#CFD8CE] text-[#14241B] rounded-lg hover:bg-[#F3F5F1] whitespace-nowrap shrink-0"
                    >
                      View Scheme Details
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setSubView('call');
                        setTextInput(
                          responseLang === 'te'
                            ? `${scheme.schemeName} పథకానికి నా అర్హత, కావలసిన పత్రాలు మరియు దరఖాస్తు విధానం వివరించండి.`
                            : `Explain the eligibility, required documents, and application steps for ${scheme.schemeName}.`
                        );
                      }}
                      className="px-3 py-1.5 text-xs font-medium bg-[#1B4332] text-white rounded-lg hover:bg-[#143326] whitespace-nowrap shrink-0"
                    >
                      Ask AI About Scheme
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* SUBVIEW 4: AGRICULTURAL KNOWLEDGE BASE (RAG) */}
      {subView === 'knowledge' && (
        <div className="bg-white border border-[#E3E7E1] rounded-xl p-6 space-y-5">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 pb-4 border-b border-[#E8ECE6]">
            <div>
              <p className="text-xs text-[#4B5E52]">
                Source-Attributed Agricultural Reference Library Supporting RAG
              </p>
              <h3 className="text-lg font-semibold text-[#14241B] mt-0.5">
                Agricultural Knowledge Base
              </h3>
            </div>
            <input
              type="search"
              value={knowledgeSearch}
              onChange={(e) => setKnowledgeSearch(e.target.value)}
              placeholder="Search crop, soil, storage, pest..."
              className="w-full md:w-72 px-3 py-2 text-sm border border-[#D4DCD2] rounded-lg focus:outline-none focus:border-[#1B4332]"
            />
          </div>

          <div className="flex flex-wrap gap-1.5">
            {KNOWLEDGE_CATEGORIES.map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => setKnowledgeCategory(cat)}
                className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap shrink-0 ${
                  knowledgeCategory === cat
                    ? 'bg-[#1B4332] text-white'
                    : 'bg-[#F3F5F1] text-[#4B5E52] hover:text-[#14241B]'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>

          {filteredKnowledge.length === 0 ? (
            <p className="py-8 text-center text-sm text-[#4B5E52]">
              No knowledge records match this filter.
            </p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {filteredKnowledge.map((doc) => {
                const isSaved = savedKnowledgeIds.includes(doc.id);
                return (
                  <div
                    key={doc.id}
                    className="border border-[#E3E7E1] rounded-xl p-5 flex flex-col justify-between space-y-3"
                  >
                    <div className="space-y-2">
                      <div className="flex items-center justify-between gap-2 text-xs text-[#4B5E52]">
                        <span>
                          {doc.category} · {doc.applicableRegions}
                        </span>
                        <span className="font-mono-num">
                          {doc.isOutdated ? 'Outdated' : doc.verificationStatus} ·{' '}
                          {doc.lastVerifiedDate}
                        </span>
                      </div>
                      <h4 className="text-base font-semibold text-[#14241B]">{doc.title}</h4>
                      {doc.titleTe && <p className="text-xs text-[#2D6A4F]">{doc.titleTe}</p>}
                      <p className="text-sm text-[#374B3E]">{doc.content}</p>
                      <p className="text-xs text-[#5A6D60] pt-1">
                        Source: {doc.sourceName}
                      </p>
                    </div>

                    <div className="pt-3 border-t border-[#EEF1EC] flex items-center justify-between gap-2">
                      <button
                        type="button"
                        onClick={() => handleToggleBookmarkKnowledge(doc.id)}
                        className="inline-flex items-center gap-1.5 text-xs font-medium text-[#1B4332] hover:underline"
                      >
                        <Bookmark className="w-3.5 h-3.5" />
                        <span>{isSaved ? 'Saved in My Farm' : 'Save to My Farm'}</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setSubView('call');
                          setTextInput(
                            responseLang === 'te'
                              ? `${doc.titleTe || doc.title} గురించి నా పొలానికి ఎలా వర్తిస్తుందో వివరించండి.`
                              : `Explain how "${doc.title}" applies to my farm.`
                          );
                        }}
                        className="text-xs font-medium text-[#4B5E52] hover:text-[#14241B]"
                      >
                        Discuss with AI →
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Scheme Full Details Modal */}
      {selectedScheme && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 overflow-y-auto">
          <div className="bg-white border border-[#E3E7E1] rounded-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6 space-y-4">
            <div className="flex items-start justify-between gap-4 pb-3 border-b border-[#E8ECE6]">
              <div>
                <p className="text-xs text-[#4B5E52]">
                  {selectedScheme.level} Scheme · {selectedScheme.verificationStatus} (Last verified:{' '}
                  <span className="font-mono-num">{selectedScheme.lastVerifiedDate}</span>)
                </p>
                <h3 className="text-lg font-semibold text-[#14241B] mt-0.5">
                  {selectedScheme.schemeName}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setSelectedScheme(null)}
                className="text-xs font-medium text-[#4B5E52] hover:text-[#14241B]"
              >
                Close
              </button>
            </div>

            {selectedScheme.verificationStatus !== 'Verified' && (
              <div className="p-3 rounded-lg bg-[#FEF3C7] text-xs text-[#92400E]">
                Verification Notice: Current seasonal dates or state disbursement guidelines require local verification at your Rythu Seva Kendra / Mandal Agriculture Office before applying.
              </div>
            )}

            <div className="space-y-3 text-sm text-[#374B3E]">
              <p>
                <strong className="text-[#14241B]">Purpose:</strong> {selectedScheme.purpose}
              </p>
              <p>
                <strong className="text-[#14241B]">Applicable Region:</strong>{' '}
                {selectedScheme.applicableState}
              </p>
              <p>
                <strong className="text-[#14241B]">Eligibility Conditions:</strong>{' '}
                {selectedScheme.eligibilityConditions}
              </p>
              <p>
                <strong className="text-[#14241B]">Benefits:</strong> {selectedScheme.benefits}
              </p>
              <p>
                <strong className="text-[#14241B]">Required Documents:</strong>{' '}
                {selectedScheme.requiredDocuments}
              </p>
              <p>
                <strong className="text-[#14241B]">Application Procedure:</strong>{' '}
                {selectedScheme.applicationProcedure}
              </p>
              <p>
                <strong className="text-[#14241B]">Relevant Office:</strong>{' '}
                {selectedScheme.relevantOffice}
              </p>
              <p>
                <strong className="text-[#14241B]">Important Dates / Deadlines:</strong>{' '}
                {selectedScheme.importantDates}
              </p>
              <p>
                <strong className="text-[#14241B]">Official Source:</strong>{' '}
                {selectedScheme.officialSource}
                {selectedScheme.officialSourceUrl && (
                  <span> ({selectedScheme.officialSourceUrl})</span>
                )}
              </p>
            </div>

            <div className="pt-4 border-t border-[#E8ECE6] flex flex-wrap items-center justify-between gap-3">
              <a
                href={selectedScheme.officialSourceUrl || selectedScheme.officialPortal}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-xs font-medium text-[#1B4332] hover:underline"
              >
                <span>
                  Open Official Source ({selectedScheme.officialSourceUrl || selectedScheme.officialPortal})
                </span>
                <ExternalLink className="w-3.5 h-3.5" />
              </a>

              <button
                type="button"
                onClick={() => {
                  const s = selectedScheme;
                  setSelectedScheme(null);
                  setSubView('call');
                  setTextInput(
                    responseLang === 'te'
                      ? `${s.schemeName} పథకానికి నా పొలం అర్హత మరియు దరఖాస్తు విధానం చెప్పండి.`
                      : `How do I apply for ${s.schemeName} and verify my eligibility?`
                  );
                }}
                className="px-4 py-2 text-xs font-medium bg-[#1B4332] text-white rounded-lg hover:bg-[#143326]"
              >
                Ask AI Questions About This Scheme
              </button>
            </div>
          </div>
        </div>
      )}

      <FarmerProfileModal
        farmer={activeFarmer}
        isOpen={editModalOpen}
        onClose={() => setEditModalOpen(false)}
      />
    </div>
  );
};
