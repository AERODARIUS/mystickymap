import { NoteReport } from '../types';

/**
 * Calculates a simple risk score for a note based on its content and reports.
 * This is an MVP implementation.
 * 
 * Scores:
 * - 0-30: Low risk
 * - 31-60: Medium risk (Flag for review)
 * - 61-100: High risk (Immediate attention)
 */
export const calculateRiskScore = (content: string, reports: NoteReport[]): number => {
  let score = 0;

  // 1. Content-based scoring (Keywords)
  // In a real app, this would be more sophisticated or use an AI model.
  const suspiciousKeywords = [
    'buy now', 'click here', 'crypto', 'prize', 'winner', 'viagra',
    'offensive', 'hate', 'kill', 'die', 'stupid'
  ];
  
  const lowercaseContent = content.toLowerCase();
  suspiciousKeywords.forEach(word => {
    if (lowercaseContent.includes(word)) {
      score += 15;
    }
  });

  // 2. Report-based scoring
  // More reports or more severe reasons increase the score.
  reports.forEach(report => {
    if (report.status === 'pending') {
      switch (report.reason) {
        case 'spam':
          score += 10;
          break;
        case 'harassment':
          score += 30;
          break;
        case 'hate_speech':
          score += 50;
          break;
        case 'nsfw':
          score += 25;
          break;
        case 'threat':
          score += 60;
          break;
        case 'other':
          score += 5;
          break;
      }
    }
  });

  // 3. Cap at 100
  return Math.min(score, 100);
};

/**
 * Determines if a note should be flagged for review based on its risk score.
 */
export const shouldFlagForReview = (score: number): boolean => {
  return score >= 40; // Conservative threshold for beta
};
