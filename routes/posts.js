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
    const userId = req.user.id;

    const limit = parseInt(req.query.limit) || 6;   // fetch 6 posts by default
    const offset = parseInt(req.query.offset) || 0; // start at zero by default
    
 
    const [[{ totalCount }]] = await pool.query('SELECT COUNT(1) AS totalCount FROM posts');
    

    const sqlPosts = `
      SELECT 
        p.*,
        g.name AS giver_name,
        r.name AS receiver_name,
        (SELECT COUNT(1) FROM likes WHERE post_id = p.id) AS like_count,
        (SELECT COUNT(1) FROM comments WHERE post_id = p.id) AS comment_count,
        EXISTS (SELECT 1 FROM likes WHERE post_id = p.id AND user_id = ?) AS user_liked
      FROM posts p
      JOIN users g ON p.giver_id = g.id
      JOIN users r ON p.receiver_id = r.id
      ORDER BY p.created_at DESC
      LIMIT ? OFFSET ?`;
    
    const [posts] = await pool.query(sqlPosts, [userId, limit, offset]);
    

    const postIds = posts.map(post => post.id);
    let comments = {};
    if (postIds.length > 0) {
      const sqlComments = `
        SELECT 
          c.*, 
          u.name AS commenter_name,
          (SELECT COUNT(1) FROM comment_likes WHERE comment_id = c.id) AS like_count
        FROM comments c
        JOIN users u ON c.user_id = u.id
        WHERE c.post_id IN (?)
        ORDER BY c.created_at ASC`;
      
      const [commentRows] = await pool.query(sqlComments, [postIds]);
      
  
      comments = commentRows.reduce((acc, comment) => {
        acc[comment.post_id] = acc[comment.post_id] || [];
        acc[comment.post_id].push(comment);
        return acc;
      }, {});
    }

    
    const feed = posts.map(post => ({
      ...post,
      user_liked: Boolean(post.user_liked),
      comments: comments[post.id] || [],
    }));
    
   
    res.json({
      totalCount,     
      limit,         
      offset,         
      nextOffset: offset + limit < totalCount ? offset + limit : null,
      data: feed,
    });
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


//Comment on Post
router.post('/:id/comment', verifyToken, async (req, res) => {
  const { comment_text } = req.body;
  const post_id = req.params.id;
  const user_id = req.user.id;

  try {
    await pool.query(
      'INSERT INTO comments (post_id, user_id, comment_text) VALUES (?, ?, ?)',
      [post_id, user_id, comment_text]
    );
    await logAudit(user_id, req.user.role, 'Comment Added', `Post ${post_id}`);
    res.json({ message: 'Comment added' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});


//Like / Unlike Comment
router.post('/comments/:id/like', verifyToken, async (req, res) => {
  const comment_id = req.params.id;
  const user_id = req.user.id;

  try {
    const [[liked]] = await pool.query(
      'SELECT * FROM comment_likes WHERE comment_id = ? AND user_id = ?',
      [comment_id, user_id]
    );

    if (liked) {
      await pool.query('DELETE FROM comment_likes WHERE id = ?', [liked.id]);
      return res.json({ message: 'Unliked comment' });
    } else {
      await pool.query('INSERT INTO comment_likes (comment_id, user_id) VALUES (?, ?)', [
        comment_id,
        user_id,
      ]);
      return res.json({ message: 'Liked comment' });
    }
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});


//Delete Comment (admin or owner)
router.delete('/comments/:id', verifyToken, async (req, res) => {
  const comment_id = req.params.id;
  const user_id = req.user.id;
  const user_role = req.user.role;

  try {
    const [[comment]] = await pool.query('SELECT * FROM comments WHERE id = ?', [comment_id]);
    if (!comment) return res.status(404).json({ message: 'Comment not found' });

    if (comment.user_id !== user_id && user_role !== 'admin') {
      return res.status(403).json({ message: 'Not allowed to delete' });
    }

    await pool.query('DELETE FROM comments WHERE id = ?', [comment_id]);
    await logAudit(user_id, user_role, 'Comment Deleted', `Comment ID: ${comment_id}`);
    res.json({ message: 'Comment deleted' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});


//Edit Post (Manager = own only, Admin = all)
router.put('/:id', verifyToken, async (req, res) => {
  const post_id = req.params.id;
  const { reason, points, image_url } = req.body;
  const { id: user_id, role } = req.user;

  try {
    const [[post]] = await pool.query('SELECT * FROM posts WHERE id = ?', [post_id]);
    if (!post) return res.status(404).json({ message: 'Post not found' });

    // Only admin or post creator (if manager)
    if (role === 'manager' && post.giver_id !== user_id) {
      return res.status(403).json({ message: 'Not allowed to edit post' });
    }

    await pool.query(
      'UPDATE posts SET reason = ?, points = ?, image_url = ? WHERE id = ?',
      [reason || post.reason, points || post.points, image_url || post.image_url, post_id]
    );

    await logAudit(user_id, role, 'Post Edited', `Post ID: ${post_id}`);
    res.json({ message: 'Post updated' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});


//Delete Post (Admin only)
router.delete('/:id', verifyToken, async (req, res) => {
  const { role } = req.user;
  const post_id = req.params.id;

  if (role !== 'admin') return res.status(403).json({ message: 'Only admin can delete posts' });

  try {
    await pool.query('DELETE FROM posts WHERE id = ?', [post_id]);
    await logAudit(req.user.id, role, 'Post Deleted', `Post ID: ${post_id}`);
    res.json({ message: 'Post deleted' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
