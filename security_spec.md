# Security Specification for My Sticky Map

## 1. Data Invariants
- **Identity Integrity**: `authorId` on `notes` must strictly match `request.auth.uid`.
- **Relational Integrity**: Notes are top-level but linked to users via `authorId`.
- **Immutability**: `authorId` and `createdAt` on notes are immutable after creation.
- **Privacy Core**: `isPrivate` notes must be readable ONLY by the author or admins.
- **Input Validation**: `content` must be within 1-1000 chars. `location` must be a valid lat/lng map.
- **RBAC**: `role` in `/users/{userId}` can only be set by admins.

## 2. The "Dirty Dozen" Forbidden Payloads

1. **Identity Spoofing**: `create` note with `authorId: "someone_else"`.
2. **Shadow Field Injection**: `create` note with `isVerified: true` (unauthorized field).
3. **Privilege Escalation**: `update` own user document with `role: "admin"`.
4. **Denial of Wallet (ID Injection)**: `create` note with 1.5KB random character string as document ID.
5. **Denial of Wallet (Payload Size)**: `create` note with `content` size > 1MB.
6. **Immutable Field Tampering**: `update` note's `createdAt` to a new timestamp.
7. **Privacy Leak (List)**: `list` notes without a query filter and see private notes of others.
8. **Privacy Leak (Get)**: `get` a private note of another user by ID.
9. **State Shortcut**: `update` a note to change its `type` from `text` to `audio` without updating `audioUrl`? (Actually `type` is fixed on creation).
10. **Type Poisoning**: `update` `location` with a string instead of a map.
11. **Regex Poisoning**: Use `../../passwords` as document ID.
12. **PII Scraping**: `list` all documents in `/users` collection without ownership filter.

## 3. Test Runner Strategy
Tests will follow `firestore.rules.test.ts` pattern using `@firebase/rules-unit-testing`.
