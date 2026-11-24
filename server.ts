import 'dotenv/config';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { WebSocketServer, WebSocket } from 'ws';
import { adminAuth } from './src/lib/firebase-admin.ts';
import { requireAuth, type AuthRequest } from './src/middleware/auth.ts';
import {
  getAdminPortalOverview,
  getOrCreateUser,
  getSiteSnapshotForUser,
  listBookkeepingSnapshotsForUser,
  recordBookkeepingSnapshot,
  reviewUserSubscriptionVerification,
  submitSubscriptionVerificationRequest,
  updateUserProfile,
  upsertSiteSnapshotForUser
} from './src/db/repository.ts';
import {
  createChatMessage,
  deleteMessageForEveryone,
  editOwnMessage,
  getMessagesForThread,
  listChatContactsForUser,
  markThreadMessagesRead,
  purgeExpiredChatMessages,
  toggleMessagePin,
  toggleMessageReaction,
  touchUserActivity
} from './src/db/chatRepository.ts';
import { isSuperAdminEmail, sanitizeAvatarUrl } from './src/utils/siteLogic.ts';
import { SUBSCRIPTION_TIERS, normalizeSubscriptionTier } from './src/utils/accountLogic.ts';
import {
  ALLOWED_USER_STATUSES,
  TEAM_LOBBY_THREAD_KEY,
  TEAM_RECIPIENT_UID,
  isUserParticipantInThread
} from './src/utils/chatLogic.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface AuthedSocket extends WebSocket {
  uid?: string;
  displayName?: string;
  email?: string;
}

function extractTokenProfile(req: AuthRequest) {
  const uid = req.user?.uid || '';
  const email = (req.user?.email || `${uid}@users.local`).trim().toLowerCase();
  const displayName =
    typeof req.user?.name === 'string' ? req.user.name.trim() : '';
  const photoUrl =
    typeof req.user?.picture === 'string'
      ? sanitizeAvatarUrl(req.user.picture)
      : '';
  const emailVerified = req.user?.email_verified !== false;
  const isSuperAdmin = emailVerified && isSuperAdminEmail(email);

  return { uid, email, displayName, photoUrl, isSuperAdmin };
}

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;

  // Support up to 4 MB attachments encoded in base64 JSON (~5.5 MB)
  app.use(express.json({ limit: '8mb' }));

  const httpServer = http.createServer(app);
  const wss = new WebSocketServer({ noServer: true });

  // Authoritative online presence state (UID -> Set of live WebSocket tabs)
  const onlineClients = new Map<string, Set<AuthedSocket>>();
  const userStatuses = new Map<string, string>();

  const getOnlineUidSet = () => new Set<string>(onlineClients.keys());

  const safeSend = (ws: WebSocket, payload: unknown) => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(payload));
    }
  };

  const broadcastPresence = () => {
    const payload = {
      type: 'presence:update',
      onlineUids: Array.from(onlineClients.keys()),
      statuses: Object.fromEntries(userStatuses.entries())
    };
    for (const sockets of onlineClients.values()) {
      for (const sock of sockets) {
        safeSend(sock, payload);
      }
    }
  };

  const broadcastToThread = (threadKey: string, payload: unknown) => {
    if (threadKey === TEAM_LOBBY_THREAD_KEY) {
      for (const sockets of onlineClients.values()) {
        for (const sock of sockets) {
          safeSend(sock, payload);
        }
      }
      return;
    }
    const participants = threadKey.split('__');
    for (const uid of participants) {
      const sockets = onlineClients.get(uid);
      if (!sockets) continue;
      for (const sock of sockets) {
        safeSend(sock, payload);
      }
    }
  };

  httpServer.on('upgrade', (request, socket, head) => {
    try {
      const urlObj = new URL(request.url || '/', `http://${request.headers.host || 'localhost'}`);
      if (urlObj.pathname === '/ws/chat') {
        wss.handleUpgrade(request, socket, head, ws => {
          wss.emit('connection', ws, request);
        });
      } else {
        socket.destroy();
      }
    } catch {
      socket.destroy();
    }
  });

  wss.on('connection', (rawWs: WebSocket) => {
    const ws = rawWs as AuthedSocket;
    const authTimeout = setTimeout(() => {
      if (!ws.uid) {
        ws.close(4001, 'Auth timeout');
      }
    }, 10_000);

    ws.on('message', async rawData => {
      try {
        const msg = JSON.parse(String(rawData || '{}'));
        if (msg.type === 'auth') {
          if (typeof msg.token !== 'string' || !msg.token) {
            ws.close(4002, 'Missing token');
            return;
          }
          if (!adminAuth) {
            ws.close(4003, 'Auth service unavailable');
            return;
          }
          const decoded = await adminAuth.verifyIdToken(msg.token);
          clearTimeout(authTimeout);
          ws.uid = decoded.uid;
          ws.email = (decoded.email || '').trim().toLowerCase();
          ws.displayName =
            typeof decoded.name === 'string' && decoded.name.trim()
              ? decoded.name.trim()
              : ws.email.split('@')[0] || 'User';

          let set = onlineClients.get(decoded.uid);
          if (!set) {
            set = new Set<AuthedSocket>();
            onlineClients.set(decoded.uid, set);
          }
          set.add(ws);
          if (!userStatuses.has(decoded.uid)) {
            userStatuses.set(decoded.uid, 'Available');
          }

          await touchUserActivity(decoded.uid);
          safeSend(ws, {
            type: 'auth:ok',
            uid: decoded.uid,
            onlineUids: Array.from(onlineClients.keys()),
            statuses: Object.fromEntries(userStatuses.entries())
          });
          broadcastPresence();
          return;
        }

        if (!ws.uid) return;

        if (msg.type === 'ping') {
          await touchUserActivity(ws.uid);
          safeSend(ws, { type: 'pong', ts: Date.now() });
          return;
        }

        if (msg.type === 'status:set') {
          const nextStatus = typeof msg.status === 'string' ? msg.status.trim() : '';
          if ((ALLOWED_USER_STATUSES as readonly string[]).includes(nextStatus)) {
            userStatuses.set(ws.uid, nextStatus);
            await touchUserActivity(ws.uid, nextStatus);
            broadcastPresence();
          }
          return;
        }

        if (msg.type === 'typing') {
          const threadKey = typeof msg.threadKey === 'string' ? msg.threadKey : '';
          if (!isUserParticipantInThread(threadKey, ws.uid)) return;
          broadcastToThread(threadKey, {
            type: 'chat:typing',
            threadKey,
            fromUid: ws.uid,
            fromName: ws.displayName || 'Teammate',
            isTyping: Boolean(msg.isTyping)
          });
        }
      } catch (err) {
        console.error('WebSocket message error:', err);
        if (!ws.uid) {
          ws.close(4003, 'Invalid auth token');
        }
      }
    });

    ws.on('close', () => {
      clearTimeout(authTimeout);
      if (ws.uid) {
        const set = onlineClients.get(ws.uid);
        if (set) {
          set.delete(ws);
          if (set.size === 0) {
            onlineClients.delete(ws.uid);
          }
        }
        broadcastPresence();
      }
    });
  });

  // 5-Day Auto-Delete Background Purger (only when optional SQL DB is configured)
  if (process.env.SQL_HOST) {
    const initialPurge = setTimeout(() => {
      purgeExpiredChatMessages().catch(() => {});
    }, 5_000);
    initialPurge.unref?.();

    const cleanupTimer = setInterval(() => {
      purgeExpiredChatMessages().catch(() => {});
    }, 15 * 60 * 1000);
    cleanupTimer.unref?.();
  }

  // Fast health check endpoint for Cloud Run readiness/liveness probes
  app.get('/api/health', (_req, res) => {
    res.status(200).json({ status: 'ok' });
  });

  // ==========================================
  // AUTH & PROFILE ROUTES
  // ==========================================
  app.get('/api/me', requireAuth, async (req: AuthRequest, res) => {
    try {
      const { uid, email, displayName, photoUrl, isSuperAdmin } =
        extractTokenProfile(req);
      if (!uid) {
        return res.status(401).json({ error: 'Unauthorized' });
      }
      const user = await getOrCreateUser({
        uid,
        email,
        displayName,
        photoUrl,
        incrementSignIn: false
      });
      await touchUserActivity(uid);
      return res.json({ user, isSuperAdmin });
    } catch (error: any) {
      console.error('Failed to sync user profile:', error);
      return res
        .status(500)
        .json({ error: error?.message || 'Failed to load profile' });
    }
  });

  app.post('/api/auth/sync', requireAuth, async (req: AuthRequest, res) => {
    try {
      const { uid, email, displayName, photoUrl, isSuperAdmin } =
        extractTokenProfile(req);
      if (!uid) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const body = req.body && typeof req.body === 'object' ? req.body : {};
      const recordSignIn = body.recordSignIn === true;
      const fallbackName =
        typeof body.displayName === 'string' ? body.displayName.trim() : '';
      const fallbackPhoto =
        typeof body.photoUrl === 'string'
          ? sanitizeAvatarUrl(body.photoUrl)
          : '';

      const user = await getOrCreateUser({
        uid,
        email,
        displayName: displayName || fallbackName,
        photoUrl: photoUrl || fallbackPhoto,
        incrementSignIn: recordSignIn
      });
      await touchUserActivity(uid);

      return res.json({ user, isSuperAdmin });
    } catch (error: any) {
      console.error('Failed to record user sign-in:', error);
      return res
        .status(500)
        .json({ error: error?.message || 'Failed to sync sign-in' });
    }
  });

  app.get(
    '/api/admin/overview',
    requireAuth,
    async (req: AuthRequest, res) => {
      try {
        const { uid, isSuperAdmin } = extractTokenProfile(req);
        if (!uid) {
          return res.status(401).json({ error: 'Unauthorized' });
        }
        if (!isSuperAdmin) {
          return res
            .status(403)
            .json({ error: 'Forbidden: Super Admin access required' });
        }

        const overview = await getAdminPortalOverview();
        return res.json(overview);
      } catch (error: any) {
        console.error('Failed to load Super Admin overview:', error);
        return res.status(500).json({
          error: error?.message || 'Failed to load admin overview'
        });
      }
    }
  );

  app.patch('/api/me/profile', requireAuth, async (req: AuthRequest, res) => {
    try {
      const { uid, email, displayName, photoUrl, isSuperAdmin } =
        extractTokenProfile(req);
      if (!uid) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      // Ensure row exists first
      await getOrCreateUser({
        uid,
        email,
        displayName,
        photoUrl,
        incrementSignIn: false
      });

      const body = req.body && typeof req.body === 'object' ? req.body : {};
      const updates: {
        uid: string;
        displayName?: string;
        photoUrl?: string | null;
      } = { uid };

      if (typeof body.displayName === 'string') {
        const trimmed = body.displayName.trim();
        if (trimmed) updates.displayName = trimmed;
      }

      if (body.photoUrl === null || body.photoUrl === '') {
        updates.photoUrl = photoUrl || '';
      } else if (typeof body.photoUrl === 'string') {
        const sanitized = sanitizeAvatarUrl(body.photoUrl);
        if (!sanitized) {
          return res.status(400).json({
            error: 'Invalid photo format. Please upload a PNG, JPG, or WebP image.'
          });
        }
        updates.photoUrl = sanitized;
      }

      const updatedUser = await updateUserProfile(updates);
      return res.json({ user: updatedUser, isSuperAdmin });
    } catch (error: any) {
      console.error('Failed to update user profile:', error);
      return res.status(500).json({
        error: error?.message || 'Failed to update profile'
      });
    }
  });

  app.post(
    '/api/me/subscription-verify',
    requireAuth,
    async (req: AuthRequest, res) => {
      try {
        const { uid, email, displayName, photoUrl, isSuperAdmin } =
          extractTokenProfile(req);
        if (!uid) return res.status(401).json({ error: 'Unauthorized' });

        await getOrCreateUser({
          uid,
          email,
          displayName,
          photoUrl,
          incrementSignIn: false
        });

        const body = req.body && typeof req.body === 'object' ? req.body : {};
        const requestedTier = String(body.requestedTier || '')
          .trim()
          .toLowerCase();
        if (requestedTier !== 'pro' && requestedTier !== 'ultra') {
          return res.status(400).json({
            error: 'Please select either Google AI Pro or Google AI Ultra.'
          });
        }
        const proofUrl =
          typeof body.proofImage === 'string'
            ? sanitizeAvatarUrl(body.proofImage)
            : '';
        if (!proofUrl) {
          return res.status(400).json({
            error:
              'Please attach a valid PNG, JPG, or WebP screenshot of your active Google AI subscription from one.google.com.'
          });
        }

        const updatedUser = await submitSubscriptionVerificationRequest({
          uid,
          requestedTier,
          proofUrl
        });
        return res.status(201).json({ user: updatedUser, isSuperAdmin });
      } catch (error: any) {
        console.error('Failed to submit subscription verification:', error);
        return res.status(400).json({
          error: error?.message || 'Failed to submit verification request'
        });
      }
    }
  );

  app.patch(
    '/api/admin/users/:uid/tier',
    requireAuth,
    async (req: AuthRequest, res) => {
      try {
        const { uid, email, isSuperAdmin } = extractTokenProfile(req);
        if (!uid) return res.status(401).json({ error: 'Unauthorized' });
        if (!isSuperAdmin) {
          return res
            .status(403)
            .json({ error: 'Forbidden: Super Admin access required' });
        }
        const targetUid = String(req.params.uid || '').trim();
        if (!targetUid) {
          return res.status(400).json({ error: 'Target user UID is required' });
        }
        const action =
          req.body?.action === 'reject'
            ? 'reject'
            : req.body?.action === 'approve'
            ? 'approve'
            : undefined;
        const candidate = String(req.body?.subscriptionTier || 'standard')
          .trim()
          .toLowerCase();
        if (!(SUBSCRIPTION_TIERS as readonly string[]).includes(candidate)) {
          return res.status(400).json({
            error: 'Invalid subscription tier. Allowed values: standard, pro, ultra.'
          });
        }
        const updatedUser = await reviewUserSubscriptionVerification({
          targetUid,
          tier: normalizeSubscriptionTier(candidate),
          verifiedByEmail: email,
          action
        });
        if (!updatedUser) {
          return res.status(404).json({ error: 'User not found' });
        }
        return res.json({ user: updatedUser });
      } catch (error: any) {
        console.error('Failed to update user tier:', error);
        return res.status(500).json({
          error: error?.message || 'Failed to update subscription tier'
        });
      }
    }
  );

  // ==========================================
  // LIVE CHAT, PRESENCE & 5-DAY EXPIRING MESSAGES ROUTES
  // ==========================================
  app.get('/api/chat/contacts', requireAuth, async (req: AuthRequest, res) => {
    try {
      const { uid, email, displayName, photoUrl } = extractTokenProfile(req);
      if (!uid) return res.status(401).json({ error: 'Unauthorized' });

      // Ensure user row exists & mark active
      await getOrCreateUser({ uid, email, displayName, photoUrl, incrementSignIn: false });
      await touchUserActivity(uid);

      const data = await listChatContactsForUser(uid, getOnlineUidSet());
      return res.json({
        ...data,
        myStatus: userStatuses.get(uid) || 'Available'
      });
    } catch (error: any) {
      console.error('Failed to load chat contacts:', error);
      return res
        .status(500)
        .json({ error: error?.message || 'Failed to load contacts' });
    }
  });

  app.post('/api/chat/status', requireAuth, async (req: AuthRequest, res) => {
    try {
      const { uid } = extractTokenProfile(req);
      if (!uid) return res.status(401).json({ error: 'Unauthorized' });
      const status = typeof req.body?.status === 'string' ? req.body.status.trim() : '';
      if (!(ALLOWED_USER_STATUSES as readonly string[]).includes(status)) {
        return res.status(400).json({ error: 'Invalid status value' });
      }
      userStatuses.set(uid, status);
      await touchUserActivity(uid, status);
      broadcastPresence();
      return res.json({ status });
    } catch (error: any) {
      return res.status(500).json({ error: error?.message || 'Failed to update status' });
    }
  });

  app.get('/api/chat/messages', requireAuth, async (req: AuthRequest, res) => {
    try {
      const { uid } = extractTokenProfile(req);
      if (!uid) return res.status(401).json({ error: 'Unauthorized' });

      const threadKey = String(req.query.threadKey || '').trim();
      if (!threadKey) {
        return res.status(400).json({ error: 'threadKey is required' });
      }
      if (!isUserParticipantInThread(threadKey, uid)) {
        return res.status(403).json({ error: 'Forbidden' });
      }

      const messages = await getMessagesForThread(threadKey, uid, 150);
      return res.json({ messages });
    } catch (error: any) {
      console.error('Failed to fetch chat messages:', error);
      return res
        .status(500)
        .json({ error: error?.message || 'Failed to fetch messages' });
    }
  });

  app.post('/api/chat/messages', requireAuth, async (req: AuthRequest, res) => {
    try {
      const { uid, email, displayName, photoUrl } = extractTokenProfile(req);
      if (!uid) return res.status(401).json({ error: 'Unauthorized' });

      const {
        recipientUid,
        messageType,
        body,
        attachment,
        replyToId,
        isUrgent
      } = req.body || {};

      if (typeof recipientUid !== 'string' || !recipientUid.trim()) {
        return res.status(400).json({ error: 'recipientUid is required' });
      }

      const created = await createChatMessage({
        senderUid: uid,
        senderName: displayName || email.split('@')[0],
        senderEmail: email,
        senderPhoto: photoUrl,
        recipientUid:
          recipientUid.trim() === TEAM_RECIPIENT_UID
            ? TEAM_RECIPIENT_UID
            : recipientUid.trim(),
        messageType,
        body,
        attachment: attachment || null,
        replyToId: typeof replyToId === 'number' ? replyToId : null,
        isUrgent: Boolean(isUrgent)
      });

      await touchUserActivity(uid);
      broadcastToThread(created.threadKey, {
        type: 'chat:message',
        message: created
      });

      return res.status(201).json({ message: created });
    } catch (error: any) {
      const msg = error?.message || 'Failed to send message';
      const status =
        msg.includes('required') ||
        msg.includes('exceeds') ||
        msg.includes('allowed') ||
        msg.includes('Unsupported') ||
        msg.includes('Invalid') ||
        msg.includes('yourself')
          ? 400
          : 500;
      return res.status(status).json({ error: msg });
    }
  });

  app.post('/api/chat/read', requireAuth, async (req: AuthRequest, res) => {
    try {
      const { uid } = extractTokenProfile(req);
      if (!uid) return res.status(401).json({ error: 'Unauthorized' });
      const threadKey = typeof req.body?.threadKey === 'string' ? req.body.threadKey.trim() : '';
      if (!threadKey || !isUserParticipantInThread(threadKey, uid)) {
        return res.status(403).json({ error: 'Forbidden' });
      }
      const updatedIds = await markThreadMessagesRead(threadKey, uid);
      if (updatedIds.length > 0) {
        broadcastToThread(threadKey, {
          type: 'chat:read',
          threadKey,
          readerUid: uid,
          messageIds: updatedIds
        });
      }
      return res.json({ updatedIds });
    } catch (error: any) {
      return res.status(500).json({ error: error?.message || 'Failed to mark read' });
    }
  });

  app.post('/api/chat/messages/:id/react', requireAuth, async (req: AuthRequest, res) => {
    try {
      const { uid, displayName, email } = extractTokenProfile(req);
      if (!uid) return res.status(401).json({ error: 'Unauthorized' });
      const messageId = Number(req.params.id);
      const emoji = typeof req.body?.emoji === 'string' ? req.body.emoji : '';
      if (!Number.isInteger(messageId) || messageId <= 0) {
        return res.status(400).json({ error: 'Invalid message ID' });
      }

      const updated = await toggleMessageReaction(
        messageId,
        uid,
        displayName || email.split('@')[0],
        emoji
      );
      broadcastToThread(updated.threadKey, {
        type: 'chat:updated',
        message: updated
      });
      return res.json({ message: updated });
    } catch (error: any) {
      const msg = error?.message || 'Failed to toggle reaction';
      return res.status(msg.includes('Forbidden') ? 403 : 400).json({ error: msg });
    }
  });

  app.post('/api/chat/messages/:id/pin', requireAuth, async (req: AuthRequest, res) => {
    try {
      const { uid } = extractTokenProfile(req);
      if (!uid) return res.status(401).json({ error: 'Unauthorized' });
      const messageId = Number(req.params.id);
      if (!Number.isInteger(messageId) || messageId <= 0) {
        return res.status(400).json({ error: 'Invalid message ID' });
      }
      const updated = await toggleMessagePin(messageId, uid);
      broadcastToThread(updated.threadKey, {
        type: 'chat:updated',
        message: updated
      });
      return res.json({ message: updated });
    } catch (error: any) {
      const msg = error?.message || 'Failed to pin message';
      return res.status(msg.includes('Forbidden') ? 403 : 400).json({ error: msg });
    }
  });

  app.patch('/api/chat/messages/:id', requireAuth, async (req: AuthRequest, res) => {
    try {
      const { uid } = extractTokenProfile(req);
      if (!uid) return res.status(401).json({ error: 'Unauthorized' });
      const messageId = Number(req.params.id);
      const body = typeof req.body?.body === 'string' ? req.body.body : '';
      if (!Number.isInteger(messageId) || messageId <= 0) {
        return res.status(400).json({ error: 'Invalid message ID' });
      }
      const updated = await editOwnMessage(messageId, uid, body);
      broadcastToThread(updated.threadKey, {
        type: 'chat:updated',
        message: updated
      });
      return res.json({ message: updated });
    } catch (error: any) {
      const msg = error?.message || 'Failed to edit message';
      return res.status(msg.includes('Forbidden') ? 403 : 400).json({ error: msg });
    }
  });

  app.delete('/api/chat/messages/:id', requireAuth, async (req: AuthRequest, res) => {
    try {
      const { uid, isSuperAdmin } = extractTokenProfile(req);
      if (!uid) return res.status(401).json({ error: 'Unauthorized' });
      const messageId = Number(req.params.id);
      if (!Number.isInteger(messageId) || messageId <= 0) {
        return res.status(400).json({ error: 'Invalid message ID' });
      }
      const updated = await deleteMessageForEveryone(messageId, uid, isSuperAdmin);
      broadcastToThread(updated.threadKey, {
        type: 'chat:updated',
        message: updated
      });
      return res.json({ message: updated });
    } catch (error: any) {
      const msg = error?.message || 'Failed to delete message';
      return res.status(msg.includes('Forbidden') ? 403 : 400).json({ error: msg });
    }
  });

  // ==========================================
  // SITE SNAPSHOTS & BOOKKEEPING ROUTES
  // ==========================================
  app.get('/api/site-state', requireAuth, async (req: AuthRequest, res) => {
    try {
      const uid = req.user?.uid;
      if (!uid) {
        return res.status(401).json({ error: 'Unauthorized' });
      }
      const siteId = String(req.query.siteId || '').trim();
      const subgroupId = String(req.query.subgroupId || '').trim();
      if (!siteId || !subgroupId) {
        return res
          .status(400)
          .json({ error: 'siteId and subgroupId are required' });
      }

      const snapshot = await getSiteSnapshotForUser(uid, siteId, subgroupId);
      return res.json({ snapshot });
    } catch (error: any) {
      console.error('Failed to fetch site snapshot:', error);
      return res
        .status(500)
        .json({ error: error?.message || 'Failed to fetch site snapshot' });
    }
  });

  app.put('/api/site-state', requireAuth, async (req: AuthRequest, res) => {
    try {
      const { uid, email, displayName, photoUrl } = extractTokenProfile(req);
      if (!uid) {
        return res.status(401).json({ error: 'Unauthorized' });
      }
      const { siteId, subgroupId, siteName, subgroupName, payload } =
        req.body || {};

      if (
        typeof siteId !== 'string' ||
        !siteId.trim() ||
        typeof subgroupId !== 'string' ||
        !subgroupId.trim() ||
        !payload ||
        typeof payload !== 'object'
      ) {
        return res.status(400).json({ error: 'Invalid site snapshot payload' });
      }

      const saved = await upsertSiteSnapshotForUser({
        uid,
        email,
        displayName,
        photoUrl,
        siteId: siteId.trim(),
        subgroupId: subgroupId.trim(),
        siteName: String(siteName || siteId).trim(),
        subgroupName: String(subgroupName || subgroupId).trim(),
        payloadJson: payload
      });

      return res.json({ id: saved.id, updatedAt: saved.updatedAt });
    } catch (error: any) {
      console.error('Failed to persist site snapshot:', error);
      return res
        .status(500)
        .json({ error: error?.message || 'Failed to save site snapshot' });
    }
  });

  app.post(
    '/api/bookkeeping-snapshots',
    requireAuth,
    async (req: AuthRequest, res) => {
      try {
        const { uid, email, displayName, photoUrl } = extractTokenProfile(req);
        if (!uid) {
          return res.status(401).json({ error: 'Unauthorized' });
        }
        const {
          siteId,
          subgroupId,
          siteName,
          subgroupName,
          monthKey,
          workerCount,
          totalLaborCost,
          totalMaterialValue,
          totalAdvances,
          netPayable
        } = req.body || {};

        if (
          typeof siteId !== 'string' ||
          !siteId.trim() ||
          typeof subgroupId !== 'string' ||
          !subgroupId.trim() ||
          typeof monthKey !== 'string' ||
          !monthKey.trim()
        ) {
          return res
            .status(400)
            .json({ error: 'siteId, subgroupId, and monthKey are required' });
        }

        const saved = await recordBookkeepingSnapshot({
          uid,
          email,
          displayName,
          photoUrl,
          siteId: siteId.trim(),
          subgroupId: subgroupId.trim(),
          siteName: String(siteName || siteId).trim(),
          subgroupName: String(subgroupName || subgroupId).trim(),
          monthKey: monthKey.trim(),
          workerCount: Number(workerCount) || 0,
          totalLaborCost: Number(totalLaborCost) || 0,
          totalMaterialValue: Number(totalMaterialValue) || 0,
          totalAdvances: Number(totalAdvances) || 0,
          netPayable: Number(netPayable) || 0
        });

        return res.status(201).json({ snapshot: saved });
      } catch (error: any) {
        console.error('Failed to record bookkeeping snapshot:', error);
        return res.status(500).json({
          error: error?.message || 'Failed to record bookkeeping snapshot'
        });
      }
    }
  );

  app.get(
    '/api/bookkeeping-snapshots',
    requireAuth,
    async (req: AuthRequest, res) => {
      try {
        const uid = req.user?.uid;
        if (!uid) {
          return res.status(401).json({ error: 'Unauthorized' });
        }
        const siteId = req.query.siteId
          ? String(req.query.siteId).trim()
          : undefined;
        const snapshots = await listBookkeepingSnapshotsForUser(uid, siteId);
        return res.json({ snapshots });
      } catch (error: any) {
        console.error('Failed to fetch bookkeeping snapshots:', error);
        return res.status(500).json({
          error: error?.message || 'Failed to fetch bookkeeping snapshots'
        });
      }
    }
  );

  const distPath = path.join(__dirname, 'dist');
  const distIndexPath = path.join(distPath, 'index.html');
  const hasDistBuild = fs.existsSync(distIndexPath);
  // Use Vite dev middleware only in explicit development mode, or when no dist/ build exists yet.
  // In Cloud Run production containers (`npm start`), `dist/index.html` exists so we always serve
  // prebuilt static assets immediately without starting any dev watcher even if NODE_ENV is unset.
  const useViteDev =
    process.env.NODE_ENV === 'development' ||
    (process.env.NODE_ENV !== 'production' && !hasDistBuild);

  if (useViteDev) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true, hmr: false, ws: false, watch: null },
      appType: 'spa'
    });

    // When HMR is disabled in middlewareMode, Vite 8's default /@vite/client still
    // attempts to open a WebSocket to port 24678 (which is unreachable behind HTTPS
    // reverse proxies) and throws unhandled errors at @vite/client:234. Serve a
    // clean ESM shim preserving all 5 public Vite client exports with zero WS traffic.
    const noHmrViteClientShim = `
const sheetsMap = new Map();
const linkSheetsMap = new Map();
if (typeof document !== 'undefined') {
  document.querySelectorAll('style[data-vite-dev-id]').forEach((el) => {
    sheetsMap.set(el.getAttribute('data-vite-dev-id'), el);
  });
  document.querySelectorAll('link[rel="stylesheet"][data-vite-dev-id]').forEach((el) => {
    linkSheetsMap.set(el.getAttribute('data-vite-dev-id'), el);
  });
}
let lastInsertedStyle;
export function updateStyle(id, content) {
  if (linkSheetsMap.has(id)) return;
  let style = sheetsMap.get(id);
  if (!style) {
    style = document.createElement('style');
    style.setAttribute('type', 'text/css');
    style.setAttribute('data-vite-dev-id', id);
    style.textContent = content;
    if (!lastInsertedStyle) {
      document.head.appendChild(style);
      setTimeout(() => { lastInsertedStyle = undefined; }, 0);
    } else {
      lastInsertedStyle.insertAdjacentElement('afterend', style);
    }
    lastInsertedStyle = style;
  } else if (style.textContent !== content) {
    style.textContent = content;
  }
  sheetsMap.set(id, style);
}
export function removeStyle(id) {
  if (linkSheetsMap.has(id)) {
    document.querySelectorAll('link[rel="stylesheet"][data-vite-dev-id="' + CSS.escape(id) + '"]').forEach((el) => el.remove());
    linkSheetsMap.delete(id);
  }
  const style = sheetsMap.get(id);
  if (style) {
    document.head.removeChild(style);
    sheetsMap.delete(id);
  }
}
export function createHotContext() {
  return {
    data: {},
    accept() {},
    acceptExports() {},
    dispose() {},
    prune() {},
    decline() {},
    invalidate() {},
    on() {},
    off() {},
    send() {},
  };
}
export function injectQuery(url, queryToInject) {
  if (!url || (url[0] !== '.' && url[0] !== '/')) return url;
  const pathname = url.replace(/[?#].*$/, '');
  const parsed = new URL(url, 'http://vite.dev');
  return pathname + '?' + queryToInject + (parsed.search ? '&' + parsed.search.slice(1) : '') + (parsed.hash || '');
}
export class ErrorOverlay {}
`;

    app.get('/@vite/client', (_req, res) => {
      res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
      res.setHeader('Cache-Control', 'no-store');
      res.send(noHmrViteClientShim);
    });

    app.use(vite.middlewares);
  } else {
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      if (fs.existsSync(distIndexPath)) {
        res.sendFile(distIndexPath);
      } else {
        res.status(503).send('Production build not found. Run npm run build first.');
      }
    });
  }

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`Server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch(err => {
  console.error('Fatal server startup error:', err);
  process.exit(1);
});
