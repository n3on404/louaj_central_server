import { Router } from 'express';
import { 
  registerUser, 
  loginUser, 
  getUserProfile, 
  updateUserProfile,
  changePassword,
  verifyToken,
  healthCheck,
  verifyPhoneNumber,
  resendVerificationCode
} from '../controllers/user';
import { authenticateUser, rateLimitSMS } from '../middleware/auth';

const router = Router();

/**
 * @route POST /api/v1/users/register
 * @desc Register a new user with phone number and password
 * @body { phoneNumber: string, firstName: string, lastName: string, password: string, email?: string }
 * @response { user: User, token: string }
 * @public
 */
router.post('/register', registerUser);

/**
 * @route POST /api/v1/users/login
 * @desc Login user with phone number and password
 * @body { phoneNumber: string, password: string }
 * @response { user: User, token: string }
 * @public
 */
router.post('/login', loginUser);

/**
 * @route POST /api/v1/users/verify-phone
 * @desc Verify phone number with SMS code
 * @body { phoneNumber: string, verificationCode: string }
 * @response { message: string }
 * @public
 */
router.post('/verify-phone', rateLimitSMS(5, 15), verifyPhoneNumber);

/**
 * @route POST /api/v1/users/resend-verification
 * @desc Resend verification code to phone number
 * @body { phoneNumber: string }
 * @response { message: string }
 * @public
 */
router.post('/resend-verification', rateLimitSMS(3, 15), resendVerificationCode);

/**
 * @route POST /api/v1/users/verify-token
 * @desc Verify JWT token
 * @body { token: string }
 * @response { user: User }
 * @public
 */
router.post('/verify-token', verifyToken);

/**
 * @route GET /api/v1/users/health
 * @desc User service health check
 * @response { status: string, timestamp: string }
 * @public
 */
router.get('/health', healthCheck);

/**
 * @route GET /api/v1/users/profile
 * @desc Get current user profile
 * @response { user: User }
 * @protected
 */
router.get('/profile', authenticateUser, getUserProfile);

/**
 * @route PUT /api/v1/users/profile
 * @desc Update user profile
 * @body { firstName?: string, lastName?: string, email?: string }
 * @response { user: User }
 * @protected
 */
router.put('/profile', authenticateUser, updateUserProfile);

/**
 * @route PUT /api/v1/users/change-password
 * @desc Change user password
 * @body { currentPassword: string, newPassword: string }
 * @response { message: string }
 * @protected
 */
router.put('/change-password', authenticateUser, changePassword);

export default router;
