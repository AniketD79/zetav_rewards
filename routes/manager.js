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



//Get Single Employee Detail
router.get('/employees/:id', verifyToken, requireRole('manager'), async (req, res) => {
  const { id } = req.params;
  try {
    const isAssigned = await isMyEmployee(req.user.id, id);
    if (!isAssigned) return res.status(403).json({ message: 'Unauthorized access' });

    const [[employee]] = await pool.query(
      'SELECT * FROM users WHERE id = ?', [id]
    );

    const [[{ total }]] = await pool.query(
      'SELECT SUM(points) AS total FROM reward_points WHERE receiver_id = ?',
      [id]
    );

    res.json({
      ...employee,
      total_points: total || 0
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});



router.post('/reward', verifyToken, requireRole('manager'), async (req, res) => {
  const { receiver_id, points, reason } = req.body;

  try {
    // Helper to check assignment
    const isAssigned = await isMyEmployee(req.user.id, receiver_id);
    if (!isAssigned) return res.status(403).json({ message: 'Not your assigned employee' });

    // Check manager's remaining points
    const [[{ remaining }]] = await pool.query(
      'SELECT SUM(remaining_points) AS remaining FROM manager_points WHERE manager_id = ?',
      [req.user.id]
    );
    if (!remaining || points > remaining) 
      return res.status(400).json({ message: 'Not enough points' });

    // Insert reward
    await pool.query(
      'INSERT INTO reward_points (giver_id, receiver_id, points, reason) VALUES (?, ?, ?, ?)',
      [req.user.id, receiver_id, points, reason]
    );

    // Deduct points from manager balance
    await pool.query(
      'UPDATE manager_points SET remaining_points = remaining_points - ? WHERE manager_id = ? LIMIT 1',
      [points, req.user.id]
    );

    // ====== Auto-create recognition post ======

    // Path to your post images folder
    const imagesDir = path.join(__dirname, '..', 'post_images');

    // Read all files from the directory synchronously
    const files = fs.readdirSync(imagesDir).filter(file =>
      /\.(jpg|jpeg|png|gif)$/i.test(file)
    );

    if (files.length === 0) {
      return res.status(500).json({ message: 'No images found in post_images folder' });
    }

    // Pick a random image
    const randomIndex = Math.floor(Math.random() * files.length);
    const randomImage = `/post_images/${files[randomIndex]}`;  // URL path you serve

    // Insert post with same data + random image
    await pool.query(
      'INSERT INTO posts (giver_id, receiver_id, points, reason, image_url) VALUES (?, ?, ?, ?, ?)',
      [req.user.id, receiver_id, points, reason, randomImage]
    );

    await logAudit(req.user.id, 'manager', 'Reward Given with Auto Post', `Rewarded ${points} pts to employee ${receiver_id}, auto post created`);

    res.json({ message: 'Rewarded successfully and post created.' });

  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});


//View Manager Points (assigned/remaining)
router.get('/points', verifyToken, requireRole('manager'), async (req, res) => {
  try {
    const [[{ assigned }]] = await pool.query(
      'SELECT SUM(points_assigned) AS assigned FROM manager_points WHERE manager_id = ?',
      [req.user.id]
    );
    const [[{ remaining }]] = await pool.query(
      'SELECT SUM(remaining_points) AS remaining FROM manager_points WHERE manager_id = ?',
      [req.user.id]
    );

    res.json({
      assigned_points: assigned || 0,
      remaining_points: remaining || 0,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});


module.exports = router;
