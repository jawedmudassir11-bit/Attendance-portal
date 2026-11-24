import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CHAT_RETENTION_DAYS,
  CHAT_RETENTION_MS,
  TEAM_LOBBY_THREAD_KEY,
  TEAM_RECIPIENT_UID,
  buildThreadKey,
  isUserParticipantInThread,
  computeExpiryDate,
  isMessageExpired,
  formatTimeUntilExpiry,
  validateChatAttachment,
  toggleReactionInMap,
  mergeChatMessageIdempotent,
  type ChatMessageDTO
} from './chatLogic';

test('Canonical DM thread keys are symmetric and team lobby key is consistent', () => {
  assert.equal(buildThreadKey('uid_b', 'uid_a'), 'uid_a__uid_b');
  assert.equal(buildThreadKey('uid_a', 'uid_b'), 'uid_a__uid_b');
  assert.equal(buildThreadKey('uid_a', TEAM_RECIPIENT_UID), TEAM_LOBBY_THREAD_KEY);
  assert.equal(isUserParticipantInThread('uid_a__uid_b', 'uid_a'), true);
  assert.equal(isUserParticipantInThread('uid_a__uid_b', 'uid_b'), true);
  assert.equal(isUserParticipantInThread('uid_a__uid_b', 'uid_c'), false);
  assert.equal(isUserParticipantInThread(TEAM_LOBBY_THREAD_KEY, 'uid_c'), true);
});

test('5-day auto-expiry calculates exact retention window and readable countdown', () => {
  assert.equal(CHAT_RETENTION_DAYS, 5);
  const start = new Date('2026-11-21T12:00:00Z');
  const exp = computeExpiryDate(start);
  assert.equal(exp.getTime() - start.getTime(), CHAT_RETENTION_MS);
  assert.equal(exp.toISOString(), '2026-11-26T12:00:00.000Z');

  assert.equal(isMessageExpired(exp, start.getTime() + 1000), false);
  assert.equal(isMessageExpired(exp, exp.getTime()), true);
  assert.equal(isMessageExpired(exp, exp.getTime() + 1000), true);

  assert.equal(
    formatTimeUntilExpiry(exp, start.getTime() + 2 * 60 * 60 * 1000),
    '4d 22h left'
  );
  assert.equal(
    formatTimeUntilExpiry(exp, exp.getTime() - 90 * 60 * 1000),
    '1h 30m left'
  );
  assert.equal(formatTimeUntilExpiry(exp, exp.getTime() + 100), 'Expired');
});

test('Chat attachment validator permits documents, images, and audio while blocking dangerous files and oversized uploads', () => {
  const pdf = validateChatAttachment({
    fileName: 'Barsoi_Payroll_Nov.pdf',
    mimeType: 'application/pdf',
    sizeBytes: 250_000,
    dataUrl: 'data:application/pdf;base64,JVBERi0xLjQ='
  });
  assert.equal(pdf.valid, true);
  assert.equal(pdf.messageType, 'document');

  const png = validateChatAttachment({
    fileName: 'site_pour.png',
    mimeType: 'image/png',
    sizeBytes: 120_000,
    dataUrl: 'data:image/png;base64,iVBORw0KGgo='
  });
  assert.equal(png.valid, true);
  assert.equal(png.messageType, 'image');

  const audio = validateChatAttachment({
    fileName: 'voice_note.webm',
    mimeType: 'audio/webm;codecs=opus',
    sizeBytes: 80_000,
    dataUrl: 'data:audio/webm;base64,GkXfo59ChoEBQveBAULygQ=='
  });
  assert.equal(audio.valid, true);
  assert.equal(audio.messageType, 'audio');

  const blockedHtml = validateChatAttachment({
    fileName: 'payload.html',
    mimeType: 'text/html',
    sizeBytes: 100
  });
  assert.equal(blockedHtml.valid, false);

  const blockedSvg = validateChatAttachment({
    fileName: 'diagram.svg',
    mimeType: 'image/svg+xml',
    sizeBytes: 200
  });
  assert.equal(blockedSvg.valid, false);

  const oversized = validateChatAttachment({
    fileName: 'huge.pdf',
    mimeType: 'application/pdf',
    sizeBytes: 5 * 1024 * 1024
  });
  assert.equal(oversized.valid, false);
});

test('Reaction toggle and idempotent message merge avoid duplicates on reconnects', () => {
  const added = toggleReactionInMap({}, '👍', 'u1', 'Asfar');
  assert.deepEqual(added['👍'], [{ uid: 'u1', name: 'Asfar' }]);

  const secondUser = toggleReactionInMap(added, '👍', 'u2', 'Mudassir');
  assert.equal(secondUser['👍'].length, 2);

  const removed = toggleReactionInMap(secondUser, '👍', 'u1', 'Asfar');
  assert.deepEqual(removed['👍'], [{ uid: 'u2', name: 'Mudassir' }]);

  const msg1: ChatMessageDTO = {
    id: 42,
    threadKey: 'a__b',
    senderUid: 'a',
    recipientUid: 'b',
    senderName: 'Asfar',
    senderEmail: 'jawedasfar1@gmail.com',
    senderPhoto: '',
    messageType: 'text',
    body: 'Hello site',
    attachmentName: '',
    attachmentMime: '',
    attachmentSize: 0,
    attachmentData: '',
    replyToId: null,
    replyToPreview: '',
    replyToSender: '',
    reactions: {},
    isPinned: false,
    isUrgent: false,
    isEdited: false,
    isDeleted: false,
    readBy: ['a'],
    createdAt: '2026-11-21T12:00:00.000Z',
    expiresAt: '2026-11-26T12:00:00.000Z'
  };

  const once = mergeChatMessageIdempotent([], msg1);
  const twice = mergeChatMessageIdempotent(once, msg1);
  assert.equal(twice.length, 1);

  const updated = mergeChatMessageIdempotent(twice, {
    ...msg1,
    body: 'Hello site updated',
    isEdited: true
  });
  assert.equal(updated.length, 1);
  assert.equal(updated[0].body, 'Hello site updated');
  assert.equal(updated[0].isEdited, true);
});
