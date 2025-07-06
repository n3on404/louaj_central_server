import { PrismaClient } from '@prisma/client';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import { twilioService } from './twilio';

const prisma = new PrismaClient();

interface CreateUserRequest {
  phoneNumber: string;
  firstName: string;
  lastName: string;
  password: string;
  email?: string;
}

interface AuthenticateUserRequest {
  phoneNumber: string;
  password: string;
}

interface UserResponse {
  id: string;
  phoneNumber: string;
  firstName: string;
  lastName: string;
  email?: string;
  isVerified: boolean;
  createdAt: Date;
  updatedAt: Date;
}

interface AuthResult {
  success: boolean;
  token?: string;
  user?: UserResponse;
  error?: string;
}

interface VerificationResult {
  success: boolean;
  message?: string;
  error?: string;
}

class UserService {
  private jwtSecret: string;
  private saltRounds: number = 12;

  constructor() {
    this.jwtSecret = process.env.JWT_SECRET || '125169cc5d865676c9b13ec2df5926cc942ff45e84eb931d6e2cef2940f8efbc';
    
    if (!process.env.JWT_SECRET) {
      console.warn('⚠️  Using default JWT secret. Set JWT_SECRET in production!');
    }
  }

  /**
   * Register a new user with phone number and password
   */
  async registerUser(userData: CreateUserRequest): Promise<AuthResult> {
    try {
      console.log(`👤 Registering user with phone: ${userData.phoneNumber}`);

      // Normalize phone number (remove spaces, ensure format)
      const normalizedPhone = this.normalizePhoneNumber(userData.phoneNumber);

      // Check if user already exists
      const existingUser = await prisma.user.findUnique({
        where: { phoneNumber: normalizedPhone }
      });

      if (existingUser) {
        return {
          success: false,
          error: 'User with this phone number already exists'
        };
      }      // Hash password
      const hashedPassword = await bcrypt.hash(userData.password, this.saltRounds);

      // Create new user (unverified initially)
      const newUser = await prisma.user.create({
        data: {
          phoneNumber: normalizedPhone,
          firstName: userData.firstName,
          lastName: userData.lastName,
          password: hashedPassword,
          email: userData.email || null,
          isVerified: false // User needs to verify phone number
        }
      });

      // Send verification SMS
      try {
        await twilioService.sendVerificationCode(normalizedPhone);
        console.log(`📱 Verification SMS sent to: ${normalizedPhone}`);
      } catch (smsError) {
        console.error('❌ Failed to send verification SMS:', smsError);
        // Don't fail registration if SMS fails, but log the error
      }

      // Generate JWT token
      const token = this.generateToken(newUser);

      console.log(`✅ New user registered: ${newUser.firstName} ${newUser.lastName} (${newUser.id})`);

      return {
        success: true,
        token,
        user: this.formatUserResponse(newUser)
      };

    } catch (error) {
      console.error('❌ Error registering user:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Authenticate user with phone number and password
   */
  async authenticateUser(authData: AuthenticateUserRequest): Promise<AuthResult> {
    try {
      console.log(`🔐 Authenticating user with phone: ${authData.phoneNumber}`);

      // Normalize phone number
      const normalizedPhone = this.normalizePhoneNumber(authData.phoneNumber);

      // Find user by phone number
      const user = await prisma.user.findUnique({
        where: { phoneNumber: normalizedPhone }
      });

      if (!user) {
        return {
          success: false,
          error: 'Invalid phone number or password'
        };
      }

      // Verify password
      const isValidPassword = await bcrypt.compare(authData.password, user.password);

      if (!isValidPassword) {
        return {
          success: false,
          error: 'Invalid phone number or password'
        };
      }

      // Generate JWT token
      const token = this.generateToken(user);

      console.log(`✅ User authenticated successfully: ${user.firstName} ${user.lastName}`);

      return {
        success: true,
        token,
        user: this.formatUserResponse(user)
      };

    } catch (error) {
      console.error('❌ Error authenticating user:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Verify JWT token and get user information
   */
  async verifyToken(token: string): Promise<{
    success: boolean;
    user?: UserResponse;
    error?: string;
  }> {
    try {
      // Verify and decode token
      const decoded = jwt.verify(token, this.jwtSecret) as any;
      
      if (!decoded.userId) {
        return {
          success: false,
          error: 'Invalid token payload'
        };
      }

      // Get fresh user data from database
      const user = await prisma.user.findUnique({
        where: { id: decoded.userId }
      });

      if (!user) {
        return {
          success: false,
          error: 'User not found'
        };
      }

      return {
        success: true,
        user: this.formatUserResponse(user)
      };

    } catch (error) {
      console.error('❌ Token verification error:', error);
      
      if (error instanceof jwt.JsonWebTokenError) {
        return {
          success: false,
          error: 'Invalid token'
        };
      }
      
      if (error instanceof jwt.TokenExpiredError) {
        return {
          success: false,
          error: 'Token expired'
        };
      }

      return {
        success: false,
        error: 'Token verification failed'
      };
    }
  }

  /**
   * Update user profile
   */
  async updateUser(userId: string, updateData: Partial<{
    firstName: string;
    lastName: string;
    email: string;
    password: string;
  }>): Promise<{
    success: boolean;
    user?: UserResponse;
    error?: string;
  }> {
    try {
      console.log(`📝 Updating user: ${userId}`);

      // Prepare update data
      const dataToUpdate: any = {};
      
      if (updateData.firstName) dataToUpdate.firstName = updateData.firstName;
      if (updateData.lastName) dataToUpdate.lastName = updateData.lastName;
      if (updateData.email) dataToUpdate.email = updateData.email;
      
      // Hash new password if provided
      if (updateData.password) {
        dataToUpdate.password = await bcrypt.hash(updateData.password, this.saltRounds);
      }

      const updatedUser = await prisma.user.update({
        where: { id: userId },
        data: dataToUpdate
      });

      console.log(`✅ User updated successfully: ${updatedUser.firstName} ${updatedUser.lastName}`);

      return {
        success: true,
        user: this.formatUserResponse(updatedUser)
      };

    } catch (error) {
      console.error('❌ Error updating user:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Get user by ID
   */
  async getUserById(userId: string): Promise<{
    success: boolean;
    user?: UserResponse;
    error?: string;
  }> {
    try {
      const user = await prisma.user.findUnique({
        where: { id: userId }
      });

      if (!user) {
        return {
          success: false,
          error: 'User not found'
        };
      }

      return {
        success: true,
        user: this.formatUserResponse(user)
      };

    } catch (error) {
      console.error('❌ Error getting user:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Change user password
   */
  async changePassword(userId: string, currentPassword: string, newPassword: string): Promise<{
    success: boolean;
    error?: string;
  }> {
    try {
      console.log(`🔒 Changing password for user: ${userId}`);

      // Get user with current password
      const user = await prisma.user.findUnique({
        where: { id: userId }
      });

      if (!user) {
        return {
          success: false,
          error: 'User not found'
        };
      }

      // Verify current password
      const isValidPassword = await bcrypt.compare(currentPassword, user.password);

      if (!isValidPassword) {
        return {
          success: false,
          error: 'Current password is incorrect'
        };
      }

      // Hash new password
      const hashedNewPassword = await bcrypt.hash(newPassword, this.saltRounds);

      // Update password
      await prisma.user.update({
        where: { id: userId },
        data: { password: hashedNewPassword }
      });      console.log(`✅ Password changed successfully for user: ${userId}`);

      return {
        success: true
      };

    } catch (error) {
      console.error('❌ Error changing password:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Verify phone number with SMS code
   */
  async verifyPhoneNumber(phoneNumber: string, verificationCode: string): Promise<VerificationResult> {
    try {
      console.log(`📱 Verifying phone number: ${phoneNumber} with code: ${verificationCode}`);

      const normalizedPhone = this.normalizePhoneNumber(phoneNumber);

      // Verify code with Twilio
      const twilioResult = await twilioService.verifyCode(normalizedPhone, verificationCode);

      if (!twilioResult.valid) {
        return {
          success: false,
          error: 'Invalid verification code'
        };
      }

      // Update user verification status
      await prisma.user.updateMany({
        where: { 
          phoneNumber: normalizedPhone,
          isVerified: false
        },
        data: { isVerified: true }
      });

      console.log(`✅ Phone number verified successfully: ${normalizedPhone}`);

      return {
        success: true,
        message: 'Phone number verified successfully'
      };

    } catch (error) {
      console.error('❌ Error verifying phone number:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Verification failed'
      };
    }
  }

  /**
   * Resend verification code to phone number
   */
  async resendVerificationCode(phoneNumber: string): Promise<VerificationResult> {
    try {
      console.log(`📱 Resending verification code to: ${phoneNumber}`);

      const normalizedPhone = this.normalizePhoneNumber(phoneNumber);

      // Check if user exists and is not verified
      const user = await prisma.user.findUnique({
        where: { phoneNumber: normalizedPhone }
      });

      if (!user) {
        return {
          success: false,
          error: 'User not found'
        };
      }

      if (user.isVerified) {
        return {
          success: false,
          error: 'Phone number is already verified'
        };
      }

      // Send new verification code
      await twilioService.sendVerificationCode(normalizedPhone);

      console.log(`✅ Verification code resent to: ${normalizedPhone}`);

      return {
        success: true,
        message: 'Verification code sent successfully'
      };

    } catch (error) {
      console.error('❌ Error resending verification code:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to send verification code'
      };
    }
  }

  /**
   * Generate JWT token for user
   */
  private generateToken(user: any): string {
    const payload = {
      userId: user.id,
      phoneNumber: user.phoneNumber,
      firstName: user.firstName,
      lastName: user.lastName
    };

    return jwt.sign(payload, this.jwtSecret, { 
      expiresIn: '30d' // 30 days expiration
    });
  }

  /**
   * Normalize phone number to standard format
   */
  private normalizePhoneNumber(phoneNumber: string): string {
    // Remove all non-digit characters
    let normalized = phoneNumber.replace(/\D/g, '');
    
    // Handle Tunisian phone numbers
    if (normalized.startsWith('216')) {
      // Already has country code
      return `+${normalized}`;
    } else if (normalized.startsWith('0')) {
      // Remove leading 0 and add country code
      return `+216${normalized.substring(1)}`;
    } else if (normalized.length === 8) {
      // Local number, add country code
      return `+216${normalized}`;
    }
    
    // If it doesn't match expected patterns, return as is with +
    return `+${normalized}`;
  }

  /**
   * Format user response (remove sensitive data)
   */
  private formatUserResponse(user: any): UserResponse {
    return {
      id: user.id,
      phoneNumber: user.phoneNumber,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      isVerified: user.isVerified,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt
    };
  }
}

// Export singleton instance
export const userService = new UserService();
export { UserService };
export type { 
  CreateUserRequest, 
  AuthenticateUserRequest, 
  UserResponse, 
  AuthResult,
  VerificationResult
};
