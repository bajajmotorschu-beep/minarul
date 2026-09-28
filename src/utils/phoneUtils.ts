/**
 * Phone number normalization and validation for Bangladeshi mobile numbers
 * Handles formats like:
 * 017XXXXXXXX, +88017XXXXXXXX, 88017XXXXXXXX, 018XXXXXXXX,
 * Bengali numerals (০১৭১২৩৪৫৬৭৮), spaces, hyphens, parentheses, etc.
 */

// Mapping of Bengali numerals (বাংলা সংখ্যা) to standard ASCII digits
const banglaToEnglishMap: Record<string, string> = {
  '০': '0',
  '১': '1',
  '২': '2',
  '৩': '3',
  '৪': '4',
  '৫': '5',
  '৬': '6',
  '৭': '7',
  '৮': '8',
  '৯': '9',
};

/**
 * Converts Bengali digits to English digits
 */
export function convertBanglaToEnglishDigits(input: string): string {
  if (!input) return '';
  return input.replace(/[০-৯]/g, (match) => banglaToEnglishMap[match] || match);
}

/**
 * Normalizes any Bangladeshi phone number input into a clean 11-digit string (e.g. 017XXXXXXXX)
 */
export function normalizePhoneNumber(rawPhone: string): string {
  if (!rawPhone) return '';
  
  // 1. Convert any Bengali digits to English
  const englishPhone = convertBanglaToEnglishDigits(rawPhone);
  
  // 2. Remove all non-numeric characters (spaces, dashes, parentheses, plus, etc.)
  let digits = englishPhone.replace(/[^0-9]/g, '');
  if (!digits) return '';

  // 3. Remove international prefixes
  // Format: 008801XXXXXXXXX -> 01XXXXXXXXX
  if (digits.startsWith('008801') && digits.length >= 15) {
    digits = digits.slice(4);
  }
  // Format: 8801XXXXXXXXX -> 01XXXXXXXXX
  if (digits.startsWith('8801') && digits.length === 13) {
    digits = digits.slice(2);
  }
  // Format: 88001XXXXXXXXX or similar accidental prefixes
  if (digits.startsWith('880') && digits.length === 14) {
    digits = digits.slice(3);
  }

  // Format: 1XXXXXXXXX (10 digits missing the leading 0, e.g. 1712345678)
  if (digits.startsWith('1') && digits.length === 10) {
    digits = '0' + digits;
  }

  // If longer than 11 digits but ends with 11-digit BD number (e.g. from copy-paste)
  if (digits.length > 11 && digits.includes('01')) {
    const match = digits.match(/01[3-9]\d{8}/);
    if (match) {
      return match[0];
    }
  }

  return digits;
}

/**
 * Validates whether a phone number is a valid Bangladeshi mobile number
 * Operators:
 * 013 (Grameenphone), 014 (Banglalink), 015 (Teletalk), 016 (Airtel),
 * 017 (Grameenphone), 018 (Robi), 019 (Banglalink)
 */
export function isValidBangladeshiPhone(rawPhone: string): boolean {
  const normalized = normalizePhoneNumber(rawPhone);
  // Valid Bangladeshi mobile operators start with 013-019 and are exactly 11 digits
  return /^01[3-9]\d{8}$/.test(normalized);
}

/**
 * Checks if input is likely intended as a phone number rather than an email
 */
export function isLikelyPhoneNumber(input: string): boolean {
  if (!input) return false;
  const clean = input.trim();
  if (clean.includes('@')) return false;
  // If it contains letters (except common prefixes like + or ext), not a phone
  const hasLetters = /[a-zA-Z]/.test(clean);
  if (hasLetters) return false;
  return true;
}

