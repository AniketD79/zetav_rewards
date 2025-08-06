const express = require('express');
const pool = require('../config/db');
const { verifyToken, requireRole } = require('../middleware/auth');

const router = express.Router();

// Returns list of managers(for admin to select manager)
router.get('/managers', verifyToken, requireRole('admin'), async (req, res) => {
  try {
    const [managers] = await pool.query(
      `SELECT 
  u.id,
  u.name,
  u.profile_picture,
  d.name AS department_name,
  IFNULL(mp.points_assigned, 0) AS total_points
FROM users u
LEFT JOIN departments d ON u.department_id = d.id
LEFT JOIN manager_points mp ON mp.manager_id = u.id
WHERE u.role = 'manager'
ORDER BY u.name ASC;
`
    );
    res.json(managers);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Admin calls this with any manager id; manager calls with their own ID

router.get('/managers/:managerId/employees', verifyToken, requireRole('admin', 'manager'), async (req, res) => {
  const managerId = req.params.managerId;

  // If role is manager, verify that manager can only access their own employees
  if (req.user.role === 'manager' && Number(managerId) !== req.user.id) {
    return res.status(403).json({ message: 'Access denied to other manager’s employees.' });
  }

  try {
    const [employees] = await pool.query(
      `SELECT 
         u.id,
         u.name,
         u.profile_picture,
         d.name AS department_name,
         COALESCE(SUM(rp.points), 0) AS total_points
       FROM users u
       LEFT JOIN departments d ON u.department_id = d.id
       LEFT JOIN reward_points rp ON rp.receiver_id = u.id
       WHERE u.manager_id = ? AND u.role = 'employee'
       GROUP BY u.id, d.name
       ORDER BY u.name ASC`,
      [managerId]
    );
    res.json(employees);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Employee Leaderboard: employees under their manager
router.get('/employee/peers', verifyToken, requireRole('employee'), async (req, res) => {
  try {
    // Get current user's manager_id
    const [[{ manager_id }]] = await pool.query(
      'SELECT manager_id FROM users WHERE id = ?',
      [req.user.id]
    );

    if (!manager_id) {
      return res.status(400).json({ message: 'No manager assigned.' });
    }

   
    const [peers] = await pool.query(
      `SELECT 
         u.id,
         u.name,
         u.profile_picture,
         d.name AS department_name,
         COALESCE(SUM(rp.points), 0) AS total_points
       FROM users u
       LEFT JOIN departments d ON u.department_id = d.id
       LEFT JOIN reward_points rp ON rp.receiver_id = u.id
       WHERE u.manager_id = ? AND u.role = 'employee'
       GROUP BY u.id, d.name
       ORDER BY total_points DESC`,
      [manager_id]  
    );

    res.json(peers);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;
