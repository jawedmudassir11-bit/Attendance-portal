import type { UserRole } from './siteLogic';

export interface PortalRoleHashes {
  adminHash: string;
  supervisorHash: string;
  inchargeHash: string;
}

export interface PortalRtdbConfig {
  rtdbUrl: string;
  rtdbProjectId: string;
  backupRtdbUrl: string;
  storageBucket: string;
}

export interface AttendancePortalRecord extends PortalRoleHashes, PortalRtdbConfig {
  id: string;
  ownerUid: string;
  ownerEmail: string;
  ownerName: string;
  companyName: string;
  companySubtitle: string;
  companyLogo: string;
  sharedWithEmails: string[];
  createdAt?: string | number | null;
  updatedAt?: string | number | null;
}

export interface PortalShareRecord {
  id: string;
  portalId: string;
  ownerUid: string;
  ownerEmail: string;
  recipientEmail: string;
  companyName: string;
  createdAt?: string | number | null;
}

export const MAX_SHARED_EMAILS_PER_PORTAL = 50;
export const MAX_COMPANY_NAME_LENGTH = 100;
export const MAX_COMPANY_SUBTITLE_LENGTH = 200;
export const MAX_COMPANY_LOGO_LENGTH = 260_000;
export const MIN_ROLE_PASSWORD_LENGTH = 4;
export const MAX_ROLE_PASSWORD_LENGTH = 32;

export interface RoleDefinitionMeta {
  role: 'admin' | 'supervisor' | 'incharge';
  label: string;
  shortTag: string;
  summary: string;
  permissions: string[];
}

export const PORTAL_ROLE_DEFINITIONS: readonly RoleDefinitionMeta[] = [
  {
    role: 'admin',
    label: 'Admin',
    shortTag: 'Full Control',
    summary:
      'Complete ownership over the portal, sites, payroll, historical records, backups, and team sharing.',
    permissions: [
      'Create, rename, or delete Sites and Subgroups',
      'Edit or unlock attendance for ANY date (past or present)',
      'Add, edit, transfer, or delete workers and daily wage rates',
      'Record partial wage settlements and restore 15-day cloud backups',
      'Share or revoke portal access via email and update portal settings'
    ]
  },
  {
    role: 'supervisor',
    label: 'Supervisor',
    shortTag: 'Daily Field Entry',
    summary:
      'Handles day-to-day site attendance, overtime, cash advances, and Daily Progress Reports on the ground.',
    permissions: [
      'Mark daily worker attendance (Present / Half-Day / Absent)',
      'Enter overtime hours (OT) and daily cash advances',
      'Log DPR work progress, weather/downtime, and material entries',
      'Can edit today and yesterday only (auto-locked after 48 hours)',
      'Cannot unlock manually locked days or restore system backups'
    ]
  },
  {
    role: 'incharge',
    label: 'Site In-Charge',
    shortTag: 'Site Oversight & Locking',
    summary:
      'Oversees multiple crews on site, manages worker rosters, locks daily registers, and sends daily executive reports.',
    permissions: [
      'Includes all Supervisor daily attendance and DPR permissions',
      'Lock or unlock a day’s attendance register for Supervisors',
      'Add/edit workers and transfer or copy workers between subgroups',
      'Manage site officials, equipment logs, and low-stock thresholds',
      'Dispatch 6:00 PM WhatsApp Executive Summaries to Head Office'
    ]
  }
] as const;

const EMAIL_RE = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;

const COMMON_DOMAIN_TYPOS: Record<string, string> = {
  'gmial.com': 'gmail.com',
  'gmal.com': 'gmail.com',
  'gamil.com': 'gmail.com',
  'gnail.com': 'gmail.com',
  'gmail.co': 'gmail.com',
  'gmail.cm': 'gmail.com',
  'gmail.con': 'gmail.com',
  'gmaill.com': 'gmail.com',
  'yaho.com': 'yahoo.com',
  'yahooo.com': 'yahoo.com',
  'yahoo.con': 'yahoo.com',
  'outlok.com': 'outlook.com',
  'hotmal.com': 'hotmail.com',
  'hotmial.com': 'hotmail.com'
};

export function normalizeEmail(raw: string): string {
  return String(raw || '').trim().toLowerCase();
}

export interface EmailVerificationResult {
  valid: boolean;
  normalizedEmail: string;
  error?: string;
  suggestion?: string;
}

export function validateShareRecipientEmail(
  rawEmail: string,
  options?: {
    ownerEmail?: string;
    existingSharedEmails?: string[];
  }
): EmailVerificationResult {
  const normalized = normalizeEmail(rawEmail);
  if (!normalized) {
    return {
      valid: false,
      normalizedEmail: '',
      error: 'Please enter a recipient email address.'
    };
  }
  if (normalized.length > 254 || !EMAIL_RE.test(normalized)) {
    return {
      valid: false,
      normalizedEmail: normalized,
      error: 'Please enter a valid email address (for example, colleague@gmail.com).'
    };
  }

  const [localPart, domainPart] = normalized.split('@');
  if (!localPart || !domainPart || localPart.length > 64) {
    return {
      valid: false,
      normalizedEmail: normalized,
      error: 'Email address format looks invalid.'
    };
  }

  const typoFix = COMMON_DOMAIN_TYPOS[domainPart];
  if (typoFix) {
    return {
      valid: false,
      normalizedEmail: normalized,
      error: `Did you mean ${localPart}@${typoFix}? Please check the domain spelling.`,
      suggestion: `${localPart}@${typoFix}`
    };
  }

  if (options?.ownerEmail && normalizeEmail(options.ownerEmail) === normalized) {
    return {
      valid: false,
      normalizedEmail: normalized,
      error: 'You already own this portal — enter a teammate’s email address instead.'
    };
  }

  const existing = (options?.existingSharedEmails || []).map(normalizeEmail);
  if (existing.includes(normalized)) {
    return {
      valid: false,
      normalizedEmail: normalized,
      error: 'This email address already has access to this portal.'
    };
  }

  if (existing.length >= MAX_SHARED_EMAILS_PER_PORTAL) {
    return {
      valid: false,
      normalizedEmail: normalized,
      error: `Maximum of ${MAX_SHARED_EMAILS_PER_PORTAL} shared team members reached for this portal.`
    };
  }

  return {
    valid: true,
    normalizedEmail: normalized
  };
}

export interface ParsedFirebaseRtdbInput {
  valid: boolean;
  databaseURL: string;
  projectId: string;
  storageBucket: string;
  error?: string;
}

/**
 * Code-free smart parser:
 * Accepts either:
 *  1) A pasted Firebase Realtime Database URL:
 *     - https://my-company-default-rtdb.firebaseio.com/
 *     - https://my-company-default-rtdb.asia-southeast1.firebasedatabase.app/
 *     - my-company-default-rtdb.firebasedatabase.app (auto-adds https://)
 *  2) A full pasted Firebase Web SDK config snippet (`const firebaseConfig = { ... }`)
 */
export function parseFirebaseRtdbInput(rawInput: string): ParsedFirebaseRtdbInput {
  const raw = String(rawInput || '').trim();
  if (!raw) {
    return {
      valid: false,
      databaseURL: '',
      projectId: '',
      storageBucket: '',
      error: 'Please paste your Firebase Realtime Database URL or Firebase config snippet.'
    };
  }

  let extractedUrl = '';
  let extractedProjectId = '';
  let extractedStorageBucket = '';

  // Try extracting from a pasted JS/JSON firebaseConfig snippet first
  const dbUrlMatch = raw.match(/databaseURL\s*[:=]\s*["'`]([^"'`\s]+)["'`]/i);
  const projectIdMatch = raw.match(/projectId\s*[:=]\s*["'`]([^"'`\s]+)["'`]/i);
  const bucketMatch = raw.match(/storageBucket\s*[:=]\s*["'`]([^"'`\s]+)["'`]/i);

  if (dbUrlMatch?.[1]) {
    extractedUrl = dbUrlMatch[1].trim();
  }
  if (projectIdMatch?.[1]) {
    extractedProjectId = projectIdMatch[1].trim();
  }
  if (bucketMatch?.[1]) {
    extractedStorageBucket = bucketMatch[1].trim();
  }

  // Fallback: look for any firebasedatabase.app or firebaseio.com URL in the text
  if (!extractedUrl) {
    const bareUrlMatch = raw.match(
      /(?:https?:\/\/)?([a-zA-Z0-9-]+\.(?:[a-zA-Z0-9-]+\.)?(?:firebasedatabase\.app|firebaseio\.com))\/?/i
    );
    if (bareUrlMatch?.[1]) {
      extractedUrl = `https://${bareUrlMatch[1]}/`;
    }
  }

  if (!extractedUrl) {
    return {
      valid: false,
      databaseURL: '',
      projectId: '',
      storageBucket: '',
      error:
        'Could not find a valid Firebase Realtime Database URL. It should look like https://your-project-default-rtdb.firebaseio.com/ or https://your-project-default-rtdb.asia-southeast1.firebasedatabase.app/'
    };
  }

  if (!/^https?:\/\//i.test(extractedUrl)) {
    extractedUrl = `https://${extractedUrl}`;
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(extractedUrl);
  } catch {
    return {
      valid: false,
      databaseURL: '',
      projectId: '',
      storageBucket: '',
      error: 'The Realtime Database URL format is invalid.'
    };
  }

  if (parsedUrl.protocol !== 'https:') {
    return {
      valid: false,
      databaseURL: '',
      projectId: '',
      storageBucket: '',
      error: 'Firebase Realtime Database URL must use https://.'
    };
  }

  const host = parsedUrl.hostname.toLowerCase();
  const isFirebaseHost =
    host.endsWith('.firebasedatabase.app') || host.endsWith('.firebaseio.com');
  if (!isFirebaseHost) {
    return {
      valid: false,
      databaseURL: '',
      projectId: '',
      storageBucket: '',
      error:
        'URL must end with .firebasedatabase.app or .firebaseio.com (copied from Firebase Console → Realtime Database).'
    };
  }

  const normalizedUrl = `https://${host}/`;

  // Derive projectId from hostname if not explicitly present
  if (!extractedProjectId) {
    const firstSegment = host.split('.')[0] || '';
    extractedProjectId = firstSegment.replace(/-default-rtdb$/i, '').trim() || firstSegment;
  }

  if (!extractedProjectId || extractedProjectId.length < 2) {
    return {
      valid: false,
      databaseURL: '',
      projectId: '',
      storageBucket: '',
      error: 'Could not determine the Firebase Project ID from this URL.'
    };
  }

  return {
    valid: true,
    databaseURL: normalizedUrl,
    projectId: extractedProjectId.slice(0, 100),
    storageBucket: extractedStorageBucket.slice(0, 200)
  };
}

export interface RolePasswordsValidation {
  valid: boolean;
  error?: string;
}

export function validateRolePasswordsSetup(passwords: {
  admin: string;
  supervisor: string;
  incharge: string;
}): RolePasswordsValidation {
  const admin = (passwords.admin || '').trim();
  const supervisor = (passwords.supervisor || '').trim();
  const incharge = (passwords.incharge || '').trim();

  if (admin.length < MIN_ROLE_PASSWORD_LENGTH) {
    return {
      valid: false,
      error: `Admin password must be at least ${MIN_ROLE_PASSWORD_LENGTH} characters.`
    };
  }
  if (supervisor.length < MIN_ROLE_PASSWORD_LENGTH) {
    return {
      valid: false,
      error: `Supervisor password must be at least ${MIN_ROLE_PASSWORD_LENGTH} characters.`
    };
  }
  if (incharge.length < MIN_ROLE_PASSWORD_LENGTH) {
    return {
      valid: false,
      error: `Site In-Charge password must be at least ${MIN_ROLE_PASSWORD_LENGTH} characters.`
    };
  }

  if (
    admin.length > MAX_ROLE_PASSWORD_LENGTH ||
    supervisor.length > MAX_ROLE_PASSWORD_LENGTH ||
    incharge.length > MAX_ROLE_PASSWORD_LENGTH
  ) {
    return {
      valid: false,
      error: `Role passwords must be ${MAX_ROLE_PASSWORD_LENGTH} characters or fewer.`
    };
  }

  if (admin === supervisor || admin === incharge || supervisor === incharge) {
    return {
      valid: false,
      error:
        'Each role (Admin, Supervisor, and Site In-Charge) must have a different password so the portal knows which role to unlock.'
    };
  }

  return { valid: true };
}

/**
 * Computes a salted SHA-256 hex digest using standard Web Crypto API (works in browser & Node 22).
 */
export async function hashPortalRolePassword(
  portalId: string,
  rawPassword: string
): Promise<string> {
  const cleanPortal = String(portalId || '').trim();
  const cleanPwd = String(rawPassword || '').trim();
  const input = `${cleanPortal}::${cleanPwd}`;
  const data = new TextEncoder().encode(input);
  const digest = await globalThis.crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

export async function verifyPortalRolePassword(
  portalId: string,
  rawPassword: string,
  roleHashes: PortalRoleHashes | null | undefined
): Promise<{
  valid: boolean;
  role?: UserRole;
  message: string;
}> {
  const clean = (rawPassword || '').trim();
  if (!clean) {
    return { valid: false, message: 'Please enter a role password.' };
  }
  if (!roleHashes || !portalId) {
    return {
      valid: false,
      message: 'No role passwords are configured for this portal.'
    };
  }

  const candidateHash = await hashPortalRolePassword(portalId, clean);
  if (roleHashes.adminHash && candidateHash === roleHashes.adminHash) {
    return { valid: true, role: 'admin', message: 'Admin Access Unlocked' };
  }
  if (roleHashes.inchargeHash && candidateHash === roleHashes.inchargeHash) {
    return {
      valid: true,
      role: 'incharge',
      message: 'Site In-Charge Mode Unlocked'
    };
  }
  if (roleHashes.supervisorHash && candidateHash === roleHashes.supervisorHash) {
    return {
      valid: true,
      role: 'supervisor',
      message: 'Supervisor Mode Unlocked'
    };
  }

  return { valid: false, message: 'Incorrect role password for this portal.' };
}

export function generatePortalId(companyName: string): string {
  const slug = String(companyName || 'portal')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 22);
  const rand = Math.random().toString(36).slice(2, 8);
  const ts = Date.now().toString(36);
  return `p_${slug || 'site'}_${ts}_${rand}`.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 60);
}

export function buildDeterministicShareId(portalId: string, recipientEmail: string): string {
  const cleanPortal = String(portalId || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 48);
  const cleanEmail = normalizeEmail(recipientEmail).replace(/[^a-z0-9]/g, '_').slice(0, 60);
  return `sh_${cleanPortal}_${cleanEmail}`.slice(0, 120);
}

export function getCompanyInitials(companyName: string): string {
  const clean = String(companyName || '').trim();
  if (!clean) return 'AP';
  const words = clean.split(/\s+/).filter(Boolean);
  if (words.length >= 2) {
    return `${words[0][0]}${words[1][0]}`.toUpperCase();
  }
  return clean.slice(0, 2).toUpperCase();
}

export const RECOMMENDED_PORTAL_RTDB_RULES = `{
  "rules": {
    "global": {
      ".read": true,
      ".write": true
    },
    "data": {
      ".read": true,
      ".write": true
    },
    "backups": {
      ".read": true,
      ".write": true
    }
  }
}`;
