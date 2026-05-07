import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup, onAuthStateChanged } from 'firebase/auth';
import { initializeFirestore, doc, getDocFromServer, Timestamp, serverTimestamp } from 'firebase/firestore';
import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { getRemoteConfig, fetchAndActivate, getValue } from 'firebase/remote-config';
import firebaseConfig from '../firebase-applet-config.json';

// Initialize Firebase SDK
const app = initializeApp(firebaseConfig);

// Initialize Firestore with experimental long polling for better compatibility in AI Studio preview
export const db = initializeFirestore(app, {
  experimentalForceLongPolling: true,
}, firebaseConfig.firestoreDatabaseId);

export const auth = getAuth(app);
export const storage = getStorage(app);
export const remoteConfig = getRemoteConfig(app);
export const googleProvider = new GoogleAuthProvider();

// Configure Remote Config
remoteConfig.settings.minimumFetchIntervalMillis = 3600000; // 1 hour by default
if (process.env.NODE_ENV !== 'production') {
  remoteConfig.settings.minimumFetchIntervalMillis = 0; // Fresh config on every reload in dev
}

export { signInWithPopup, onAuthStateChanged, ref, uploadBytes, getDownloadURL, fetchAndActivate, getValue, Timestamp, serverTimestamp };

import { logger } from './services/logger';

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId: string | undefined;
    email: string | null | undefined;
    emailVerified: boolean | undefined;
    isAnonymous: boolean | undefined;
    tenantId: string | null | undefined;
    providerInfo: {
      providerId: string;
      displayName: string | null;
      email: string | null;
      photoUrl: string | null;
    }[];
  }
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData.map(provider => ({
        providerId: provider.providerId,
        displayName: provider.displayName,
        email: provider.email,
        photoUrl: provider.photoURL
      })) || []
    },
    operationType,
    path
  }
  
  // Log the firestore error to the centralized backend
  logger.error(`Firestore ${operationType} failed at ${path}`, error, { 
    firestoreContext: errInfo 
  });

  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

async function testConnection() {
  try {
    // Attempt to verify connection without alarming logs for transient network issues
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    // Only log warning if it's clearly a configuration issue, not just a temporary "offline" state
    if (error instanceof Error) {
      const isPermissionError = error.message.includes('permission-denied') || 
                               error.message.includes('Missing or insufficient permissions');
      
      if (isPermissionError) {
        console.warn("Firestore access denied. Please check your security rules at /firestore.rules or verify you are authenticated if required.");
      } else if (!error.message.includes('the client is offline')) {
        console.error("Firestore connection error:", error.message);
      }
    }
  }
}
testConnection();

// Removed extra Timestamp export as it is now in the main export block
