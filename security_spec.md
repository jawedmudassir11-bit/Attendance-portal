# Firestore Security Specification

## 1. Data Invariants
1. **Default Deny**: All paths not explicitly matched under `/databases/{database}/documents` are denied.
2. **Verified Email Mandate**: Every read and write on `/portals/{portalId}` and `/portalShares/{shareId}` requires `request.auth != null && request.auth.token.email_verified == true`.
3. **Portal Ownership & Identity Integrity**: On portal creation, `ownerUid == request.auth.uid`, `ownerEmail == request.auth.token.email.lower()`, `id == portalId`, and `createdAt == request.time && updatedAt == request.time`.
4. **Immutable Ownership & Creation Fields**: On portal update, `id`, `ownerUid`, `ownerEmail`, and `createdAt` can never be modified.
5. **PII & Access Isolation**: Only the portal owner (`resource.data.ownerUid == request.auth.uid`) or a verified recipient explicitly listed in `resource.data.sharedWithEmails` (`request.auth.token.email.lower() in resource.data.sharedWithEmails`) can `get` or `list` a portal. Non-owners can never modify or delete a portal.
6. **Bounded Arrays**: `sharedWithEmails` is strictly capped at `<= 50` entries and checked for string element types.
7. **Relational & Atomic Sharing**: Every `/portalShares/{shareId}` creation verifies that the parent `/portals/{portalId}` exists, is owned by `request.auth.uid`, and atomically updates `/portals/{portalId}` (`getAfter` verifies `recipientEmail in sharedWithEmails`).
8. **Strict Key & Volumetric Validation**: Every string field enforces `.size()` limits matching `firebase-blueprint.json`, IDs match `^[a-zA-Z0-9_\-]+$`, and `hasAll`/`hasOnly`/`affectedKeys().hasOnly(...)` block all shadow fields.

## 2. The "Dirty Dozen" Adversarial Payloads
1. **Unauthenticated Read**: `get /portals/portal_1` with `auth = null` -> `PERMISSION_DENIED`.
2. **Unverified Email Spoofing**: `create /portals/portal_1` with `email_verified = false` -> `PERMISSION_DENIED`.
3. **Owner UID Spoofing**: `create /portals/portal_1` where `ownerUid = "victim_uid"` != `auth.uid` -> `PERMISSION_DENIED`.
4. **Shadow Field Injection**: `create /portals/portal_1` with extra key `isSuperAdmin: true` -> `PERMISSION_DENIED`.
5. **Client Timestamp Forgery**: `create /portals/portal_1` with client-fabricated `createdAt` != `request.time` -> `PERMISSION_DENIED`.
6. **ID Poisoning**: `create /portals/../../evil$id` with invalid characters -> `PERMISSION_DENIED`.
7. **Denial-of-Wallet Oversized String**: `create /portals/portal_1` with `companyName` length > 100 -> `PERMISSION_DENIED`.
8. **Unbounded Share Array**: `update /portals/portal_1` with `sharedWithEmails.size() > 50` -> `PERMISSION_DENIED`.
9. **Unauthorized Portal Read (PII Leak)**: Non-owner, non-shared user calls `get /portals/portal_1` -> `PERMISSION_DENIED`.
10. **Non-Owner Portal Mutation**: Shared recipient attempts `update /portals/portal_1` to change `adminHash` or `rtdbUrl` -> `PERMISSION_DENIED`.
11. **Immutable Field Tampering**: Owner attempts `update /portals/portal_1` modifying `ownerUid` or `createdAt` -> `PERMISSION_DENIED`.
12. **Orphaned / Non-Atomic Share Creation**: Attacker creates `/portalShares/share_1` for a portal they do not own or without updating `sharedWithEmails` -> `PERMISSION_DENIED`.
