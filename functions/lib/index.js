"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.logError = void 0;
const https_1 = require("firebase-functions/v2/https");
const logger = __importStar(require("firebase-functions/logger"));
const app_1 = require("firebase-admin/app");
const firestore_1 = require("firebase-admin/firestore");
(0, app_1.initializeApp)();
const db = (0, firestore_1.getFirestore)();
/**
 * Sanitizes sensitive data from the payload
 */
function sanitizePayload(payload) {
    const sensitiveFields = ['auth', 'token', 'password', 'secret', 'key', 'lat', 'lng', 'content'];
    const sanitized = JSON.parse(JSON.stringify(payload));
    const recursiveSanitize = (obj) => {
        if (!obj || typeof obj !== 'object')
            return;
        for (const key in obj) {
            if (sensitiveFields.some(field => key.toLowerCase().includes(field))) {
                obj[key] = '[REDACTED]';
            }
            else if (obj[key] && typeof obj[key] === 'object') {
                recursiveSanitize(obj[key]);
            }
        }
    };
    recursiveSanitize(sanitized);
    return sanitized;
}
/**
 * Persists error to Cloud Logging and Firestore
 */
exports.logError = (0, https_1.onCall)({
    cors: true,
    maxInstances: 10,
}, async (request) => {
    const userId = request.auth?.uid || "anonymous";
    const rawPayload = request.data;
    if (!rawPayload.message || !rawPayload.severity) {
        throw new https_1.HttpsError("invalid-argument", "Message and severity are required.");
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
            createdAt: firestore_1.FieldValue.serverTimestamp(),
        });
    }
    catch (err) {
        logger.error("Failed to persist error to Firestore", err);
    }
    return { success: true };
});
//# sourceMappingURL=index.js.map