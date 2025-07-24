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

//POST Redeem request
router.post('/redeem', verifyToken, requireRole('employee'), async (req, res) => {
  const { reward_title, required_points } = req.body;
  try {
    const [[{ earned }]] = await pool.query(
      'SELECT COALESCE(SUM(points), 0) AS earned FROM reward_points WHERE receiver_id=?',
      [req.user.id]
    );
    const [[{ redeemed }]] = await pool.query(
      'SELECT COALESCE(SUM(required_points), 0) AS redeemed FROM redemptions WHERE user_id=? AND status="approved"',
      [req.user.id]
    );

    const available = earned - redeemed;
    if (required_points > available) {
      return res.status(400).json({ message: 'Not enough points to redeem.' });
    }

    await pool.query(
      'INSERT INTO redemptions (user_id, reward_title, required_points) VALUES (?, ?, ?)',
      [req.user.id, reward_title, required_points]
    );

    await logAudit(req.user.id, 'employee', 'Redemption Requested', `${reward_title} - ${required_points} pts`);

    res.json({ message: 'Redemption request submitted.' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

//View own redemptions
router.get('/redemptions', verifyToken, requireRole('employee'), async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT * FROM redemptions WHERE user_id = ? ORDER BY requested_at DESC',
      [req.user.id]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

//Get assigned manager info
router.get('/manager', verifyToken, requireRole('employee'), async (req, res) => {
  try {
    const [[emp]] = await pool.query('SELECT manager_id FROM users WHERE id = ?', [
      req.user.id,
    ]);
    if (!emp.manager_id)
      return res.status(404).json({ message: 'No manager assigned.' });

    const [[manager]] = await pool.query('SELECT id, name, email, role FROM users WHERE id = ?', [emp.manager_id]);
    res.json(manager);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
