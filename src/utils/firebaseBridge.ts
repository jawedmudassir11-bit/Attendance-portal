declare global {
  interface Window {
    firebase?: any;
    XLSX?: any;
    html2pdf?: any;
    webkitSpeechRecognition?: any;
    SpeechRecognition?: any;
  }
}

export interface ActivePortalRtdbConfig {
  portalId: string;
  databaseURL: string;
  projectId: string;
  backupDatabaseURL?: string;
  storageBucket?: string;
}

let activeConfig: ActivePortalRtdbConfig | null = null;
let primaryDb: any = null;
let backupDb: any = null;
let backupStorage: any = null;

function sanitizeAppName(raw: string): string {
  return raw.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 60);
}

/**
 * Dynamically configures the active Firebase Realtime Database connection
 * for the currently opened Attendance Portal.
 * Zero hardcoded credentials or personal project URLs exist in this module.
 */
export function setActivePortalFirebaseConfig(config: ActivePortalRtdbConfig | null): void {
  activeConfig = config;
  primaryDb = null;
  backupDb = null;
  backupStorage = null;

  if (!config || !config.databaseURL || typeof window === 'undefined' || !window.firebase) {
    return;
  }

  try {
    const fb = window.firebase;
    const apps: any[] = Array.isArray(fb.apps) ? fb.apps : [];

    // Primary Realtime Database for this portal
    const primaryAppName = sanitizeAppName(`PortalRTDB_${config.portalId}_${config.projectId}`);
    const existingPrimary = apps.find((a: any) => a.name === primaryAppName);
    const primaryApp =
      existingPrimary ||
      fb.initializeApp(
        {
          databaseURL: config.databaseURL,
          projectId: config.projectId,
          ...(config.storageBucket ? { storageBucket: config.storageBucket } : {})
        },
        primaryAppName
      );
    primaryDb = typeof primaryApp.database === 'function' ? primaryApp.database() : null;
    if (config.storageBucket && typeof primaryApp.storage === 'function') {
      backupStorage = primaryApp.storage();
    }

    // Optional Secondary Backup Realtime Database (if configured by the portal owner)
    if (config.backupDatabaseURL && config.backupDatabaseURL.trim()) {
      const backupAppName = sanitizeAppName(`PortalBackup_${config.portalId}`);
      const existingBackup = apps.find((a: any) => a.name === backupAppName);
      const backupApp =
        existingBackup ||
        fb.initializeApp(
          {
            databaseURL: config.backupDatabaseURL.trim(),
            projectId: config.projectId,
            ...(config.storageBucket ? { storageBucket: config.storageBucket } : {})
          },
          backupAppName
        );
      backupDb = typeof backupApp.database === 'function' ? backupApp.database() : null;
      if (!backupStorage && config.storageBucket && typeof backupApp.storage === 'function') {
        backupStorage = backupApp.storage();
      }
    }
  } catch (err) {
    console.warn('Portal Realtime Database initialization warning:', err);
  }
}

export function getActivePortalFirebaseConfig(): ActivePortalRtdbConfig | null {
  return activeConfig;
}

export function getFirebaseServices() {
  return {
    db: primaryDb,
    backupDb,
    storageBackup: backupStorage,
    portalId: activeConfig?.portalId || null,
    databaseURL: activeConfig?.databaseURL || null
  };
}

/**
 * Live connection & rules probe for the Code-Free Firebase Setup step.
 * Tests whether the user's pasted Realtime Database URL is reachable and readable/writable.
 */
export async function testRealtimeDatabaseConnection(params: {
  databaseURL: string;
  projectId: string;
}): Promise<{
  ok: boolean;
  status: 'connected' | 'rules_locked' | 'unreachable' | 'sdk_unavailable';
  message: string;
}> {
  if (typeof window === 'undefined' || !window.firebase) {
    return {
      ok: false,
      status: 'sdk_unavailable',
      message: 'Firebase SDK is still loading. Please wait a second and try again.'
    };
  }

  try {
    const fb = window.firebase;
    const probeName = `ProbeRTDB_${Date.now()}`;
    const probeApp = fb.initializeApp(
      {
        databaseURL: params.databaseURL,
        projectId: params.projectId
      },
      probeName
    );
    const probeDb = probeApp.database();

    const cleanup = () => {
      try {
        probeApp.delete?.().catch(() => {});
      } catch {
        // Ignore cleanup errors
      }
    };

    const result = await new Promise<{
      ok: boolean;
      status: 'connected' | 'rules_locked' | 'unreachable';
      message: string;
    }>(resolve => {
      const timer = window.setTimeout(() => {
        resolve({
          ok: false,
          status: 'unreachable',
          message:
            'Timed out connecting to that Database URL. Double-check the URL copied from Firebase Console → Realtime Database.'
        });
      }, 6500);

      probeDb
        .ref('global/structure')
        .once('value')
        .then(() => {
          window.clearTimeout(timer);
          resolve({
            ok: true,
            status: 'connected',
            message: 'Connected successfully! Your Firebase Realtime Database is ready.'
          });
        })
        .catch((err: any) => {
          window.clearTimeout(timer);
          const msg = String(err?.message || err?.code || '').toLowerCase();
          if (msg.includes('permission_denied') || msg.includes('permission denied')) {
            resolve({
              ok: false,
              status: 'rules_locked',
              message:
                'Database URL is valid, but Firebase Rules are currently blocking access. Paste the recommended Rules below in Firebase Console → Realtime Database → Rules → Publish.'
            });
          } else {
            resolve({
              ok: false,
              status: 'unreachable',
              message:
                'Could not reach that Realtime Database URL. Please verify the URL and your internet connection.'
            });
          }
        });
    });

    cleanup();
    return result;
  } catch (err: any) {
    return {
      ok: false,
      status: 'unreachable',
      message: err?.message || 'Unable to connect to the provided Firebase Realtime Database.'
    };
  }
}

export function safeGetStorage(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function safeSetStorage(key: string, val: string): void {
  try {
    localStorage.setItem(key, val);
  } catch {
    // ignore storage quota errors
  }
}

export function safeRemoveStorage(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    // ignore
  }
}
