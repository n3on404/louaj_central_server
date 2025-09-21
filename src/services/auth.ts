import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import { prisma } from '../config/database';
import { StaffRole } from '@prisma/client';

interface LoginResponse {
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
  private saltRounds: number = 12;
  private sessionDuration = 30 * 24 * 60 * 60 * 1000; // 30 days in milliseconds

  constructor() {
    this.jwtSecret = process.env.JWT_SECRET || '125169cc5d865676c9b13ec2df5926cc942ff45e84eb931d6e2cef2940f8efbc';
    
    if (!process.env.JWT_SECRET) {
      console.warn('⚠️  Using default JWT secret. Set JWT_SECRET in production!');
    }
  }

  /**
   * Hash CIN to use as default password
   */
  private async hashCinPassword(cin: string): Promise<string> {
    return await bcrypt.hash(cin, this.saltRounds);
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
      const hashedPassword = await this.hashCinPassword(cin);
      const admin = await prisma.staff.create({
        data: {
          cin,
          phoneNumber: phoneNumber,
          firstName,
          lastName,
          password: hashedPassword, // CIN as default password
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
       const hashedPassword = await this.hashCinPassword(cin);
       const supervisor = await prisma.staff.create({
         data: {
           cin,
           phoneNumber: phoneNumber,
           firstName,
           lastName,
           password: hashedPassword, // CIN as default password
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
       const hashedPassword = await this.hashCinPassword(cin);
       const worker = await prisma.staff.create({
         data: {
           cin,
           phoneNumber: phoneNumber,
           firstName,
           lastName,
           password: hashedPassword, // CIN as default password
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
   * Login with CIN and password
   */
  async login(cin: string, password: string): Promise<LoginResponse> {
    try {
      console.log(`🔐 Attempting login for CIN: ${cin}`);

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
          message: 'Invalid CIN or password'
        };
      }

      if (!staff.isActive) {
        return {
          success: false,
          message: 'Staff account is deactivated. Please contact your supervisor.'
        };
      }

      // Verify password
      const isValidPassword = await bcrypt.compare(password, staff.password);

      if (!isValidPassword) {
        return {
          success: false,
          message: 'Invalid CIN or password'
        };
      }

      // Update last login time
      await prisma.staff.update({
        where: { id: staff.id },
        data: { updatedAt: new Date() }
      });

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
      console.error('❌ Login error:', error);
      return {
        success: false,
        message: 'Login failed. Please try again.'
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
   * Change staff password
   */
  async changePassword(staffId: string, currentPassword: string, newPassword: string): Promise<{ success: boolean; message: string }> {
    try {
      console.log(`🔒 Changing password for staff: ${staffId}`);

      // Get staff with current password
      const staff = await prisma.staff.findUnique({
        where: { id: staffId }
      });

      if (!staff) {
        return {
          success: false,
          message: 'Staff member not found'
        };
      }

      // Verify current password
      const isValidPassword = await bcrypt.compare(currentPassword, staff.password);

      if (!isValidPassword) {
        return {
          success: false,
          message: 'Current password is incorrect'
        };
      }

      // Hash new password
      const hashedNewPassword = await bcrypt.hash(newPassword, this.saltRounds);

      // Update password
      await prisma.staff.update({
        where: { id: staffId },
        data: { password: hashedNewPassword }
      });

      console.log(`✅ Password changed successfully for staff: ${staffId}`);

      return {
        success: true,
        message: 'Password changed successfully'
      };

    } catch (error: any) {
      console.error('❌ Error changing password:', error);
      return {
        success: false,
        message: 'Failed to change password'
      };
    }
  }

  async config(cin: string): Promise<{ success: boolean; message: string; data?: any }> {
    try {
      const staff = await prisma.staff.findUnique({
        where: { cin },
        include: {
          station: true
        }
      });

      if (!staff) {
        return {
          success: false,
          message: 'Staff member not found with this CIN'
        };
      }

      return {
        success: true,
        message: 'Config retrieved successfully',
        data: {
          stationId: staff.stationId,
          stationName: staff.station?.name,
          governorate: staff.station?.governorateId,
          delegation: staff.station?.delegationId
        }
      };

    } catch (error: any) {
      console.error('❌ Config retrieval error:', error);
      return {
        success: false,
        message: 'Failed to retrieve config'
      };
    }
  }
}

// Export singleton instance
export const authService = new AuthService();
export { AuthService };
export type { LoginResponse, CreateStaffResponse, TokenPayload }; 