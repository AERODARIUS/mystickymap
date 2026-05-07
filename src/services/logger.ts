import { getFunctions, httpsCallable } from 'firebase/functions';
import { auth } from '../firebase';

export enum LogSeverity {
  INFO = 'info',
  WARNING = 'warning',
  ERROR = 'error',
  CRITICAL = 'critical',
}

export interface LogMetadata {
  [key: string]: unknown;
}

class Logger {
  private functions = getFunctions();
  private logErrorCallable = httpsCallable(this.functions, 'logError');
  private isLogging = false;

  /**
   * Normalizes an error object into a serializable format
   */
  private normalizeError(error: unknown) {
    if (error instanceof Error) {
      return {
        message: error.message,
        stack: error.stack,
        name: error.name,
      };
    }
    if (typeof error === 'string') {
      return { message: error };
    }
    try {
      return { message: JSON.stringify(error) };
    } catch {
      return { message: String(error) };
    }
  }

  /**
   * Safely logs an event to the backend
   */
  private async log(
    severity: LogSeverity,
    message: string,
    error?: unknown,
    metadata?: LogMetadata
  ) {
    // Avoid recursive logging loops
    if (this.isLogging) return;
    this.isLogging = true;

    try {
      const normalized = this.normalizeError(error);
      const payload = {
        message: message || normalized.message || 'Unknown error',
        stack: normalized.stack,
        severity,
        source: 'frontend',
        route: window.location.pathname,
        browser: navigator.userAgent,
        userAgent: navigator.userAgent,
        appVersion: '1.0.0', // Could be dynamic
        userId: auth.currentUser?.uid,
        metadata: {
          ...(metadata as Record<string, unknown>),
          name: normalized.name,
          timestamp: new Date().toISOString(),
        },
      };

      // Also log to local console for development
      const consoleMethod = severity === LogSeverity.ERROR || severity === LogSeverity.CRITICAL ? 'error' : 'warn';
      console[consoleMethod](`[Logger:${severity}] ${message}`, { error, metadata, payload });

      // Send to backend
      await this.logErrorCallable(payload);
    } catch (err) {
      // Gracefully fail if logging fails
      console.warn('Logging utility failed to report error:', err);
    } finally {
      this.isLogging = false;
    }
  }

  info(message: string, metadata?: LogMetadata) {
    this.log(LogSeverity.INFO, message, undefined, metadata);
  }

  warn(message: string, error?: unknown, metadata?: LogMetadata) {
    this.log(LogSeverity.WARNING, message, error, metadata);
  }

  error(message: string, error?: unknown, metadata?: LogMetadata) {
    this.log(LogSeverity.ERROR, message, error, metadata);
  }

  critical(message: string, error?: unknown, metadata?: LogMetadata) {
    this.log(LogSeverity.CRITICAL, message, error, metadata);
  }
}

export const logger = new Logger();
