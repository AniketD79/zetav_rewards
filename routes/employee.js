const express = require('express');
const pool = require('../config/db');
const bcrypt = require('bcryptjs');
const { verifyToken, requireRole } = require('../middleware/auth');
const logAudit = require('../utils/logger');
const router = express.Router();

//Get current points
router.get('/points', verifyToken, requireRole('employee'), async (req, res) => {
  const uid = req.user.id;
  try {
    const [[{ earned }]] = await pool.query(
      'SELECT COALESCE(SUM(points), 0) AS earned FROM reward_points WHERE receiver_id = ?',
      [uid]
    );
    const [[{ redeemed }]] = await pool.query(
      'SELECT COALESCE(SUM(required_points), 0) AS redeemed FROM redemptions WHERE user_id = ? AND status = "approved"',
      [uid]
    );

    res.json({
      earned_points: earned || 0,
      redeemed_points: redeemed || 0,
      available_points: (earned || 0) - (redeemed || 0),
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
