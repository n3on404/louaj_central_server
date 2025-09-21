import { Router } from 'express';
import {
  createAdmin,
  createSupervisor,
  createWorker,
  login,
  changePassword,
  getProfile,
  refreshToken,
  logout,
  config
} from '../controllers/auth';
import {
  authenticate,
  requireAdmin,
  requireSupervisor,
  requireStaff,
  validateCIN,
  validatePhoneNumber
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
 * Login with CIN and password
 * POST /api/v1/auth/login
 */
router.post('/login',
  validateCIN,
  login
);

/**
 * Change password
 * POST /api/v1/auth/change-password
 */
router.post('/change-password',
  authenticate,
  requireStaff,
  changePassword
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


/**
 * Get config
 * POST /api/v1/auth/config
 */
router.post('/config',
  validateCIN,
  config
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