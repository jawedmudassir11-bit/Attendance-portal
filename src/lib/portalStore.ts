import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
  type Firestore,
  type Timestamp
} from 'firebase/firestore';
import type { Auth } from 'firebase/auth';
import {
  DEFAULT_AUTH_SLOT,
  getFirebaseAuthForSlot,
  getFirestoreForSlot,
  handleFirestoreError,
  OperationType
} from './firebase';
import {
  buildDeterministicShareId,
  generatePortalId,
  hashPortalRolePassword,
  MAX_COMPANY_LOGO_LENGTH,
  MAX_COMPANY_NAME_LENGTH,
  MAX_COMPANY_SUBTITLE_LENGTH,
  MAX_SHARED_EMAILS_PER_PORTAL,
  normalizeEmail,
  type AttendancePortalRecord
} from '../utils/portalLogic';

function formatTimestamp(val: unknown): string | null {
  if (!val) return null;
  if (typeof (val as Timestamp)?.toDate === 'function') {
    return (val as Timestamp).toDate().toISOString();
  }
  if (typeof val === 'string') return val;
  if (typeof val === 'number') return new Date(val).toISOString();
  return null;
}

function parsePortalDoc(id: string, data: Record<string, any>): AttendancePortalRecord {
  return {
    id: String(data.id || id),
    ownerUid: String(data.ownerUid || ''),
    ownerEmail: normalizeEmail(data.ownerEmail || ''),
    ownerName: String(data.ownerName || ''),
    companyName: String(data.companyName || 'Untitled Portal'),
    companySubtitle: String(data.companySubtitle || ''),
    companyLogo: typeof data.companyLogo === 'string' ? data.companyLogo : '',
    adminHash: String(data.adminHash || ''),
    supervisorHash: String(data.supervisorHash || ''),
    inchargeHash: String(data.inchargeHash || ''),
    rtdbUrl: String(data.rtdbUrl || ''),
    rtdbProjectId: String(data.rtdbProjectId || ''),
    backupRtdbUrl: String(data.backupRtdbUrl || ''),
    storageBucket: String(data.storageBucket || ''),
    sharedWithEmails: Array.isArray(data.sharedWithEmails)
      ? data.sharedWithEmails.map((e: unknown) => normalizeEmail(String(e || ''))).filter(Boolean)
      : [],
    createdAt: formatTimestamp(data.createdAt),
    updatedAt: formatTimestamp(data.updatedAt)
  };
}

function getSlotServices(slotKey: string = DEFAULT_AUTH_SLOT): { db: Firestore; auth: Auth } {
  return {
    db: getFirestoreForSlot(slotKey),
    auth: getFirebaseAuthForSlot(slotKey)
  };
}

export function subscribeUserPortals(params: {
  uid: string;
  email: string;
  slotKey?: string;
  onOwnedChange: (portals: AttendancePortalRecord[]) => void;
  onSharedChange: (portals: AttendancePortalRecord[]) => void;
  onError?: (err: Error) => void;
}): () => void {
  const { uid, email, slotKey = DEFAULT_AUTH_SLOT, onOwnedChange, onSharedChange, onError } = params;
  const { db, auth } = getSlotServices(slotKey);
  const normalizedEmail = normalizeEmail(email);

  const ownedQuery = query(collection(db, 'portals'), where('ownerUid', '==', uid));
  const sharedQuery = query(
    collection(db, 'portals'),
    where('sharedWithEmails', 'array-contains', normalizedEmail)
  );

  const unsubOwned = onSnapshot(
    ownedQuery,
    snap => {
      const list = snap.docs
        .map(d => parsePortalDoc(d.id, d.data()))
        .sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')));
      onOwnedChange(list);
    },
    err => {
      try {
        handleFirestoreError(err, OperationType.LIST, 'portals (owned)', auth);
      } catch (wrapped) {
        onError?.(wrapped as Error);
      }
    }
  );

  const unsubShared = onSnapshot(
    sharedQuery,
    snap => {
      const list = snap.docs
        .map(d => parsePortalDoc(d.id, d.data()))
        .filter(p => p.ownerUid !== uid)
        .sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')));
      onSharedChange(list);
    },
    err => {
      try {
        handleFirestoreError(err, OperationType.LIST, 'portals (shared)', auth);
      } catch (wrapped) {
        onError?.(wrapped as Error);
      }
    }
  );

  return () => {
    unsubOwned();
    unsubShared();
  };
}

export async function createPortalInFirestore(params: {
  slotKey?: string;
  ownerUid: string;
  ownerEmail: string;
  ownerName: string;
  companyName: string;
  companySubtitle?: string;
  companyLogo?: string;
  adminPassword: string;
  supervisorPassword: string;
  inchargePassword: string;
  rtdbUrl: string;
  rtdbProjectId: string;
  backupRtdbUrl?: string;
  storageBucket?: string;
}): Promise<AttendancePortalRecord> {
  const { db, auth } = getSlotServices(params.slotKey);
  const portalId = generatePortalId(params.companyName);
  const cleanCompanyName = params.companyName.trim().slice(0, MAX_COMPANY_NAME_LENGTH);
  const cleanSubtitle = (params.companySubtitle || '').trim().slice(0, MAX_COMPANY_SUBTITLE_LENGTH);
  const cleanLogo =
    params.companyLogo && params.companyLogo.length <= MAX_COMPANY_LOGO_LENGTH
      ? params.companyLogo
      : '';
  const cleanOwnerEmail = normalizeEmail(params.ownerEmail);
  const cleanOwnerName = (params.ownerName || cleanOwnerEmail.split('@')[0] || 'Owner')
    .trim()
    .slice(0, 100);

  const [adminHash, supervisorHash, inchargeHash] = await Promise.all([
    hashPortalRolePassword(portalId, params.adminPassword),
    hashPortalRolePassword(portalId, params.supervisorPassword),
    hashPortalRolePassword(portalId, params.inchargePassword)
  ]);

  const docPath = `portals/${portalId}`;
  const payload = {
    id: portalId,
    ownerUid: params.ownerUid,
    ownerEmail: cleanOwnerEmail,
    ownerName: cleanOwnerName,
    companyName: cleanCompanyName,
    companySubtitle: cleanSubtitle,
    companyLogo: cleanLogo,
    adminHash,
    supervisorHash,
    inchargeHash,
    rtdbUrl: params.rtdbUrl.trim().slice(0, 300),
    rtdbProjectId: params.rtdbProjectId.trim().slice(0, 100),
    backupRtdbUrl: (params.backupRtdbUrl || '').trim().slice(0, 300),
    storageBucket: (params.storageBucket || '').trim().slice(0, 200),
    sharedWithEmails: [] as string[],
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  };

  try {
    await setDoc(doc(db, 'portals', portalId), payload);
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, docPath, auth);
  }

  const nowIso = new Date().toISOString();
  return {
    ...payload,
    createdAt: nowIso,
    updatedAt: nowIso
  };
}

export async function updatePortalSettingsInFirestore(params: {
  slotKey?: string;
  portalId: string;
  companyName?: string;
  companySubtitle?: string;
  companyLogo?: string;
  newPasswords?: {
    admin: string;
    supervisor: string;
    incharge: string;
  };
  rtdbUrl?: string;
  rtdbProjectId?: string;
  backupRtdbUrl?: string;
  storageBucket?: string;
}): Promise<Partial<AttendancePortalRecord>> {
  const { db, auth } = getSlotServices(params.slotKey);
  const docPath = `portals/${params.portalId}`;
  const updates: Record<string, any> = {
    updatedAt: serverTimestamp()
  };

  if (typeof params.companyName === 'string') {
    updates.companyName = params.companyName.trim().slice(0, MAX_COMPANY_NAME_LENGTH);
  }
  if (typeof params.companySubtitle === 'string') {
    updates.companySubtitle = params.companySubtitle.trim().slice(0, MAX_COMPANY_SUBTITLE_LENGTH);
  }
  if (typeof params.companyLogo === 'string') {
    updates.companyLogo =
      params.companyLogo.length <= MAX_COMPANY_LOGO_LENGTH ? params.companyLogo : '';
  }
  if (params.newPasswords) {
    const [adminHash, supervisorHash, inchargeHash] = await Promise.all([
      hashPortalRolePassword(params.portalId, params.newPasswords.admin),
      hashPortalRolePassword(params.portalId, params.newPasswords.supervisor),
      hashPortalRolePassword(params.portalId, params.newPasswords.incharge)
    ]);
    updates.adminHash = adminHash;
    updates.supervisorHash = supervisorHash;
    updates.inchargeHash = inchargeHash;
  }
  if (typeof params.rtdbUrl === 'string') {
    updates.rtdbUrl = params.rtdbUrl.trim().slice(0, 300);
  }
  if (typeof params.rtdbProjectId === 'string') {
    updates.rtdbProjectId = params.rtdbProjectId.trim().slice(0, 100);
  }
  if (typeof params.backupRtdbUrl === 'string') {
    updates.backupRtdbUrl = params.backupRtdbUrl.trim().slice(0, 300);
  }
  if (typeof params.storageBucket === 'string') {
    updates.storageBucket = params.storageBucket.trim().slice(0, 200);
  }

  try {
    await updateDoc(doc(db, 'portals', params.portalId), updates);
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, docPath, auth);
  }

  const { updatedAt: _ignored, ...plainUpdates } = updates;
  return {
    ...plainUpdates,
    updatedAt: new Date().toISOString()
  };
}

export async function sharePortalWithEmailInFirestore(params: {
  slotKey?: string;
  portal: AttendancePortalRecord;
  recipientEmail: string;
}): Promise<string[]> {
  const { db, auth } = getSlotServices(params.slotKey);
  const normalizedRecipient = normalizeEmail(params.recipientEmail);
  const nextShared = Array.from(
    new Set([...(params.portal.sharedWithEmails || []).map(normalizeEmail), normalizedRecipient])
  ).slice(0, MAX_SHARED_EMAILS_PER_PORTAL);

  const shareId = buildDeterministicShareId(params.portal.id, normalizedRecipient);
  const batch = writeBatch(db);
  batch.update(doc(db, 'portals', params.portal.id), {
    sharedWithEmails: nextShared,
    updatedAt: serverTimestamp()
  });
  batch.set(doc(db, 'portalShares', shareId), {
    id: shareId,
    portalId: params.portal.id,
    ownerUid: params.portal.ownerUid,
    ownerEmail: normalizeEmail(params.portal.ownerEmail),
    recipientEmail: normalizedRecipient,
    companyName: params.portal.companyName.slice(0, MAX_COMPANY_NAME_LENGTH),
    createdAt: serverTimestamp()
  });

  try {
    await batch.commit();
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `portals/${params.portal.id}/share`, auth);
  }

  return nextShared;
}

export async function revokePortalShareInFirestore(params: {
  slotKey?: string;
  portal: AttendancePortalRecord;
  recipientEmail: string;
}): Promise<string[]> {
  const { db, auth } = getSlotServices(params.slotKey);
  const normalizedRecipient = normalizeEmail(params.recipientEmail);
  const nextShared = (params.portal.sharedWithEmails || [])
    .map(normalizeEmail)
    .filter(e => e !== normalizedRecipient);

  const shareId = buildDeterministicShareId(params.portal.id, normalizedRecipient);
  const batch = writeBatch(db);
  batch.update(doc(db, 'portals', params.portal.id), {
    sharedWithEmails: nextShared,
    updatedAt: serverTimestamp()
  });
  batch.delete(doc(db, 'portalShares', shareId));

  try {
    await batch.commit();
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `portals/${params.portal.id}/revoke`, auth);
  }

  return nextShared;
}

export async function deletePortalInFirestore(params: {
  slotKey?: string;
  portalId: string;
}): Promise<void> {
  const { db, auth } = getSlotServices(params.slotKey);
  try {
    await deleteDoc(doc(db, 'portals', params.portalId));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, `portals/${params.portalId}`, auth);
  }
}
