import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { MotionConfig, AnimatePresence, motion } from 'motion/react';
import {
  Calendar,
  Lock,
  Unlock,
  CheckSquare,
  ClipboardList,
  Table,
  FileText,
  Crown,
  MessageCircle
} from 'lucide-react';
import { useAuth } from './context/AuthContext';
import {
  LiquidGlassSvgFilters,
  LiquidGlassWallpaper,
  GlassCard,
  GlassAppearanceToggle,
  GlassPillNav,
  handleGlassPointerMove,
  useScrollHeader
} from './components/LiquidGlass';
import {
  SPRING_TACTILE,
  SPRING_CONTAINER,
  SPRING_SHEET,
  parseGlassAppearanceMode,
  type GlassAppearanceMode
} from './utils/glassPhysics';
import { UserAvatar, SubscriptionTierBadge } from './components/UserAvatar';
import { GoogleAccountPopover } from './components/GoogleAccountSwitcher';
import { useLiveChat } from './hooks/useLiveChat';
import { useAutoBackup } from './hooks/useAutoBackup';
import { LiveChatModal } from './components/LiveChatModal';
import { TEAM_RECIPIENT_UID } from './utils/chatLogic';
import { shouldAllowSubgroupWrite } from './utils/backupLogic';
import {
  SiteNode,
  AppState,
  UserRole,
  WorkerProfile,
  DPRRecord,
  TimelineNote,
  EquipmentItem,
  DEFAULT_SEED_SITES,
  createSeedAppState,
  createEmptyAppState,
  aggregateMasterRollupState,
  sanitizeStructure,
  sanitizeState,
  calculateSiteDashboardStats,
  calculateActiveStockMap,
  isDayAutoLockedForRole
} from './utils/siteLogic';
import {
  getFirebaseServices,
  setActivePortalFirebaseConfig,
  safeGetStorage,
  safeSetStorage,
  safeRemoveStorage
} from './utils/firebaseBridge';
import {
  generatePortalId,
  hashPortalRolePassword,
  normalizeEmail,
  type AttendancePortalRecord
} from './utils/portalLogic';
import {
  subscribeUserPortals,
  createPortalInFirestore,
  updatePortalSettingsInFirestore,
  sharePortalWithEmailInFirestore,
  revokePortalShareInFirestore,
  deletePortalInFirestore
} from './lib/portalStore';
import { AttendanceTab } from './components/AttendanceTab';
import { DprSiteTab } from './components/DprSiteTab';
import { RegisterTab } from './components/RegisterTab';
import { ReportsSlipsTab } from './components/ReportsSlipsTab';
import {
  PinLoginModal,
  WorkerFormModal,
  WorkerProfileModal,
  WorkerTransferModal,
  StockThresholdModal
} from './components/ModalsAndDrawers';
import {
  CompanyLetterhead,
  IntroCenterToHeaderGlide,
  SiteHierarchyDropdown,
  ProfileAnalyticsDrawer,
  PresenceUser,
  ActivityLogItem
} from './components/ProfileAnalyticsDrawer';
import { OfflineQueueBanner } from './components/PwaAndOfflineBar';
import { StartAuthScreen } from './components/StartAuthScreen';
import { PortalHubScreen } from './components/PortalHubScreen';
import {
  CreatePortalWizard,
  type PortalWizardSubmitPayload
} from './components/CreatePortalWizard';
import { PortalShareModal } from './components/PortalShareModal';
import { PortalTutorialModal } from './components/PortalTutorialModal';

type ActiveTab = 'attendance' | 'dpr' | 'register' | 'reports';

const DEMO_USER = {
  uid: 'demo_owner_uid',
  email: 'owner@demo-company.com',
  displayName: 'Aarav Sharma',
  photoURL: null as string | null
};

function isDemoHubModeEnabled(): boolean {
  if (typeof window === 'undefined') return false;
  return new URLSearchParams(window.location.search).get('demo') === 'hub';
}

function portalStorageKey(portalId: string | null | undefined, suffix: string): string {
  const safeId = (portalId || 'default').replace(/[^a-zA-Z0-9_-]/g, '_');
  return `ap_${safeId}_${suffix}`;
}

export default function App() {
  const isDemoMode = useMemo(() => isDemoHubModeEnabled(), []);
  const now = useMemo(() => new Date(), []);
  const currentMonthKey = `${now.getMonth() + 1}-${now.getFullYear()}`;
  const currentDayOfMonth = now.getDate();
  const [selectedDay, setSelectedDay] = useState<number>(now.getDate());
  const [selectedMonth, setSelectedMonth] = useState<number>(now.getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState<number>(now.getFullYear());

  const monthKey = `${selectedMonth}-${selectedYear}`;
  const dateKey = `${selectedDay}-${monthKey}`;

  // Auth context
  const {
    user: authUser,
    loading: authLoading,
    activeSlotKey,
    isSuperAdmin,
    profileRecord,
    activeSubscriptionTier,
    activePhotoUrl,
    savedAccounts,
    liveSessionUids,
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
  } = useAuth();

  // Effective signed-in user (real Google user, or in-memory demo user ONLY when ?demo=hub is explicitly passed)
  const effectiveUser = useMemo(() => {
    if (authUser) {
      return {
        uid: authUser.uid,
        email: normalizeEmail(authUser.email || ''),
        displayName:
          profileRecord?.displayName ||
          authUser.displayName ||
          (authUser.email ? authUser.email.split('@')[0] : 'Portal User'),
        photoURL: activePhotoUrl || authUser.photoURL || profileRecord?.photoUrl || ''
      };
    }
    if (isDemoMode) {
      return {
        uid: DEMO_USER.uid,
        email: DEMO_USER.email,
        displayName: DEMO_USER.displayName,
        photoURL: ''
      };
    }
    return null;
  }, [authUser, profileRecord, activePhotoUrl, isDemoMode]);

  // Multi-Tenant Portal Directory State
  const [ownedPortals, setOwnedPortals] = useState<AttendancePortalRecord[]>([]);
  const [sharedPortals, setSharedPortals] = useState<AttendancePortalRecord[]>([]);
  const [loadingPortals, setLoadingPortals] = useState<boolean>(false);
  const [portalsError, setPortalsError] = useState<string | null>(null);
  const [activePortal, setActivePortal] = useState<AttendancePortalRecord | null>(null);

  // Multi-Tenant Modals
  const [isWizardOpen, setIsWizardOpen] = useState(false);
  const [wizardEditingPortal, setWizardEditingPortal] = useState<AttendancePortalRecord | null>(null);
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);
  const [shareTargetPortal, setShareTargetPortal] = useState<AttendancePortalRecord | null>(null);
  const [isTutorialOpen, setIsTutorialOpen] = useState(false);

  // Theme & iOS 27 Glass Appearance state (Light/Dark + Clear/Tinted)
  const [darkMode, setDarkMode] = useState<boolean>(() => safeGetStorage('ap_dark_mode') === '1');
  const [glassMode, setGlassMode] = useState<GlassAppearanceMode>(() =>
    parseGlassAppearanceMode(safeGetStorage('ap_glass_mode'))
  );
  const [retryPortalsNonce, setRetryPortalsNonce] = useState<number>(0);
  const { isScrolled: isWorkspaceScrolled } = useScrollHeader();

  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark');
      safeSetStorage('ap_dark_mode', '1');
    } else {
      document.documentElement.classList.remove('dark');
      safeSetStorage('ap_dark_mode', '0');
    }
  }, [darkMode]);

  useEffect(() => {
    document.documentElement.dataset.glass = glassMode;
    safeSetStorage('ap_glass_mode', glassMode);
  }, [glassMode]);

  const toggleDarkMode = useCallback(() => setDarkMode(d => !d), []);
  const toggleGlassMode = useCallback(
    () => setGlassMode(m => (m === 'clear' ? 'tinted' : 'clear')),
    []
  );

  // Active Portal Sites & Subgroups state
  const [sites, setSites] = useState<SiteNode[]>(DEFAULT_SEED_SITES);
  const [currentSiteId, setCurrentSiteId] = useState<string>(DEFAULT_SEED_SITES[0].id);
  const [currentSubgroupId, setCurrentSubgroupId] = useState<string>(
    DEFAULT_SEED_SITES[0].subgroups[0].id
  );
  const isMasterRollup = currentSubgroupId === 'ALL_GROUPS';

  const [appState, setAppState] = useState<AppState>(() =>
    createSeedAppState(`${now.getMonth() + 1}-${now.getFullYear()}`, now.getDate())
  );

  // Intro Glide State
  const headerLogoRef = useRef<HTMLDivElement | null>(null);
  const [introStage, setIntroStage] = useState<'center' | 'gliding' | 'done'>('done');
  const [isIntroCloudReady, setIsIntroCloudReady] = useState<boolean>(true);

  // Device / User display name (auto-populated from Google Account)
  const [userName, setUserName] = useState<string>(() => {
    const saved = safeGetStorage('ap_user_profile');
    return saved && saved.trim() ? saved.trim() : '';
  });

  useEffect(() => {
    if (effectiveUser?.displayName) {
      const cleanName = effectiveUser.displayName.trim();
      if (cleanName && !userName) {
        setUserName(cleanName);
        safeSetStorage('ap_user_profile', cleanName);
      }
    }
  }, [effectiveUser?.displayName, userName]);

  // Role state (per-portal isolated)
  const [userRole, setUserRole] = useState<UserRole>('viewer');

  // Workspace Navigation & Modals
  const [activeTab, setActiveTab] = useState<ActiveTab>('attendance');
  const [isPinModalOpen, setIsPinModalOpen] = useState(false);
  const [isWorkerModalOpen, setIsWorkerModalOpen] = useState(false);
  const [editingWorker, setEditingWorker] = useState<WorkerProfile | null>(null);
  const [profileWorker, setProfileWorker] = useState<WorkerProfile | null>(null);
  const [isTransferModalOpen, setIsTransferModalOpen] = useState(false);
  const [transferTargetWorker, setTransferTargetWorker] = useState<WorkerProfile | null>(null);
  const [isStockThresholdModalOpen, setIsStockThresholdModalOpen] = useState(false);
  const [isAnalyticsOpen, setIsAnalyticsOpen] = useState(false);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [isAccountMenuOpen, setIsAccountMenuOpen] = useState(false);

  const [syncStatus, setSyncStatus] = useState<'synced' | 'syncing' | 'local'>('synced');
  const [isOnline, setIsOnline] = useState<boolean>(() =>
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );
  const [offlineQueuedCount, setOfflineQueuedCount] = useState<number>(0);
  const [totalSyncs, setTotalSyncs] = useState<number>(1);
  const [presenceList, setPresenceList] = useState<PresenceUser[]>([]);
  const [peakUsers, setPeakUsers] = useState<number>(1);
  const [activityLogs, setActivityLogs] = useState<ActivityLogItem[]>([]);
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' | 'info' } | null>(
    null
  );

  const showToast = useCallback((msg: string, type: 'success' | 'error' | 'info' = 'info') => {
    setToast({ msg, type });
    setTimeout(() => {
      setToast(prev => (prev?.msg === msg ? null : prev));
    }, 3400);
  }, []);

  // Seed demo portals when ?demo=hub is active
  useEffect(() => {
    if (!isDemoMode || authUser) return;
    let cancelled = false;
    (async () => {
      const ownedId = 'portal_skyline_demo';
      const sharedId = 'portal_apex_shared';
      const [oAdmin, oSup, oInc, sAdmin, sSup, sInc] = await Promise.all([
        hashPortalRolePassword(ownedId, 'Admin123'),
        hashPortalRolePassword(ownedId, 'Super123'),
        hashPortalRolePassword(ownedId, 'Site123'),
        hashPortalRolePassword(sharedId, 'ApexAdmin1'),
        hashPortalRolePassword(sharedId, 'ApexSup1'),
        hashPortalRolePassword(sharedId, 'ApexSite1')
      ]);
      if (cancelled) return;
      const nowIso = new Date().toISOString();
      setOwnedPortals([
        {
          id: ownedId,
          ownerUid: DEMO_USER.uid,
          ownerEmail: DEMO_USER.email,
          ownerName: DEMO_USER.displayName,
          companyName: 'Skyline Civil Infrastructure',
          companySubtitle: 'Regd. Office: Sector 18, Gurugram, Haryana',
          companyLogo: '',
          adminHash: oAdmin,
          supervisorHash: oSup,
          inchargeHash: oInc,
          rtdbUrl: 'https://skyline-civil-demo-default-rtdb.firebaseio.com',
          rtdbProjectId: 'skyline-civil-demo',
          backupRtdbUrl: '',
          storageBucket: 'skyline-civil-demo.appspot.com',
          sharedWithEmails: ['supervisor.raj@gmail.com'],
          createdAt: nowIso,
          updatedAt: nowIso
        }
      ]);
      setSharedPortals([
        {
          id: sharedId,
          ownerUid: 'partner_uid_01',
          ownerEmail: 'partner@apexbuilders.com',
          ownerName: 'Vikram Mehta',
          companyName: 'Apex Builders & Contractors',
          companySubtitle: 'Industrial Park Phase-II, Pune',
          companyLogo: '',
          adminHash: sAdmin,
          supervisorHash: sSup,
          inchargeHash: sInc,
          rtdbUrl: 'https://apex-builders-rtdb-default-rtdb.firebaseio.com',
          rtdbProjectId: 'apex-builders-rtdb',
          backupRtdbUrl: '',
          storageBucket: 'apex-builders-rtdb.appspot.com',
          sharedWithEmails: [DEMO_USER.email],
          createdAt: nowIso,
          updatedAt: nowIso
        }
      ]);
      setLoadingPortals(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [isDemoMode, authUser]);

  // Real-time Firestore subscription for the signed-in Google user's owned & shared portals
  useEffect(() => {
    if (!authUser || !authUser.email) {
      if (!isDemoMode) {
        setOwnedPortals([]);
        setSharedPortals([]);
        setActivePortal(null);
        setActivePortalFirebaseConfig(null);
      }
      return;
    }

    setLoadingPortals(true);
    setPortalsError(null);
    let ownedReady = false;
    let sharedReady = false;

    const unsub = subscribeUserPortals({
      uid: authUser.uid,
      email: authUser.email,
      slotKey: activeSlotKey,
      onOwnedChange: list => {
        setOwnedPortals(list);
        ownedReady = true;
        if (ownedReady && sharedReady) setLoadingPortals(false);
      },
      onSharedChange: list => {
        setSharedPortals(list);
        sharedReady = true;
        if (ownedReady && sharedReady) setLoadingPortals(false);
      },
      onError: err => {
        setLoadingPortals(false);
        setPortalsError(err?.message || 'Unable to load portals right now.');
      }
    });

    const fallbackReadyTimer = window.setTimeout(() => {
      setLoadingPortals(false);
    }, 3000);

    return () => {
      window.clearTimeout(fallbackReadyTimer);
      unsub();
    };
  }, [authUser, activeSlotKey, isDemoMode, retryPortalsNonce]);

  // Keep activePortal and shareTargetPortal fresh whenever Firestore updates
  useEffect(() => {
    const allPortals = [...ownedPortals, ...sharedPortals];
    if (activePortal) {
      const updated = allPortals.find(p => p.id === activePortal.id);
      if (updated) {
        setActivePortal(prev => (prev && JSON.stringify(prev) === JSON.stringify(updated) ? prev : updated));
      }
    }
    if (shareTargetPortal) {
      const updatedShare = allPortals.find(p => p.id === shareTargetPortal.id);
      if (updatedShare) {
        setShareTargetPortal(prev =>
          prev && JSON.stringify(prev) === JSON.stringify(updatedShare) ? prev : updatedShare
        );
      }
    }
  }, [ownedPortals, sharedPortals, activePortal, shareTargetPortal]);

  // Track which site+subgroup payload is loaded & cloud-hydrated
  const loadedTargetKeyRef = useRef<string>(`${currentSiteId}__${currentSubgroupId}`);
  const cloudHydratedKeyRef = useRef<string>('');
  const appStateRef = useRef<AppState>(appState);
  const currentSiteIdRef = useRef<string>(currentSiteId);
  const currentSubgroupIdRef = useRef<string>(currentSubgroupId);
  const sitesRef = useRef<SiteNode[]>(sites);
  useEffect(() => {
    appStateRef.current = appState;
  }, [appState]);
  useEffect(() => {
    currentSiteIdRef.current = currentSiteId;
  }, [currentSiteId]);
  useEffect(() => {
    currentSubgroupIdRef.current = currentSubgroupId;
  }, [currentSubgroupId]);
  useEffect(() => {
    sitesRef.current = sites;
  }, [sites]);

  // Enter a Portal: initialize dynamic Firebase RTDB config & portal-scoped state
  const handleEnterPortal = useCallback(
    (portal: AttendancePortalRecord, initialRoleOverride?: UserRole) => {
      setActivePortalFirebaseConfig({
        portalId: portal.id,
        databaseURL: portal.rtdbUrl,
        projectId: portal.rtdbProjectId,
        backupDatabaseURL: portal.backupRtdbUrl,
        storageBucket: portal.storageBucket
      });

      const savedSite = safeGetStorage(portalStorageKey(portal.id, 'last_site')) || DEFAULT_SEED_SITES[0].id;
      const savedSub =
        safeGetStorage(portalStorageKey(portal.id, 'last_sub')) || DEFAULT_SEED_SITES[0].subgroups[0].id;
      const savedRoleRaw = safeGetStorage(portalStorageKey(portal.id, 'role'));
      const resolvedRole: UserRole =
        initialRoleOverride ||
        (savedRoleRaw === 'admin' || savedRoleRaw === 'incharge' || savedRoleRaw === 'supervisor'
          ? savedRoleRaw
          : 'viewer');

      const savedQueueCount =
        parseInt(safeGetStorage(portalStorageKey(portal.id, 'offline_queue_count')) || '0', 10) || 0;

      setSites(DEFAULT_SEED_SITES);
      setCurrentSiteId(savedSite);
      setCurrentSubgroupId(savedSub);
      currentSiteIdRef.current = savedSite;
      currentSubgroupIdRef.current = savedSub;
      loadedTargetKeyRef.current = `${savedSite}__${savedSub}`;
      cloudHydratedKeyRef.current = '';

      const cachedRaw = safeGetStorage(portalStorageKey(portal.id, `cache_${savedSite}_${savedSub}`));
      if (cachedRaw) {
        try {
          const parsed = sanitizeState(JSON.parse(cachedRaw));
          appStateRef.current = parsed;
          setAppState(parsed);
        } catch {
          const seeded = createSeedAppState(currentMonthKey, currentDayOfMonth);
          appStateRef.current = seeded;
          setAppState(seeded);
        }
      } else {
        const seeded = createSeedAppState(currentMonthKey, currentDayOfMonth);
        appStateRef.current = seeded;
        setAppState(seeded);
      }

      setUserRole(resolvedRole);
      if (initialRoleOverride) {
        safeSetStorage(portalStorageKey(portal.id, 'role'), initialRoleOverride);
      }
      setOfflineQueuedCount(savedQueueCount);
      setActiveTab('attendance');
      setPresenceList([]);
      setActivityLogs([]);
      setActivePortal(portal);

      const skipIntro =
        typeof window !== 'undefined' &&
        (window.location.search.includes('skipintro=1') || window.location.search.includes('demo=hub'));
      setIntroStage(skipIntro ? 'done' : 'center');
      setIsIntroCloudReady(skipIntro);
    },
    [currentMonthKey, currentDayOfMonth]
  );

  const handleExitToHub = useCallback(() => {
    setActivePortal(null);
    setActivePortalFirebaseConfig(null);
    setIsAccountMenuOpen(false);
    setIsAnalyticsOpen(false);
    setIsPinModalOpen(false);
    setIsShareModalOpen(false);
    setShareTargetPortal(null);
    setIntroStage('done');
  }, []);

  // Create or Update Portal from the 3-step Wizard
  const handleWizardSubmit = useCallback(
    async (payload: PortalWizardSubmitPayload) => {
      if (!effectiveUser) return;

      // EDIT EXISTING PORTAL
      if (wizardEditingPortal) {
        if (isDemoMode && !authUser) {
          let nextHashes: Partial<AttendancePortalRecord> = {};
          if (
            payload.updatePasswords &&
            payload.adminPassword &&
            payload.supervisorPassword &&
            payload.inchargePassword
          ) {
            const [adminHash, supervisorHash, inchargeHash] = await Promise.all([
              hashPortalRolePassword(wizardEditingPortal.id, payload.adminPassword),
              hashPortalRolePassword(wizardEditingPortal.id, payload.supervisorPassword),
              hashPortalRolePassword(wizardEditingPortal.id, payload.inchargePassword)
            ]);
            nextHashes = { adminHash, supervisorHash, inchargeHash };
          }
          const updated: AttendancePortalRecord = {
            ...wizardEditingPortal,
            companyName: payload.companyName,
            companySubtitle: payload.companySubtitle,
            companyLogo: payload.companyLogo,
            rtdbUrl: payload.rtdbUrl,
            rtdbProjectId: payload.rtdbProjectId,
            backupRtdbUrl: payload.backupRtdbUrl,
            storageBucket: payload.storageBucket,
            ...nextHashes,
            updatedAt: new Date().toISOString()
          };
          setOwnedPortals(prev => prev.map(p => (p.id === updated.id ? updated : p)));
          if (activePortal?.id === updated.id) {
            setActivePortal(updated);
            setActivePortalFirebaseConfig({
              portalId: updated.id,
              databaseURL: updated.rtdbUrl,
              projectId: updated.rtdbProjectId,
              backupDatabaseURL: updated.backupRtdbUrl,
              storageBucket: updated.storageBucket
            });
          }
          setIsWizardOpen(false);
          setWizardEditingPortal(null);
          showToast(`Saved settings for ${updated.companyName}`, 'success');
          return;
        }

        const updates = await updatePortalSettingsInFirestore({
          slotKey: activeSlotKey,
          portalId: wizardEditingPortal.id,
          companyName: payload.companyName,
          companySubtitle: payload.companySubtitle,
          companyLogo: payload.companyLogo,
          newPasswords:
            payload.updatePasswords &&
            payload.adminPassword &&
            payload.supervisorPassword &&
            payload.inchargePassword
              ? {
                  admin: payload.adminPassword,
                  supervisor: payload.supervisorPassword,
                  incharge: payload.inchargePassword
                }
              : undefined,
          rtdbUrl: payload.rtdbUrl,
          rtdbProjectId: payload.rtdbProjectId,
          backupRtdbUrl: payload.backupRtdbUrl,
          storageBucket: payload.storageBucket
        });
        const merged: AttendancePortalRecord = { ...wizardEditingPortal, ...updates };
        if (activePortal?.id === merged.id) {
          setActivePortal(merged);
          setActivePortalFirebaseConfig({
            portalId: merged.id,
            databaseURL: merged.rtdbUrl,
            projectId: merged.rtdbProjectId,
            backupDatabaseURL: merged.backupRtdbUrl,
            storageBucket: merged.storageBucket
          });
        }
        setIsWizardOpen(false);
        setWizardEditingPortal(null);
        showToast(`Updated settings for ${merged.companyName}`, 'success');
        return;
      }

      // CREATE BRAND-NEW PORTAL
      if (!payload.adminPassword || !payload.supervisorPassword || !payload.inchargePassword) {
        throw new Error('Please set passwords for Admin, Supervisor, and Site In-Charge.');
      }

      if (isDemoMode && !authUser) {
        const newId = generatePortalId(payload.companyName);
        const [adminHash, supervisorHash, inchargeHash] = await Promise.all([
          hashPortalRolePassword(newId, payload.adminPassword),
          hashPortalRolePassword(newId, payload.supervisorPassword),
          hashPortalRolePassword(newId, payload.inchargePassword)
        ]);
        const nowIso = new Date().toISOString();
        const created: AttendancePortalRecord = {
          id: newId,
          ownerUid: effectiveUser.uid,
          ownerEmail: effectiveUser.email,
          ownerName: effectiveUser.displayName,
          companyName: payload.companyName,
          companySubtitle: payload.companySubtitle,
          companyLogo: payload.companyLogo,
          adminHash,
          supervisorHash,
          inchargeHash,
          rtdbUrl: payload.rtdbUrl,
          rtdbProjectId: payload.rtdbProjectId,
          backupRtdbUrl: payload.backupRtdbUrl,
          storageBucket: payload.storageBucket,
          sharedWithEmails: [],
          createdAt: nowIso,
          updatedAt: nowIso
        };
        setOwnedPortals(prev => [created, ...prev]);
        setIsWizardOpen(false);
        setWizardEditingPortal(null);
        handleEnterPortal(created, 'admin');
        showToast(`${created.companyName} portal created and ready!`, 'success');
        return;
      }

      const created = await createPortalInFirestore({
        slotKey: activeSlotKey,
        ownerUid: effectiveUser.uid,
        ownerEmail: effectiveUser.email,
        ownerName: effectiveUser.displayName,
        companyName: payload.companyName,
        companySubtitle: payload.companySubtitle,
        companyLogo: payload.companyLogo,
        adminPassword: payload.adminPassword,
        supervisorPassword: payload.supervisorPassword,
        inchargePassword: payload.inchargePassword,
        rtdbUrl: payload.rtdbUrl,
        rtdbProjectId: payload.rtdbProjectId,
        backupRtdbUrl: payload.backupRtdbUrl,
        storageBucket: payload.storageBucket
      });

      setIsWizardOpen(false);
      setWizardEditingPortal(null);
      handleEnterPortal(created, 'admin');
      showToast(`${created.companyName} created — Firebase setup saved!`, 'success');
    },
    [effectiveUser, wizardEditingPortal, isDemoMode, authUser, activeSlotKey, activePortal, handleEnterPortal, showToast]
  );

  // Share Portal with recipient email
  const handleSharePortalEmail = useCallback(
    async (portal: AttendancePortalRecord, recipientEmail: string) => {
      const cleanEmail = normalizeEmail(recipientEmail);
      if (isDemoMode && !authUser) {
        const nextShared = Array.from(new Set([...(portal.sharedWithEmails || []), cleanEmail]));
        const updated = { ...portal, sharedWithEmails: nextShared, updatedAt: new Date().toISOString() };
        setOwnedPortals(prev => prev.map(p => (p.id === portal.id ? updated : p)));
        if (activePortal?.id === portal.id) setActivePortal(updated);
        if (shareTargetPortal?.id === portal.id) setShareTargetPortal(updated);
        showToast(`Shared ${portal.companyName} with ${cleanEmail}`, 'success');
        return;
      }

      const nextShared = await sharePortalWithEmailInFirestore({
        slotKey: activeSlotKey,
        portal,
        recipientEmail: cleanEmail
      });
      const updated = { ...portal, sharedWithEmails: nextShared };
      if (activePortal?.id === portal.id) setActivePortal(updated);
      if (shareTargetPortal?.id === portal.id) setShareTargetPortal(updated);
      showToast(`Shared ${portal.companyName} with ${cleanEmail}`, 'success');
    },
    [isDemoMode, authUser, activeSlotKey, activePortal, shareTargetPortal, showToast]
  );

  // Revoke Shared Portal access
  const handleRevokePortalEmail = useCallback(
    async (portal: AttendancePortalRecord, recipientEmail: string) => {
      const cleanEmail = normalizeEmail(recipientEmail);
      if (isDemoMode && !authUser) {
        const nextShared = (portal.sharedWithEmails || []).filter(e => normalizeEmail(e) !== cleanEmail);
        const updated = { ...portal, sharedWithEmails: nextShared, updatedAt: new Date().toISOString() };
        setOwnedPortals(prev => prev.map(p => (p.id === portal.id ? updated : p)));
        if (activePortal?.id === portal.id) setActivePortal(updated);
        if (shareTargetPortal?.id === portal.id) setShareTargetPortal(updated);
        showToast(`Revoked access for ${cleanEmail}`, 'info');
        return;
      }

      const nextShared = await revokePortalShareInFirestore({
        slotKey: activeSlotKey,
        portal,
        recipientEmail: cleanEmail
      });
      const updated = { ...portal, sharedWithEmails: nextShared };
      if (activePortal?.id === portal.id) setActivePortal(updated);
      if (shareTargetPortal?.id === portal.id) setShareTargetPortal(updated);
      showToast(`Revoked access for ${cleanEmail}`, 'info');
    },
    [isDemoMode, authUser, activeSlotKey, activePortal, shareTargetPortal, showToast]
  );

  // Delete Portal from Hub directory (does not erase external Firebase RTDB data)
  const handleDeletePortal = useCallback(
    async (portal: AttendancePortalRecord) => {
      if (isDemoMode && !authUser) {
        setOwnedPortals(prev => prev.filter(p => p.id !== portal.id));
        if (activePortal?.id === portal.id) handleExitToHub();
        showToast(`Removed ${portal.companyName} from your portal list`, 'info');
        return;
      }

      await deletePortalInFirestore({ slotKey: activeSlotKey, portalId: portal.id });
      if (activePortal?.id === portal.id) handleExitToHub();
      showToast(`Removed ${portal.companyName} from your portal list`, 'info');
    },
    [isDemoMode, authUser, activeSlotKey, activePortal, handleExitToHub, showToast]
  );

  // Live Team Chat
  const liveChat = useLiveChat({
    authUser,
    getAuthToken,
    isChatOpen
  });

  const handleOpenChat = useCallback(
    (recipientUid?: string) => {
      if (recipientUid) {
        liveChat.setActiveRecipientUid(recipientUid);
      } else if (liveChat.onlineContacts.length > 0) {
        const unreadOnline = liveChat.onlineContacts.find(c => c.unreadCount > 0);
        liveChat.setActiveRecipientUid(
          unreadOnline ? unreadOnline.uid : liveChat.onlineContacts[0].uid
        );
      } else {
        const anyUnread = liveChat.contacts.find(c => c.unreadCount > 0);
        liveChat.setActiveRecipientUid(anyUnread ? anyUnread.uid : TEAM_RECIPIENT_UID);
      }
      setIsChatOpen(true);
    },
    [liveChat]
  );

  // Google Auth Handlers
  const handleGoogleSignIn = useCallback(async () => {
    const result = await signInWithGoogle();
    if (result?.user) {
      const cleanName = (result.user.displayName || result.user.email?.split('@')[0] || '').trim();
      if (cleanName) {
        setUserName(cleanName);
        safeSetStorage('ap_user_profile', cleanName);
      }
      showToast(`Signed in as ${result.user.displayName || result.user.email}`, 'success');
    }
  }, [signInWithGoogle, showToast]);

  const handleSwitchAccount = useCallback(
    async (uidOrEmail: string) => {
      try {
        const result = await switchAccount(uidOrEmail);
        if (result?.user) {
          handleExitToHub();
          const cleanName = (result.user.displayName || result.user.email?.split('@')[0] || '').trim();
          if (cleanName) {
            setUserName(cleanName);
            safeSetStorage('ap_user_profile', cleanName);
          }
          setIsAccountMenuOpen(false);
          showToast(`Switched to ${result.user.displayName || result.user.email}`, 'success');
        }
      } catch (err: any) {
        showToast(err?.message || 'Could not switch Google account.', 'error');
      }
    },
    [switchAccount, handleExitToHub, showToast]
  );

  const handleAddAnotherAccount = useCallback(async () => {
    try {
      const result = await addAnotherAccount();
      if (result?.user) {
        handleExitToHub();
        showToast(`Added ${result.user.displayName || result.user.email}`, 'success');
      }
    } catch (err: any) {
      showToast(err?.message || 'Could not add Google account.', 'error');
    }
  }, [addAnotherAccount, handleExitToHub, showToast]);

  const handleSubmitSubscriptionVerification = useCallback(
    async (requestedTier: 'pro' | 'ultra', proofImage: string) => {
      await submitSubscriptionVerification(requestedTier, proofImage);
      showToast(
        `Google AI ${requestedTier === 'ultra' ? 'Ultra' : 'Pro'} verification proof submitted`,
        'success'
      );
    },
    [submitSubscriptionVerification, showToast]
  );

  const handleChangeProfilePhoto = useCallback(
    async (dataUrl: string | null) => {
      try {
        await updateMyProfile({ photoUrl: dataUrl });
        showToast(
          dataUrl ? 'Profile photo updated' : 'Restored Google profile photo',
          'success'
        );
      } catch (err: any) {
        showToast(err?.message || 'Failed to update profile photo.', 'error');
      }
    },
    [updateMyProfile, showToast]
  );

  const handleGoogleSignOut = useCallback(async () => {
    setIsAccountMenuOpen(false);
    handleExitToHub();
    if (authUser) {
      await signOutUser();
    } else if (isDemoMode && typeof window !== 'undefined') {
      window.location.href = window.location.pathname;
      return;
    }
    showToast('Signed out of Google account', 'info');
  }, [handleExitToHub, authUser, signOutUser, isDemoMode, showToast]);

  const handleGoogleSignOutAll = useCallback(async () => {
    setIsAccountMenuOpen(false);
    handleExitToHub();
    if (authUser) {
      await signOutAllAccounts();
    }
    showToast('Signed out of all saved Google accounts', 'info');
  }, [handleExitToHub, authUser, signOutAllAccounts, showToast]);

  // Log activity to active portal's Firebase global/activity and local state
  const logActivity = useCallback(
    (action: string, overrideName?: string) => {
      if (!activePortal) return;
      const activeUser = overrideName || userName || effectiveUser?.displayName || 'User';
      const entry: ActivityLogItem = {
        user: activeUser,
        action,
        time: Date.now()
      };
      setActivityLogs(prev => [entry, ...prev]);
      const { db } = getFirebaseServices();
      if (db) {
        try {
          db.ref('global/activity').push(entry);
        } catch {
          // Ignore offline push errors
        }
      }
    },
    [activePortal, userName, effectiveUser?.displayName]
  );

  // Automated 15-Day Backup Engine (scoped to active portal)
  const autoBackup = useAutoBackup({
    portalId: activePortal?.id,
    companyName: activePortal?.companyName,
    sites,
    userName: userName || effectiveUser?.displayName || '',
    userRole,
    onLogActivity: logActivity,
    onToast: showToast
  });

  const handleSaveUserName = useCallback(
    (newName: string) => {
      const cleaned = newName.trim();
      if (!cleaned) return;
      setUserName(cleaned);
      safeSetStorage('ap_user_profile', cleaned);
      logActivity(`Updated profile name to ${cleaned}`, cleaned);
      showToast(`Profile saved as ${cleaned}`, 'success');
    },
    [logActivity, showToast]
  );

  // Sync Active Portal Firebase Presence & Audit Logs
  useEffect(() => {
    if (!activePortal) return;
    const displayUser = userName || effectiveUser?.displayName || 'Portal User';
    const { db } = getFirebaseServices();
    const isMobile =
      typeof navigator !== 'undefined' && /Mobi|Android|iPhone/i.test(navigator.userAgent);
    const deviceLabel = isMobile ? '📱 Mobile' : '💻 Desktop';

    if (!db || (isDemoMode && !authUser)) {
      setPresenceList([
        {
          name: displayUser,
          role: userRole,
          device: deviceLabel,
          time: Date.now()
        }
      ]);
      return;
    }

    const userKey = displayUser.replace(/[^a-zA-Z0-9]/g, '') || 'user';
    const userPresenceRef = db.ref(`global/presence/${userKey}`);
    const connectedRef = db.ref('.info/connected');
    const allPresenceRef = db.ref('global/presence');

    const onConnected = (snap: any) => {
      if (snap.val()) {
        userPresenceRef.set({
          name: displayUser,
          role: userRole,
          device: deviceLabel,
          time: Date.now()
        });
        if (typeof userPresenceRef.onDisconnect === 'function') {
          userPresenceRef.onDisconnect().remove();
        }
      }
    };

    const onPresenceValue = (snap: any) => {
      const val = snap.val();
      if (val && typeof val === 'object') {
        const list = Object.values(val).filter(Boolean) as PresenceUser[];
        setPresenceList(list);
        setPeakUsers(prev => Math.max(prev, list.length));
      } else {
        setPresenceList([
          {
            name: displayUser,
            role: userRole,
            device: deviceLabel,
            time: Date.now()
          }
        ]);
      }
    };

    const startOfDay = new Date().setHours(0, 0, 0, 0);
    const activityQuery = db.ref('global/activity').orderByChild('time').startAt(startOfDay);
    const onActivityValue = (snap: any) => {
      const val = snap.val();
      if (val && typeof val === 'object') {
        const logs = (Object.values(val).filter(Boolean) as ActivityLogItem[]).reverse();
        setActivityLogs(logs);
      }
    };

    connectedRef.on('value', onConnected);
    allPresenceRef.on('value', onPresenceValue);
    activityQuery.on('value', onActivityValue);

    return () => {
      connectedRef.off('value', onConnected);
      allPresenceRef.off('value', onPresenceValue);
      activityQuery.off('value', onActivityValue);
    };
  }, [activePortal?.id, activePortal?.rtdbUrl, userName, effectiveUser?.displayName, userRole, isDemoMode, authUser]);

  // Connect to Active Portal's Firebase RTDB for Site Structure
  useEffect(() => {
    if (!activePortal) return;
    if (isDemoMode && !authUser) return;
    const { db } = getFirebaseServices();
    if (!db) return;

    const structRef = db.ref('global/structure');
    const onStructValue = (snap: any) => {
      const val = snap.val();
      if (val) {
        const sanitized = sanitizeStructure(val);
        if (sanitized.length > 0) {
          setSites(sanitized);
          const matchedSite =
            sanitized.find(s => s.id === currentSiteIdRef.current) || sanitized[0];
          const prevSubId = currentSubgroupIdRef.current;
          const nextSubId =
            prevSubId === 'ALL_GROUPS'
              ? 'ALL_GROUPS'
              : matchedSite.subgroups.find(sub => sub.id === prevSubId)?.id ||
                matchedSite.subgroups[0]?.id ||
                'ALL_GROUPS';

          if (matchedSite.id !== currentSiteIdRef.current) {
            setCurrentSiteId(matchedSite.id);
            safeSetStorage(portalStorageKey(activePortal.id, 'last_site'), matchedSite.id);
          }
          if (nextSubId !== prevSubId) {
            setCurrentSubgroupId(nextSubId);
            safeSetStorage(portalStorageKey(activePortal.id, 'last_sub'), nextSubId);
          }
        }
      }
    };
    structRef.on('value', onStructValue);
    return () => {
      structRef.off('value', onStructValue);
    };
  }, [activePortal?.id, activePortal?.rtdbUrl, isDemoMode, authUser]);

  const activeRollupSubgroupsKey = useMemo(() => {
    if (currentSubgroupId !== 'ALL_GROUPS') return '';
    const activeSiteObj = sites.find(s => s.id === currentSiteId);
    return (activeSiteObj?.subgroups || []).map(s => `${s.id}:${s.name}`).join('|');
  }, [sites, currentSiteId, currentSubgroupId]);

  // Listen to currentSite / currentSubgroup data in Active Portal's Firebase RTDB
  useEffect(() => {
    if (!activePortal || !currentSiteId || !currentSubgroupId) return;

    const targetKey = `${currentSiteId}__${currentSubgroupId}`;
    if (cloudHydratedKeyRef.current !== targetKey) {
      cloudHydratedKeyRef.current = '';
    }

    if (currentSubgroupId !== 'ALL_GROUPS') {
      const cachedRaw = safeGetStorage(
        portalStorageKey(activePortal.id, `cache_${currentSiteId}_${currentSubgroupId}`)
      );
      if (cachedRaw) {
        try {
          const parsed = sanitizeState(JSON.parse(cachedRaw));
          loadedTargetKeyRef.current = targetKey;
          appStateRef.current = parsed;
          setAppState(parsed);
        } catch {
          const fallback =
            isDemoMode && !authUser
              ? createSeedAppState(currentMonthKey, currentDayOfMonth)
              : createEmptyAppState();
          loadedTargetKeyRef.current = targetKey;
          appStateRef.current = fallback;
          setAppState(fallback);
        }
      } else {
        const fallback =
          isDemoMode && !authUser
            ? createSeedAppState(currentMonthKey, currentDayOfMonth)
            : createEmptyAppState();
        loadedTargetKeyRef.current = targetKey;
        appStateRef.current = fallback;
        setAppState(fallback);
      }
    } else {
      const empty = createEmptyAppState();
      loadedTargetKeyRef.current = targetKey;
      appStateRef.current = empty;
      setAppState(empty);
    }

    const { db } = getFirebaseServices();
    if (!db || (isDemoMode && !authUser)) {
      cloudHydratedKeyRef.current = targetKey;
      setSyncStatus(isDemoMode && !authUser ? 'synced' : 'local');
      setIsIntroCloudReady(true);
      return;
    }

    setSyncStatus('syncing');

    if (currentSubgroupId === 'ALL_GROUPS') {
      const siteRef = db.ref(`data/${currentSiteId}`);
      const onSiteValue = (snap: any) => {
        if (
          currentSiteIdRef.current !== currentSiteId ||
          currentSubgroupIdRef.current !== 'ALL_GROUPS'
        ) {
          return;
        }
        const allGroups = snap.val();
        const activeSiteObj = sitesRef.current.find(s => s.id === currentSiteId);
        const aggregated = aggregateMasterRollupState(allGroups, activeSiteObj?.subgroups || []);
        loadedTargetKeyRef.current = targetKey;
        cloudHydratedKeyRef.current = targetKey;
        appStateRef.current = aggregated;
        setAppState(aggregated);
        setSyncStatus('synced');
        setIsIntroCloudReady(true);
      };
      siteRef.on('value', onSiteValue, () => {
        setSyncStatus('local');
        setIsIntroCloudReady(true);
      });
      return () => siteRef.off('value', onSiteValue);
    }

    const subRef = db.ref(`data/${currentSiteId}/${currentSubgroupId}`);
    const onSubValue = (snap: any) => {
      if (
        currentSiteIdRef.current !== currentSiteId ||
        currentSubgroupIdRef.current !== currentSubgroupId
      ) {
        return;
      }
      const val = snap.val();
      loadedTargetKeyRef.current = targetKey;
      cloudHydratedKeyRef.current = targetKey;
      if (val) {
        const clean = sanitizeState(val);
        appStateRef.current = clean;
        setAppState(clean);
        safeSetStorage(
          portalStorageKey(activePortal.id, `cache_${currentSiteId}_${currentSubgroupId}`),
          JSON.stringify(clean)
        );
      } else {
        const empty = createEmptyAppState();
        appStateRef.current = empty;
        setAppState(empty);
        safeRemoveStorage(
          portalStorageKey(activePortal.id, `cache_${currentSiteId}_${currentSubgroupId}`)
        );
      }
      setSyncStatus('synced');
      setIsIntroCloudReady(true);
    };
    subRef.on('value', onSubValue, () => {
      if (!navigator.onLine) {
        cloudHydratedKeyRef.current = targetKey;
      }
      setSyncStatus('local');
      setIsIntroCloudReady(true);
    });

    return () => {
      subRef.off('value', onSubValue);
    };
  }, [
    activePortal?.id,
    activePortal?.rtdbUrl,
    currentSiteId,
    currentSubgroupId,
    activeRollupSubgroupsKey,
    isDemoMode,
    authUser,
    currentMonthKey,
    currentDayOfMonth
  ]);

  // Orchestrate Smooth Center-to-Header Glide when opening a portal
  useEffect(() => {
    if (introStage === 'done') return;
    const readyTimer = setTimeout(() => {
      setIsIntroCloudReady(true);
    }, 550);
    return () => clearTimeout(readyTimer);
  }, [introStage]);

  useEffect(() => {
    if (introStage !== 'center' || !isIntroCloudReady) return;
    const glideTimer = setTimeout(() => {
      setIntroStage('gliding');
    }, 450);
    return () => clearTimeout(glideTimer);
  }, [introStage, isIntroCloudReady]);

  useEffect(() => {
    if (introStage !== 'gliding') return;
    const doneTimer = setTimeout(() => {
      setIntroStage('done');
    }, 620);
    return () => clearTimeout(doneTimer);
  }, [introStage]);

  const handleSkipIntro = useCallback(() => {
    setIntroStage(prev => (prev === 'center' ? 'gliding' : 'done'));
  }, []);

  // Write helper to active portal's Firebase RTDB
  const persistAppState = useCallback(
    (updater: (prev: AppState) => AppState) => {
      if (!activePortal) return;
      const writeCheck = shouldAllowSubgroupWrite({
        currentSiteId,
        currentSubgroupId,
        activeSiteIdRef: currentSiteIdRef.current,
        activeSubgroupIdRef: currentSubgroupIdRef.current,
        cloudHydratedKey: cloudHydratedKeyRef.current
      });

      if (!writeCheck.allowed) {
        showToast(
          writeCheck.reason || 'Master Roll-Up is read-only — select a specific subgroup to edit',
          'info'
        );
        return;
      }

      const next = updater(appStateRef.current);
      appStateRef.current = next;
      setAppState(next);
      setTotalSyncs(c => c + 1);

      const path = `data/${currentSiteId}/${currentSubgroupId}`;
      safeSetStorage(
        portalStorageKey(activePortal.id, `cache_${currentSiteId}_${currentSubgroupId}`),
        JSON.stringify(next)
      );

      if (isDemoMode && !authUser) {
        setSyncStatus('synced');
        return;
      }

      if (!navigator.onLine) {
        setSyncStatus('local');
        setOfflineQueuedCount(c => {
          const nextCount = c + 1;
          safeSetStorage(
            portalStorageKey(activePortal.id, 'offline_queue_count'),
            String(nextCount)
          );
          return nextCount;
        });
        return;
      }

      const { db } = getFirebaseServices();
      if (db) {
        setSyncStatus('syncing');
        db.ref(path)
          .set(next)
          .then(() => {
            setSyncStatus('synced');
            setOfflineQueuedCount(0);
            safeSetStorage(portalStorageKey(activePortal.id, 'offline_queue_count'), '0');
          })
          .catch(() => {
            setSyncStatus('local');
            setOfflineQueuedCount(c => {
              const nextCount = c + 1;
              safeSetStorage(
                portalStorageKey(activePortal.id, 'offline_queue_count'),
                String(nextCount)
              );
              return nextCount;
            });
          });
      }
    },
    [activePortal, currentSiteId, currentSubgroupId, isDemoMode, authUser, showToast]
  );

  // Flush offline queue automatically when device comes back online
  const flushOfflineQueue = useCallback(() => {
    if (!activePortal || (isDemoMode && !authUser)) return;
    const writeCheck = shouldAllowSubgroupWrite({
      currentSiteId,
      currentSubgroupId,
      activeSiteIdRef: currentSiteIdRef.current,
      activeSubgroupIdRef: currentSubgroupIdRef.current,
      cloudHydratedKey: cloudHydratedKeyRef.current
    });
    if (!writeCheck.allowed) return;

    const { db } = getFirebaseServices();
    if (db) {
      setSyncStatus('syncing');
      db.ref(`data/${currentSiteId}/${currentSubgroupId}`)
        .set(appStateRef.current)
        .then(() => {
          setSyncStatus('synced');
          setOfflineQueuedCount(0);
          safeSetStorage(portalStorageKey(activePortal.id, 'offline_queue_count'), '0');
          showToast('Offline changes synced to Cloud!', 'success');
        })
        .catch(() => setSyncStatus('local'));
    }
  }, [activePortal, isDemoMode, authUser, currentSiteId, currentSubgroupId, showToast]);

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      flushOfflineQueue();
    };
    const handleOffline = () => {
      setIsOnline(false);
      setSyncStatus('local');
    };
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [flushOfflineQueue]);

  const persistStructure = useCallback(
    (nextSites: SiteNode[]) => {
      setSites(nextSites);
      if (isDemoMode && !authUser) return;
      const { db } = getFirebaseServices();
      if (db) {
        db.ref('global/structure').set(nextSites).catch(() => {});
      }
    },
    [isDemoMode, authUser]
  );

  const currentSite = useMemo(
    () => sites.find(s => s.id === currentSiteId) || sites[0],
    [sites, currentSiteId]
  );
  const currentSubgroup = useMemo(
    () =>
      currentSite?.subgroups.find(sub => sub.id === currentSubgroupId) || currentSite?.subgroups[0],
    [currentSite, currentSubgroupId]
  );

  const dashboardStats = useMemo(
    () => calculateSiteDashboardStats(appState, monthKey, selectedDay),
    [appState, monthKey, selectedDay]
  );

  const activeMaterialNames = useMemo(
    () => Object.keys(calculateActiveStockMap(appState.dpr)),
    [appState.dpr]
  );

  // Site & Subgroup Handlers
  const handleSelectSiteSubgroup = (sId: string, subId: string) => {
    if (!activePortal) return;
    setCurrentSiteId(sId);
    setCurrentSubgroupId(subId);
    safeSetStorage(portalStorageKey(activePortal.id, 'last_site'), sId);
    safeSetStorage(portalStorageKey(activePortal.id, 'last_sub'), subId);
    const targetSite = sites.find(s => s.id === sId);
    const targetSub = targetSite?.subgroups.find(sub => sub.id === subId);
    showToast(
      subId === 'ALL_GROUPS'
        ? `Switched to ${targetSite?.name} Master Roll-Up`
        : `Switched to ${targetSite?.name} ➔ ${targetSub?.name}`,
      'info'
    );
  };

  const handleCreateSite = (siteName: string) => {
    if (!activePortal) return;
    const newSiteId = `site_${Date.now()}`;
    const newSubId = `sub_${Date.now()}`;
    const newSite: SiteNode = {
      id: newSiteId,
      name: siteName,
      subgroups: [{ id: newSubId, name: 'Main Group' }]
    };
    const next = [...sites, newSite];
    persistStructure(next);
    const freshEmpty = createEmptyAppState();
    const freshKey = `${newSiteId}__${newSubId}`;
    loadedTargetKeyRef.current = freshKey;
    cloudHydratedKeyRef.current = freshKey;
    appStateRef.current = freshEmpty;
    setAppState(freshEmpty);
    setCurrentSiteId(newSiteId);
    setCurrentSubgroupId(newSubId);
    safeSetStorage(portalStorageKey(activePortal.id, 'last_site'), newSiteId);
    safeSetStorage(portalStorageKey(activePortal.id, 'last_sub'), newSubId);
    logActivity(`Created new site: ${siteName}`);
    showToast(`Created site ${siteName}`, 'success');
  };

  const handleRenameSite = (siteId: string, newName: string) => {
    const next = sites.map(s => (s.id === siteId ? { ...s, name: newName } : s));
    persistStructure(next);
    logActivity(`Renamed site to ${newName}`);
    showToast(`Renamed site to ${newName}`, 'success');
  };

  const handleDeleteSite = (siteId: string) => {
    if (!activePortal) return;
    if (sites.length <= 1) {
      showToast('At least one project site must remain active', 'error');
      return;
    }
    const next = sites.filter(s => s.id !== siteId);
    persistStructure(next);
    const { db } = getFirebaseServices();
    if (db && !(isDemoMode && !authUser)) db.ref(`data/${siteId}`).remove().catch(() => {});
    logActivity('Deleted a main site');
    if (currentSiteId === siteId && next.length > 0) {
      const fallbackSiteId = next[0].id;
      const fallbackSubId = next[0].subgroups[0]?.id || 'ALL_GROUPS';
      setCurrentSiteId(fallbackSiteId);
      setCurrentSubgroupId(fallbackSubId);
      safeSetStorage(portalStorageKey(activePortal.id, 'last_site'), fallbackSiteId);
      safeSetStorage(portalStorageKey(activePortal.id, 'last_sub'), fallbackSubId);
    }
    showToast('Deleted site', 'info');
  };

  const handleCreateSubgroup = (siteId: string, subName: string) => {
    if (!activePortal) return;
    const newSubId = `sub_${Date.now()}`;
    const next = sites.map(s =>
      s.id === siteId
        ? { ...s, subgroups: [...(s.subgroups || []), { id: newSubId, name: subName }] }
        : s
    );
    persistStructure(next);
    const freshEmpty = createEmptyAppState();
    const freshKey = `${siteId}__${newSubId}`;
    loadedTargetKeyRef.current = freshKey;
    cloudHydratedKeyRef.current = freshKey;
    appStateRef.current = freshEmpty;
    setAppState(freshEmpty);
    setCurrentSiteId(siteId);
    setCurrentSubgroupId(newSubId);
    safeSetStorage(portalStorageKey(activePortal.id, 'last_site'), siteId);
    safeSetStorage(portalStorageKey(activePortal.id, 'last_sub'), newSubId);
    logActivity(`Added group ${subName}`);
    showToast(`Added clean new group ${subName}`, 'success');
  };

  const handleRenameSubgroup = (siteId: string, subId: string, newName: string) => {
    const next = sites.map(s =>
      s.id === siteId
        ? {
            ...s,
            subgroups: s.subgroups.map(sub => (sub.id === subId ? { ...sub, name: newName } : sub))
          }
        : s
    );
    persistStructure(next);
    logActivity(`Renamed group to ${newName}`);
    showToast(`Renamed group to ${newName}`, 'success');
  };

  const handleDeleteSubgroup = (siteId: string, subId: string) => {
    if (!activePortal) return;
    const next = sites.map(s =>
      s.id === siteId ? { ...s, subgroups: s.subgroups.filter(sub => sub.id !== subId) } : s
    );
    persistStructure(next);
    safeRemoveStorage(portalStorageKey(activePortal.id, `cache_${siteId}_${subId}`));
    const { db } = getFirebaseServices();
    if (db && !(isDemoMode && !authUser)) {
      db.ref(`data/${siteId}/${subId}`).remove().catch(() => {});
    }
    logActivity('Deleted a group');
    if (currentSubgroupId === subId) {
      const updatedSite = next.find(s => s.id === siteId);
      const nextSubId = updatedSite?.subgroups[0]?.id || 'ALL_GROUPS';
      setCurrentSubgroupId(nextSubId);
      safeSetStorage(portalStorageKey(activePortal.id, 'last_sub'), nextSubId);
    }
    showToast('Deleted group', 'info');
  };

  // Attendance Locking & Worker Handlers
  const isDayManuallyLocked = useMemo(() => {
    const monthAtt = appState.attendance[monthKey] || {};
    return appState.workers.some(w => Boolean(monthAtt[w.id]?.[selectedDay]?.locked));
  }, [appState.attendance, appState.workers, monthKey, selectedDay]);

  const isDayAutoLocked = useMemo(
    () =>
      isDayAutoLockedForRole(
        userRole,
        selectedDay,
        monthKey,
        currentDayOfMonth,
        currentMonthKey,
        isDayManuallyLocked
      ),
    [userRole, selectedDay, monthKey, currentDayOfMonth, currentMonthKey, isDayManuallyLocked]
  );

  const isWorkerDayLocked = useCallback(
    (wId: string, day: number) => {
      const manualLocked = Boolean(appState.attendance[monthKey]?.[wId]?.[day]?.locked);
      return isDayAutoLockedForRole(
        userRole,
        day,
        monthKey,
        currentDayOfMonth,
        currentMonthKey,
        manualLocked
      );
    },
    [appState.attendance, monthKey, userRole, currentDayOfMonth, currentMonthKey]
  );

  const handleToggleDayLockForSupervisors = () => {
    if (userRole !== 'admin' && userRole !== 'incharge') {
      setIsPinModalOpen(true);
      return;
    }
    const nextLockState = !isDayManuallyLocked;
    persistAppState(prev => {
      const monthAtt = { ...(prev.attendance[monthKey] || {}) };
      prev.workers.forEach(w => {
        const workerAtt = { ...(monthAtt[w.id] || {}) };
        const existing = workerAtt[selectedDay] || { duty: null, ot: 0, adv: 0, locked: false };
        workerAtt[selectedDay] = { ...existing, locked: nextLockState };
        monthAtt[w.id] = workerAtt;
      });
      return {
        ...prev,
        attendance: { ...prev.attendance, [monthKey]: monthAtt }
      };
    });
    logActivity(
      `${nextLockState ? 'Locked' : 'Unlocked'} Day ${selectedDay} attendance for Supervisors`
    );
    showToast(
      nextLockState
        ? `Day ${selectedDay} locked for Supervisors`
        : `Day ${selectedDay} unlocked for Supervisors`,
      'success'
    );
  };

  const handleTransferWorker = (
    workerId: string,
    targetSiteId: string,
    targetSubgroupId: string,
    mode: 'move' | 'copy'
  ) => {
    if (!activePortal) return;
    if (isMasterRollup) {
      showToast('Select a specific subgroup before transferring workers', 'info');
      return;
    }
    if (targetSiteId === currentSiteId && targetSubgroupId === currentSubgroupId) return;
    const workerObj = appState.workers.find(w => w.id === workerId);
    if (!workerObj) return;

    const targetSite = sites.find(s => s.id === targetSiteId);
    const targetSub = targetSite?.subgroups.find(sub => sub.id === targetSubgroupId);
    const transferredWorker: WorkerProfile = {
      ...workerObj,
      id: mode === 'copy' ? `w_${Date.now()}` : workerObj.id
    };

    safeRemoveStorage(portalStorageKey(activePortal.id, `cache_${targetSiteId}_${targetSubgroupId}`));

    const { db } = getFirebaseServices();
    if (db && !(isDemoMode && !authUser)) {
      const destRef = db.ref(`data/${targetSiteId}/${targetSubgroupId}/workers`);
      destRef
        .once('value')
        .then((snap: any) => {
          const val = snap.val();
          const existingList: WorkerProfile[] = Array.isArray(val)
            ? val.filter(Boolean)
            : val
            ? (Object.values(val).filter(Boolean) as WorkerProfile[])
            : [];
          const nextList = [
            ...existingList.filter(w => w.id !== transferredWorker.id),
            transferredWorker
          ];
          return destRef.set(nextList);
        })
        .catch(() => {});
    }

    if (mode === 'move') {
      persistAppState(prev => ({
        ...prev,
        workers: prev.workers.filter(w => w.id !== workerId)
      }));
    }

    logActivity(
      `${mode === 'move' ? 'Moved' : 'Copied'} worker ${workerObj.name} to ${
        targetSite?.name || 'Site'
      } ➔ ${targetSub?.name || 'Group'}`
    );
    showToast(
      `${mode === 'move' ? 'Moved' : 'Copied'} ${workerObj.name} to ${
        targetSub?.name || 'target group'
      }`,
      'success'
    );
  };

  const handleRecordSettlement = (workerId: string, amountPaid: number, note: string) => {
    const workerObj = appState.workers.find(w => w.id === workerId);
    if (!workerObj || !amountPaid || amountPaid <= 0) return;

    persistAppState(prev => {
      const currentOpening = parseFloat(String(prev.advances[workerId] || 0)) || 0;
      return {
        ...prev,
        advances: {
          ...prev.advances,
          [workerId]: currentOpening + amountPaid
        }
      };
    });
    logActivity(`Recorded ₹${amountPaid} wage settlement for ${workerObj.name} (${note})`);
    showToast(
      `Recorded ₹${amountPaid.toLocaleString('en-IN')} payment for ${workerObj.name}`,
      'success'
    );
  };

  const handleSaveStockThresholds = (nextThresholds: Record<string, number>) => {
    persistAppState(prev => ({
      ...prev,
      stockThresholds: nextThresholds
    }));
    logActivity('Updated low-stock alert thresholds');
    showToast('Saved custom low-stock alert rules', 'success');
  };

  const handleSetDailyDuty = (wId: string, day: number, duty: number, type: 'worker' | 'kp') => {
    if (type === 'kp') {
      persistAppState(prev => {
        const monthKp = { ...(prev.kpAttendance[monthKey] || {}) };
        const kpDays = { ...(monthKp[wId] || {}) };
        kpDays[day] = { duty, locked: false };
        monthKp[wId] = kpDays;
        return {
          ...prev,
          kpAttendance: { ...prev.kpAttendance, [monthKey]: monthKp }
        };
      });
      return;
    }

    persistAppState(prev => {
      const monthAtt = { ...(prev.attendance[monthKey] || {}) };
      const workerAtt = { ...(monthAtt[wId] || {}) };
      const existing = workerAtt[day] || { duty: null, ot: 0, adv: 0, locked: false };
      workerAtt[day] = { ...existing, duty };
      monthAtt[wId] = workerAtt;
      return {
        ...prev,
        attendance: { ...prev.attendance, [monthKey]: monthAtt }
      };
    });
  };

  const handleSetDailyOT = (wId: string, day: number, otStr: string) => {
    const otVal = parseFloat(otStr) || 0;
    persistAppState(prev => {
      const monthAtt = { ...(prev.attendance[monthKey] || {}) };
      const workerAtt = { ...(monthAtt[wId] || {}) };
      const existing = workerAtt[day] || { duty: 1, ot: 0, adv: 0, locked: false };
      workerAtt[day] = { ...existing, ot: otVal };
      monthAtt[wId] = workerAtt;
      return {
        ...prev,
        attendance: { ...prev.attendance, [monthKey]: monthAtt }
      };
    });
  };

  const handleSetDailyAdv = (wId: string, day: number, advStr: string) => {
    const advVal = parseFloat(advStr) || 0;
    persistAppState(prev => {
      const monthAtt = { ...(prev.attendance[monthKey] || {}) };
      const workerAtt = { ...(monthAtt[wId] || {}) };
      const existing = workerAtt[day] || { duty: 1, ot: 0, adv: 0, locked: false };
      workerAtt[day] = { ...existing, adv: advVal };
      monthAtt[wId] = workerAtt;
      return {
        ...prev,
        attendance: { ...prev.attendance, [monthKey]: monthAtt }
      };
    });
  };

  const handleUpdateRegisterCell = (
    workerId: string,
    day: number,
    field: 'duty' | 'ot' | 'adv',
    value: string | number | null
  ) => {
    persistAppState(prev => {
      const monthAtt = { ...(prev.attendance[monthKey] || {}) };
      const workerAtt = { ...(monthAtt[workerId] || {}) };
      const existing = workerAtt[day] || { duty: null, ot: 0, adv: 0, locked: false };
      workerAtt[day] = { ...existing, [field]: value };
      monthAtt[workerId] = workerAtt;
      return {
        ...prev,
        attendance: { ...prev.attendance, [monthKey]: monthAtt }
      };
    });
  };

  const handleUpdateOpeningAdvance = (workerId: string, value: number) => {
    persistAppState(prev => ({
      ...prev,
      advances: { ...prev.advances, [workerId]: value }
    }));
  };

  const handleMarkAllPresent = () => {
    persistAppState(prev => {
      const monthAtt = { ...(prev.attendance[monthKey] || {}) };
      prev.workers.forEach(w => {
        const workerAtt = { ...(monthAtt[w.id] || {}) };
        const existing = workerAtt[selectedDay] || { duty: null, ot: 0, adv: 0, locked: false };
        if (existing.duty === null || existing.duty === undefined) {
          workerAtt[selectedDay] = { ...existing, duty: 1 };
        }
        monthAtt[w.id] = workerAtt;
      });
      return {
        ...prev,
        attendance: { ...prev.attendance, [monthKey]: monthAtt }
      };
    });
    logActivity(`Marked all workers present for Day ${selectedDay}`);
    showToast('Marked all unmarked workers Present (P)', 'success');
  };

  const handleSaveWorker = (data: {
    id?: string;
    name: string;
    desig: string;
    phone: string;
    rate: number;
    openingAdv?: number;
  }) => {
    persistAppState(prev => {
      if (data.id) {
        return {
          ...prev,
          workers: prev.workers.map(w =>
            w.id === data.id
              ? { id: data.id, name: data.name, desig: data.desig, phone: data.phone, rate: data.rate }
              : w
          ),
          advances:
            data.openingAdv !== undefined
              ? { ...prev.advances, [data.id]: data.openingAdv }
              : prev.advances
        };
      }
      const newId = `w_${Date.now()}`;
      const newWorker: WorkerProfile = {
        id: newId,
        name: data.name,
        desig: data.desig,
        phone: data.phone,
        rate: data.rate
      };
      return {
        ...prev,
        workers: [...prev.workers, newWorker],
        advances:
          data.openingAdv !== undefined
            ? { ...prev.advances, [newId]: data.openingAdv }
            : prev.advances
      };
    });
    logActivity(
      data.id
        ? `Updated worker ${data.name} (${data.desig})`
        : `Registered worker ${data.name} (${data.desig})`
    );
    showToast(
      data.id ? `Updated ${data.name}` : `Added ${data.name} (${data.desig}) to workforce`,
      'success'
    );
  };

  const handleDeleteWorkerOrKp = (id: string, type: 'worker' | 'kp' = 'worker') => {
    if (type === 'kp') {
      persistAppState(prev => ({
        ...prev,
        keyPersons: prev.keyPersons.filter(k => k.id !== id)
      }));
      logActivity('Deleted a site official');
      showToast('Removed site official', 'info');
      return;
    }
    const target = appState.workers.find(w => w.id === id);
    persistAppState(prev => ({
      ...prev,
      workers: prev.workers.filter(w => w.id !== id)
    }));
    logActivity(`Deleted worker ${target?.name || id}`);
    showToast('Worker removed from site register', 'info');
  };

  const handleUpdateDPR = (dk: string, updated: DPRRecord) => {
    persistAppState(prev => ({
      ...prev,
      dpr: { ...prev.dpr, [dk]: updated }
    }));
    logActivity(`Updated DPR for ${dk}`);
    showToast('DPR & Material Log saved', 'success');
  };

  const handlePhotoUploadInput = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const { storageBackup } = getFirebaseServices();
    let finalUrl: string | null = null;

    if (storageBackup && !(isDemoMode && !authUser)) {
      try {
        const path = `site_photos/${currentSiteId}/${currentSubgroupId}/${dateKey}_${Date.now()}_${file.name}`;
        const ref = storageBackup.ref(path);
        await ref.put(file);
        finalUrl = await ref.getDownloadURL();
      } catch {
        // Fallback to local data URL
      }
    }

    if (!finalUrl) {
      finalUrl = await new Promise<string | null>(resolve => {
        const reader = new FileReader();
        reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : null);
        reader.onerror = () => resolve(null);
        reader.readAsDataURL(file);
      });
    }

    if (finalUrl) {
      persistAppState(prev => {
        const existing = prev.dpr[dateKey] || {
          work: '',
          weather: '☀️ Sunny / Clear',
          rainStart: '',
          rainEnd: '',
          workStop: 'No',
          matReceived: [],
          matConsumed: [],
          photos: []
        };
        return {
          ...prev,
          dpr: {
            ...prev.dpr,
            [dateKey]: { ...existing, photos: [...(existing.photos || []), finalUrl!] }
          }
        };
      });
      logActivity(`Attached site photo for ${dateKey}`);
      showToast('Site photo attached to DPR', 'success');
    }
  };

  const handleAddTimelineNote = (text: string, priority: 'General' | 'Urgent' | 'Safety') => {
    const newNote: TimelineNote = {
      id: `note_${Date.now()}`,
      text,
      priority,
      completed: false,
      completedBy: '',
      completedAt: null,
      author: userName || effectiveUser?.displayName || userRole.toUpperCase(),
      role: userRole,
      timestamp: Date.now()
    };
    persistAppState(prev => ({
      ...prev,
      timeline: {
        ...prev.timeline,
        [dateKey]: [newNote, ...(prev.timeline[dateKey] || [])]
      }
    }));
    logActivity(`Posted ${priority} note on site timeline`);
    showToast('Added site instruction note', 'success');
  };

  const handleToggleTimelineNote = (dk: string, idx: number) => {
    persistAppState(prev => ({
      ...prev,
      timeline: {
        ...prev.timeline,
        [dk]: (prev.timeline[dk] || []).map((n, i) =>
          i === idx
            ? {
                ...n,
                completed: !n.completed,
                completedBy: !n.completed
                  ? userName || effectiveUser?.displayName || userRole.toUpperCase()
                  : '',
                completedAt: !n.completed ? Date.now() : null
              }
            : n
        )
      }
    }));
  };

  const handleDeleteTimelineNote = (dk: string, idx: number) => {
    persistAppState(prev => ({
      ...prev,
      timeline: {
        ...prev.timeline,
        [dk]: (prev.timeline[dk] || []).filter((_, i) => i !== idx)
      }
    }));
  };

  const handleAddEquipment = (
    name: string,
    operator: string,
    fuel: string,
    status: 'Operational' | 'Maintenance' | 'Idle'
  ) => {
    const newEq: EquipmentItem = {
      id: `eq_${Date.now()}`,
      name,
      operator,
      fuel,
      status
    };
    persistAppState(prev => ({
      ...prev,
      equipment: [...prev.equipment, newEq]
    }));
    logActivity(`Added equipment ${name}`);
    showToast(`Added machinery ${name}`, 'success');
  };

  const handleCycleEquipmentStatus = (idx: number) => {
    const order: ('Operational' | 'Maintenance' | 'Idle')[] = ['Operational', 'Maintenance', 'Idle'];
    persistAppState(prev => ({
      ...prev,
      equipment: prev.equipment.map((eq, i) => {
        if (i !== idx) return eq;
        const nextStatus = order[(order.indexOf(eq.status) + 1) % order.length];
        return { ...eq, status: nextStatus };
      })
    }));
  };

  const handleDeleteEquipment = (idx: number) => {
    persistAppState(prev => ({
      ...prev,
      equipment: prev.equipment.filter((_, i) => i !== idx)
    }));
    showToast('Removed equipment entry', 'info');
  };

  const handleDateInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    if (!val) return;
    const [y, m, d] = val.split('-').map(Number);
    if (y && m && d) {
      setSelectedYear(y);
      setSelectedMonth(m);
      setSelectedDay(d);
    }
  };

  const isoDateValue = `${selectedYear}-${String(selectedMonth).padStart(2, '0')}-${String(
    selectedDay
  ).padStart(2, '0')}`;

  const isActivePortalOwner = Boolean(
    activePortal &&
      effectiveUser &&
      (activePortal.ownerUid === effectiveUser.uid ||
        normalizeEmail(activePortal.ownerEmail) === normalizeEmail(effectiveUser.email))
  );

  const hasForegroundOverlay =
    isWizardOpen ||
    isShareModalOpen ||
    isTutorialOpen ||
    isPinModalOpen ||
    isWorkerModalOpen ||
    Boolean(profileWorker) ||
    isTransferModalOpen ||
    isStockThresholdModalOpen ||
    isChatOpen ||
    isAnalyticsOpen;

  const workspaceTabs = [
    { id: 'attendance' as ActiveTab, label: 'Daily Attendance', icon: CheckSquare },
    { id: 'dpr' as ActiveTab, label: 'DPR & Site Stock', icon: ClipboardList },
    { id: 'register' as ActiveTab, label: 'Monthly Register & Staff', icon: Table },
    { id: 'reports' as ActiveTab, label: 'Wage Slips, Reports & Tools', icon: FileText }
  ];

  const mobileTabs = [
    { id: 'attendance' as ActiveTab, label: 'Attendance', icon: CheckSquare },
    { id: 'dpr' as ActiveTab, label: 'DPR & Stock', icon: ClipboardList },
    { id: 'register' as ActiveTab, label: 'Register', icon: Table },
    { id: 'reports' as ActiveTab, label: 'Slips', icon: FileText }
  ];

  // =========================================================================
  // VIEW 1: START / AUTHENTICATION SCREEN (ONLY "Login using Google")
  // =========================================================================
  if (!effectiveUser) {
    return (
      <MotionConfig reducedMotion="user">
        <LiquidGlassSvgFilters />
        <LiquidGlassWallpaper darkMode={darkMode} glassMode={glassMode} />
        <StartAuthScreen
          onSignInWithGoogle={handleGoogleSignIn}
          isAuthLoading={authLoading}
          darkMode={darkMode}
          onToggleDarkMode={toggleDarkMode}
          glassMode={glassMode}
          onToggleGlassMode={toggleGlassMode}
        />
      </MotionConfig>
    );
  }

  // =========================================================================
  // VIEW 2: PORTAL HUB SCREEN (Create Portal + Owned + Shared Portals)
  // =========================================================================
  if (!activePortal) {
    return (
      <MotionConfig reducedMotion="user">
        <LiquidGlassSvgFilters />
        <LiquidGlassWallpaper darkMode={darkMode} glassMode={glassMode} />

        <motion.div
          animate={{
            scale: isWizardOpen || isShareModalOpen || isTutorialOpen ? 0.975 : 1,
            opacity: isWizardOpen || isShareModalOpen || isTutorialOpen ? 0.88 : 1
          }}
          transition={SPRING_SHEET}
          className="origin-top will-change-transform"
        >
          <PortalHubScreen
            userName={effectiveUser.displayName}
            userEmail={effectiveUser.email}
            userPhotoUrl={effectiveUser.photoURL}
            darkMode={darkMode}
            onToggleDarkMode={toggleDarkMode}
            glassMode={glassMode}
            onToggleGlassMode={toggleGlassMode}
            ownedPortals={ownedPortals}
            sharedPortals={sharedPortals}
            loadingPortals={loadingPortals}
            portalsError={portalsError}
            onRetrySync={() => {
              setPortalsError(null);
              setRetryPortalsNonce(n => n + 1);
            }}
            onCreatePortal={() => {
              setWizardEditingPortal(null);
              setIsWizardOpen(true);
            }}
            onOpenPortal={portal => handleEnterPortal(portal)}
            onSharePortal={portal => {
              setShareTargetPortal(portal);
              setIsShareModalOpen(true);
            }}
            onEditPortal={portal => {
              setWizardEditingPortal(portal);
              setIsWizardOpen(true);
            }}
            onDeletePortal={handleDeletePortal}
            onOpenTutorial={() => setIsTutorialOpen(true)}
            onSignOut={handleGoogleSignOut}
          />
        </motion.div>

        <CreatePortalWizard
          isOpen={isWizardOpen}
          editingPortal={wizardEditingPortal}
          onClose={() => {
            setIsWizardOpen(false);
            setWizardEditingPortal(null);
          }}
          onSubmit={handleWizardSubmit}
        />

        <PortalShareModal
          isOpen={isShareModalOpen}
          portal={shareTargetPortal}
          currentUserUid={effectiveUser.uid}
          currentUserEmail={effectiveUser.email}
          onClose={() => {
            setIsShareModalOpen(false);
            setShareTargetPortal(null);
          }}
          onShareWithEmail={handleSharePortalEmail}
          onRevokeEmail={handleRevokePortalEmail}
        />

        <PortalTutorialModal
          isOpen={isTutorialOpen}
          onClose={() => setIsTutorialOpen(false)}
        />

        <AnimatePresence>
          {toast && (
            <motion.div
              role="status"
              initial={{ opacity: 0, y: 18, scale: 0.92 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 12, scale: 0.94 }}
              transition={SPRING_CONTAINER}
              className={`fixed bottom-5 right-4 z-50 px-5 py-2.5 rounded-full backdrop-blur-xl border shadow-xl text-xs font-bold text-white ${
                toast.type === 'error'
                  ? 'bg-rose-600/90 border-rose-300/50'
                  : toast.type === 'success'
                  ? 'bg-emerald-600/90 border-emerald-300/50'
                  : 'bg-slate-900/85 dark:bg-blue-600/90 border-white/25'
              }`}
            >
              {toast.msg}
            </motion.div>
          )}
        </AnimatePresence>
      </MotionConfig>
    );
  }

  // =========================================================================
  // VIEW 3: ACTIVE ATTENDANCE PORTAL WORKSPACE
  // =========================================================================
  return (
    <MotionConfig reducedMotion="user">
      <LiquidGlassSvgFilters />
      <LiquidGlassWallpaper darkMode={darkMode} glassMode={glassMode} />

      <div className="min-h-screen text-slate-900 dark:text-slate-100 pb-24 md:pb-10">
        {/* SMOOTH CENTER-TO-HEADER COMPANY BRAND INTRO GLIDE */}
        <IntroCenterToHeaderGlide
          stage={introStage}
          isCloudReady={isIntroCloudReady}
          companyName={activePortal.companyName}
          companyLogo={activePortal.companyLogo}
          companySubtitle={activePortal.companySubtitle}
          userName={userName || effectiveUser.displayName}
          siteName={currentSite?.name || 'Main Site'}
          subgroupName={isMasterRollup ? 'All Groups' : currentSubgroup?.name || 'Team A'}
          workerCount={appState.workers.length}
          headerLogoRef={headerLogoRef}
          onSkip={handleSkipIntro}
        />

        <motion.div
          animate={{
            scale: hasForegroundOverlay ? 0.985 : 1,
            opacity: hasForegroundOverlay ? 0.92 : 1
          }}
          transition={SPRING_SHEET}
          className="origin-top will-change-transform"
        >
          {/* SCROLL-LINKED FLOATING LIQUID GLASS HEADER */}
          <header
            className={`sticky top-0 z-30 no-print transition-all duration-300 ${
              isWorkspaceScrolled ? 'pt-1.5 pb-1' : 'pt-2.5 sm:pt-3 pb-1.5'
            }`}
          >
            <div className="max-w-7xl mx-auto px-2.5 sm:px-5 space-y-1.5">
              {/* 1. FLOATING LIQUID GLASS COMPANY LETTERHEAD */}
              <CompanyLetterhead
                companyName={activePortal.companyName}
                companyLogo={activePortal.companyLogo}
                companySubtitle={activePortal.companySubtitle}
                logoTargetRef={headerLogoRef}
                hideLogoForMorph={introStage !== 'done'}
                onBackToHub={handleExitToHub}
                onOpenTutorial={() => {
                  setIsAccountMenuOpen(false);
                  setIsTutorialOpen(true);
                }}
                onOpenShare={
                  isActivePortalOwner
                    ? () => {
                        setIsAccountMenuOpen(false);
                        setShareTargetPortal(activePortal);
                        setIsShareModalOpen(true);
                      }
                    : undefined
                }
              />

              {/* 2. DETACHED FLOATING LIQUID GLASS CONTROL PILL BAR */}
              <div
                onPointerMove={handleGlassPointerMove}
                className="lg-surface lg-surface-sheen rounded-[24px] sm:rounded-full px-3 sm:px-4 py-1.5 sm:py-2 bg-slate-900/72 dark:bg-slate-950/70 text-white"
              >
                <div className="relative z-10 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1.5 sm:gap-2">
                  {/* Row 1 on mobile (Left group on desktop): Site Switcher + Cloud Status + Mobile Avatar */}
                  <div className="flex items-center justify-between gap-2 sm:gap-2.5 w-full sm:w-auto min-w-0">
                    <SiteHierarchyDropdown
                      sites={sites}
                      currentSiteId={currentSiteId}
                      currentSubgroupId={currentSubgroupId}
                      isMasterRollup={isMasterRollup}
                      userRole={userRole}
                      onSelectSiteSubgroup={handleSelectSiteSubgroup}
                      onCreateSite={handleCreateSite}
                      onRenameSite={handleRenameSite}
                      onDeleteSite={handleDeleteSite}
                      onCreateSubgroup={handleCreateSubgroup}
                      onRenameSubgroup={handleRenameSubgroup}
                      onDeleteSubgroup={handleDeleteSubgroup}
                      onRequireAuth={() => setIsPinModalOpen(true)}
                    />

                    {/* Cloud Synced / Offline Queue Pill (Desktop) */}
                    <div
                      title={`Firebase RTDB: ${activePortal.rtdbProjectId || activePortal.rtdbUrl}`}
                      className={`hidden xl:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-extrabold border backdrop-blur-md shrink-0 ${
                        !isOnline || offlineQueuedCount > 0
                          ? 'bg-amber-400/20 text-amber-200 border-amber-300/45'
                          : 'bg-emerald-400/20 text-emerald-100 border-emerald-300/45'
                      }`}
                    >
                      <span
                        className={`w-2 h-2 rounded-full ${
                          !isOnline || offlineQueuedCount > 0
                            ? 'bg-amber-300'
                            : 'bg-emerald-300 shadow-[0_0_8px_rgba(110,231,183,0.85)]'
                        }`}
                      />
                      <span>
                        {!isOnline
                          ? `Offline (${offlineQueuedCount})`
                          : offlineQueuedCount > 0
                          ? `${offlineQueuedCount} Pending`
                          : syncStatus === 'syncing'
                          ? 'Syncing...'
                          : 'Cloud Synced'}
                      </span>
                    </div>

                    {/* Mobile-Only Compact Profile Avatar Trigger */}
                    <button
                      type="button"
                      onClick={() => setIsAccountMenuOpen(prev => !prev)}
                      aria-label={`Open Profile Menu for ${effectiveUser.displayName}`}
                      className="sm:hidden relative flex items-center justify-center rounded-full p-0.5 bg-white/15 border border-white/30 shrink-0 cursor-pointer"
                    >
                      <UserAvatar
                        photoUrl={effectiveUser.photoURL}
                        name={effectiveUser.displayName}
                        email={effectiveUser.email}
                        size="sm"
                        highlight={isSuperAdmin ? 'gold' : 'blue'}
                        subscriptionTier={activeSubscriptionTier}
                      />
                    </button>
                  </div>

                  {/* Row 2 on mobile (Right group on desktop): Desktop Profile, Chat, Date, Theme/Glass, Role Lock */}
                  <div className="flex items-center justify-between sm:justify-end gap-1.5 sm:gap-2 w-full sm:w-auto">
                    <div className="flex items-center gap-1.5 sm:gap-2">
                      {/* Desktop Profile Pill */}
                      <div className="hidden sm:inline-flex items-center rounded-full shrink-0">
                        <motion.button
                          type="button"
                          whileTap={{ scale: 0.95 }}
                          transition={SPRING_TACTILE}
                          onClick={() => setIsAccountMenuOpen(prev => !prev)}
                          aria-label={`Open Profile Menu for ${effectiveUser.displayName}`}
                          title="Profile, Share Portal, Guide & Account Switcher"
                          className={`inline-flex items-center gap-2 pl-1.5 pr-3 py-1 rounded-full text-xs font-extrabold text-white border shadow-xs transition-colors cursor-pointer whitespace-nowrap shrink-0 backdrop-blur-md ${
                            isSuperAdmin
                              ? 'bg-amber-400/25 hover:bg-amber-400/35 border-amber-300/60'
                              : 'bg-white/18 hover:bg-white/28 border-white/30'
                          }`}
                        >
                          <span className="relative flex items-center shrink-0">
                            <UserAvatar
                              photoUrl={effectiveUser.photoURL}
                              name={effectiveUser.displayName}
                              email={effectiveUser.email}
                              size="xs"
                              highlight={isSuperAdmin ? 'gold' : 'blue'}
                              subscriptionTier={activeSubscriptionTier}
                            />
                            {isSuperAdmin && (
                              <span className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-amber-400 text-[#152E4D] flex items-center justify-center ring-1 ring-[#152E4D]">
                                <Crown className="w-2.5 h-2.5" />
                              </span>
                            )}
                          </span>
                          <span className="max-w-[100px] truncate">
                            {effectiveUser.displayName.split(' ')[0]}
                          </span>
                          {(activeSubscriptionTier === 'pro' || activeSubscriptionTier === 'ultra') && (
                            <SubscriptionTierBadge
                              tier={activeSubscriptionTier}
                              size="xs"
                              className="hidden md:inline-flex"
                            />
                          )}
                        </motion.button>
                      </div>

                      {/* Live Chat Quick Pill */}
                      {authUser && (
                        <motion.button
                          type="button"
                          whileTap={{ scale: 0.95 }}
                          transition={SPRING_TACTILE}
                          onClick={() => handleOpenChat()}
                          aria-label="Open Live Team Chat"
                          title={`Open Live Team Chat (${liveChat.onlineContacts.length} online)`}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-xs font-extrabold bg-emerald-400/22 hover:bg-emerald-400/35 text-emerald-100 border border-emerald-300/45 transition-colors cursor-pointer whitespace-nowrap shrink-0"
                        >
                          <MessageCircle className="w-3.5 h-3.5 text-emerald-200 shrink-0" />
                          <span>Chat</span>
                          {liveChat.onlineContacts.length > 0 && (
                            <span className="tabular-nums text-[10px] font-black text-emerald-200">
                              {liveChat.onlineContacts.length}
                            </span>
                          )}
                        </motion.button>
                      )}

                      {/* Recessed Glass Date Picker */}
                      <div className="relative flex items-center shrink-0">
                        <Calendar className="w-3.5 h-3.5 text-sky-200 absolute left-2.5 pointer-events-none hidden sm:block" />
                        <input
                          type="date"
                          value={isoDateValue}
                          onChange={handleDateInputChange}
                          aria-label="Active attendance date"
                          className="no-glass w-[114px] sm:w-auto pl-2 sm:pl-8 pr-1.5 sm:pr-2.5 py-1.5 text-[11px] sm:text-xs font-mono bg-white/14 border border-white/28 rounded-full text-white focus:outline-none focus:ring-2 focus:ring-sky-300/70"
                        />
                      </div>
                    </div>

                    {/* Right cluster: Liquid Glass Appearance Toggle + Role Lock */}
                    <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
                      <GlassAppearanceToggle
                        darkMode={darkMode}
                        onToggleDarkMode={toggleDarkMode}
                        glassMode={glassMode}
                        onToggleGlassMode={toggleGlassMode}
                        compact
                        idPrefix="ws_header"
                      />

                      {userRole === 'viewer' ? (
                        <motion.button
                          type="button"
                          whileTap={{ scale: 0.95 }}
                          transition={SPRING_TACTILE}
                          onClick={() => setIsPinModalOpen(true)}
                          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-extrabold bg-white/22 hover:bg-white/34 text-white border border-white/35 transition-colors cursor-pointer whitespace-nowrap shrink-0"
                        >
                          <Lock className="w-3.5 h-3.5 shrink-0" />
                          <span className="hidden sm:inline">View Only</span>
                          <span className="sm:hidden">Lock</span>
                        </motion.button>
                      ) : (
                        <motion.button
                          type="button"
                          whileTap={{ scale: 0.95 }}
                          transition={SPRING_TACTILE}
                          onClick={() => {
                            setUserRole('viewer');
                            safeSetStorage(portalStorageKey(activePortal.id, 'role'), 'viewer');
                            logActivity('Locked portal access');
                            showToast('Locked to Viewer mode', 'info');
                          }}
                          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-extrabold bg-rose-500/90 hover:bg-rose-500 text-white border border-rose-300/50 shadow-xs transition-colors cursor-pointer whitespace-nowrap shrink-0"
                          title="Click to lock session"
                        >
                          <Unlock className="w-3.5 h-3.5 shrink-0" />
                          <span className="uppercase">{userRole}</span>
                        </motion.button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* POOR-NETWORK OFFLINE SYNC QUEUE BANNER */}
            <OfflineQueueBanner
              isOnline={isOnline}
              queuedCount={offlineQueuedCount}
              onSyncNow={flushOfflineQueue}
            />
          </header>

          {/* MAIN CONTAINER */}
          <main className="max-w-7xl mx-auto px-3 sm:px-5 pt-2.5 space-y-3.5">
            {/* COMPACT 4-KPI LIQUID GLASS SUMMARY STRIP */}
            <section
              aria-label="Site Key Metrics"
              className="grid grid-cols-2 lg:grid-cols-4 gap-3 tabular-nums no-print"
            >
              <GlassCard interactive elevated className="rounded-[22px] p-3.5">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <span className="text-[11px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300 block">
                      Present Today
                    </span>
                    <div className="text-lg sm:text-xl font-mono font-extrabold text-slate-950 dark:text-white mt-0.5">
                      {dashboardStats.presentToday}{' '}
                      <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                        / {dashboardStats.totalWorkers}
                      </span>
                    </div>
                  </div>
                  <span className="text-xs font-mono font-extrabold px-2.5 py-1 rounded-full bg-emerald-500/18 border border-emerald-500/30 text-emerald-800 dark:text-emerald-200">
                    {dashboardStats.totalWorkers > 0
                      ? `${Math.round((dashboardStats.presentToday / dashboardStats.totalWorkers) * 100)}%`
                      : '0%'}
                  </span>
                </div>
              </GlassCard>

              <GlassCard interactive elevated className="rounded-[22px] p-3.5">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <span className="text-[11px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300 block">
                      Monthly OT
                    </span>
                    <div className="text-lg sm:text-xl font-mono font-extrabold text-blue-700 dark:text-sky-300 mt-0.5">
                      {dashboardStats.totalOT}{' '}
                      <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">Hrs</span>
                    </div>
                  </div>
                  <span className="text-xs font-mono font-bold px-2.5 py-1 rounded-full bg-white/50 dark:bg-white/10 border border-white/60 dark:border-white/15 text-slate-700 dark:text-slate-200">
                    {selectedMonth}/{selectedYear}
                  </span>
                </div>
              </GlassCard>

              <GlassCard interactive elevated className="rounded-[22px] p-3.5">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <span className="text-[11px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300 block">
                      Advances Paid
                    </span>
                    <div className="text-lg sm:text-xl font-mono font-extrabold text-rose-700 dark:text-rose-300 mt-0.5">
                      ₹{Math.round(dashboardStats.totalAdvance).toLocaleString('en-IN')}
                    </div>
                  </div>
                  <span className="text-[11px] font-bold px-2.5 py-1 rounded-full bg-rose-500/15 border border-rose-500/25 text-rose-700 dark:text-rose-200">
                    Ded.
                  </span>
                </div>
              </GlassCard>

              <GlassCard interactive elevated className="rounded-[22px] p-3.5">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <span className="text-[11px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300 block">
                      Net Wage Liability
                    </span>
                    <div className="text-lg sm:text-xl font-mono font-extrabold text-emerald-700 dark:text-emerald-300 mt-0.5">
                      ₹{Math.round(dashboardStats.totalNetBalance).toLocaleString('en-IN')}
                    </div>
                  </div>
                  <span className="text-[11px] font-bold px-2.5 py-1 rounded-full bg-emerald-500/18 border border-emerald-500/30 text-emerald-800 dark:text-emerald-200">
                    Payable
                  </span>
                </div>
              </GlassCard>
            </section>

            {/* DETACHED FLOATING LIQUID GLASS DESKTOP NAVIGATION PILL BAR */}
            <div className="hidden md:flex justify-start no-print">
              <GlassPillNav
                items={workspaceTabs}
                activeId={activeTab}
                onSelect={setActiveTab}
                layoutId="workspace_desktop_tab"
                ariaLabel="Primary Workspace Navigation"
                variant="desktop"
              />
            </div>

            {/* ACTIVE WORKSPACE VIEW */}
            <div className="lg-workspace-content">
              {activeTab === 'attendance' && (
                <AttendanceTab
                  appState={appState}
                  selectedDay={selectedDay}
                  monthKey={monthKey}
                  userRole={userRole}
                  isMasterRollup={isMasterRollup}
                  isDayAutoLocked={isDayAutoLocked}
                  isDayManuallyLocked={isDayManuallyLocked}
                  isWorkerDayLocked={isWorkerDayLocked}
                  onSetDailyDuty={handleSetDailyDuty}
                  onSetDailyOT={handleSetDailyOT}
                  onSetDailyAdv={handleSetDailyAdv}
                  onMarkAllPresent={handleMarkAllPresent}
                  onToggleDayLockForSupervisors={handleToggleDayLockForSupervisors}
                  onOpenTransferModal={w => {
                    setTransferTargetWorker(w || null);
                    setIsTransferModalOpen(true);
                  }}
                  onOpenAddModal={() => {
                    setEditingWorker(null);
                    setIsWorkerModalOpen(true);
                  }}
                  onOpenEditModal={(id, type) => {
                    if (type === 'worker') {
                      const found = appState.workers.find(w => w.id === id) || null;
                      setEditingWorker(found);
                      setIsWorkerModalOpen(true);
                    }
                  }}
                  onDeleteWorker={handleDeleteWorkerOrKp}
                  onOpenWorkerProfile={wId => {
                    const found = appState.workers.find(w => w.id === wId) || null;
                    setProfileWorker(found);
                  }}
                  onRequireAuth={() => setIsPinModalOpen(true)}
                />
              )}

              {activeTab === 'dpr' && (
                <DprSiteTab
                  appState={appState}
                  dateKey={dateKey}
                  selectedDay={selectedDay}
                  monthKey={monthKey}
                  userRole={userRole}
                  userName={userName || effectiveUser.displayName || userRole.toUpperCase()}
                  siteName={currentSite?.name || 'Main Site'}
                  subgroupName={isMasterRollup ? 'Master Roll-Up' : currentSubgroup?.name || 'Team A'}
                  companyName={activePortal.companyName}
                  isMasterRollup={isMasterRollup}
                  onUpdateDPR={handleUpdateDPR}
                  onPhotoUpload={handlePhotoUploadInput}
                  onOpenPhotoLightbox={url => window.open(url, '_blank', 'noopener,noreferrer')}
                  onOpenStockThresholdModal={() => setIsStockThresholdModalOpen(true)}
                  onAddTimelineNote={handleAddTimelineNote}
                  onToggleTimelineNote={handleToggleTimelineNote}
                  onDeleteTimelineNote={handleDeleteTimelineNote}
                  onAddEquipment={handleAddEquipment}
                  onCycleEquipmentStatus={handleCycleEquipmentStatus}
                  onDeleteEquipment={handleDeleteEquipment}
                  onRequireAuth={() => setIsPinModalOpen(true)}
                  showToast={msg => showToast(msg, 'info')}
                />
              )}

              {activeTab === 'register' && (
                <RegisterTab
                  appState={appState}
                  userRole={userRole}
                  isMasterRollup={isMasterRollup}
                  monthKey={monthKey}
                  selectedDay={selectedDay}
                  siteName={currentSite?.name || 'Main Site'}
                  subgroupName={isMasterRollup ? 'Master Roll-Up' : currentSubgroup?.name || 'Team A'}
                  companyName={activePortal.companyName}
                  onUpdateCell={handleUpdateRegisterCell}
                  onUpdateOpeningAdvance={handleUpdateOpeningAdvance}
                  onOpenWorkerModal={(w?: WorkerProfile) => {
                    setEditingWorker(w || null);
                    setIsWorkerModalOpen(true);
                  }}
                  onDeleteWorker={id => handleDeleteWorkerOrKp(id, 'worker')}
                  onOpenWorkerProfile={(w: WorkerProfile) => setProfileWorker(w)}
                  onRequireLogin={() => setIsPinModalOpen(true)}
                  onToast={showToast}
                />
              )}

              {activeTab === 'reports' && (
                <ReportsSlipsTab
                  appState={appState}
                  monthKey={monthKey}
                  selectedDay={selectedDay}
                  siteId={currentSiteId}
                  subgroupId={currentSubgroupId}
                  siteName={currentSite?.name || 'Main Site'}
                  subgroupName={isMasterRollup ? 'Master Roll-Up' : currentSubgroup?.name || 'Team A'}
                  companyName={activePortal.companyName}
                  companySubtitle={activePortal.companySubtitle}
                  backupProjectLabel={activePortal.backupRtdbUrl ? 'Backup RTDB' : activePortal.rtdbProjectId || 'Portal RTDB'}
                  userRole={userRole}
                  autoBackup={autoBackup}
                  onToast={showToast}
                />
              )}
            </div>
          </main>
        </motion.div>

        {/* FLOATING DETACHED LIQUID GLASS MOBILE BOTTOM DOCK */}
        <div className="md:hidden fixed bottom-3 inset-x-3 z-30 no-print">
          <GlassPillNav
            items={mobileTabs}
            activeId={activeTab}
            onSelect={setActiveTab}
            layoutId="workspace_mobile_tab"
            ariaLabel="Mobile Bottom Navigation"
            variant="mobile"
          />
        </div>

        {/* FLOATING LIQUID GLASS TOAST NOTIFICATION */}
        <AnimatePresence>
          {toast && (
            <motion.div
              role="status"
              initial={{ opacity: 0, y: 18, scale: 0.92 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 12, scale: 0.94 }}
              transition={SPRING_CONTAINER}
              className={`fixed bottom-20 md:bottom-5 right-4 z-50 px-5 py-2.5 rounded-full backdrop-blur-xl border shadow-xl text-xs font-bold text-white ${
                toast.type === 'error'
                  ? 'bg-rose-600/90 border-rose-300/50'
                  : toast.type === 'success'
                  ? 'bg-emerald-600/90 border-emerald-300/50'
                  : 'bg-slate-900/85 dark:bg-blue-600/90 border-white/25'
              }`}
            >
              {toast.msg}
            </motion.div>
          )}
        </AnimatePresence>

      {/* PROFILE & GOOGLE ACCOUNT SWITCHER POPOVER (Profile -> Share) */}
      <GoogleAccountPopover
        isOpen={isAccountMenuOpen}
        onClose={() => setIsAccountMenuOpen(false)}
        authUser={authUser}
        profileRecord={profileRecord}
        userName={userName || effectiveUser.displayName}
        userRole={userRole}
        isSuperAdmin={isSuperAdmin}
        activeSubscriptionTier={activeSubscriptionTier}
        activePhotoUrl={effectiveUser.photoURL}
        savedAccounts={savedAccounts}
        liveSessionUids={liveSessionUids}
        onSignInGoogle={handleGoogleSignIn}
        onSwitchAccount={handleSwitchAccount}
        onAddAnotherAccount={handleAddAnotherAccount}
        onRemoveSavedAccount={removeSavedAccountFromList}
        onSignOutGoogle={handleGoogleSignOut}
        onSignOutAllAccounts={handleGoogleSignOutAll}
        onChangePhoto={handleChangeProfilePhoto}
        onSubmitVerification={handleSubmitSubscriptionVerification}
        onlineCount={liveChat.onlineContacts.length}
        unreadChatCount={liveChat.totalUnread}
        onOpenChat={() => handleOpenChat()}
        onOpenAnalyticsDrawer={() => setIsAnalyticsOpen(true)}
        onSharePortal={() => {
          setIsAccountMenuOpen(false);
          setShareTargetPortal(activePortal);
          setIsShareModalOpen(true);
        }}
        onOpenTutorial={() => {
          setIsAccountMenuOpen(false);
          setIsTutorialOpen(true);
        }}
        onBackToHub={handleExitToHub}
      />

      {/* PROFILE & LIVE PORTAL ANALYTICS SLIDE-OVER DRAWER */}
      <ProfileAnalyticsDrawer
        isOpen={isAnalyticsOpen}
        onClose={() => setIsAnalyticsOpen(false)}
        userName={userName || effectiveUser.displayName}
        onUpdateUserName={handleSaveUserName}
        userRole={userRole}
        darkMode={darkMode}
        onToggleDarkMode={() => setDarkMode(d => !d)}
        onOpenPinModal={() => setIsPinModalOpen(true)}
        onLockRole={() => {
          setUserRole('viewer');
          safeSetStorage(portalStorageKey(activePortal.id, 'role'), 'viewer');
          logActivity('Locked portal access');
          showToast('Locked to Viewer mode', 'info');
        }}
        onForceSync={() => {
          flushOfflineQueue();
          showToast('Force Synced with Cloud', 'success');
        }}
        sites={sites}
        appState={appState}
        monthKey={monthKey}
        selectedDay={selectedDay}
        onJumpToDay={dayNum => {
          setSelectedDay(dayNum);
          showToast(`Jumped to Day ${dayNum}`, 'info');
        }}
        totalSyncs={totalSyncs}
        presenceList={presenceList}
        peakUsers={peakUsers}
        activityLogs={activityLogs}
        authUser={authUser}
        isSuperAdmin={isSuperAdmin}
        profileRecord={profileRecord}
        activeSubscriptionTier={activeSubscriptionTier}
        activePhotoUrl={effectiveUser.photoURL}
        savedAccounts={savedAccounts}
        liveSessionUids={liveSessionUids}
        onSignInGoogle={handleGoogleSignIn}
        onSwitchAccount={handleSwitchAccount}
        onAddAnotherAccount={handleAddAnotherAccount}
        onRemoveSavedAccount={removeSavedAccountFromList}
        onSignOutGoogle={handleGoogleSignOut}
        onSignOutAllAccounts={handleGoogleSignOutAll}
        onChangePhoto={handleChangeProfilePhoto}
        onSubmitVerification={handleSubmitSubscriptionVerification}
        onUpdateUserTier={updateUserTierAsAdmin}
        fetchAdminOverview={fetchAdminOverview}
        chatContacts={liveChat.contacts}
        unreadChatCount={liveChat.totalUnread}
        onOpenChat={handleOpenChat}
        onOpenSharePortal={() => {
          setShareTargetPortal(activePortal);
          setIsShareModalOpen(true);
        }}
        onOpenPortalSettings={
          isActivePortalOwner
            ? () => {
                setWizardEditingPortal(activePortal);
                setIsWizardOpen(true);
              }
            : undefined
        }
        onOpenTutorial={() => setIsTutorialOpen(true)}
        onBackToHub={handleExitToHub}
        isPortalOwner={isActivePortalOwner}
      />

      {/* REAL-TIME LIVE TEAM & DIRECT CHAT MODAL */}
      <LiveChatModal
        isOpen={isChatOpen}
        onClose={() => setIsChatOpen(false)}
        onOpenProfileDrawer={() => setIsAnalyticsOpen(true)}
        authUser={authUser}
        activePhotoUrl={effectiveUser.photoURL}
        activeSubscriptionTier={activeSubscriptionTier}
        isSuperAdmin={isSuperAdmin}
        onSignInGoogle={handleGoogleSignIn}
        contacts={liveChat.contacts}
        teamLobby={liveChat.teamLobby}
        myStatus={liveChat.myStatus}
        onUpdateMyStatus={liveChat.updateMyStatus}
        wsConnected={liveChat.wsConnected}
        activeRecipientUid={liveChat.activeRecipientUid}
        onSelectRecipient={liveChat.setActiveRecipientUid}
        messages={liveChat.messages}
        loadingMessages={liveChat.loadingMessages}
        typingUser={liveChat.typingUser}
        soundEnabled={liveChat.soundEnabled}
        onToggleSound={() => liveChat.setSoundEnabled(s => !s)}
        chatError={liveChat.chatError}
        onClearChatError={() => liveChat.setChatError(null)}
        onSendMessage={liveChat.sendMessage}
        onToggleReaction={liveChat.toggleReaction}
        onTogglePin={liveChat.togglePin}
        onEditMessage={liveChat.editMessage}
        onDeleteMessage={liveChat.deleteMessage}
        onSendTyping={liveChat.sendTyping}
        activeSiteSnapshot={{
          siteName: currentSite?.name || currentSiteId,
          subgroupName: isMasterRollup
            ? 'All Subgroups'
            : currentSubgroup?.name || currentSubgroupId,
          dateLabel: `${String(selectedDay).padStart(2, '0')}-${monthKey}`,
          presentToday: dashboardStats.presentToday,
          totalWorkers: appState.workers.length,
          monthlyOT: dashboardStats.totalOT,
          totalNetBalance: dashboardStats.totalNetBalance
        }}
      />

      {/* PER-PORTAL ROLE PASSWORD UNLOCK MODAL */}
      <PinLoginModal
        isOpen={isPinModalOpen}
        portalId={activePortal.id}
        companyName={activePortal.companyName}
        roleHashes={{
          adminHash: activePortal.adminHash,
          supervisorHash: activePortal.supervisorHash,
          inchargeHash: activePortal.inchargeHash
        }}
        onClose={() => setIsPinModalOpen(false)}
        onSuccess={(role, msg) => {
          setUserRole(role);
          safeSetStorage(portalStorageKey(activePortal.id, 'role'), role);
          logActivity(`Authorized as ${role}`);
          showToast(msg, 'success');
        }}
      />

      {/* WORKER ADD/EDIT MODAL */}
      <WorkerFormModal
        isOpen={isWorkerModalOpen}
        editingWorker={editingWorker}
        initialAdvance={editingWorker ? appState.advances[editingWorker.id] || 0 : 0}
        onClose={() => setIsWorkerModalOpen(false)}
        onSave={handleSaveWorker}
      />

      {/* WORKER PROFILE, CALENDAR & SETTLEMENT MODAL */}
      <WorkerProfileModal
        worker={profileWorker}
        appState={appState}
        monthKey={monthKey}
        siteName={currentSite?.name || 'Main Site'}
        companyName={activePortal.companyName}
        userRole={userRole}
        onClose={() => setProfileWorker(null)}
        onRecordSettlement={handleRecordSettlement}
        onOpenTransferModal={w => {
          setTransferTargetWorker(w);
          setIsTransferModalOpen(true);
        }}
      />

      {/* WORKER TRANSFER / COPY BETWEEN GROUPS MODAL */}
      <WorkerTransferModal
        isOpen={isTransferModalOpen}
        workers={appState.workers}
        initialWorker={transferTargetWorker}
        sites={sites}
        currentSiteId={currentSiteId}
        currentSubgroupId={currentSubgroupId}
        onClose={() => setIsTransferModalOpen(false)}
        onTransferWorker={handleTransferWorker}
      />

      {/* CUSTOM LOW-STOCK ALERT THRESHOLDS MODAL */}
      <StockThresholdModal
        isOpen={isStockThresholdModalOpen}
        thresholds={appState.stockThresholds}
        activeMaterialNames={activeMaterialNames}
        onClose={() => setIsStockThresholdModalOpen(false)}
        onSaveThresholds={handleSaveStockThresholds}
      />

      {/* PORTAL SETTINGS WIZARD (OWNER EDIT) */}
      <CreatePortalWizard
        isOpen={isWizardOpen}
        editingPortal={wizardEditingPortal}
        onClose={() => {
          setIsWizardOpen(false);
          setWizardEditingPortal(null);
        }}
        onSubmit={handleWizardSubmit}
      />

      {/* PROFILE -> SHARE PORTAL MODAL */}
      <PortalShareModal
        isOpen={isShareModalOpen}
        portal={shareTargetPortal}
        currentUserUid={effectiveUser.uid}
        currentUserEmail={effectiveUser.email}
        onClose={() => {
          setIsShareModalOpen(false);
          setShareTargetPortal(null);
        }}
        onShareWithEmail={handleSharePortalEmail}
        onRevokeEmail={handleRevokePortalEmail}
      />

        {/* IN-APP FULL TUTORIAL & GUIDE MODAL */}
        <PortalTutorialModal
          isOpen={isTutorialOpen}
          onClose={() => setIsTutorialOpen(false)}
        />
      </div>
    </MotionConfig>
  );
}
