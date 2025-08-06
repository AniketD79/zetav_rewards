const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('../config/db');
const logAudit = require('../utils/logger');

const router = express.Router();

const ACCESS_TOKEN_EXPIRY = '15d'; // short-lived token
const REFRESH_TOKEN_EXPIRY = '30d'; // long-lived token

// Generate access token
function generateAccessToken(user) {
  return jwt.sign(
    { id: user.id, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: ACCESS_TOKEN_EXPIRY }
  );
}

// Generate refresh token
function generateRefreshToken(user) {
  return jwt.sign(
    { id: user.id, role: user.role },
    process.env.REFRESH_TOKEN_SECRET,
    { expiresIn: REFRESH_TOKEN_EXPIRY }
  );
}

// Utility to convert REFRESH_TOKEN_EXPIRY string to Date
function getRefreshTokenExpiryDate() {
 
  const match = process.env.REFRESH_TOKEN_EXPIRY?.match(/^(\d+)([smhd])$/) || REFRESH_TOKEN_EXPIRY.match(/^(\d+)([smhd])$/);
  if (!match) return new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // fallback 30 days

  const value = parseInt(match[1], 10);
  const unit = match[2];

  let ms = 0;
  switch (unit) {
    case 's': ms = value * 1000; break;
    case 'm': ms = value * 60 * 1000; break;
    case 'h': ms = value * 60 * 60 * 1000; break;
    case 'd': ms = value * 24 * 60 * 60 * 1000; break;
    default: ms = value * 24 * 60 * 60 * 1000;
  }
  return new Date(Date.now() + ms);
}

// User Signup
router.post('/signup', async (req, res) => {
  const { name, email, password } = req.body;
  try {
    const [existing] = await pool.query('SELECT id FROM users WHERE email = ?', [email]);
    if (existing.length > 0)
      return res.status(400).json({ message: 'Email already registered' });

    const hashedPassword = await bcrypt.hash(password, 10);
    await pool.query('INSERT INTO users (name, email, password) VALUES (?, ?, ?)', [
      name,
      email,
      hashedPassword,
    ]);

    res.status(201).json({ message: 'Signup successful. Await admin approval.' });
  } catch (err) {
    res.status(500).json({ message: 'Signup failed', error: err.message });
  }
});

// User Login
router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  try {
    const [users] = await pool.query('SELECT * FROM users WHERE email = ?', [email]);
    if (users.length === 0) return res.status(404).json({ message: 'User not found' });

    const user = users[0];

    if (!user.approved)
      return res.status(403).json({ message: 'Account not yet approved by admin' });

    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.status(401).json({ message: 'Invalid password' });

    // Generate tokens
    const accessToken = generateAccessToken(user);
    const refreshToken = generateRefreshToken(user);

    // Calculate expiry date for refresh token
    const expiresAt = getRefreshTokenExpiryDate();

    // Insert refresh token in refresh_tokens table
    await pool.query(
      `INSERT INTO refresh_tokens (user_id, token, expires_at) VALUES (?, ?, ?)`,
      [user.id, refreshToken, expiresAt]
    );

    await logAudit(user.id, user.role, 'Login', 'User logged in');

    res.json({
      accessToken,
      refreshToken,
      role: user.role,
    });
  } catch (err) {
    res.status(500).json({ message: 'Login error', error: err.message });
  }
});

// Refresh access token
router.post('/token/refresh', async (req, res) => {
  const { refreshToken } = req.body;
  if (!refreshToken) return res.status(401).json({ message: 'Refresh token required' });

  try {
    const decoded = jwt.verify(refreshToken, process.env.REFRESH_TOKEN_SECRET);

    const [tokens] = await pool.query(
      `SELECT * FROM refresh_tokens WHERE token = ? AND revoked = FALSE AND expires_at > NOW()`,
      [refreshToken]
    );

    if (tokens.length === 0) {
      return res.status(403).json({ message: 'Invalid or expired refresh token' });
    }

    // Generate new access token
    const user = { id: decoded.id, role: decoded.role };
    const accessToken = generateAccessToken(user);

    // (Optional) Generate new refresh token and update DB
    const newRefreshToken = generateRefreshToken(user);
    const expiresAt = getRefreshTokenExpiryDate();
    await pool.query('UPDATE refresh_tokens SET token = ?, expires_at = ? WHERE token = ?', [newRefreshToken, expiresAt, refreshToken]);

    res.json({
      accessToken,
      refreshToken: newRefreshToken,
      role: user.role,
    });
  } catch (err) {
    return res.status(403).json({ message: 'Invalid or expired refresh token' });
  }
});

// Logout endpoint
router.post('/logout', async (req, res) => {
  const { refreshToken } = req.body;
  if (!refreshToken) return res.status(400).json({ message: 'Refresh token required' });

  try {
    // Verify refresh token
    const decoded = jwt.verify(refreshToken, process.env.REFRESH_TOKEN_SECRET);

    // Mark refresh token as revoked in DB
    await pool.query(
      `UPDATE refresh_tokens SET revoked = TRUE WHERE token = ?`,
      [refreshToken]
    );

    await logAudit(decoded.id, null, 'Logout', 'User logged out');

    res.json({ message: 'Logged out successfully' });
  } catch (err) {
    res.status(400).json({ message: 'Invalid refresh token' });
  }
});

router.post('/fcmtoken', verifyToken, async (req, res) => {
  const { token } = req.body;
  if (!token || typeof token !== 'string') {
    return res.status(400).json({ message: 'Valid FCM token required' });
  }
  await pool.query('UPDATE users SET fcm_token = ? WHERE id = ?', [token, req.user.id]);
  res.json({ message: 'FCM token saved' });
});


module.exports = router;
