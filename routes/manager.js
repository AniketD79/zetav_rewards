const express = require('express');
const pool = require('../config/db');
const { verifyToken, requireRole } = require('../middleware/auth');
const logAudit = require('../utils/logger');

const router = express.Router();

async function isMyEmployee(managerId, employeeId) {
  const [[user]] = await pool.query(
    'SELECT id FROM users WHERE id = ? AND manager_id = ?',
    [employeeId, managerId]
  );
  return !!user;
}

//Get All Employees Assigned to This Manager
router.get('/employees', verifyToken, requireRole('manager'), async (req, res) => {
  try {
    const [employees] = await pool.query(
      'SELECT * FROM users WHERE manager_id = ?',
      [req.user.id]
    );
    res.json(employees);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});




module.exports = router;
