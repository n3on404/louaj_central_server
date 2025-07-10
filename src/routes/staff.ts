import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import {
  getAllStaff,
  getStaffById,
  createStaff,
  updateStaff,
  toggleStaffStatus,
  deleteStaff
} from '../controllers/staff';

const router = Router();

// Apply authentication to all routes
router.use(authenticate);

/**
 * Get all staff members
 * GET /api/v1/staff
 * Access: SUPERVISOR, ADMIN
 */
router.get('/', getAllStaff);

/**
 * Get staff member by ID
 * GET /api/v1/staff/:id
 * Access: SUPERVISOR, ADMIN
 */
router.get('/:id', getStaffById);

/**
 * Create new worker (staff member)
 * POST /api/v1/staff
 * Access: SUPERVISOR, ADMIN
 */
router.post('/', createStaff);

/**
 * Update staff member
 * PUT /api/v1/staff/:id
 * Access: SUPERVISOR, ADMIN
 */
router.put('/:id', updateStaff);

/**
 * Toggle staff member status (freeze/unfreeze)
 * PATCH /api/v1/staff/:id/toggle-status
 * Access: SUPERVISOR, ADMIN
 */
router.patch('/:id/toggle-status', toggleStaffStatus);

/**
 * Delete staff member
 * DELETE /api/v1/staff/:id
 * Access: SUPERVISOR, ADMIN
 */
router.delete('/:id', deleteStaff);

export default router; 