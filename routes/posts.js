const express = require('express');
const pool = require('../config/db');
const { verifyToken } = require('../middleware/auth');
const logAudit = require('../utils/logger');
const multer = require('multer');
const fs = require('fs');
const path = require('path');

const router = express.Router();

// Configure multer for image upload
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadPath = 'uploads/';
    if (!fs.existsSync(uploadPath)) fs.mkdirSync(uploadPath);
    cb(null, uploadPath);
  },
  filename: function (req, file, cb) {
    const unique = Date.now() + '-' + file.originalname;
    cb(null, unique);
  },
});
const upload = multer({ storage });

// ===============================
//Create a Post (Admin / Manager only)
// ===============================
router.post('/', verifyToken, upload.single('image'), async (req, res) => {
  const { receiver_id, reason, points } = req.body;
  const user = req.user;

  if (!(user.role === 'admin' || user.role === 'manager')) {
    return res.status(403).json({ message: 'Only Admin or Manager can create posts.' });
  }

  const image_url = req.file ? `/uploads/${req.file.filename}` : null;

  try {
    await pool.query(
      'INSERT INTO posts (giver_id, receiver_id, points, reason, image_url) VALUES (?, ?, ?, ?, ?)',
      [user.id, receiver_id, points || 0, reason, image_url]
    );
    await logAudit(user.id, user.role, 'Post Created', `To: ${receiver_id}, Points: ${points}`);
    res.json({ message: 'Post created.' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});


module.exports = router;
