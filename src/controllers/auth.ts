import { Request, Response } from 'express';
import { authService } from '../services/auth';



export const config = async (req: Request, res: Response): Promise<void> => {
  try {
    const {cin} = req.body;

    if (!cin) {
      res.status(400).json({
        success: false,
        message: 'CIN is required',
        code: 'MISSING_FIELDS'
      });
      return;
    }

    const result = await authService.config(cin);

    if (!result.success) {
      res.status(400).json({
        success: false,
        message: result.message,
        code: 'CONFIG_FAILED'
      });
      return;
    }

    res.json({
      success: true,
      message: 'Config retrieved successfully',
      data: result.data
    });
  } catch (error: any) {
    console.error('❌ Config retrieval error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve config',
      code: 'INTERNAL_ERROR'
    });
  }
};


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
 * Login with CIN and password
 * POST /api/v1/auth/login
 */
export const login = async (req: Request, res: Response): Promise<void> => {
  try {
    const { cin, password } = req.body;

    if (!cin || !password) {
      res.status(400).json({
        success: false,
        message: 'CIN and password are required',
        code: 'MISSING_FIELDS'
      });
      return;
    }

    const result = await authService.login(cin, password);

    if (!result.success) {
      res.status(400).json({
        success: false,
        message: result.message,
        code: 'LOGIN_FAILED'
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
    console.error('❌ Login error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to login',
      code: 'INTERNAL_ERROR'
    });
  }
};

/**
 * Change staff password
 * POST /api/v1/auth/change-password
 */
export const changePassword = async (req: Request, res: Response): Promise<void> => {
  try {
    const staffId = (req as any).staff?.id;
    const { currentPassword, newPassword } = req.body;

    if (!staffId) {
      res.status(401).json({
        success: false,
        message: 'Authentication required',
        code: 'AUTH_REQUIRED'
      });
      return;
    }

    if (!currentPassword || !newPassword) {
      res.status(400).json({
        success: false,
        message: 'Current password and new password are required',
        code: 'MISSING_PASSWORDS'
      });
      return;
    }

    // Validate new password strength
    if (newPassword.length < 6) {
      res.status(400).json({
        success: false,
        message: 'New password must be at least 6 characters long',
        code: 'WEAK_PASSWORD'
      });
      return;
    }

    const result = await authService.changePassword(staffId, currentPassword, newPassword);

    if (!result.success) {
      res.status(400).json({
        success: false,
        message: result.message,
        code: 'PASSWORD_CHANGE_FAILED'
      });
      return;
    }

    console.log(`🔒 Password changed for staff: ${staffId}`);

    res.json({
      success: true,
      message: result.message
    });
  } catch (error: any) {
    console.error('❌ Change password error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to change password',
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

    // SMS testing removed - using password authentication now
    res.status(400).json({
      success: false,
      message: 'SMS testing is no longer available. Use password authentication.',
      code: 'SMS_DISABLED'
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