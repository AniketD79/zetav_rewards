const express = require('express');
const pool = require('../config/db');
const { verifyToken, requireRole } = require('../middleware/auth');
const logAudit = require('../utils/logger');

const router = express.Router();

//Get All Users (filter by role)
router.get('/users', verifyToken, requireRole('admin'), async (req, res) => {
  const { role } = req.query;
  try {
    const query = role
      ? 'SELECT * FROM users WHERE role = ?'
      : 'SELECT * FROM users';
    const [users] = await pool.query(query, role ? [role] : []);
    res.json(users);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

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
  const { role, manager_id } = req.body;

  try {
    const query = 'UPDATE users SET role = ?, manager_id = ? WHERE id = ?';
    await pool.query(query, [role, manager_id || null, id]);

    await logAudit(
      req.user.id,
      'admin',
      'User Role Updated',
      `User ${id} set as ${role}${manager_id ? ` under manager ${manager_id}` : ''}`
    );

    res.json({ message: 'User role and manager assignment updated.' });

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

//Get Pending Redemptions
router.get('/redemptions/pending', verifyToken, requireRole('admin'), async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT r.*, u.name as user_name FROM redemptions r 
       JOIN users u ON r.user_id = u.id 
       WHERE r.status = 'pending'`
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

//Approve Redemption
router.put('/redemptions/:id/approve', verifyToken, requireRole('admin'), async (req, res) => {
  const { id } = req.params;
  try {
    await pool.query('UPDATE redemptions SET status = "approved" WHERE id = ?', [id]);
    await logAudit(req.user.id, 'admin', 'Redemption Approved', `Redemption ID ${id}`);
    res.json({ message: 'Redemption approved.' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

//Decline Redemption
router.put('/redemptions/:id/decline', verifyToken, requireRole('admin'), async (req, res) => {
  const { id } = req.params;
  const { reason } = req.body;
  try {
    await pool.query('UPDATE redemptions SET status = "declined", decline_reason = ? WHERE id = ?', [reason, id]);
    await logAudit(req.user.id, 'admin', 'Redemption Declined', `Redemption ID ${id}: ${reason}`);
    res.json({ message: 'Redemption declined.' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

//Send Notification (to role, all or user)
router.post('/notifications', verifyToken, requireRole('admin'), async (req, res) => {
  const { message, role, user_id } = req.body;

  try {
    // If sending to all users of a specific role
    if (role) {
      const [users] = await pool.query('SELECT id FROM users WHERE role = ?', [role]);
      const values = users.map(u => [req.user.id, u.id, message, 'announcement']);
      await pool.query(
        'INSERT INTO notifications (sender_id, recipient_id, message, type) VALUES ?',
        [values]
      );
    }

    // If sending to a specific user
    if (user_id) {
      await pool.query(
        'INSERT INTO notifications (sender_id, recipient_id, message, type) VALUES (?, ?, ?, ?)',
        [req.user.id, user_id, message, 'direct']
      );
    }

    // If sending to all users
    if (!role && !user_id) {
      const [users] = await pool.query('SELECT id FROM users');
      const values = users.map(u => [req.user.id, u.id, message, 'announcement']);
      await pool.query(
        'INSERT INTO notifications (sender_id, recipient_id, message, type) VALUES ?',
        [values]
      );
    }

    await logAudit(req.user.id, 'admin', 'Send Notification', message);
    res.json({ message: 'Notification sent.' });
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
});

module.exports = router;
