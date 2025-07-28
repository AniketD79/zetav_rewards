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


//Create a Post (Admin / Manager only)
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


//Get Feed (All Users)

//Enhanced Feed With Like Count, Comment Count, Comments & Comment Likes
router.get('/feed', verifyToken, async (req, res) => {
  try {
    // Step 1: Get posts with like & comment count
    const [posts] = await pool.query(`
      SELECT 
        p.*, 
        g.name AS giver_name, 
        r.name AS receiver_name,
        (SELECT COUNT(*) FROM likes WHERE post_id = p.id) AS like_count,
        (SELECT COUNT(*) FROM comments WHERE post_id = p.id) AS comment_count
      FROM posts p
      JOIN users g ON p.giver_id = g.id
      JOIN users r ON p.receiver_id = r.id
      ORDER BY p.created_at DESC
    `);

    const postIds = posts.map(post => post.id);

    // Step 2: Get all comments for those posts
    let comments = [];
    if (postIds.length > 0) {
      const [commentRows] = await pool.query(`
        SELECT 
          c.*, 
          u.name AS commenter_name,
          (SELECT COUNT(*) FROM comment_likes WHERE comment_id = c.id) AS like_count
        FROM comments c
        JOIN users u ON c.user_id = u.id
        WHERE c.post_id IN (?)
        ORDER BY c.created_at ASC
      `, [postIds]);

      // Group comments by post_id
      comments = commentRows.reduce((acc, comment) => {
        if (!acc[comment.post_id]) acc[comment.post_id] = [];
        acc[comment.post_id].push(comment);
        return acc;
      }, {});
    }

    // Step 3: Attach comments to matching posts
    const finalFeed = posts.map(post => ({
      ...post,
      comments: comments[post.id] || [],
    }));

    res.json(finalFeed);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});



//Like / Unlike Post
router.post('/:id/like', verifyToken, async (req, res) => {
  const post_id = req.params.id;
  const user_id = req.user.id;

  try {
    const [[like]] = await pool.query(
      'SELECT * FROM likes WHERE post_id = ? AND user_id = ?',
      [post_id, user_id]
    );

    if (like) {
      await pool.query('DELETE FROM likes WHERE id = ?', [like.id]);
      return res.json({ message: 'Unliked' });
    } else {
      await pool.query('INSERT INTO likes (post_id, user_id) VALUES (?, ?)', [post_id, user_id]);
      return res.json({ message: 'Liked' });
    }
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});


module.exports = router;
