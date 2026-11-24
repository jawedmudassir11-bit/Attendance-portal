import React, { useState, useEffect } from 'react';
import { Download, Share, PlusSquare, X, WifiOff, RefreshCw, Smartphone } from 'lucide-react';

interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{
    outcome: 'accepted' | 'dismissed';
    platform: string;
  }>;
  prompt(): Promise<void>;
}

export function usePWAInstall() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [isIOS, setIsIOS] = useState(false);

  useEffect(() => {
    const isStandalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as any).standalone === true;
    setIsInstalled(isStandalone);

    const userAgent = window.navigator.userAgent.toLowerCase();
    const isIOSDevice = /iphone|ipad|ipod/.test(userAgent);
    setIsIOS(isIOSDevice && !isStandalone);

    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };

    const handleAppInstalled = () => {
      setIsInstalled(true);
      setDeferredPrompt(null);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  const promptInstall = async () => {
    if (!deferredPrompt) return false;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      setDeferredPrompt(null);
      return true;
    }
    return false;
  };

  return {
    isInstallable: !!deferredPrompt,
    isInstalled,
    isIOS,
    promptInstall
  };
}

export const PWAInstallButton: React.FC = () => {
  const { isInstallable, isInstalled, isIOS, promptInstall } = usePWAInstall();
  const [showGuideModal, setShowGuideModal] = useState(false);

  if (isInstalled) return null;

  const handleClick = async () => {
    if (isInstallable) {
      await promptInstall();
    } else {
      setShowGuideModal(true);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        aria-label="Install Attendance Portal App"
        title="Install Attendance Portal as a Windows, Android, or iOS App (Offline-Ready PWA)"
        className="inline-flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-full text-xs font-extrabold bg-blue-600/85 hover:bg-blue-600 text-white border border-white/45 shadow-xs transition-all active:scale-95 cursor-pointer shrink-0"
      >
        <Download className="w-3.5 h-3.5" />
        <span className="hidden sm:inline">Install App</span>
      </button>

      {showGuideModal && (
        <div
          onMouseDown={e => {
            if (e.target === e.currentTarget) setShowGuideModal(false);
          }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 backdrop-blur-md p-4"
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="pwa-install-title"
            className="lg-modal rounded-[28px] w-full max-w-sm p-6 space-y-4 text-slate-900 dark:text-slate-100"
          >
            <div className="flex items-center justify-between border-b border-slate-900/10 dark:border-white/12 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-2xl bg-[#0B1B2B] border border-amber-400/50 text-amber-400 flex items-center justify-center font-extrabold text-xs">
                  AP
                </div>
                <div>
                  <h3 id="pwa-install-title" className="text-sm font-extrabold">
                    Install Attendance Portal App
                  </h3>
                  <p className="text-[11px] text-slate-600 dark:text-slate-400">
                    Windows, Android &amp; iOS offline-ready PWA
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowGuideModal(false)}
                aria-label="Close install instructions"
                className="p-1.5 rounded-full text-slate-500 hover:bg-white/60 dark:hover:bg-white/10 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {isIOS ? (
              <ol className="space-y-2.5 text-xs text-slate-700 dark:text-slate-300">
                <li className="flex items-center gap-2.5 p-3 rounded-2xl bg-white/55 dark:bg-white/8 border border-white/60 dark:border-white/12">
                  <span className="w-6 h-6 rounded-full bg-blue-600 text-white font-bold flex items-center justify-center shrink-0">
                    1
                  </span>
                  <span>
                    Tap the <strong>Share</strong> button <Share className="w-3.5 h-3.5 inline text-blue-500" /> in Safari.
                  </span>
                </li>
                <li className="flex items-center gap-2.5 p-3 rounded-2xl bg-white/55 dark:bg-white/8 border border-white/60 dark:border-white/12">
                  <span className="w-6 h-6 rounded-full bg-blue-600 text-white font-bold flex items-center justify-center shrink-0">
                    2
                  </span>
                  <span>
                    Select <strong>Add to Home Screen</strong>{' '}
                    <PlusSquare className="w-3.5 h-3.5 inline text-blue-500" /> and tap <strong>Add</strong>.
                  </span>
                </li>
              </ol>
            ) : (
              <div className="space-y-2.5 text-xs text-slate-700 dark:text-slate-300">
                <div className="p-3.5 rounded-2xl bg-white/55 dark:bg-white/8 border border-white/60 dark:border-white/12 flex items-start gap-2.5">
                  <Smartphone className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                  <div>
                    <strong className="text-slate-900 dark:text-white block mb-1">
                      Windows (Edge / Chrome) &amp; Android:
                    </strong>
                    Click the <strong>App Install icon</strong> in the browser address bar, or open the browser menu <strong>(⋮ / …)</strong> → <strong>Apps → Install Attendance Portal</strong> to run standalone on your desktop or home screen.
                  </div>
                </div>
              </div>
            )}

            <button
              type="button"
              onClick={() => setShowGuideModal(false)}
              className="w-full py-2.5 rounded-full lg-btn-primary text-white font-bold text-xs cursor-pointer"
            >
              Got It
            </button>
          </div>
        </div>
      )}
    </>
  );
};

interface OfflineQueueBannerProps {
  isOnline: boolean;
  queuedCount: number;
  onSyncNow: () => void;
}

export const OfflineQueueBanner: React.FC<OfflineQueueBannerProps> = ({
  isOnline,
  queuedCount,
  onSyncNow
}) => {
  if (isOnline && queuedCount === 0) return null;

  return (
    <div className="max-w-7xl mx-auto px-3 sm:px-6 pt-1.5 no-print">
      <div
        role="status"
        className={`px-4 py-2 rounded-full backdrop-blur-xl text-xs font-bold flex items-center justify-between gap-2 border shadow-md ${
          !isOnline
            ? 'bg-amber-400/90 text-slate-950 border-amber-300'
            : 'bg-blue-600/90 text-white border-blue-400/60'
        }`}
      >
        <div className="flex items-center gap-2 min-w-0">
          {!isOnline ? (
            <WifiOff className="w-4 h-4 shrink-0" />
          ) : (
            <RefreshCw className="w-4 h-4 shrink-0 animate-spin" />
          )}
          <span className="truncate">
            {!isOnline
              ? queuedCount > 0
                ? `Offline Mode: ${queuedCount} change${queuedCount > 1 ? 's' : ''} saved offline — will sync automatically when network returns.`
                : 'Offline Mode: Poor network detected. Attendance & DPR edits are being queued locally.'
              : `Syncing ${queuedCount} offline change${queuedCount > 1 ? 's' : ''} to Firebase Cloud...`}
          </span>
        </div>
        {isOnline && queuedCount > 0 && (
          <button
            type="button"
            onClick={onSyncNow}
            className="px-3 py-1 rounded-full bg-white/25 hover:bg-white/35 text-white font-extrabold text-[11px] shrink-0 cursor-pointer"
          >
            Sync Now
          </button>
        )}
      </div>
    </div>
  );
};
