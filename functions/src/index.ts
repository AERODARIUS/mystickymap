import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import { initializeApp } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";

initializeApp();
const db = getFirestore();

interface ErrorPayload {
  message: string;
  stack?: string;
  severity: "info" | "warning" | "error" | "critical";
  source?: string;
  route?: string;
  browser?: string;
  userAgent?: string;
  appVersion?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Sanitizes sensitive data from the payload
 */
function sanitizePayload(payload: unknown): Record<string, unknown> {
  const sensitiveFields = ['auth', 'token', 'password', 'secret', 'key', 'lat', 'lng', 'content'];
  const sanitized = JSON.parse(JSON.stringify(payload));

  const recursiveSanitize = (obj: Record<string, unknown>) => {
    if (!obj || typeof obj !== 'object') return;
    for (const key in obj) {
      if (sensitiveFields.some(field => key.toLowerCase().includes(field))) {
        obj[key] = '[REDACTED]';
      } else if (obj[key] && typeof obj[key] === 'object') {
        recursiveSanitize(obj[key] as Record<string, unknown>);
      }
    }
  };

  recursiveSanitize(sanitized);
  return sanitized;
}

/**
 * Persists error to Cloud Logging and Firestore
 */
export const logError = onCall({
  cors: true,
  maxInstances: 10,
}, async (request) => {
  const userId = request.auth?.uid || "anonymous";
  const rawPayload = request.data as ErrorPayload;

  if (!rawPayload.message || !rawPayload.severity) {
    throw new HttpsError("invalid-argument", "Message and severity are required.");
  }

  const sanitized = sanitizePayload(rawPayload);

  // 1. Structured Cloud Logging
  logger.write({
    severity: String(sanitized.severity || 'error').toUpperCase(),
    message: String(sanitized.message),
    stack: sanitized.stack,
    userId,
    route: sanitized.route,
    source: sanitized.source,
    metadata: sanitized.metadata,
    httpRequest: {
      userAgent: sanitized.userAgent,
    },
  });

  // 2. Persist to Firestore
  try {
    await db.collection("errorLogs").add({
      ...sanitized,
      userId,
      createdAt: FieldValue.serverTimestamp(),
    });
  } catch (err) {
    logger.error("Failed to persist error to Firestore", err);
  }

  return { success: true };
});

