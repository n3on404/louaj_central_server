import { Request, Response } from 'express';
import { authService } from '../services/auth';

/**
 * Create a new admin account (no auth required - for initial setup)
 * POST /api/v1/auth/register/admin
 */
export const createAdmin = async (req: Request, res: Response): Promise<void> => {
  try {
    const { cin, phoneNumber, firstName, lastName } = req.body;

    // Validate required fields
    if (!cin || !phoneNumber || !firstName || !lastName) {
      res.status(400).json({
        success: false,
        message: 'Missing required fields: cin, phoneNumber, firstName, lastName',
        code: 'MISSING_FIELDS'
      });
      return;
    }

    const result = await authService.createAdmin({
      cin,
      phoneNumber,
      firstName,
      lastName
    });

    if (!result.success) {
      res.status(400).json({
        success: false,
        message: result.message,
        code: 'CREATION_FAILED'
      });
      return;
    }

    console.log(`👑 New admin created: ${firstName} ${lastName} (${cin})`);

    res.status(201).json({
      success: true,
      message: result.message,
      data: result.data
    });
  } catch (error: any) {
    console.error('❌ Admin creation error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create admin account',
      code: 'INTERNAL_ERROR'
    });
  }
};

/**
 * Create a new supervisor account (ADMIN only)
 * POST /api/v1/auth/register/supervisor
 */
export const createSupervisor = async (req: Request, res: Response): Promise<void> => {
  try {
    const { cin, phoneNumber, firstName, lastName, stationId } = req.body;

    // Validate required fields
    if (!cin || !phoneNumber || !firstName || !lastName || !stationId) {
      res.status(400).json({
        success: false,
        message: 'Missing required fields: cin, phoneNumber, firstName, lastName, stationId',
        code: 'MISSING_FIELDS'
      });
      return;
    }

    const result = await authService.createSupervisor({
      cin,
      phoneNumber,
      firstName,
      lastName,
      stationId
    });

    if (!result.success) {
      res.status(400).json({
        success: false,
        message: result.message,
        code: 'CREATION_FAILED'
      });
      return;
    }

    console.log(`👨‍💼 New supervisor registered: ${firstName} ${lastName} (${cin})`);

    res.status(201).json({
      success: true,
      message: result.message,
      data: result.data
    });
  } catch (error: any) {
    console.error('❌ Supervisor creation error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create supervisor account',
      code: 'INTERNAL_ERROR'
    });
  }
};

/**
 * Create a new worker account (requires supervisor auth)
 * POST /api/v1/auth/register/worker
 */
export const createWorker = async (req: Request, res: Response): Promise<void> => {
  try {
    const { cin, phoneNumber, firstName, lastName, stationId } = req.body;

    // Validate required fields
    if (!cin || !phoneNumber || !firstName || !lastName || !stationId) {
      res.status(400).json({
        success: false,
        message: 'Missing required fields: cin, phoneNumber, firstName, lastName, stationId',
        code: 'MISSING_FIELDS'
      });
      return;
    }

    // Get supervisor ID from authenticated request
    const supervisorId = req.staff!.id;

    const result = await authService.createWorker(supervisorId, {
      cin,
      phoneNumber,
      firstName,
      lastName,
      stationId
    });

    if (!result.success) {
      res.status(400).json({
        success: false,
        message: result.message,
        code: 'CREATION_FAILED'
      });
      return;
    }

    console.log(`👷‍♂️ New worker registered: ${firstName} ${lastName} (${cin}) by supervisor ${req.staff!.firstName} ${req.staff!.lastName}`);

    res.status(201).json({
      success: true,
      message: result.message,
      data: result.data
    });
  } catch (error: any) {
    console.error('❌ Worker creation error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create worker account',
      code: 'INTERNAL_ERROR'
    });
  }
};

/**
 * Initiate login process - send SMS verification code
 * POST /api/v1/auth/login/start
 */
export const startLogin = async (req: Request, res: Response): Promise<void> => {
  try {
    const { cin } = req.body;

    const result = await authService.initiateLogin(cin);

    if (!result.success) {
      res.status(400).json({
        success: false,
        message: result.message,
        code: 'LOGIN_FAILED'
      });
      return;
    }

    // Don't expose verification SID to client for security
    res.json({
      success: true,
      message: result.message,
      data: result.data
    });
  } catch (error: any) {
    console.error('❌ Login start error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to initiate login',
      code: 'INTERNAL_ERROR'
    });
  }
};

/**
 * Complete login process - verify SMS code and create session
 * POST /api/v1/auth/login/verify
 */
export const verifyLogin = async (req: Request, res: Response): Promise<void> => {
  try {
    const { cin, verificationCode } = req.body;

    if (!cin || !verificationCode) {
      res.status(400).json({
        success: false,
        message: 'CIN and verification code are required',
        code: 'MISSING_FIELDS'
      });
      return;
    }

    const result = await authService.verifyLogin(cin, verificationCode);

    if (!result.success) {
      res.status(400).json({
        success: false,
        message: result.message,
        code: 'VERIFICATION_FAILED'
      });
      return;
    }

    console.log(`🔓 Login successful: ${result.data!.staff.firstName} ${result.data!.staff.lastName} (${result.data!.staff.role})`);

    res.json({
      success: true,
      message: result.message,
      data: result.data
    });
  } catch (error: any) {
    console.error('❌ Login verification error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to verify login',
      code: 'INTERNAL_ERROR'
    });
  }
};

/**
 * Get current user profile
 * GET /api/v1/auth/profile
 */
export const getProfile = async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.staff) {
      res.status(401).json({
        success: false,
        message: 'Authentication required',
        code: 'AUTH_REQUIRED'
      });
      return;
    }

    res.json({
      success: true,
      message: 'Profile retrieved successfully',
      data: req.staff
    });
  } catch (error: any) {
    console.error('❌ Profile retrieval error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve profile',
      code: 'INTERNAL_ERROR'
    });
  }
};

/**
 * Test SMS service
 * POST /api/v1/auth/test-sms
 */
export const testSMS = async (req: Request, res: Response): Promise<void> => {
  try {
    const { phoneNumber } = req.body;

    if (!phoneNumber) {
      res.status(400).json({
        success: false,
        message: 'Phone number is required',
        code: 'PHONE_REQUIRED'
      });
      return;
    }

    const result = await authService.testSMS(phoneNumber);

    res.json({
      success: result.success,
      message: result.message,
      data: result.sid ? { sid: result.sid } : undefined
    });
  } catch (error: any) {
    console.error('❌ SMS test error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to test SMS service',
      code: 'INTERNAL_ERROR'
    });
  }
};

/**
 * Refresh token endpoint
 * POST /api/v1/auth/refresh
 */
export const refreshToken = async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.staff) {
      res.status(401).json({
        success: false,
        message: 'Authentication required',
        code: 'AUTH_REQUIRED'
      });
      return;
    }

    // For now, just return the current staff info
    // In the future, you could implement token refresh logic
    res.json({
      success: true,
      message: 'Token is still valid',
      data: {
        staff: req.staff,
        refreshedAt: new Date().toISOString()
      }
    });
  } catch (error: any) {
    console.error('❌ Token refresh error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to refresh token',
      code: 'INTERNAL_ERROR'
    });
  }
};

/**
 * Logout endpoint (for completeness, JWT is stateless)
 * POST /api/v1/auth/logout
 */
export const logout = async (req: Request, res: Response): Promise<void> => {
  try {
    // Since JWT is stateless, we can't actually invalidate the token
    // In a production system, you might want to maintain a blacklist
    console.log(`🔒 Logout: ${req.staff?.firstName} ${req.staff?.lastName}`);

    res.json({
      success: true,
      message: 'Logout successful. Please delete the token from your client.',
      timestamp: new Date().toISOString()
    });
  } catch (error: any) {
    console.error('❌ Logout error:', error);
    res.status(500).json({
      success: false,
      message: 'Logout failed',
      code: 'INTERNAL_ERROR'
    });
  }
}; 