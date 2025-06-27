import { Router } from 'express';
import {
  createAdmin,
  createSupervisor,
  createWorker,
  startLogin,
  verifyLogin,
  getProfile,
  testSMS,
  refreshToken,
  logout
} from '../controllers/auth';
import {
  authenticate,
  requireAdmin,
  requireSupervisor,
  requireStaff,
  validateCIN,
  validatePhoneNumber,
  rateLimitSMS
} from '../middleware/auth';

const router = Router();

// =============== ACCOUNT CREATION ===============

/**
 * Create admin account (no auth required - for initial setup)
 * POST /api/v1/auth/register/admin
 */
router.post('/register/admin',
  validateCIN,
  validatePhoneNumber,
  createAdmin
);

/**
 * Create supervisor account (ADMIN only)
 * POST /api/v1/auth/register/supervisor
 */
router.post('/register/supervisor',
  authenticate,
  requireAdmin,
  validateCIN,
  validatePhoneNumber,
  createSupervisor
);

/**
 * Create worker account (requires supervisor auth)
 * POST /api/v1/auth/register/worker
 */
router.post('/register/worker',
  authenticate,
  requireSupervisor,
  validateCIN,
  validatePhoneNumber,
  createWorker
);

// =============== LOGIN FLOW ===============

/**
 * Start login process - send SMS verification
 * POST /api/v1/auth/login/start
 */
router.post('/login/start',
  validateCIN,
  rateLimitSMS(3, 15), // 3 attempts per 15 minutes
  startLogin
);

/**
 * Complete login - verify SMS code and get token
 * POST /api/v1/auth/login/verify
 */
router.post('/login/verify',
  validateCIN,
  rateLimitSMS(5, 30), // 5 attempts per 30 minutes (more lenient for verification)
  verifyLogin
);

// =============== AUTHENTICATED ROUTES ===============

/**
 * Get user profile
 * GET /api/v1/auth/profile
 */
router.get('/profile',
  authenticate,
  requireStaff,
  getProfile
);

/**
 * Refresh token
 * POST /api/v1/auth/refresh
 */
router.post('/refresh',
  authenticate,
  requireStaff,
  refreshToken
);

/**
 * Logout
 * POST /api/v1/auth/logout
 */
router.post('/logout',
  authenticate,
  requireStaff,
  logout
);

// =============== TESTING & UTILITIES ===============

/**
 * Test SMS service (for development/testing)
 * POST /api/v1/auth/test-sms
 * Only available in development mode
 */
if (process.env.NODE_ENV === 'development' || process.env.ALLOW_SMS_TEST === 'true') {
  router.post('/test-sms',
    validatePhoneNumber,
    rateLimitSMS(2, 10), // Limited testing
    testSMS
  );
}

/**
 * Health check for auth service
 * GET /api/v1/auth/health
 */
router.get('/health', (_req, res) => {
  res.json({
    success: true,
    message: 'Auth service is healthy',
    timestamp: new Date().toISOString(),
    endpoints: {
      admin_registration: 'POST /api/v1/auth/register/admin',
      supervisor_registration: 'POST /api/v1/auth/register/supervisor (ADMIN only)',
      worker_registration: 'POST /api/v1/auth/register/worker (SUPERVISOR only)',
      login_start: 'POST /api/v1/auth/login/start',
      login_verify: 'POST /api/v1/auth/login/verify',
      profile: 'GET /api/v1/auth/profile',
      refresh: 'POST /api/v1/auth/refresh',
      logout: 'POST /api/v1/auth/logout'
    }
  });
});

export default router; 