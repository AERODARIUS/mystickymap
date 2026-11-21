/**
 * Idempotent Firestore migration: backfills `expiresAt: null` on existing notes
 * that were created before the optional expiration feature.
 *
 * Preserves all existing note fields (createdAt, updatedAt, content, location, etc.).
 *
 * Usage:
 *   npx tsx scripts/migrations/001_add_notes_expires_at.ts [--dry-run]
 */
import fs from 'node:fs';
import path from 'node:path';
import { initializeApp, applicationDefault } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

async function run() {
  const dryRun = process.argv.includes('--dry-run');
  const configPath = path.resolve(process.cwd(), 'firebase-applet-config.json');
  const config = JSON.parse(fs.readFileSync(configPath, 'utf8')) as {
    projectId: string;
    firestoreDatabaseId?: string;
  };

  const app = initializeApp({
    credential: applicationDefault(),
    projectId: config.projectId,
  });

  const db = config.firestoreDatabaseId
    ? getFirestore(app, config.firestoreDatabaseId)
    : getFirestore(app);

  const snapshot = await db.collection('notes').get();
  const docsToMigrate = snapshot.docs.filter((docSnap) => {
    const data = docSnap.data();
    return !Object.prototype.hasOwnProperty.call(data, 'expiresAt');
  });

  console.log(
    `Scanned ${snapshot.size} notes. Found ${docsToMigrate.length} notes missing expiresAt.`
  );

  if (dryRun || docsToMigrate.length === 0) {
    console.log(dryRun ? 'Dry-run complete. No documents modified.' : 'Nothing to migrate.');
    return;
  }

  const BATCH_LIMIT = 450;
  let updated = 0;

  for (let i = 0; i < docsToMigrate.length; i += BATCH_LIMIT) {
    const chunk = docsToMigrate.slice(i, i + BATCH_LIMIT);
    const batch = db.batch();
    for (const docSnap of chunk) {
      batch.update(docSnap.ref, { expiresAt: null });
    }
    await batch.commit();
    updated += chunk.length;
    console.log(`Migrated ${updated}/${docsToMigrate.length} notes...`);
  }

  console.log(`Migration complete. Backfilled expiresAt: null on ${updated} notes.`);
}

run().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
