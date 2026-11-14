const router = require('express').Router();
const { createTransaction, createCartTransaction, handleNotification, getOrder } = require('../controllers/midtransController');
const { authMiddleware } = require('../middleware/auth');
const rateLimit = require('../middleware/rate-limit');
router.post('/create-transaction', authMiddleware, rateLimit(30), createTransaction);
router.post('/create-cart-transaction', authMiddleware, rateLimit(30), createCartTransaction);
router.post('/notification', handleNotification);
router.get('/orders/:orderId', authMiddleware, rateLimit(120), getOrder);
module.exports = router;
