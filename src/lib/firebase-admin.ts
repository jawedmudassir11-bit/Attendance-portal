import fs from 'node:fs';
import { initializeApp, getApps } from 'firebase-admin/app';
import { getAuth, type Auth } from 'firebase-admin/auth';

function resolveFirebaseProjectId(): string | undefined {
  if (process.env.FIREBASE_PROJECT_ID?.trim()) {
    return process.env.FIREBASE_PROJECT_ID.trim();
  }
  if (process.env.GOOGLE_CLOUD_PROJECT?.trim()) {
    return process.env.GOOGLE_CLOUD_PROJECT.trim();
  }
  try {
    const configPath = new URL('../../firebase-applet-config.json', import.meta.url);
    if (fs.existsSync(configPath)) {
      const firebaseConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8')) as {
        projectId?: string;
      };
      if (firebaseConfig?.projectId) {
        return firebaseConfig.projectId;
      }
    }
  } catch (err) {
    console.warn('Optional firebase-applet-config.json could not be loaded:', err);
  }
  return undefined;
}

let resolvedAdminAuth: Auth | null = null;

try {
  if (!getApps().length) {
    const projectId = resolveFirebaseProjectId();
    initializeApp(projectId ? { projectId } : undefined);
  }
  resolvedAdminAuth = getAuth();
} catch (err) {
  console.warn('Firebase Admin SDK initialization skipped:', err);
}

export const adminAuth = resolvedAdminAuth;
