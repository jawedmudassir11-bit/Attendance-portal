import { initializeApp, getApps, getApp, type FirebaseApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, type Auth } from 'firebase/auth';
import {
  getFirestore,
  doc,
  getDocFromServer,
  type Firestore
} from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';

export const DEFAULT_AUTH_SLOT = '[DEFAULT]';

const defaultApp = getApps().some(a => a.name === DEFAULT_AUTH_SLOT)
  ? getApp(DEFAULT_AUTH_SLOT)
  : initializeApp(firebaseConfig);

export const auth = getAuth(defaultApp);
export const db: Firestore = getFirestore(
  defaultApp,
  firebaseConfig.firestoreDatabaseId
);
export const googleAuthProvider = new GoogleAuthProvider();
googleAuthProvider.setCustomParameters({ prompt: 'select_account' });

const namedAuthCache = new Map<string, Auth>();
namedAuthCache.set(DEFAULT_AUTH_SLOT, auth);

const namedFirestoreCache = new Map<string, Firestore>();
namedFirestoreCache.set(DEFAULT_AUTH_SLOT, db);

function getOrCreateAppForSlot(slotKey: string): FirebaseApp {
  const cleanSlot = (slotKey || '').trim() || DEFAULT_AUTH_SLOT;
  const existing = getApps().find(a => a.name === cleanSlot);
  if (existing) return existing;
  return initializeApp(firebaseConfig, cleanSlot);
}

/**
 * Returns an independent Firebase Auth instance for a named account slot.
 * Each named FirebaseApp maintains its own persistent session in IndexedDB,
 * enabling 1-click instant switching between multiple signed-in Google accounts.
 */
export function getFirebaseAuthForSlot(slotKey: string): Auth {
  const cleanSlot = (slotKey || '').trim() || DEFAULT_AUTH_SLOT;
  const cached = namedAuthCache.get(cleanSlot);
  if (cached) return cached;

  const namedApp = getOrCreateAppForSlot(cleanSlot);
  const slotAuth = getAuth(namedApp);
  namedAuthCache.set(cleanSlot, slotAuth);
  return slotAuth;
}

/**
 * Returns the Firestore instance bound to the matching Firebase Auth slot
 * so security rules always evaluate against the currently active Google user.
 */
export function getFirestoreForSlot(slotKey: string): Firestore {
  const cleanSlot = (slotKey || '').trim() || DEFAULT_AUTH_SLOT;
  const cached = namedFirestoreCache.get(cleanSlot);
  if (cached) return cached;

  const namedApp = getOrCreateAppForSlot(cleanSlot);
  const slotDb = getFirestore(namedApp, firebaseConfig.firestoreDatabaseId);
  namedFirestoreCache.set(cleanSlot, slotDb);
  return slotDb;
}

export function createGoogleProvider(loginHint?: string): GoogleAuthProvider {
  const provider = new GoogleAuthProvider();
  const params: Record<string, string> = {
    prompt: 'select_account'
  };
  if (loginHint && loginHint.trim()) {
    params.login_hint = loginHint.trim().toLowerCase();
  }
  provider.setCustomParameters(params);
  return provider;
}

// ==========================================
// STRUCTURED FIRESTORE ERROR HANDLING & STARTUP CONNECTION CHECK
// ==========================================
export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write'
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null,
  activeAuth: Auth = auth
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: activeAuth.currentUser?.uid,
      email: activeAuth.currentUser?.email,
      emailVerified: activeAuth.currentUser?.emailVerified,
      isAnonymous: activeAuth.currentUser?.isAnonymous,
      tenantId: activeAuth.currentUser?.tenantId,
      providerInfo:
        activeAuth.currentUser?.providerData?.map(provider => ({
          providerId: provider.providerId,
          email: provider.email
        })) || []
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

async function testConnection() {
  if (typeof window === 'undefined') return;
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error('Please check your Firebase configuration.');
    }
  }
}

void testConnection();
