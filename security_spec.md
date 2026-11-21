# Security Specification for Spotheon

## 1. Data Invariants
- **Identity Integrity**: `authorId` on `notes` must strictly match `request.auth.uid`.
- **Relational Integrity**: Notes are top-level but linked to users via `authorId`.
- **Immutability**: `authorId` and `createdAt` on notes are immutable after creation.
- **Visibility Model**: 
    - `public`: Discovery (list) and fetching (get) allowed for everyone while `moderationState` is visible (or omitted) and not expired (`expiresAt` omitted, `null`, or `> request.time`).
    - `unlisted`: Fetching (get) allowed for everyone via ID while visible and not expired, but hidden from discovery (list).
    - `private`: Both discovery and fetching restricted to author and admins.
- **Expiration Integrity**:
    - `expiresAt` is optional and nullable (`null` or `timestamp`). `null` or omitted means the note never expires.
    - When `expiresAt` is set on `create` or modified to a non-null value on `update` by a non-admin, it must be strictly in the future (`> request.time`).
    - Expired notes remain stored and accessible to their owner (`authorId == request.auth.uid`) and admins, and are denied to all other users on `get`, `list`, and comment interactions.
- **Input Validation**: `content` must be within 1–1000 visible characters (up to 4000 stored Markdown characters for notes) and 1–500 visible characters (up to 1500 stored Markdown characters for comments). Optional `contentFormat` must be `'plain'` or `'markdown'`. `location` must be a valid lat/lng map.
- **RBAC**: `role` in `/users/{userId}` can only be set by admins.

- **Comment Visibility**: Comments inherit visibility and expiration from their parent note. They cannot be read, listed, or created unless the parent note is `public`/`unlisted`, visible, and not expired, or the requester is the owner/admin.

## 2. The "Dirty Dozen" Forbidden Payloads

1. **Identity Spoofing**: `create` note with `authorId: "someone_else"`.
2. **Shadow Field Injection**: `create` note with `isVerified: true` (unauthorized field).
3. **Privilege Escalation**: `update` own user document with `role: "admin"`.
4. **Denial of Wallet (ID Injection)**: `create` note with 1.5KB random character string as document ID.
5. **Denial of Wallet (Payload Size)**: `create` note with `content` size > 4000 chars or comment `content` > 1500 chars.
6. **Immutable Field Tampering**: `update` note's `createdAt` to a new timestamp.
7. **Privacy Leak (List)**: `list` notes without a query filter and see private or expired notes of others.
8. **Privacy Leak (Get)**: `get` a private or expired note of another user by ID.
9. **Comment Hijacking**: `create` a comment for a note the user does not have read access to (including expired notes).
10. **Comment Context Forgery**: `create` a comment with `noteId` that does not match the parent collection's ID.
11. **Type Poisoning**: `update` `location` with a string instead of a map, or `expiresAt` with a string/number instead of a timestamp/null.
12. **Past Expiration Injection**: `create` or `update` a note with `expiresAt <= request.time`.

## 3. Test Runner Strategy
Tests will follow `firestore.rules.test.ts` and Vitest verification patterns.

