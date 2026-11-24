import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState
} from 'react';
import { onAuthStateChanged, signInWithPopup, signOut, type User } from 'firebase/auth';
import {
  DEFAULT_AUTH_SLOT,
  createGoogleProvider,
  getFirebaseAuthForSlot
} from '../lib/firebase';
import { isSuperAdminEmail } from '../utils/siteLogic';
import {
  getEffectiveVerifiedTier,
  normalizeSubscriptionTier,
  normalizeVerificationStatus,
  removeSavedAccount,
  sortSavedAccounts,
  upsertSavedAccount,
  type SavedGoogleAccount,
  type SubscriptionTier,
  type SubscriptionVerificationStatus
} from '../utils/accountLogic';

export interface UserProfileRecord {
  id: number;
  uid: string;
  email: string;
  displayName: string;
  photoUrl: string;
  role: string;
  subscriptionTier: SubscriptionTier;
  subscriptionVerified: boolean;
  subscriptionVerificationStatus: SubscriptionVerificationStatus;
  subscriptionRequestedTier: string;
  subscriptionProofUrl?: string;
  subscriptionVerifiedAt?: string | null;
  subscriptionVerifiedBy?: string;
  signInCount: number;
  createdAt: string;
  lastSignInAt: string;
}

export interface AdminOverviewData {
  summary: {
    totalSignedInUsers: number;
    totalCumulativeSignIns: number;
    activeLast24h: number;
    activeLast7d: number;
    superAdminCount: number;
    totalSiteSnapshots: number;
    totalBookkeepingExports: number;
  };
  users: UserProfileRecord[];
  recentSiteSnapshots: {
    id: number;
    siteName: string;
    subgroupName: string;
    ownerEmail: string;
    ownerName: string;
    workerCount: number;
    dprCount: number;
    updatedAt: string;
  }[];
  recentBookkeepingExports: {
    id: number;
    siteName: string;
    subgroupName: string;
    monthKey: string;
    workerCount: number;
    totalLaborCost: number;
    totalMaterialValue: number;
    totalAdvances: number;
    netPayable: number;
    ownerEmail: string;
    ownerName: string;
    exportedAt: string;
  }[];
}

export interface SignInGoogleOptions {
  loginHint?: string;
  slotKey?: string;
}

interface AuthContextValue {
  user: User | null;
  activeSlotKey: string;
  isSuperAdmin: boolean;
  profileRecord: UserProfileRecord | null;
  activeSubscriptionTier: SubscriptionTier;
  activePhotoUrl: string;
  savedAccounts: SavedGoogleAccount[];
  liveSessionUids: string[];
  loading: boolean;
  signInWithGoogle: (
    options?: SignInGoogleOptions
  ) => Promise<{ user: User; isSuperAdmin: boolean; instant?: boolean } | null>;
  switchAccount: (
    uidOrEmail: string
  ) => Promise<{ user: User; isSuperAdmin: boolean; instant?: boolean } | null>;
  addAnotherAccount: () => Promise<{
    user: User;
    isSuperAdmin: boolean;
    instant?: boolean;
  } | null>;
  removeSavedAccountFromList: (uidOrEmail: string) => Promise<void>;
  signOutUser: () => Promise<void>;
  signOutAllAccounts: () => Promise<void>;
  updateMyProfile: (updates: {
    displayName?: string;
    photoUrl?: string | null;
  }) => Promise<UserProfileRecord | null>;
  submitSubscriptionVerification: (
    requestedTier: 'pro' | 'ultra',
    proofImage: string
  ) => Promise<UserProfileRecord | null>;
  updateUserTierAsAdmin: (
    targetUid: string,
    tier: SubscriptionTier,
    action?: 'approve' | 'reject'
  ) => Promise<boolean>;
  getAuthToken: () => Promise<string | null>;
  fetchAdminOverview: () => Promise<AdminOverviewData | null>;
}

const SAVED_ACCOUNTS_KEY = 'gi_saved_google_accounts_v2';
const LEGACY_SAVED_ACCOUNTS_KEY = 'gi_saved_google_accounts_v1';
const ACTIVE_SLOT_KEY = 'gi_active_auth_slot_v1';

function parseUserProfileRecord(raw: any): UserProfileRecord {
  const verified = Boolean(raw?.subscriptionVerified);
  return {
    id: Number(raw?.id || 0),
    uid: String(raw?.uid || ''),
    email: String(raw?.email || '').toLowerCase(),
    displayName: String(raw?.displayName || ''),
    photoUrl: String(raw?.photoUrl || ''),
    role: String(raw?.role || 'member'),
    subscriptionTier: getEffectiveVerifiedTier(raw?.subscriptionTier, verified),
    subscriptionVerified: verified,
    subscriptionVerificationStatus: normalizeVerificationStatus(
      raw?.subscriptionVerificationStatus
    ),
    subscriptionRequestedTier: String(raw?.subscriptionRequestedTier || ''),
    subscriptionProofUrl:
      typeof raw?.subscriptionProofUrl === 'string'
        ? raw.subscriptionProofUrl
        : '',
    subscriptionVerifiedAt: raw?.subscriptionVerifiedAt ?? null,
    subscriptionVerifiedBy: String(raw?.subscriptionVerifiedBy || ''),
    signInCount: Number(raw?.signInCount || 1),
    createdAt: String(raw?.createdAt || new Date().toISOString()),
    lastSignInAt: String(raw?.lastSignInAt || new Date().toISOString())
  };
}

function loadSavedAccountsFromStorage(): SavedGoogleAccount[] {
  try {
    const raw =
      window.localStorage.getItem(SAVED_ACCOUNTS_KEY) ||
      window.localStorage.getItem(LEGACY_SAVED_ACCOUNTS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        item =>
          item &&
          typeof item.uid === 'string' &&
          typeof item.email === 'string' &&
          item.uid.trim() &&
          item.email.trim()
      )
      .map(item => {
        const verified = Boolean(item.subscriptionVerified);
        return {
          uid: String(item.uid),
          slotKey:
            typeof item.slotKey === 'string' && item.slotKey.trim()
              ? item.slotKey.trim()
              : DEFAULT_AUTH_SLOT,
          email: String(item.email).toLowerCase(),
          displayName: String(item.displayName || ''),
          photoUrl: String(item.photoUrl || ''),
          role: String(item.role || 'member'),
          subscriptionTier: getEffectiveVerifiedTier(
            item.subscriptionTier,
            verified
          ),
          subscriptionVerified: verified,
          lastUsedAt: String(item.lastUsedAt || new Date().toISOString())
        };
      });
  } catch {
    return [];
  }
}

function persistSavedAccounts(list: SavedGoogleAccount[]) {
  try {
    // Store ONLY non-sensitive display metadata & Firebase slot names (never tokens or secrets)
    window.localStorage.setItem(SAVED_ACCOUNTS_KEY, JSON.stringify(list));
  } catch {
    // Ignore quota/sandbox errors
  }
}

function loadActiveSlotKey(): string {
  try {
    const raw = window.localStorage.getItem(ACTIVE_SLOT_KEY);
    if (raw && raw.trim()) return raw.trim();
  } catch {
    // Ignore storage errors
  }
  return DEFAULT_AUTH_SLOT;
}

function persistActiveSlotKey(slotKey: string) {
  try {
    window.localStorage.setItem(
      ACTIVE_SLOT_KEY,
      (slotKey || '').trim() || DEFAULT_AUTH_SLOT
    );
  } catch {
    // Ignore storage errors
  }
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  activeSlotKey: DEFAULT_AUTH_SLOT,
  isSuperAdmin: false,
  profileRecord: null,
  activeSubscriptionTier: 'standard',
  activePhotoUrl: '',
  savedAccounts: [],
  liveSessionUids: [],
  loading: true,
  signInWithGoogle: async () => null,
  switchAccount: async () => null,
  addAnotherAccount: async () => null,
  removeSavedAccountFromList: async () => {},
  signOutUser: async () => {},
  signOutAllAccounts: async () => {},
  updateMyProfile: async () => null,
  submitSubscriptionVerification: async () => null,
  updateUserTierAsAdmin: async () => false,
  getAuthToken: async () => null,
  fetchAdminOverview: async () => null
});

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({
  children
}) => {
  const [activeSlotKey, setActiveSlotKeyState] = useState<string>(() =>
    loadActiveSlotKey()
  );
  const activeSlotKeyRef = useRef<string>(activeSlotKey);

  const [user, setUser] = useState<User | null>(null);
  const [profileRecord, setProfileRecord] = useState<UserProfileRecord | null>(
    null
  );
  const [serverSuperAdmin, setServerSuperAdmin] = useState<boolean>(false);
  const [savedAccounts, setSavedAccounts] = useState<SavedGoogleAccount[]>(() =>
    loadSavedAccountsFromStorage()
  );
  const [liveSessionUids, setLiveSessionUids] = useState<string[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  // Keep Firebase ID token & live slot sessions strictly in memory
  const tokenRef = useRef<string | null>(null);
  const explicitSignInUidRef = useRef<string | null>(null);
  const liveUsersBySlotRef = useRef<Map<string, User | null>>(new Map());
  const slotUnsubscribersRef = useRef<Map<string, () => void>>(new Map());

  const setActiveSlotKey = useCallback((nextSlot: string) => {
    const clean = (nextSlot || '').trim() || DEFAULT_AUTH_SLOT;
    activeSlotKeyRef.current = clean;
    setActiveSlotKeyState(clean);
    persistActiveSlotKey(clean);
  }, []);

  const recomputeLiveUids = useCallback(() => {
    const uids = new Set<string>();
    liveUsersBySlotRef.current.forEach(u => {
      if (u?.uid) uids.add(u.uid);
    });
    setLiveSessionUids(Array.from(uids));
  }, []);

  const isSuperAdmin = Boolean(
    user && (serverSuperAdmin || isSuperAdminEmail(user.email))
  );

  // Strictly verified-only Google AI Pro / Ultra tier
  const activeSubscriptionTier: SubscriptionTier = user
    ? getEffectiveVerifiedTier(
        profileRecord?.subscriptionTier,
        profileRecord?.subscriptionVerified
      )
    : 'standard';

  const activePhotoUrl: string =
    profileRecord?.photoUrl || user?.photoURL || '';

  const rememberAccount = useCallback(
    (entry: {
      uid: string;
      slotKey?: string;
      email: string;
      displayName?: string;
      photoUrl?: string;
      role?: string;
      subscriptionTier?: SubscriptionTier;
      subscriptionVerified?: boolean;
    }) => {
      setSavedAccounts(prev => {
        const next = sortSavedAccounts(
          upsertSavedAccount(prev, {
            ...entry,
            slotKey: entry.slotKey || activeSlotKeyRef.current,
            lastUsedAt: new Date().toISOString()
          }),
          entry.uid
        );
        persistSavedAccounts(next);
        return next;
      });
    },
    []
  );

  const hydrateActiveUserFromServer = useCallback(
    async (
      targetUser: User,
      slotKey: string,
      options?: { recordSignIn?: boolean }
    ): Promise<{ record: UserProfileRecord | null; isSuperAdmin: boolean }> => {
      const token = await targetUser.getIdToken();
      tokenRef.current = token;

      let superAdminFlag = isSuperAdminEmail(targetUser.email);
      let loadedRecord: UserProfileRecord | null = null;

      try {
        const resp = options?.recordSignIn
          ? await fetch('/api/auth/sync', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${token}`
              },
              body: JSON.stringify({
                recordSignIn: true,
                displayName: targetUser.displayName || '',
                photoUrl: targetUser.photoURL || ''
              })
            })
          : await fetch('/api/me', {
              headers: { Authorization: `Bearer ${token}` }
            });

        if (resp.ok) {
          const data = await resp.json();
          if (data?.user) {
            loadedRecord = parseUserProfileRecord(data.user);
            setProfileRecord(loadedRecord);
            rememberAccount({
              uid: loadedRecord.uid,
              slotKey,
              email: loadedRecord.email,
              displayName:
                loadedRecord.displayName || targetUser.displayName || '',
              photoUrl: loadedRecord.photoUrl || targetUser.photoURL || '',
              role: loadedRecord.role,
              subscriptionTier: loadedRecord.subscriptionTier,
              subscriptionVerified: loadedRecord.subscriptionVerified
            });
          }
          superAdminFlag = Boolean(data?.isSuperAdmin);
          setServerSuperAdmin(superAdminFlag);
        } else {
          setServerSuperAdmin(superAdminFlag);
          rememberAccount({
            uid: targetUser.uid,
            slotKey,
            email: targetUser.email || '',
            displayName: targetUser.displayName || '',
            photoUrl: targetUser.photoURL || '',
            role: superAdminFlag ? 'super_admin' : 'member',
            subscriptionTier: 'standard',
            subscriptionVerified: false
          });
        }
      } catch {
        setServerSuperAdmin(superAdminFlag);
        rememberAccount({
          uid: targetUser.uid,
          slotKey,
          email: targetUser.email || '',
          displayName: targetUser.displayName || '',
          photoUrl: targetUser.photoURL || '',
          role: superAdminFlag ? 'super_admin' : 'member',
          subscriptionTier: 'standard',
          subscriptionVerified: false
        });
      }

      return { record: loadedRecord, isSuperAdmin: superAdminFlag };
    },
    [rememberAccount]
  );

  // Subscribe to a Firebase Auth slot once so every added Google account stays live simultaneously
  const ensureSlotSubscribed = useCallback(
    (slotKey: string) => {
      const cleanSlot = (slotKey || '').trim() || DEFAULT_AUTH_SLOT;
      if (slotUnsubscribersRef.current.has(cleanSlot)) return;

      const slotAuth = getFirebaseAuthForSlot(cleanSlot);
      const unsub = onAuthStateChanged(slotAuth, async nextUser => {
        liveUsersBySlotRef.current.set(cleanSlot, nextUser);
        recomputeLiveUids();

        if (cleanSlot !== activeSlotKeyRef.current) {
          // Background slot restored — refresh its cached display info if signed in
          if (nextUser?.email) {
            rememberAccount({
              uid: nextUser.uid,
              slotKey: cleanSlot,
              email: nextUser.email,
              displayName: nextUser.displayName || '',
              photoUrl: nextUser.photoURL || ''
            });
          }
          return;
        }

        setUser(nextUser);
        if (nextUser) {
          if (explicitSignInUidRef.current === nextUser.uid) {
            explicitSignInUidRef.current = null;
            setLoading(false);
            return;
          }
          try {
            await hydrateActiveUserFromServer(nextUser, cleanSlot, {
              recordSignIn: false
            });
          } catch {
            tokenRef.current = null;
          }
        } else {
          tokenRef.current = null;
          setProfileRecord(null);
          setServerSuperAdmin(false);
        }
        setLoading(false);
      });

      slotUnsubscribersRef.current.set(cleanSlot, unsub);
    },
    [hydrateActiveUserFromServer, recomputeLiveUids, rememberAccount]
  );

  // Keep default slot, active slot, and every saved account slot subscribed
  useEffect(() => {
    const slots = new Set<string>([DEFAULT_AUTH_SLOT, activeSlotKey]);
    savedAccounts.forEach(acc => {
      if (acc.slotKey) slots.add(acc.slotKey);
    });
    slots.forEach(slot => ensureSlotSubscribed(slot));
  }, [activeSlotKey, savedAccounts, ensureSlotSubscribed]);

  // Cleanup all Firebase Auth listeners on unmount
  useEffect(() => {
    const unsubMap = slotUnsubscribersRef.current;
    return () => {
      unsubMap.forEach(unsub => unsub());
      unsubMap.clear();
    };
  }, []);

  const signInWithGoogle = useCallback(
    async (
      options?: SignInGoogleOptions
    ): Promise<{
      user: User;
      isSuperAdmin: boolean;
      instant?: boolean;
    } | null> => {
      try {
        const targetSlot =
          (options?.slotKey || '').trim() || activeSlotKeyRef.current || DEFAULT_AUTH_SLOT;
        ensureSlotSubscribed(targetSlot);
        const slotAuth = getFirebaseAuthForSlot(targetSlot);
        const provider = createGoogleProvider(options?.loginHint);

        const result = await signInWithPopup(slotAuth, provider);
        const signedUser = result.user;

        // Deduplicate if this UID was already live in another slot
        const duplicateSlots: string[] = [];
        liveUsersBySlotRef.current.forEach((existingUser, slot) => {
          if (slot !== targetSlot && existingUser?.uid === signedUser.uid) {
            duplicateSlots.push(slot);
          }
        });
        for (const dupSlot of duplicateSlots) {
          try {
            await signOut(getFirebaseAuthForSlot(dupSlot));
          } catch {
            // Ignore cleanup failure
          }
          liveUsersBySlotRef.current.set(dupSlot, null);
        }

        explicitSignInUidRef.current = signedUser.uid;
        liveUsersBySlotRef.current.set(targetSlot, signedUser);
        recomputeLiveUids();
        setActiveSlotKey(targetSlot);
        setUser(signedUser);

        const { isSuperAdmin: superAdminFlag } =
          await hydrateActiveUserFromServer(signedUser, targetSlot, {
            recordSignIn: true
          });

        return { user: signedUser, isSuperAdmin: superAdminFlag, instant: false };
      } catch (error: any) {
        const code = typeof error?.code === 'string' ? error.code : '';
        console.error('Google Sign-In failed:', code || error);
        if (code === 'auth/popup-blocked') {
          throw new Error(
            'Popup blocked by browser. Please allow popups for this site and try again.'
          );
        }
        if (
          code === 'auth/popup-closed-by-user' ||
          code === 'auth/cancelled-popup-request'
        ) {
          return null;
        }
        if (code === 'auth/unauthorized-domain') {
          throw new Error(
            'This preview domain is not yet authorized for Google Sign-In.'
          );
        }
        throw new Error(
          error?.message || 'Google Sign-In could not be completed.'
        );
      }
    },
    [
      ensureSlotSubscribed,
      hydrateActiveUserFromServer,
      recomputeLiveUids,
      setActiveSlotKey
    ]
  );

  // Instant 1-click switch whenever the target account already has an active Firebase Auth slot!
  const switchAccount = useCallback(
    async (
      uidOrEmail: string
    ): Promise<{
      user: User;
      isSuperAdmin: boolean;
      instant?: boolean;
    } | null> => {
      const needle = (uidOrEmail || '').trim().toLowerCase();
      if (!needle) return null;

      // 1. Check live in-memory Firebase Auth slots first (ZERO popup!)
      let matchedSlot: string | null = null;
      let matchedUser: User | null = null;
      liveUsersBySlotRef.current.forEach((slotUser, slotKey) => {
        if (!slotUser || matchedUser) return;
        if (
          slotUser.uid.toLowerCase() === needle ||
          (slotUser.email || '').toLowerCase() === needle
        ) {
          matchedSlot = slotKey;
          matchedUser = slotUser;
        }
      });

      const savedMatch = savedAccounts.find(
        acc =>
          acc.uid.toLowerCase() === needle || acc.email.toLowerCase() === needle
      );

      // Also check slotAuth.currentUser directly in case listener hasn't fired yet
      if (!matchedUser && savedMatch?.slotKey) {
        const candidateUser = getFirebaseAuthForSlot(
          savedMatch.slotKey
        ).currentUser;
        if (
          candidateUser &&
          (candidateUser.uid === savedMatch.uid ||
            (candidateUser.email || '').toLowerCase() ===
              savedMatch.email.toLowerCase())
        ) {
          matchedSlot = savedMatch.slotKey;
          matchedUser = candidateUser;
        }
      }

      if (matchedSlot && matchedUser) {
        setActiveSlotKey(matchedSlot);
        setUser(matchedUser);
        const { isSuperAdmin: superAdminFlag } =
          await hydrateActiveUserFromServer(matchedUser, matchedSlot, {
            recordSignIn: false
          });
        return {
          user: matchedUser,
          isSuperAdmin: superAdminFlag,
          instant: true
        };
      }

      // 2. Fallback: session wasn't live in this browser yet -> open Google sign-in in a dedicated slot
      const targetEmail =
        savedMatch?.email || (needle.includes('@') ? needle : undefined);
      const preferredSlot =
        savedMatch?.slotKey &&
        !liveUsersBySlotRef.current.get(savedMatch.slotKey)
          ? savedMatch.slotKey
          : `gi_acct_${Date.now()}`;

      return signInWithGoogle({
        loginHint: targetEmail,
        slotKey: preferredSlot
      });
    },
    [
      savedAccounts,
      setActiveSlotKey,
      hydrateActiveUserFromServer,
      signInWithGoogle
    ]
  );

  // Add another Google account into a brand-new independent Firebase Auth slot
  // so existing accounts remain signed in for instant 1-click switching!
  const addAnotherAccount = useCallback(async () => {
    const newSlotKey = `gi_acct_${Date.now()}`;
    return signInWithGoogle({ slotKey: newSlotKey });
  }, [signInWithGoogle]);

  const removeSavedAccountFromList = useCallback(
    async (uidOrEmail: string) => {
      const needle = (uidOrEmail || '').trim().toLowerCase();
      if (!needle) return;

      // Sign out its background slot if it has one (not the currently active account)
      const slotsToSignOut: string[] = [];
      liveUsersBySlotRef.current.forEach((slotUser, slotKey) => {
        if (!slotUser || slotKey === activeSlotKeyRef.current) return;
        if (
          slotUser.uid.toLowerCase() === needle ||
          (slotUser.email || '').toLowerCase() === needle
        ) {
          slotsToSignOut.push(slotKey);
        }
      });

      for (const sKey of slotsToSignOut) {
        try {
          await signOut(getFirebaseAuthForSlot(sKey));
        } catch {
          // Ignore sign-out errors
        }
        liveUsersBySlotRef.current.set(sKey, null);
      }
      recomputeLiveUids();

      setSavedAccounts(prev => {
        const next = removeSavedAccount(prev, uidOrEmail);
        persistSavedAccounts(next);
        return next;
      });
    },
    [recomputeLiveUids]
  );

  const signOutUser = useCallback(async (): Promise<void> => {
    const currentSlot = activeSlotKeyRef.current;
    const currentUid = user?.uid;

    tokenRef.current = null;
    explicitSignInUidRef.current = null;

    try {
      await signOut(getFirebaseAuthForSlot(currentSlot));
    } catch {
      // Ignore sign-out error
    }
    liveUsersBySlotRef.current.set(currentSlot, null);
    recomputeLiveUids();

    if (currentUid) {
      setSavedAccounts(prev => {
        const next = removeSavedAccount(prev, currentUid);
        persistSavedAccounts(next);
        return next;
      });
    }

    // If another Google account is still signed in on another slot, seamlessly activate it
    let fallbackSlot: string | null = null;
    let fallbackUser: User | null = null;
    liveUsersBySlotRef.current.forEach((slotUser, slotKey) => {
      if (slotUser && slotKey !== currentSlot && !fallbackUser) {
        fallbackSlot = slotKey;
        fallbackUser = slotUser;
      }
    });

    if (fallbackSlot && fallbackUser) {
      setActiveSlotKey(fallbackSlot);
      setUser(fallbackUser);
      await hydrateActiveUserFromServer(fallbackUser, fallbackSlot, {
        recordSignIn: false
      });
    } else {
      setActiveSlotKey(DEFAULT_AUTH_SLOT);
      setUser(null);
      setProfileRecord(null);
      setServerSuperAdmin(false);
    }
  }, [
    user,
    recomputeLiveUids,
    setActiveSlotKey,
    hydrateActiveUserFromServer
  ]);

  const signOutAllAccounts = useCallback(async (): Promise<void> => {
    tokenRef.current = null;
    explicitSignInUidRef.current = null;

    const allSlots = new Set<string>([
      DEFAULT_AUTH_SLOT,
      activeSlotKeyRef.current
    ]);
    liveUsersBySlotRef.current.forEach((_, sKey) => allSlots.add(sKey));
    savedAccounts.forEach(acc => {
      if (acc.slotKey) allSlots.add(acc.slotKey);
    });

    await Promise.all(
      Array.from(allSlots).map(async sKey => {
        try {
          await signOut(getFirebaseAuthForSlot(sKey));
        } catch {
          // Ignore individual sign-out errors
        }
        liveUsersBySlotRef.current.set(sKey, null);
      })
    );

    recomputeLiveUids();
    setSavedAccounts([]);
    persistSavedAccounts([]);
    setActiveSlotKey(DEFAULT_AUTH_SLOT);
    setUser(null);
    setProfileRecord(null);
    setServerSuperAdmin(false);
  }, [savedAccounts, recomputeLiveUids, setActiveSlotKey]);

  const getAuthToken = useCallback(async (): Promise<string | null> => {
    const activeAuth = getFirebaseAuthForSlot(activeSlotKeyRef.current);
    const activeCurrentUser = activeAuth.currentUser || user;
    if (!activeCurrentUser) return null;
    try {
      const freshToken = await activeCurrentUser.getIdToken();
      tokenRef.current = freshToken;
      return freshToken;
    } catch {
      return tokenRef.current;
    }
  }, [user]);

  const updateMyProfile = useCallback(
    async (updates: {
      displayName?: string;
      photoUrl?: string | null;
    }): Promise<UserProfileRecord | null> => {
      const token = await getAuthToken();
      if (!token) return null;

      const resp = await fetch('/api/me/profile', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          displayName: updates.displayName,
          photoUrl: updates.photoUrl
        })
      });
      if (!resp.ok) {
        const errBody = await resp.json().catch(() => ({}));
        throw new Error(errBody?.error || 'Failed to update profile');
      }
      const data = await resp.json();
      if (data?.user) {
        const record = parseUserProfileRecord(data.user);
        setProfileRecord(record);
        rememberAccount({
          uid: record.uid,
          slotKey: activeSlotKeyRef.current,
          email: record.email,
          displayName: record.displayName,
          photoUrl: record.photoUrl,
          role: record.role,
          subscriptionTier: record.subscriptionTier,
          subscriptionVerified: record.subscriptionVerified
        });
        return record;
      }
      return null;
    },
    [getAuthToken, rememberAccount]
  );

  const submitSubscriptionVerification = useCallback(
    async (
      requestedTier: 'pro' | 'ultra',
      proofImage: string
    ): Promise<UserProfileRecord | null> => {
      const token = await getAuthToken();
      if (!token) {
        throw new Error('Please sign in with Google first.');
      }
      const resp = await fetch('/api/me/subscription-verify', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          requestedTier,
          proofImage
        })
      });
      if (!resp.ok) {
        const errBody = await resp.json().catch(() => ({}));
        throw new Error(
          errBody?.error || 'Could not submit verification request'
        );
      }
      const data = await resp.json();
      if (data?.user) {
        const record = parseUserProfileRecord(data.user);
        setProfileRecord(record);
        return record;
      }
      return null;
    },
    [getAuthToken]
  );

  const updateUserTierAsAdmin = useCallback(
    async (
      targetUid: string,
      tier: SubscriptionTier,
      action?: 'approve' | 'reject'
    ): Promise<boolean> => {
      const token = await getAuthToken();
      if (!token) return false;
      const resp = await fetch(
        `/api/admin/users/${encodeURIComponent(targetUid)}/tier`,
        {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`
          },
          body: JSON.stringify({
            subscriptionTier: normalizeSubscriptionTier(tier),
            ...(action ? { action } : {})
          })
        }
      );
      if (!resp.ok) {
        const errBody = await resp.json().catch(() => ({}));
        throw new Error(
          errBody?.error || 'Failed to update verified subscription badge'
        );
      }
      const data = await resp.json();
      if (data?.user) {
        const updatedRecord = parseUserProfileRecord(data.user);
        if (user && user.uid === targetUid) {
          setProfileRecord(updatedRecord);
        }
        setSavedAccounts(prev => {
          const next = prev.map(acc =>
            acc.uid === targetUid
              ? {
                  ...acc,
                  subscriptionTier: updatedRecord.subscriptionTier,
                  subscriptionVerified: updatedRecord.subscriptionVerified
                }
              : acc
          );
          persistSavedAccounts(next);
          return next;
        });
      }
      return true;
    },
    [getAuthToken, user]
  );

  const fetchAdminOverview =
    useCallback(async (): Promise<AdminOverviewData | null> => {
      const token = await getAuthToken();
      if (!token) return null;
      const resp = await fetch('/api/admin/overview', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!resp.ok) {
        const errBody = await resp.json().catch(() => ({}));
        throw new Error(
          errBody?.error || `Failed to load admin overview (${resp.status})`
        );
      }
      const raw = await resp.json();
      return {
        ...raw,
        users: Array.isArray(raw?.users)
          ? raw.users.map(parseUserProfileRecord)
          : []
      } as AdminOverviewData;
    }, [getAuthToken]);

  return (
    <AuthContext.Provider
      value={{
        user,
        activeSlotKey,
        isSuperAdmin,
        profileRecord,
        activeSubscriptionTier,
        activePhotoUrl,
        savedAccounts,
        liveSessionUids,
        loading,
        signInWithGoogle,
        switchAccount,
        addAnotherAccount,
        removeSavedAccountFromList,
        signOutUser,
        signOutAllAccounts,
        updateMyProfile,
        submitSubscriptionVerification,
        updateUserTierAsAdmin,
        getAuthToken,
        fetchAdminOverview
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export function useAuth() {
  return useContext(AuthContext);
}
