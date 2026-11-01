export type UiLanguage = 'en' | 'te';

export const UI_LABELS: Record<
  UiLanguage,
  {
    tagline: string;
    navAssistant: string;
    navMerchantMarket: string;
    navFarmerMarket: string;
    navAgriroute: string;
    navMyFarm: string;
    navCoordinator: string;
    speakOnCall: string;
    endCall: string;
    selectFarmerProfile: string;
    editProfile: string;
    demoNotice: string;
    signInGoogle: string;
    signOut: string;
  }
> = {
  en: {
    tagline: 'Samriddh Annadata, Samriddh Bharat',
    navAssistant: 'AI Farmer Assistant',
    navMerchantMarket: 'Merchant Market',
    navFarmerMarket: 'Farmer Market',
    navAgriroute: 'AGRIROUTE',
    navMyFarm: 'My Farm',
    navCoordinator: 'Coordinator Dashboard',
    speakOnCall: 'Speak on Call',
    endCall: 'End Conversation',
    selectFarmerProfile: 'Active Demo Farmer Profile',
    editProfile: 'Edit Profile & Consent',
    demoNotice: 'Pilot Prototype — Fictional records are clearly marked as Demo Data',
    signInGoogle: 'Sign In',
    signOut: 'Sign Out',
  },
  te: {
    tagline: 'సమృద్ధ అన్నదాత, సమృద్ధ భారత్',
    navAssistant: 'AI రైతు సహాయకుడు',
    navMerchantMarket: 'వ్యాపారుల మార్కెట్',
    navFarmerMarket: 'రైతు మార్కెట్',
    navAgriroute: 'AGRIROUTE రవాణా మార్గం',
    navMyFarm: 'నా వ్యవసాయం (My Farm)',
    navCoordinator: 'కోఆర్డినేటర్ డాష్‌బోర్డ్',
    speakOnCall: 'కాల్‌లో మాట్లాడండి (Speak on Call)',
    endCall: 'సంభాషణ ముగించు',
    selectFarmerProfile: 'ఎంచుకున్న డెమో రైతు ప్రొఫైల్',
    editProfile: 'ప్రొఫైల్ & అనుమతి మార్చు',
    demoNotice: 'పైలట్ నమూనా — నమూనా సమాచారం స్పష్టంగా డెమో డేటాగా చూపబడింది',
    signInGoogle: 'లాగిన్',
    signOut: 'లాగ్ అవుట్',
  },
};
