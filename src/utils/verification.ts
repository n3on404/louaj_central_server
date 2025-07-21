/**
 * Generate a 6-digit verification code
 */
export const generateVerificationCode = (): string => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

/**
 * Generate a unique booking verification code (8 characters)
 */
export const generateBookingCode = (): string => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  for (let i = 0; i < 8; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
};

/**
 * Validate CIN format (8 digits for Tunisia)
 */
export const validateCIN = (cin: string): boolean => {
  const cinRegex = /^\d{8}$/;
  return cinRegex.test(cin);
};

/**
 * Validate Tunisian phone number
 */
export const validateTunisianPhone = (phoneNumber: string): boolean => {
  // Remove all non-digits
  const cleanPhone = phoneNumber.replace(/\D/g, '');
  
  // Check various Tunisian phone formats
  // Mobile: +216 XX XXX XXX or 216XXXXXXXX or XXXXXXXX
  if (cleanPhone.length === 8) {
    // Local format: XXXXXXXX
    return /^[2-9]\d{7}$/.test(cleanPhone);
  } else if (cleanPhone.length === 11 && cleanPhone.startsWith('216')) {
    // International without +: 216XXXXXXXX
    return /^216[2-9]\d{7}$/.test(cleanPhone);
  } else if (cleanPhone.length === 12 && cleanPhone.startsWith('216')) {
    // International with country code: +216XXXXXXXX
    return /^216[2-9]\d{7}$/.test(cleanPhone);
  }
  
  return false;
};

/**
 * Format phone number to standard format (+216XXXXXXXX)
 */
export const formatTunisianPhone = (phoneNumber: string): string => {
  const cleanPhone = phoneNumber.replace(/\D/g, '');
  
  if (cleanPhone.length === 8) {
    return `+216${cleanPhone}`;
  } else if (cleanPhone.length === 11 && cleanPhone.startsWith('216')) {
    return `+${cleanPhone}`;
  } else if (cleanPhone.length === 12 && cleanPhone.startsWith('216')) {
    return `+${cleanPhone}`;
  }
  
  return phoneNumber; // Return original if can't format
};

/**
 * Calculate distance between two coordinates using Haversine formula
 */
export const calculateDistance = (
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number => {
  const R = 6371e3; // Earth's radius in meters
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c; // Distance in meters
};

/**
 * Check if a point is within a certain radius of another point
 */
export const isWithinRadius = (
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
  radiusMeters: number
): boolean => {
  const distance = calculateDistance(lat1, lon1, lat2, lon2);
  return distance <= radiusMeters;
};

/**
 * Generate a secure random token
 */
export const generateSecureToken = (length: number = 32): string => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
};