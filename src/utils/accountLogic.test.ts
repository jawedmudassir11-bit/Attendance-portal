import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getEffectiveVerifiedTier,
  normalizeSubscriptionTier,
  normalizeVerificationStatus,
  removeSavedAccount,
  sortSavedAccounts,
  upsertSavedAccount,
  validateProfilePhotoInput,
  type SavedGoogleAccount
} from './accountLogic';
import { sanitizeAvatarUrl } from './siteLogic';

test('grants Pro/Ultra styling strictly when subscriptionVerified is true', () => {
  assert.equal(normalizeSubscriptionTier('pro'), 'pro');
  assert.equal(normalizeSubscriptionTier('ULTRA'), 'ultra');
  assert.equal(normalizeSubscriptionTier('enterprise'), 'standard');

  assert.equal(getEffectiveVerifiedTier('pro', true), 'pro');
  assert.equal(getEffectiveVerifiedTier('ultra', true), 'ultra');
  assert.equal(getEffectiveVerifiedTier('pro', false), 'standard');
  assert.equal(getEffectiveVerifiedTier('ultra', false), 'standard');
  assert.equal(getEffectiveVerifiedTier('pro', undefined), 'standard');

  assert.equal(normalizeVerificationStatus('pending'), 'pending');
  assert.equal(normalizeVerificationStatus('verified'), 'verified');
  assert.equal(normalizeVerificationStatus('unknown'), 'none');
});

test('upserts, deduplicates, preserves slotKey, sorts, and removes saved Google accounts', () => {
  let list: SavedGoogleAccount[] = [];
  list = upsertSavedAccount(list, {
    uid: 'uid-1',
    slotKey: '[DEFAULT]',
    email: 'jawedasfar1@gmail.com',
    displayName: 'Asfar Jawed',
    photoUrl: 'https://lh3.googleusercontent.com/asfar.jpg',
    role: 'super_admin',
    subscriptionTier: 'pro',
    subscriptionVerified: true,
    lastUsedAt: '2026-11-20T10:00:00.000Z'
  });
  list = upsertSavedAccount(list, {
    uid: 'uid-2',
    slotKey: 'gi_acct_2',
    email: 'jawedmudassir11@gmail.com',
    displayName: 'Mudassir Jawed',
    photoUrl: 'https://lh3.googleusercontent.com/mudassir.jpg',
    role: 'super_admin',
    subscriptionTier: 'ultra',
    subscriptionVerified: false,
    lastUsedAt: '2026-11-21T10:00:00.000Z'
  });

  assert.equal(list.length, 2);
  assert.equal(list[0].uid, 'uid-2');
  // Unverified ultra resolves strictly to standard
  assert.equal(list[0].subscriptionTier, 'standard');
  assert.equal(list[1].subscriptionTier, 'pro');

  // Re-upserting uid-1 updates verified tier and preserves slotKey
  list = upsertSavedAccount(list, {
    uid: 'uid-1',
    email: 'JAWEDASFAR1@gmail.com',
    subscriptionTier: 'ultra',
    subscriptionVerified: true,
    lastUsedAt: '2026-11-22T10:00:00.000Z'
  });
  assert.equal(list.length, 2);
  assert.equal(list[0].uid, 'uid-1');
  assert.equal(list[0].slotKey, '[DEFAULT]');
  assert.equal(list[0].subscriptionTier, 'ultra');

  // Active account pins to top when sorting
  const sorted = sortSavedAccounts(list, 'uid-2');
  assert.equal(sorted[0].uid, 'uid-2');

  // Remove by uid or email
  const remaining = removeSavedAccount(list, 'uid-1');
  assert.equal(remaining.length, 1);
  assert.equal(remaining[0].uid, 'uid-2');
});

test('validates profile photo inputs and sanitizes avatar URLs safely', () => {
  assert.equal(
    validateProfilePhotoInput({ mimeType: 'image/png', sizeBytes: 120_000 }).valid,
    true
  );
  assert.equal(
    validateProfilePhotoInput({ mimeType: 'image/svg+xml', sizeBytes: 1024 }).valid,
    false
  );
  assert.equal(
    validateProfilePhotoInput({ mimeType: 'image/jpeg', sizeBytes: 9 * 1024 * 1024 }).valid,
    false
  );

  assert.equal(
    sanitizeAvatarUrl('data:image/png;base64,iVBORw0KGgo='),
    'data:image/png;base64,iVBORw0KGgo='
  );
  assert.equal(sanitizeAvatarUrl('data:image/svg+xml;base64,PHN2Zz4='), '');
  assert.equal(sanitizeAvatarUrl('javascript:alert(1)'), '');
});
