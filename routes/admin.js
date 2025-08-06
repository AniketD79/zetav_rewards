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

router.get('/users', verifyToken, requireRole('admin'), async (req, res) => {
  try {
    const [users] = await pool.query(
      `SELECT id, name, email, role, manager_id, approved, profile_picture, contact_info, created_at, department_id, date_of_joining, employee_id 
       FROM users`
    );
    res.json(users);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.get('/users/pending', verifyToken, requireRole('admin'), async (req, res) => {
  try {
    const [users] = await pool.query(
      `SELECT id, name, email, role, manager_id, approved, profile_picture, contact_info, created_at, department_id, date_of_joining, employee_id 
       FROM users WHERE approved = 0`
    );
    res.json(users);
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
  const admin_id = req.user.id;
  const { manager_id, points } = req.body;

  if (!manager_id || !points || points <= 0) {
    return res.status(400).json({ message: 'manager_id and positive points are required.' });
  }

  try {
    // Check admin budget
    const [budgetRows] = await pool.query(
      'SELECT remaining_points FROM admin_budget WHERE admin_id = ?',
      [admin_id]
    );

    if (budgetRows.length === 0) {
      return res.status(400).json({ message: 'Admin budget not set. Please add budget first.' });
    }

    const remaining_points = budgetRows[0].remaining_points;

    // Check if manager already has points assigned
    const [existingPoints] = await pool.query(
      'SELECT id FROM manager_points WHERE manager_id = ?',
      [manager_id]
    );

    if (existingPoints.length > 0) {
      return res.status(400).json({ message: 'Points already assigned to this manager. Please update instead.' });
    }

    if (points > remaining_points) {
      return res.status(400).json({ message: `Insufficient points in budget. Remaining points: ${remaining_points}` });
    }

    // Insert new points assignment
    await pool.query(
      'INSERT INTO manager_points (manager_id, points_assigned, remaining_points) VALUES (?, ?, ?)',
      [manager_id, points, points]
    );

    // Deduct from admin budget
    await pool.query(
      'UPDATE admin_budget SET remaining_points = remaining_points - ? WHERE admin_id = ?',
      [points, admin_id]
    );

    await logAudit(admin_id, 'admin', 'Points Assigned', `Assigned ${points} points to manager ${manager_id}`);

    return res.json({ message: 'Points assigned to manager successfully.' });

  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
});

router.put('/assign-points', verifyToken, requireRole('admin'), async (req, res) => {
  const admin_id = req.user.id;
  const { manager_id, points } = req.body;

  if (!manager_id || !points || points <= 0) {
    return res.status(400).json({ message: 'manager_id and positive points are required.' });
  }

  try {
    // Fetch admin budget
    const [budgetRows] = await pool.query(
      'SELECT remaining_points FROM admin_budget WHERE admin_id = ?',
      [admin_id]
    );
    if (budgetRows.length === 0) {
      return res.status(400).json({ message: 'Admin budget not set. Please add budget first.' });
    }
    const remaining_points = Number(budgetRows[0].remaining_points);
    if (points > remaining_points) {
      return res.status(400).json({ message: `Insufficient admin budget. Remaining points: ${remaining_points}` });
    }

    // Fetch current manager points
    const [existingManagerPoints] = await pool.query(
      'SELECT id, points_assigned, remaining_points FROM manager_points WHERE manager_id = ?',
      [manager_id]
    );
    if (existingManagerPoints.length === 0) {
      return res.status(404).json({ message: 'Manager has no assigned points yet. Use POST to assign first.' });
    }
    const record = existingManagerPoints[0];

    // Explicitly convert DB values to numbers before addition
    const currentPointsAssigned = Number(record.points_assigned) || 0;
    const currentPointsRemaining = Number(record.remaining_points) || 0;
    const pointsToAdd = Number(points);

    const updatedPointsAssigned = currentPointsAssigned + pointsToAdd;
    const updatedPointsRemaining = currentPointsRemaining + pointsToAdd;

    // Update manager points with numeric sums
    await pool.query(
      'UPDATE manager_points SET points_assigned = ?, remaining_points = ? WHERE id = ?',
      [updatedPointsAssigned, updatedPointsRemaining, record.id]
    );

    // Deduct these points from admin budget (remaining_points decrease)
    await pool.query(
      'UPDATE admin_budget SET remaining_points = remaining_points - ? WHERE admin_id = ?',
      [pointsToAdd, admin_id]
    );

    await logAudit(
      admin_id,
      'admin',
      'Points Incremented',
      `Added ${pointsToAdd} points to manager ${manager_id}. New assigned: ${updatedPointsAssigned}`
    );

    return res.json({ message: `Added ${pointsToAdd} points to manager successfully.` });
  } catch (err) {
    console.error('Error updating points:', err);
    return res.status(500).json({ message: err.message });
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


// Add or Update Admin Budget (top-up points, edit point_value)
router.post('/budget', verifyToken, requireRole('admin'), async (req, res) => {
  const admin_id = req.user.id;
  const { total_points, point_value } = req.body;

  if (total_points == null || point_value == null) {
    return res.status(400).json({ message: 'total_points and point_value are required.' });
  }

  try {
    const [existing] = await pool.query('SELECT * FROM admin_budget WHERE admin_id = ?', [admin_id]);

    if (existing.length === 0) {
      // Insert new budget record
      await pool.query(
        'INSERT INTO admin_budget (admin_id, total_points, remaining_points, point_value) VALUES (?, ?, ?, ?)',
        [admin_id, total_points, total_points, point_value]
      );
    } else {
      // Update: add total_points to both total and remaining (top-up)
      await pool.query(
        `UPDATE admin_budget 
         SET total_points = total_points + ?, 
             remaining_points = remaining_points + ?, 
             point_value = ? 
         WHERE admin_id = ?`,
        [total_points, total_points, point_value, admin_id]
      );
    }

    await logAudit(admin_id, 'admin', 'Admin Budget Updated', `Added ${total_points} points at value ${point_value}`);

    return res.json({ message: 'Admin budget updated successfully.' });

  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
});

router.get('/budget', verifyToken, requireRole('admin'), async (req, res) => {
  const admin_id = req.user.id;

  try {
    const [rows] = await pool.query('SELECT total_points, remaining_points, point_value FROM admin_budget WHERE admin_id = ?', [admin_id]);

    if (rows.length === 0) {
      return res.status(404).json({ message: 'Admin budget not found.' });
    }

    return res.json(rows[0]);

  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
});

// PUT /admin/budget - Update admin's budget (total points and point value)
router.put('/budget', verifyToken, requireRole('admin'), async (req, res) => {
  const adminId = req.user.id;
  const { added_points, point_value } = req.body;

  if (added_points == null && point_value == null) {
    return res.status(400).json({ message: "At least one of 'added_points' or 'point_value' is required" });
  }

  try {
    // Fetch current budget
    const [rows] = await pool.query('SELECT total_points, remaining_points FROM admin_budget WHERE admin_id = ?', [adminId]);
    if (rows.length === 0) {
      return res.status(404).json({ message: "Admin budget not found. Please create one first." });
    }

    const current = rows[0];

    // Compute new values
    const newTotalPoints = added_points != null ? current.total_points + Number(added_points) : current.total_points;
    const newRemainingPoints = added_points != null ? current.remaining_points + Number(added_points) : current.remaining_points;

    // Update query parts
    const updates = [];
    const params = [];

    updates.push('total_points = ?');
    params.push(newTotalPoints);

    updates.push('remaining_points = ?');
    params.push(newRemainingPoints);

    if (point_value != null) {
      updates.push('point_value = ?');
      params.push(Number(point_value));
    }

    params.push(adminId);

    // Update budget
    await pool.query(`UPDATE admin_budget SET ${updates.join(', ')} WHERE admin_id = ?`, params);

    await logAudit(adminId, 'admin', 'Budget Updated', `Budget updated: added_points=${added_points || 0}, point_value=${point_value || 'unchanged'}`);

    res.json({ message: "Admin budget updated successfully." });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});


module.exports = router;
