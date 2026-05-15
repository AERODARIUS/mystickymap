/**
 * Simple risk scoring utility for Spotheon notes.
 * This provides a basic foundation for automated moderation flags.
 */

export interface RiskScoreResult {
  score: number; // 0 to 100
  flags: string[];
  isHighRisk: boolean;
}

const SPAM_KEYWORDS = [
  'crypto', 'bitcoin', 'investment', 'profit', 'earn', 'cheap', 'discount', 
  'free money', 'winner', 'claim', 'viagra', 'porn', 'sex', 'casino', 'bet'
];

export const calculateRiskScore = (content: string): RiskScoreResult => {
  let score = 0;
  const flags: string[] = [];
  const text = content.toLowerCase();

  // 1. Keyword check
  const matchedKeywords = SPAM_KEYWORDS.filter(word => text.includes(word));
  if (matchedKeywords.length > 0) {
    score += matchedKeywords.length * 20;
    flags.push(`spam_keywords: ${matchedKeywords.join(', ')}`);
  }

  // 2. Excessive CAPS
  const capsCount = (content.match(/[A-Z]/g) || []).length;
  if (content.length > 5 && capsCount / content.length > 0.5) {
    score += 30;
    flags.push('excessive_caps');
  }

  // 3. Excessive Punctuation
  if (/(!!|??|##|$$)/.test(content)) {
    score += 15;
    flags.push('excessive_punctuation');
  }

  // 4. Links check
  if (/(https?:\/\/[^\s]+)/g.test(content)) {
    score += 40;
    flags.push('contains_links');
  }

  // 5. Short content (usually less risky but often low quality)
  if (content.trim().length < 3) {
    score += 10;
    flags.push('very_short');
  }

  // Cap score at 100
  score = Math.min(100, score);

  return {
    score,
    flags,
    isHighRisk: score >= 70
  };
};
