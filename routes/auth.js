const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('../config/db');
const logAudit = require('../utils/logger');

const router = express.Router();

//User Signup
router.post('/signup', async (req, res) => {
  const { name, email, password } = req.body;
  try {
    const [existing] = await pool.query('SELECT * FROM users WHERE email = ?', [email]);
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

//User Login
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

    const token = jwt.sign({ id: user.id, role: user.role }, process.env.JWT_SECRET, {
      expiresIn: '7d',
    });

    await logAudit(user.id, user.role, 'Login', 'User logged in');

    res.json({
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        approved: user.approved,
      },
    });
  } catch (err) {
    res.status(500).json({ message: 'Login error', error: err.message });
  }
});

//Forgot Password (Mock)
router.post('/forgot-password', async (req, res) => {
  const { email } = req.body;
  try {
    const [users] = await pool.query('SELECT id FROM users WHERE email = ?', [email]);

    if (users.length === 0) {
      return res.status(200).json({
        message: 'If the email exists, a reset link has been sent. (Mock response)',
      });
    }

    // In real implementation: create/reset-token, email logic
    res.json({ message: 'Reset link sent successfully (mock).' });
  } catch (err) {
    res.status(500).json({ message: 'Error sending reset link', error: err.message });
  }
});

module.exports = router;
