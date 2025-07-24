const express = require('express');
const pool = require('../config/db');
const { verifyToken, requireRole } = require('../middleware/auth');

const router = express.Router();

//Employee Leaderboard: team only
router.get('/employee', verifyToken, requireRole('employee'), async (req, res) => {
  try {
    const [[{ manager_id }]] = await pool.query(
      'SELECT manager_id FROM users WHERE id = ?',
      [req.user.id]
    );

    if (!manager_id) return res.status(400).json({ message: 'No manager assigned.' });

    const [rows] = await pool.query(
      `SELECT u.id, u.name, u.profile_picture, COALESCE(SUM(rp.points),0) AS total_points 
       FROM users u 
       LEFT JOIN reward_points rp ON rp.receiver_id = u.id 
       WHERE u.manager_id = ?
       GROUP BY u.id 
       ORDER BY total_points DESC`,
      [manager_id]
    );

    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Manager Leaderboard: all their employees
router.get('/manager', verifyToken, requireRole('manager'), async (req, res) => {
  
  try {
    const [rows] = await pool.query(
      `SELECT u.id, u.name, u.profile_picture, COALESCE(SUM(rp.points),0) AS total_points 
       FROM users u 
       LEFT JOIN reward_points rp ON rp.receiver_id = u.id 
       WHERE u.manager_id = ?
       GROUP BY u.id 
       ORDER BY total_points DESC`,
      [req.user.id]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

//Admin Leaderboard: compare across all teams
router.get('/admin', verifyToken, requireRole('admin'), async (req, res) => {

  try {
    const [rows] = await pool.query(
      `SELECT 
         u.id, u.name, u.role, u.profile_picture, u.manager_id,
         m.name as manager_name,
         COALESCE(SUM(rp.points), 0) AS total_points
       FROM users u
       LEFT JOIN reward_points rp ON rp.receiver_id = u.id 
       LEFT JOIN users m ON u.manager_id = m.id
       WHERE u.role = 'employee'
       GROUP BY u.id
       ORDER BY total_points DESC`
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
