import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildDeterministicShareId,
  generatePortalId,
  getCompanyInitials,
  hashPortalRolePassword,
  parseFirebaseRtdbInput,
  PORTAL_ROLE_DEFINITIONS,
  validateRolePasswordsSetup,
  validateShareRecipientEmail,
  verifyPortalRolePassword
} from './portalLogic';

test('parseFirebaseRtdbInput accepts direct RTDB URLs across regions and rejects invalid hosts', () => {
  const asia = parseFirebaseRtdbInput(
    'https://acme-builders-default-rtdb.asia-southeast1.firebasedatabase.app/'
  );
  assert.equal(asia.valid, true);
  assert.equal(
    asia.databaseURL,
    'https://acme-builders-default-rtdb.asia-southeast1.firebasedatabase.app/'
  );
  assert.equal(asia.projectId, 'acme-builders');

  const usBare = parseFirebaseRtdbInput('sunrise-civil-default-rtdb.firebaseio.com');
  assert.equal(usBare.valid, true);
  assert.equal(usBare.databaseURL, 'https://sunrise-civil-default-rtdb.firebaseio.com/');
  assert.equal(usBare.projectId, 'sunrise-civil');

  const configSnippet = parseFirebaseRtdbInput(`
    const firebaseConfig = {
      apiKey: "AIzaSyExample",
      projectId: "metro-infra-2026",
      storageBucket: "metro-infra-2026.appspot.com",
      databaseURL: "https://metro-infra-2026-default-rtdb.europe-west1.firebasedatabase.app"
    };
  `);
  assert.equal(configSnippet.valid, true);
  assert.equal(configSnippet.projectId, 'metro-infra-2026');
  assert.equal(configSnippet.storageBucket, 'metro-infra-2026.appspot.com');
  assert.equal(
    configSnippet.databaseURL,
    'https://metro-infra-2026-default-rtdb.europe-west1.firebasedatabase.app/'
  );

  assert.equal(parseFirebaseRtdbInput('https://example.com/db').valid, false);
  assert.equal(parseFirebaseRtdbInput('').valid, false);
});

test('validateRolePasswordsSetup enforces minimum length and distinctness across all 3 roles', () => {
  assert.equal(
    validateRolePasswordsSetup({
      admin: 'adm99',
      supervisor: 'sup44',
      incharge: 'inc77'
    }).valid,
    true
  );

  assert.equal(
    validateRolePasswordsSetup({
      admin: '123',
      supervisor: 'sup44',
      incharge: 'inc77'
    }).valid,
    false
  );

  assert.equal(
    validateRolePasswordsSetup({
      admin: 'same1',
      supervisor: 'same1',
      incharge: 'inc77'
    }).valid,
    false
  );

  assert.equal(PORTAL_ROLE_DEFINITIONS.length, 3);
});

test('salted SHA-256 role password verification unlocks exact configured roles and rejects old hardcoded PINs', async () => {
  const portalId = 'p_acme_12345';
  const adminHash = await hashPortalRolePassword(portalId, 'alpha123');
  const supervisorHash = await hashPortalRolePassword(portalId, 'beta456');
  const inchargeHash = await hashPortalRolePassword(portalId, 'gamma789');
  const hashes = { adminHash, supervisorHash, inchargeHash };

  const adminRes = await verifyPortalRolePassword(portalId, 'alpha123', hashes);
  assert.equal(adminRes.valid, true);
  assert.equal(adminRes.role, 'admin');

  const supRes = await verifyPortalRolePassword(portalId, 'beta456', hashes);
  assert.equal(supRes.valid, true);
  assert.equal(supRes.role, 'supervisor');

  const incRes = await verifyPortalRolePassword(portalId, 'gamma789', hashes);
  assert.equal(incRes.valid, true);
  assert.equal(incRes.role, 'incharge');

  // Old hardcoded PINs must NOT unlock any role
  assert.equal((await verifyPortalRolePassword(portalId, '9431', hashes)).valid, false);
  assert.equal((await verifyPortalRolePassword(portalId, '1820', hashes)).valid, false);
  assert.equal((await verifyPortalRolePassword(portalId, '5566', hashes)).valid, false);

  // Different portal salt must reject the same password
  assert.equal((await verifyPortalRolePassword('p_other_999', 'alpha123', hashes)).valid, false);
});

test('validateShareRecipientEmail normalizes emails, catches typos, blocks duplicates and self-share', () => {
  const ok = validateShareRecipientEmail('  Engineer.Raj@Gmail.COM  ', {
    ownerEmail: 'owner@gmail.com',
    existingSharedEmails: ['first@gmail.com']
  });
  assert.equal(ok.valid, true);
  assert.equal(ok.normalizedEmail, 'engineer.raj@gmail.com');

  const typo = validateShareRecipientEmail('rahul@gmial.com');
  assert.equal(typo.valid, false);
  assert.equal(typo.suggestion, 'rahul@gmail.com');

  const selfShare = validateShareRecipientEmail('owner@gmail.com', {
    ownerEmail: 'OWNER@gmail.com'
  });
  assert.equal(selfShare.valid, false);

  const dup = validateShareRecipientEmail('FIRST@gmail.com', {
    existingSharedEmails: ['first@gmail.com']
  });
  assert.equal(dup.valid, false);

  assert.equal(validateShareRecipientEmail('not-an-email').valid, false);
});

test('ID generators and company initials produce Firestore-safe IDs', () => {
  const pid = generatePortalId('Apex Civil & Infra Ltd.');
  assert.match(pid, /^[a-zA-Z0-9_-]+$/);
  const sid = buildDeterministicShareId(pid, 'user.name@gmail.com');
  assert.match(sid, /^[a-zA-Z0-9_-]+$/);
  assert.equal(getCompanyInitials('Apex Civil'), 'AC');
  assert.equal(getCompanyInitials('Skyline'), 'SK');
});
