const express = require('express');
const pool = require('../config/db');
const { verifyToken, requireRole } = require('../middleware/auth');
const logAudit = require('../utils/logger');

const router = express.Router();

//Get All Users (filter by role)

//Approve User
router.put('/users/:id/approve', verifyToken, requireRole('admin'), async (req, res) => {
  const { id } = req.params;
  const { approved } = req.body; // must be true or false

  try {
    await pool.query('UPDATE users SET approved = ? WHERE id = ?', [approved ? 1 : 0, id]);

    await logAudit(req.user.id, 'admin', 'User Approval Toggled', `User ${id} -> approved: ${approved}`);
    res.json({ message: `User ${approved ? 'approved' : 'unapproved'} successfully.` });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

//Update User Role or Manager
router.put('/users/:id/update-role', verifyToken, requireRole('admin'), async (req, res) => {
  const { id } = req.params;
  const { role, manager_id, department_id, date_of_joining, employee_id } = req.body;

  try {
    const query = `
      UPDATE users SET role = ?, manager_id = ?, department_id = ?, date_of_joining = ?, employee_id = ? WHERE id = ?
    `;

    await pool.query(query, [
      role,
      manager_id || null,
      department_id || null,
      date_of_joining || null,
      employee_id || null,
      id,
    ]);

    await logAudit(
      req.user.id,
      'admin',
      'User Role Updated',
      `User ${id} set as ${role}` +
        (manager_id ? ` under manager ${manager_id}` : '') +
        (department_id ? ` assigned to department ${department_id}` : '') +
        (date_of_joining ? ` with date of joining ${date_of_joining}` : '') +
        (employee_id ? ` and employee ID ${employee_id}` : '')
    );

    res.json({ message: 'User role, manager, department, date_of_joining, and employee ID updated.' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});


//Delete a User
router.delete('/users/:id', verifyToken, requireRole('admin'), async (req, res) => {
  const { id } = req.params;
  try {
    await pool.query('DELETE FROM users WHERE id = ?', [id]);
    await logAudit(req.user.id, 'admin', 'User Deleted', `User ID ${id} deleted`);
    res.json({ message: 'User deleted successfully.' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

//Assign Points to Manager
router.post('/assign-points', verifyToken, requireRole('admin'), async (req, res) => {
  const { manager_id, points_assigned } = req.body;
  try {
    await pool.query(
      'INSERT INTO manager_points (manager_id, points_assigned, remaining_points) VALUES (?, ?, ?)',
      [manager_id, points_assigned, points_assigned]
    );
    await logAudit(req.user.id, 'admin', 'Points Assigned', `Assigned ${points_assigned} to manager ${manager_id}`);
    res.json({ message: 'Points assigned to manager.' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.get('/all/redemptions', verifyToken, requireRole('admin'), async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT 
         r.id,
         r.user_id,
         u.name AS user_name,
         r.reward_title,
         r.required_points,
         r.status,
         r.decline_reason,
         r.requested_at
       FROM redemptions r
       JOIN users u ON r.user_id = u.id
       ORDER BY r.requested_at DESC`
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.put('/redemptions/:id/status', verifyToken, requireRole('admin'), async (req, res) => {
  const { id } = req.params;
  const { status, decline_reason } = req.body;

  if (!['approved', 'declined'].includes(status)) {
    return res.status(400).json({ message: "Status must be 'approved' or 'declined'." });
  }
  
  if (status === 'declined' && (!decline_reason || decline_reason.trim() === '')) {
    return res.status(400).json({ message: 'Decline reason is required' });
  }

  try {
    await pool.query(
      'UPDATE redemptions SET status = ?, decline_reason = ? WHERE id = ?',
      [status, status === 'declined' ? decline_reason : null, id]
    );

    await logAudit(req.user.id, 'admin', `Redemption ${status}`, `Redemption ID ${id} ${status}${decline_reason ? ': '+decline_reason : ''}`);

    res.json({ message: `Redemption ${status} successfully.` });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});


//Get Audit Logs
router.get('/audit-logs', verifyToken, requireRole('admin'), async (req, res) => {
  try {
    const [logs] = await pool.query(
      `SELECT l.*, u.name, u.email FROM audit_logs l 
       JOIN users u ON u.id = l.user_id 
       ORDER BY l.created_at DESC`
    );
    res.json(logs);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
})

// Department CRUD

// Create department
router.post('/departments', verifyToken, requireRole('admin'), async (req, res) => {
  const { name } = req.body;
  try {
    const [existing] = await pool.query('SELECT * FROM departments WHERE name = ?', [name]);
    if (existing.length > 0)
      return res.status(400).json({ message: 'Department already exists' });

    await pool.query('INSERT INTO departments (name) VALUES (?)', [name]);
    res.status(201).json({ message: 'Department created' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Get all departments
router.get('/departments', verifyToken, requireRole('admin'), async (req, res) => {
  try {
    const [depts] = await pool.query('SELECT * FROM departments ORDER BY name ASC');
    res.json(depts);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Update department
router.put('/departments/:id', verifyToken, requireRole('admin'), async (req, res) => {
  const { id } = req.params;
  const { name } = req.body;
  try {
    await pool.query('UPDATE departments SET name = ? WHERE id = ?', [name, id]);
    res.json({ message: 'Department updated' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Delete department
router.delete('/departments/:id', verifyToken, requireRole('admin'), async (req, res) => {
  const { id } = req.params;
  try {
    // Consider updating users to set department_id=NULL first or use ON DELETE SET NULL FK
    await pool.query('DELETE FROM departments WHERE id = ?', [id]);
    res.json({ message: 'Department deleted' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});



module.exports = router;
