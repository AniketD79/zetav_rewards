const express = require('express');
const multer = require('multer');
const path = require('path');
const pool = require('../config/db');
const { verifyToken, requireRole } = require('../middleware/auth');
const logAudit = require('../utils/logger');

const router = express.Router();

// Multer configs for reward reasons images
const reasonStorage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, path.join(__dirname, '..', 'post_images')); // ensure exists
  },
  filename: function (req, file, cb) {
    const ext = path.extname(file.originalname);
    cb(null, `reason-${Date.now()}${ext}`);
  },
});
const reasonUpload = multer({
  storage: reasonStorage,
  limits: { fileSize: 2 * 1024 * 1024 }, // 2MB
  fileFilter: function (req, file, cb) {
    const allowedTypes = /jpeg|jpg|png|gif/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    if (extname && mimetype) return cb(null, true);
    cb(new Error('Only image files are allowed (jpeg, jpg, png, gif)'));
  },
});

// Reward Reason CRUD

// POST create reward reason with file upload
router.post('/rewardreasons', verifyToken, requireRole('admin'), reasonUpload.single('img'), async (req, res) => {
  const { reason, description } = req.body;
  let imagePath = null;
  if (req.file) {
    
    imagePath = `/post_images/${req.file.filename}`;
  }

  await pool.query(
    'INSERT INTO rewardreason (reason, description, img) VALUES (?, ?, ?)',
    [reason, description || '', imagePath]
  );

  res.status(201).json({ message: 'Reward reason created successfully.' });
});


// GET all reward reasons
router.get('/rewardreasons', verifyToken, requireRole('admin','manager'), async (req, res) => {
  try {
    const [reasons] = await pool.query(
      'SELECT id, reason, description, img FROM rewardreason ORDER BY created_at DESC'
    );
    res.json({ data: reasons });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET reward reason by id
router.get('/rewardreasons/:id', verifyToken, requireRole('admin'), async (req, res) => {
  const { id } = req.params;
  try {
    const [[reason]] = await pool.query(
      'SELECT id, reason, description, img FROM rewardreason WHERE id = ?',
      [id]
    );
    if (!reason) return res.status(404).json({ message: 'Reward reason not found' });
    res.json({ data: reason });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// PUT update reward reason
router.put('/rewardreasons/:id', verifyToken, requireRole('admin'), async (req, res) => {
  const { id } = req.params;
  const { reason, description, img } = req.body;

  if (!reason && !description && !img) {
    return res.status(400).json({ message: 'At least one field required for update.' });
  }

  try {
    const fields = [];
    const params = [];
    if (reason) {
      fields.push('reason = ?');
      params.push(reason);
    }
    if (description !== undefined) {
      fields.push('description = ?');
      params.push(description);
    }
    if (img !== undefined) {
      fields.push('img = ?');
      params.push(img);
    }
    params.push(id);

    const [result] = await pool.query(
      `UPDATE rewardreason SET ${fields.join(', ')} WHERE id = ?`,
      params
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: 'Reward reason not found' });
    }

    await logAudit(req.user.id, 'admin', 'Reward Reason Updated', `Reason ID ${id} updated`);

    res.json({ message: 'Reward reason updated successfully.' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// DELETE reward reason
router.delete('/rewardreasons/:id', verifyToken, requireRole('admin'), async (req, res) => {
  const { id } = req.params;
  try {
    const [result] = await pool.query('DELETE FROM rewardreason WHERE id = ?', [id]);
    if (result.affectedRows === 0) {
      return res.status(404).json({ message: 'Reward reason not found' });
    }

    await logAudit(req.user.id, 'admin', 'Reward Reason Deleted', `Reason ID ${id} deleted`);

    res.json({ message: 'Reward reason deleted successfully.' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});


// Multer configs for reward categories images
const categoryStorage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, path.join(__dirname, '..', 'reward_category')); // ensure this folder exists
  },
  filename: function (req, file, cb) {
    const ext = path.extname(file.originalname);
    cb(null, `category-${Date.now()}${ext}`);
  },
});
const categoryUpload = multer({
  storage: categoryStorage,
  limits: { fileSize: 2 * 1024 * 1024 }, // 2 MB
  fileFilter: function (req, file, cb) {
    const allowedTypes = /jpeg|jpg|png|gif/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    if (extname && mimetype) return cb(null, true);
    cb(new Error('Only image files are allowed (jpeg, jpg, png, gif)'));
  },
});

// POST create reward category with file upload

router.post('/rewardcategories', verifyToken, requireRole('admin'), categoryUpload.single('img'), async (req, res) => {
  const { category_name, description } = req.body;
  if (!category_name) {
    return res.status(400).json({ message: 'Category name is required' });
  }

  let imagePath = null;
  if (req.file) {
   
    imagePath = `/reward_category/${req.file.filename}`;
  }

  const [result] = await pool.query(
    'INSERT INTO rewardcategory (category_name, description, img) VALUES (?, ?, ?)',
    [category_name, description || '', imagePath]
  );

  await logAudit(req.user.id, 'admin', 'Reward Category Created', `Category ID ${result.insertId}: ${category_name}`);

  res.status(201).json({ message: 'Reward category created successfully.' });
});


// GET all reward categories
router.get('/rewardcategories', verifyToken, requireRole('admin'), async (req, res) => {
  try {
    const [categories] = await pool.query(
      'SELECT id, category_name, description, img FROM rewardcategory ORDER BY created_at DESC'
    );
    res.json({ data: categories });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET reward category by id
router.get('/rewardcategories/:id', verifyToken, requireRole('admin'), async (req, res) => {
  const { id } = req.params;
  try {
    const [[category]] = await pool.query(
      'SELECT id, category_name, description, img FROM rewardcategory WHERE id = ?',
      [id]
    );

    if (!category) return res.status(404).json({ message: 'Reward category not found' });

    res.json({ data: category });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// PUT update reward category
router.put('/rewardcategories/:id', verifyToken, requireRole('admin'), async (req, res) => {
  const { id } = req.params;
  const { category_name, description, img } = req.body;

  if (!category_name && !description && !img) {
    return res.status(400).json({ message: 'At least one field required for update.' });
  }

  try {
    const fields = [];
    const params = [];

    if (category_name) {
      fields.push('category_name = ?');
      params.push(category_name);
    }
    if (description !== undefined) {
      fields.push('description = ?');
      params.push(description);
    }
    if (img !== undefined) {
      fields.push('img = ?');
      params.push(img);
    }
    params.push(id);

    const [result] = await pool.query(`UPDATE rewardcategory SET ${fields.join(', ')} WHERE id = ?`, params);

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: 'Reward category not found' });
    }

    await logAudit(req.user.id, 'admin', 'Reward Category Updated', `Category ID ${id} updated`);

    res.json({ message: 'Reward category updated successfully.' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// DELETE reward category
router.delete('/rewardcategories/:id', verifyToken, requireRole('admin'), async (req, res) => {
  const { id } = req.params;
  try {
    const [result] = await pool.query('DELETE FROM rewardcategory WHERE id = ?', [id]);
    if (result.affectedRows === 0) {
      return res.status(404).json({ message: 'Reward category not found' });
    }

    await logAudit(req.user.id, 'admin', 'Reward Category Deleted', `Category ID ${id} deleted`);

    res.json({ message: 'Reward category deleted successfully.' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET rewards catalog accessible to employee, manager, admin
router.get('/rewards/catalog', verifyToken, requireRole('employee', 'manager', 'admin'), async (req, res) => {
  try {
    const [rewards] = await pool.query(
      `SELECT 
          r.id, 
          r.title, 
          r.description, 
          r.points_required, 
          r.category_id,
          rc.category_name, 
          rc.img AS category_img
       FROM rewards r
       LEFT JOIN rewardcategory rc ON r.category_id = rc.id
       ORDER BY rc.category_name ASC, r.points_required ASC`
    );
    res.json({ data: rewards });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Admin-only: Create a new reward with category_id
router.post('/rewards', verifyToken, requireRole('admin'), async (req, res) => {
  const { title, description, points_required, category_id } = req.body;
  if (!title || !points_required) {
    return res.status(400).json({ message: 'Title and points_required are required.' });
  }
  try {
    const [result] = await pool.query(
      'INSERT INTO rewards (title, description, points_required, category_id) VALUES (?, ?, ?, ?)',
      [title, description || '', points_required, category_id || null]
    );
    await logAudit(req.user.id, 'admin', 'Reward Created', `Reward '${title}' created with ID ${result.insertId}`);
    res.status(201).json({ message: 'Reward created successfully.' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Admin-only: Update a reward by ID (allow category_id update)
router.put('/rewards/:id', verifyToken, requireRole('admin'), async (req, res) => {
  const { id } = req.params;
  const { title, description, points_required, category_id } = req.body;

  if (!title && !description && points_required === undefined && category_id === undefined) {
    return res.status(400).json({ message: 'At least one field must be provided for update.' });
  }

  try {
    const fields = [];
    const params = [];

    if (title) {
      fields.push('title = ?');
      params.push(title);
    }
    if (description !== undefined) {
      fields.push('description = ?');
      params.push(description);
    }
    if (points_required !== undefined) {
      fields.push('points_required = ?');
      params.push(points_required);
    }
    if (category_id !== undefined) {
      fields.push('category_id = ?');
      params.push(category_id);
    }
    params.push(id);

    const [result] = await pool.query(`UPDATE rewards SET ${fields.join(', ')} WHERE id = ?`, params);

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: 'Reward not found.' });
    }

    await logAudit(req.user.id, 'admin', 'Reward Updated', `Reward ID ${id} updated`);

    res.json({ message: 'Reward updated successfully.' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;

