import { login, register, getMe, searchUsers, updatePublicKey } from '../controllers/auth.contoller.js';
import { authMiddleware } from '../middleware/auth.middleware.js';
import express from 'express';

const router = express.Router();

router.post('/register', register);
router.post('/login', login);
router.get('/me', authMiddleware, getMe);
router.get('/search', authMiddleware, searchUsers);
router.put('/public-key', authMiddleware, updatePublicKey);

export default router;