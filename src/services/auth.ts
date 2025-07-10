import jwt from 'jsonwebtoken';
import { prisma } from '../config/database';
import { StaffRole } from '@prisma/client';
import { twilioService, TwilioService } from './twilio';

interface LoginResponse {
  success: boolean;
  message: string;
  verificationSid?: string;
  data?: any;
}

interface VerifyLoginResponse {
  success: boolean;
  message: string;
  data?: {
    token: string;
    staff: any;
    expiresAt: Date;
  };
}

interface CreateStaffResponse {
  success: boolean;
  message: string;
  data?: any;
}

interface TokenPayload {
  staffId: string;
  cin: string;
  role: StaffRole;
  stationId: string | null;
  iat?: number;
  exp?: number;
}

class AuthService {
  private jwtSecret: string;
  private sessionDuration = 30 * 24 * 60 * 60 * 1000; // 30 days in milliseconds

  constructor() {
    this.jwtSecret = process.env.JWT_SECRET || '125169cc5d865676c9b13ec2df5926cc942ff45e84eb931d6e2cef2940f8efbc';
    
    if (!process.env.JWT_SECRET) {
      console.warn('⚠️  Using default JWT secret. Set JWT_SECRET in production!');
    }
  }

  /**
   * Create a new admin account (no auth required - for initial setup)
   */
  async createAdmin(data: {
    cin: string;
    phoneNumber: string;
    firstName: string;
    lastName: string;
  }): Promise<CreateStaffResponse> {
    try {
      const { cin, phoneNumber, firstName, lastName } = data;

      // Check if CIN already exists
      const existingStaff = await prisma.staff.findUnique({
        where: { cin }
      });

      if (existingStaff) {
        return {
          success: false,
          message: 'Staff member with this CIN already exists'
        };
      }

      // Create admin (no station required)
      const admin = await prisma.staff.create({
        data: {
          cin,
          phoneNumber: TwilioService.formatTunisianPhoneNumber(phoneNumber),
          firstName,
          lastName,
          role: StaffRole.ADMIN,
          stationId: null, // Admins are not tied to a specific station
          isActive: true
        }
      });

      console.log(`✅ Admin created: ${firstName} ${lastName} (${cin})`);

      return {
        success: true,
        message: 'Admin account created successfully',
        data: {
          id: admin.id,
          cin: admin.cin,
          firstName: admin.firstName,
          lastName: admin.lastName,
          role: admin.role
        }
      };
    } catch (error: any) {
      console.error('❌ Error creating admin:', error);
      return {
        success: false,
        message: 'Failed to create admin account'
      };
    }
  }

  /**
   * Create a new supervisor account (ADMIN only)
   */
  async createSupervisor(data: {
    cin: string;
    phoneNumber: string;
    firstName: string;
    lastName: string;
    stationId: string;
  }): Promise<CreateStaffResponse> {
    try {
      const { cin, phoneNumber, firstName, lastName, stationId } = data;

      // Check if CIN already exists
      const existingStaff = await prisma.staff.findUnique({
        where: { cin }
      });

      if (existingStaff) {
        return {
          success: false,
          message: 'Staff member with this CIN already exists'
        };
      }

      // Verify station exists
      const station = await prisma.station.findUnique({
        where: { id: stationId },
        include: {
          governorate: true,
          delegation: true
        }
      });

      if (!station) {
        return {
          success: false,
          message: 'Station not found'
        };
      }

             // Create supervisor
       const supervisor = await prisma.staff.create({
         data: {
           cin,
           phoneNumber: TwilioService.formatTunisianPhoneNumber(phoneNumber),
           firstName,
           lastName,
           role: StaffRole.SUPERVISOR,
           stationId,
           isActive: true
         },
        include: {
          station: {
            include: {
              governorate: true,
              delegation: true
            }
          }
        }
      });

      console.log(`✅ Supervisor created: ${firstName} ${lastName} (${cin}) at ${station.name}`);

      return {
        success: true,
        message: 'Supervisor account created successfully',
        data: {
          id: supervisor.id,
          cin: supervisor.cin,
          firstName: supervisor.firstName,
          lastName: supervisor.lastName,
          role: supervisor.role,
          station: supervisor.station ? {
            id: supervisor.station.id,
            name: supervisor.station.name,
            governorate: supervisor.station.governorate.name,
            delegation: supervisor.station.delegation.name
          } : null
        }
      };
    } catch (error: any) {
      console.error('❌ Error creating supervisor:', error);
      return {
        success: false,
        message: 'Failed to create supervisor account'
      };
    }
  }

  /**
   * Create a new worker account (requires supervisor auth)
   */
  async createWorker(
    supervisorId: string,
    data: {
      cin: string;
      phoneNumber: string;
      firstName: string;
      lastName: string;
      stationId: string;
    }
  ): Promise<CreateStaffResponse> {
    try {
      const { cin, phoneNumber, firstName, lastName, stationId } = data;

      // Verify supervisor exists and has proper role
      const supervisor = await prisma.staff.findUnique({
        where: { id: supervisorId },
        include: { station: true }
      });

      if (!supervisor || supervisor.role !== StaffRole.SUPERVISOR || !supervisor.isActive) {
        return {
          success: false,
          message: 'Only active supervisors can create worker accounts'
        };
      }

      // Check if supervisor can create worker at this station
      if (supervisor.stationId !== stationId) {
        return {
          success: false,
          message: 'Supervisors can only create workers at their own station'
        };
      }

      // Check if CIN already exists
      const existingStaff = await prisma.staff.findUnique({
        where: { cin }
      });

      if (existingStaff) {
        return {
          success: false,
          message: 'Staff member with this CIN already exists'
        };
      }

             // Create worker
       const worker = await prisma.staff.create({
         data: {
           cin,
           phoneNumber: TwilioService.formatTunisianPhoneNumber(phoneNumber),
           firstName,
           lastName,
           role: StaffRole.WORKER,
           stationId,
           isActive: true,
           createdBy: supervisorId
         },
        include: {
          station: {
            include: {
              governorate: true,
              delegation: true
            }
          }
        }
      });

      console.log(`✅ Worker created: ${firstName} ${lastName} (${cin}) by supervisor ${supervisor.firstName} ${supervisor.lastName}`);

      return {
        success: true,
        message: 'Worker account created successfully',
        data: {
          id: worker.id,
          cin: worker.cin,
          firstName: worker.firstName,
          lastName: worker.lastName,
          role: worker.role,
          station: worker.station ? {
            id: worker.station.id,
            name: worker.station.name,
            governorate: worker.station.governorate.name,
            delegation: worker.station.delegation.name
          } : null,
          createdBy: supervisorId
        }
      };
    } catch (error: any) {
      console.error('❌ Error creating worker:', error);
      return {
        success: false,
        message: 'Failed to create worker account'
      };
    }
  }

  /**
   * Initiate login process - send SMS verification
   */
  async initiateLogin(cin: string): Promise<LoginResponse> {
    try {
      console.log(`🔐 Initiating login for CIN: ${cin}`);

      // Find staff member
      const staff = await prisma.staff.findUnique({
        where: { cin },
        include: {
          station: {
            include: {
              governorate: true,
              delegation: true
            }
          }
        }
      });

      if (!staff) {
        return {
          success: false,
          message: 'Staff member not found with this CIN'
        };
      }

      if (!staff.isActive) {
        return {
          success: false,
          message: 'Staff account is deactivated. Please contact your supervisor.'
        };
      }

      // Send SMS verification
      const verificationSid = await twilioService.sendVerificationCode(staff.phoneNumber);

      console.log(`✅ SMS verification sent to ${staff.firstName} ${staff.lastName} (${staff.phoneNumber})`);

      return {
        success: true,
        message: `SMS verification code sent to ${staff.phoneNumber}`,
        verificationSid,
        data: {
          firstName: staff.firstName,
          lastName: staff.lastName,
          station: staff.station?.name || 'No Station Assigned'
        }
      };
    } catch (error: any) {
      console.error('❌ Login initiation error:', error);
      return {
        success: false,
        message: 'Failed to send verification code. Please try again.'
      };
    }
  }

  /**
   * Complete login process - verify SMS code and create session
   */
  async verifyLogin(cin: string, verificationCode: string): Promise<VerifyLoginResponse> {
    try {
      console.log(`🔍 Verifying login for CIN: ${cin}`);

      // Find staff member again
      const staff = await prisma.staff.findUnique({
        where: { cin },
        include: {
          station: {
            include: {
              governorate: true,
              delegation: true
            }
          }
        }
      });

      if (!staff || !staff.isActive) {
        return {
          success: false,
          message: 'Staff member not found or account is deactivated'
        };
      }

      // Verify SMS code
      const verificationResult = await twilioService.verifyCode(staff.phoneNumber, verificationCode);

      if (!verificationResult.valid || verificationResult.status !== 'approved') {
        return {
          success: false,
          message: 'Invalid verification code. Please try again.'
        };
      }

      // Create JWT token
      const tokenPayload: TokenPayload = {
        staffId: staff.id,
        cin: staff.cin,
        role: staff.role,
        stationId: staff.stationId
      };

      const token = jwt.sign(tokenPayload, this.jwtSecret, { expiresIn: '30d' });
      const expiresAt = new Date(Date.now() + this.sessionDuration);

      console.log(`✅ Login successful for ${staff.firstName} ${staff.lastName} (${staff.role}) at ${staff.station?.name || 'Platform Admin'}`);

      return {
        success: true,
        message: 'Login successful',
        data: {
          token,
          expiresAt,
          staff: {
            id: staff.id,
            cin: staff.cin,
            firstName: staff.firstName,
            lastName: staff.lastName,
            role: staff.role,
            phoneNumber: staff.phoneNumber,
            station: staff.station ? {
              id: staff.station.id,
              name: staff.station.name,
              governorate: staff.station.governorate.name,
              delegation: staff.station.delegation.name,
              address: staff.station.address,
              isOnline: staff.station.isOnline
            } : null
          }
        }
      };
    } catch (error: any) {
      console.error('❌ Login verification error:', error);
      return {
        success: false,
        message: 'Failed to verify login. Please try again.'
      };
    }
  }

  /**
   * Verify JWT token and return staff info
   */
  async verifyToken(token: string): Promise<{ valid: boolean; staff?: any; error?: string }> {
    try {
      const decoded = jwt.verify(token, this.jwtSecret) as TokenPayload;
      
      // Get fresh staff data
      const staff = await prisma.staff.findUnique({
        where: { id: decoded.staffId },
        include: {
          station: {
            include: {
              governorate: true,
              delegation: true
            }
          }
        }
      });

      if (!staff || !staff.isActive) {
        return { valid: false, error: 'Staff account not found or deactivated' };
      }

      return {
        valid: true,
        staff: {
          id: staff.id,
          cin: staff.cin,
          firstName: staff.firstName,
          lastName: staff.lastName,
          role: staff.role,
          phoneNumber: staff.phoneNumber,
          station: staff.station ? {
            id: staff.station.id,
            name: staff.station.name,
            governorate: staff.station.governorate.name,
            delegation: staff.station.delegation.name,
            address: staff.station.address,
            isOnline: staff.station.isOnline
          } : null
        }
      };
    } catch (error: any) {
      return { valid: false, error: 'Invalid or expired token' };
    }
  }

  /**
   * Test SMS service
   */
     async testSMS(phoneNumber: string): Promise<{ success: boolean; message: string; sid?: string }> {
     try {
       const formattedPhone = TwilioService.formatTunisianPhoneNumber(phoneNumber);
       const sid = await twilioService.sendVerificationCode(formattedPhone);
      
      return {
        success: true,
        message: `Test SMS sent successfully to ${formattedPhone}`,
        sid
      };
    } catch (error: any) {
      return {
        success: false,
        message: `Failed to send test SMS: ${error.message}`
      };
    }
  }
}

// Export singleton instance
export const authService = new AuthService();
export { AuthService };
export type { LoginResponse, VerifyLoginResponse, CreateStaffResponse, TokenPayload }; 