import { Request, Response } from 'express';
import { userService } from '../services/user';

/**
 * Register a new user with phone number and password
 * POST /api/v1/users/register
 */
export const registerUser = async (req: Request, res: Response): Promise<void> => {
  try {
    const { phoneNumber, firstName, lastName, password, email } = req.body;

    // Validate required fields
    if (!phoneNumber || !firstName || !lastName || !password) {
      res.status(400).json({
        success: false,
        message: 'Phone number, first name, last name, and password are required',
        code: 'MISSING_REQUIRED_FIELDS'
      });
      return;
    }

    // Validate password strength
    if (password.length < 6) {
      res.status(400).json({
        success: false,
        message: 'Password must be at least 6 characters long',
        code: 'WEAK_PASSWORD'
      });
      return;
    }

    const result = await userService.registerUser({
      phoneNumber,
      firstName,
      lastName,
      password,
      email
    });

    if (!result.success) {
      res.status(400).json({
        success: false,
        message: result.error || 'Registration failed',
        code: 'REGISTRATION_FAILED'
      });
      return;
    }

    console.log(`👤 User registered: ${result.user?.firstName} ${result.user?.lastName}`);

    res.status(201).json({
      success: true,
      message: 'User registered successfully',
      data: {
        token: result.token,
        user: result.user
      }
    });

  } catch (error: any) {
    console.error('❌ Registration error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      code: 'INTERNAL_ERROR'
    });
  }
};

/**
 * Login user with phone number and password
 * POST /api/v1/users/login
 */
export const loginUser = async (req: Request, res: Response): Promise<void> => {
  try {
    const { phoneNumber, password } = req.body;

    if (!phoneNumber || !password) {
      res.status(400).json({
        success: false,
        message: 'Phone number and password are required',
        code: 'MISSING_CREDENTIALS'
      });
      return;
    }

    const result = await userService.authenticateUser({ phoneNumber, password });

    if (!result.success) {
      res.status(401).json({
        success: false,
        message: result.error || 'Authentication failed',
        code: 'AUTH_FAILED'
      });
      return;
    }

    console.log(`🔐 User logged in: ${result.user?.firstName} ${result.user?.lastName}`);

    res.json({
      success: true,
      message: 'Login successful',
      data: {
        token: result.token,
        user: result.user
      }
    });
  } catch (error: any) {
    console.error('❌ Login error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      code: 'INTERNAL_ERROR'
    });
  }
};

/**
 * Verify phone number with SMS code
 * POST /api/v1/users/verify-phone
 */
export const verifyPhoneNumber = async (req: Request, res: Response): Promise<void> => {
  try {
    const { phoneNumber, verificationCode } = req.body;

    if (!phoneNumber || !verificationCode) {
      res.status(400).json({
        success: false,
        message: 'Phone number and verification code are required',
        code: 'MISSING_VERIFICATION_DATA'
      });
      return;
    }

    const result = await userService.verifyPhoneNumber(phoneNumber, verificationCode);

    if (!result.success) {
      res.status(400).json({
        success: false,
        message: result.error || 'Verification failed',
        code: 'VERIFICATION_FAILED'
      });
      return;
    }

    console.log(`📱 Phone verified: ${phoneNumber}`);

    res.json({
      success: true,
      message: result.message || 'Phone number verified successfully'
    });

  } catch (error: any) {
    console.error('❌ Phone verification error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      code: 'INTERNAL_ERROR'
    });
  }
};

/**
 * Resend verification code to phone number
 * POST /api/v1/users/resend-verification
 */
export const resendVerificationCode = async (req: Request, res: Response): Promise<void> => {
  try {
    const { phoneNumber } = req.body;

    if (!phoneNumber) {
      res.status(400).json({
        success: false,
        message: 'Phone number is required',
        code: 'MISSING_PHONE_NUMBER'
      });
      return;
    }

    const result = await userService.resendVerificationCode(phoneNumber);

    if (!result.success) {
      res.status(400).json({
        success: false,
        message: result.error || 'Failed to resend verification code',
        code: 'RESEND_FAILED'
      });
      return;
    }

    console.log(`📱 Verification code resent to: ${phoneNumber}`);

    res.json({
      success: true,
      message: result.message || 'Verification code sent successfully'
    });

  } catch (error: any) {
    console.error('❌ Resend verification error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      code: 'INTERNAL_ERROR'
    });
  }
};

/**
 * Get current user profile
 * GET /api/v1/users/profile
 */
export const getUserProfile = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).user?.id;

    if (!userId) {
      res.status(401).json({
        success: false,
        message: 'User not authenticated',
        code: 'NOT_AUTHENTICATED'
      });
      return;
    }

    const result = await userService.getUserById(userId);

    if (!result.success) {
      res.status(404).json({
        success: false,
        message: result.error || 'User not found',
        code: 'USER_NOT_FOUND'
      });
      return;
    }

    res.json({
      success: true,
      message: 'Profile retrieved successfully',
      data: {
        user: result.user
      }
    });

  } catch (error: any) {
    console.error('❌ Get profile error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      code: 'INTERNAL_ERROR'
    });
  }
};

/**
 * Update user profile
 * PUT /api/v1/users/profile
 */
export const updateUserProfile = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).user?.id;
    const { firstName, lastName, email } = req.body;

    if (!userId) {
      res.status(401).json({
        success: false,
        message: 'User not authenticated',
        code: 'NOT_AUTHENTICATED'
      });
      return;
    }

    const result = await userService.updateUser(userId, {
      firstName,
      lastName,
      email
    });

    if (!result.success) {
      res.status(400).json({
        success: false,
        message: result.error || 'Profile update failed',
        code: 'UPDATE_FAILED'
      });
      return;
    }

    console.log(`📝 Profile updated for user: ${userId}`);

    res.json({
      success: true,
      message: 'Profile updated successfully',
      data: {
        user: result.user
      }
    });

  } catch (error: any) {
    console.error('❌ Update profile error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      code: 'INTERNAL_ERROR'
    });
  }
};

/**
 * Change user password
 * PUT /api/v1/users/change-password
 */
export const changePassword = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).user?.id;
    const { currentPassword, newPassword } = req.body;

    if (!userId) {
      res.status(401).json({
        success: false,
        message: 'User not authenticated',
        code: 'NOT_AUTHENTICATED'
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

    const result = await userService.changePassword(userId, currentPassword, newPassword);

    if (!result.success) {
      res.status(400).json({
        success: false,
        message: result.error || 'Password change failed',
        code: 'PASSWORD_CHANGE_FAILED'
      });
      return;
    }

    console.log(`🔒 Password changed for user: ${userId}`);

    res.json({
      success: true,
      message: 'Password changed successfully'
    });

  } catch (error: any) {
    console.error('❌ Change password error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      code: 'INTERNAL_ERROR'
    });
  }
};

/**
 * Verify JWT token
 * POST /api/v1/users/verify-token
 */
export const verifyToken = async (req: Request, res: Response): Promise<void> => {
  try {
    const { token } = req.body;

    if (!token) {
      res.status(400).json({
        success: false,
        message: 'Token is required',
        code: 'TOKEN_REQUIRED'
      });
      return;
    }

    const result = await userService.verifyToken(token);

    if (!result.success) {
      res.status(401).json({
        success: false,
        message: result.error || 'Token verification failed',
        code: 'INVALID_TOKEN'
      });
      return;
    }

    res.json({
      success: true,
      message: 'Token is valid',
      data: {
        user: result.user
      }
    });

  } catch (error: any) {
    console.error('❌ Verify token error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      code: 'INTERNAL_ERROR'
    });
  }
};

/**
 * Health check for user service
 * GET /api/v1/users/health
 */
export const healthCheck = async (_req: Request, res: Response): Promise<void> => {
  try {
    res.json({
      success: true,
      message: 'User service is healthy',
      timestamp: new Date().toISOString(),
      service: 'user-service',
      version: '1.0.0'
    });
  } catch (error: any) {
    res.status(503).json({
      success: false,
      message: 'User service is unhealthy',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
};
