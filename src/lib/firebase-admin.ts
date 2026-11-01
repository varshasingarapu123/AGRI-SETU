import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import firebaseConfig from '../../firebase-applet-config.json' with { type: 'json' };

if (!getApps().length) {
  const projectId = process.env.FIREBASE_PROJECT_ID || firebaseConfig.projectId;
  const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;

  if (serviceAccountJson && serviceAccountJson.trim() !== '') {
    const parsedCred = JSON.parse(serviceAccountJson);
    initializeApp({
      credential: cert(parsedCred),
      projectId,
    });
  } else {
    initializeApp({
      projectId,
    });
  }
}

export const adminAuth = getAuth();
