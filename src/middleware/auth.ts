import { Request, Response, NextFunction } from 'express';
import { authService } from '../services/auth';

// Extend Express Request interface to include staff info
declare global {
  namespace Express {
    interface Request {
      staff?: {
        id: string;
        cin: string;
        firstName: string;
        lastName: string;
        role: string;
        phoneNumber: string;
        station: {
          id: string;
          name: string;
          governorate: string;
          delegation: string;
          address?: string;
          isOnline: boolean;
        };
      };
    }
  }
}

/**
 * Middleware to authenticate requests using JWT token
 */
export const authenticate = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({
        success: false,
        message: 'Access denied. No token provided.',
        code: 'NO_TOKEN'
      });
      return;
    }

    const token = authHeader.substring(7); // Remove 'Bearer ' prefix
    
    const verificationResult = await authService.verifyToken(token);
    
    if (!verificationResult.valid) {
      res.status(401).json({
        success: false,
        message: verificationResult.error || 'Invalid token',
        code: 'INVALID_TOKEN'
      });
      return;
    }

    // Attach staff info to request
    req.staff = verificationResult.staff;
    next();
  } catch (error: any) {
    console.error('❌ Authentication middleware error:', error);
    res.status(500).json({
      success: false,
      message: 'Authentication error',
      code: 'AUTH_ERROR'
    });
  }
};

/**
 * Middleware to check if authenticated user is an admin (ADMIN only)
 */
export const requireAdmin = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  if (!req.staff) {
    res.status(401).json({
      success: false,
      message: 'Authentication required',
      code: 'AUTH_REQUIRED'
    });
    return;
  }

  if (req.staff.role !== 'ADMIN') {
    res.status(403).json({
      success: false,
      message: 'Admin role required',
      code: 'ADMIN_REQUIRED'
    });
    return;
  }

  next();
};

/**
 * Middleware to check if authenticated user has supervisor-level access or higher
 * Allows: ADMIN (inherits all), SUPERVISOR
 * Role Inheritance: ADMIN → SUPERVISOR → WORKER
 */
export const requireSupervisor = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  if (!req.staff) {
    res.status(401).json({
      success: false,
      message: 'Authentication required',
      code: 'AUTH_REQUIRED'
    });
    return;
  }

  // Role inheritance: ADMIN has all SUPERVISOR privileges
  if (!['ADMIN', 'SUPERVISOR'].includes(req.staff.role)) {
    res.status(403).json({
      success: false,
      message: 'Supervisor level access required (Admin or Supervisor)',
      code: 'SUPERVISOR_ACCESS_REQUIRED'
    });
    return;
  }

  next();
};

/**
 * Middleware to check if authenticated user has worker-level access or higher
 * Allows: ADMIN (inherits all), SUPERVISOR (inherits worker), WORKER
 * Role Inheritance: ADMIN → SUPERVISOR → WORKER
 */
export const requireStaff = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  if (!req.staff) {
    res.status(401).json({
      success: false,
      message: 'Staff authentication required',
      code: 'STAFF_AUTH_REQUIRED'
    });
    return;
  }

  // Role inheritance: ADMIN and SUPERVISOR have all WORKER privileges
  if (!['WORKER', 'SUPERVISOR', 'ADMIN'].includes(req.staff.role)) {
    res.status(403).json({
      success: false,
      message: 'Staff role required (Worker level or higher)',
      code: 'STAFF_ROLE_REQUIRED'
    });
    return;
  }

  next();
};

// =============== ROLE-SPECIFIC MIDDLEWARE (No Inheritance) ===============

/**
 * Middleware that ONLY allows ADMIN (no inheritance)
 * Use this for admin-exclusive operations like creating stations
 */
export const requireAdminOnly = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  if (!req.staff) {
    res.status(401).json({
      success: false,
      message: 'Authentication required',
      code: 'AUTH_REQUIRED'
    });
    return;
  }

  if (req.staff.role !== 'ADMIN') {
    res.status(403).json({
      success: false,
      message: 'Admin role required (admin-exclusive operation)',
      code: 'ADMIN_ONLY_REQUIRED'
    });
    return;
  }

  next();
};

/**
 * Middleware that ONLY allows SUPERVISOR (no inheritance)
 * Use this for supervisor-exclusive operations if needed
 */
export const requireSupervisorOnly = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  if (!req.staff) {
    res.status(401).json({
      success: false,
      message: 'Authentication required',
      code: 'AUTH_REQUIRED'
    });
    return;
  }

  if (req.staff.role !== 'SUPERVISOR') {
    res.status(403).json({
      success: false,
      message: 'Supervisor role required (supervisor-exclusive operation)',
      code: 'SUPERVISOR_ONLY_REQUIRED'
    });
    return;
  }

  next();
};

/**
 * Middleware that ONLY allows WORKER (no inheritance)
 * Use this for worker-exclusive operations if needed
 */
export const requireWorkerOnly = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  if (!req.staff) {
    res.status(401).json({
      success: false,
      message: 'Authentication required',
      code: 'AUTH_REQUIRED'
    });
    return;
  }

  if (req.staff.role !== 'WORKER') {
    res.status(403).json({
      success: false,
      message: 'Worker role required (worker-exclusive operation)',
      code: 'WORKER_ONLY_REQUIRED'
    });
    return;
  }

  next();
};

/**
 * Middleware to check if authenticated user is a driver
 * Allows: ADMIN (can access all), DRIVER
 */
export const requireDriver = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  if (!req.staff) {
    res.status(401).json({
      success: false,
      message: 'Authentication required',
      code: 'AUTH_REQUIRED'
    });
    return;
  }

  // Admin can access driver functionality for management purposes
  if (!['ADMIN', 'DRIVER'].includes(req.staff.role)) {
    res.status(403).json({
      success: false,
      message: 'Driver role required',
      code: 'DRIVER_REQUIRED'
    });
    return;
  }

  next();
};

/**
 * Middleware that ONLY allows DRIVER (no inheritance except admin)
 * Use this for driver-exclusive operations
 */
export const requireDriverOnly = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  if (!req.staff) {
    res.status(401).json({
      success: false,
      message: 'Authentication required',
      code: 'AUTH_REQUIRED'
    });
    return;
  }

  if (req.staff.role !== 'DRIVER') {
    res.status(403).json({
      success: false,
      message: 'Driver role required (driver-exclusive operation)',
      code: 'DRIVER_ONLY_REQUIRED'
    });
    return;
  }

  next();
};

// =============== ROLE HIERARCHY HELPER FUNCTIONS ===============

/**
 * Check if a role has access to another role's functionality
 */
export const hasRoleAccess = (userRole: string, requiredRole: string): boolean => {
  const roleHierarchy = {
    'ADMIN': ['ADMIN', 'SUPERVISOR', 'WORKER', 'DRIVER'], // Admin can access all
    'SUPERVISOR': ['SUPERVISOR', 'WORKER'], 
    'WORKER': ['WORKER'],
    'DRIVER': ['DRIVER'] // Driver has separate access
  };
  
  return roleHierarchy[userRole as keyof typeof roleHierarchy]?.includes(requiredRole) || false;
};

/**
 * Get all roles that a user can access (including their own)
 */
export const getAccessibleRoles = (userRole: string): string[] => {
  const roleHierarchy = {
    'ADMIN': ['ADMIN', 'SUPERVISOR', 'WORKER', 'DRIVER'],
    'SUPERVISOR': ['SUPERVISOR', 'WORKER'],
    'WORKER': ['WORKER'],
    'DRIVER': ['DRIVER']
  };
  
  return roleHierarchy[userRole as keyof typeof roleHierarchy] || [];
};

/**
 * Optional authentication - adds staff info if token is present but doesn't require it
 */
export const optionalAuth = async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;
    
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      const verificationResult = await authService.verifyToken(token);
      
      if (verificationResult.valid) {
        req.staff = verificationResult.staff;
      }
    }
    
    next();
  } catch (error: any) {
    // Don't fail if optional auth fails, just continue without staff info
    console.warn('⚠️  Optional auth failed:', error.message);
    next();
  }
};

/**
 * Middleware to validate CIN format
 */
export const validateCIN = (req: Request, res: Response, next: NextFunction): void => {
  const { cin } = req.body;
  
  if (!cin) {
    res.status(400).json({
      success: false,
      message: 'CIN is required',
      code: 'CIN_REQUIRED'
    });
    return;
  }

  // Basic CIN validation (8 digits for Tunisia)
  const cinRegex = /^\d{8}$/;
  if (!cinRegex.test(cin)) {
    res.status(400).json({
      success: false,
      message: 'Invalid CIN format. CIN must be 8 digits.',
      code: 'INVALID_CIN_FORMAT'
    });
    return;
  }

  next();
};

/**
 * Middleware to validate phone number format
 */
export const validatePhoneNumber = (req: Request, res: Response, next: NextFunction): void => {
  const { phoneNumber } = req.body;
  
  if (!phoneNumber) {
    res.status(400).json({
      success: false,
      message: 'Phone number is required',
      code: 'PHONE_REQUIRED'
    });
    return;
  }

  // Basic phone validation (allow various formats)
  const cleanPhone = phoneNumber.replace(/\D/g, '');
  if (cleanPhone.length < 8 || cleanPhone.length > 15) {
    res.status(400).json({
      success: false,
      message: 'Invalid phone number format',
      code: 'INVALID_PHONE_FORMAT'
    });
    return;
  }

  next();
};

/**
 * Rate limiting middleware for SMS endpoints
 */
const smsAttempts = new Map<string, { count: number; resetTime: number }>();

export const rateLimitSMS = (maxAttempts: number = 3, windowMinutes: number = 15) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    const identifier = req.ip + ':' + (req.body.cin || req.body.phoneNumber);
    const now = Date.now();
    
    const attempt = smsAttempts.get(identifier);
    
    if (attempt) {
      if (now > attempt.resetTime) {
        // Reset window
        smsAttempts.set(identifier, { count: 1, resetTime: now + windowMinutes * 60 * 1000 });
      } else if (attempt.count >= maxAttempts) {
        res.status(429).json({
          success: false,
          message: `Too many SMS attempts. Try again in ${Math.ceil((attempt.resetTime - now) / 60000)} minutes.`,
          code: 'SMS_RATE_LIMIT'
        });
        return;
      } else {
        attempt.count++;
      }
    } else {
      smsAttempts.set(identifier, { count: 1, resetTime: now + windowMinutes * 60 * 1000 });
    }
    
    next();
  };
};

// Clean up old entries periodically
setInterval(() => {
  const now = Date.now();
  for (const [key, attempt] of smsAttempts.entries()) {
    if (now > attempt.resetTime) {
      smsAttempts.delete(key);
    }
  }
}, 60000); // Cleanup every minute 