/**
 * routes/api/auth.js - Authentication API Endpoints
 */

const express = require('express');
const bcrypt = require('bcryptjs');
const { db } = require('../../lib/supabase');
const { signToken, TOKEN_COOKIE_NAME, requireAuth } = require('../../middleware/auth');

const router = express.Router();

// POST /api/auth/signup
router.post('/signup', async (req, res) => {
  try {
    const { name, email, password, confirm_password, college, phone, bio } = req.body;

    if (!name || !email || !college || !password) {
      return res.status(400).json({ success: false, error: 'Please complete all required fields.' });
    }

    if (confirm_password && password !== confirm_password) {
      return res.status(400).json({ success: false, error: 'Passwords do not match.' });
    }

    if (password.length < 6) {
      return res.status(400).json({ success: false, error: 'Password must be at least 6 characters long.' });
    }

    // Check existing email
    const existing = await db.users.findByEmail(email);
    if (existing) {
      return res.status(409).json({ success: false, error: 'An account with that email already exists.' });
    }

    const salt = await bcrypt.genSalt(10);
    const password_hash = await bcrypt.hash(password, salt);

    const newUser = await db.users.create({
      name: name.trim(),
      email: email.trim().toLowerCase(),
      password_hash,
      college: college.trim(),
      phone: phone ? phone.trim() : null,
      bio: bio ? bio.trim() : null
    });

    const token = signToken(newUser);
    res.cookie(TOKEN_COOKIE_NAME, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000
    });

    return res.status(201).json({
      success: true,
      message: `Welcome to ReCraft, ${newUser.name}!`,
      token,
      user: {
        id: newUser.id,
        name: newUser.name,
        email: newUser.email,
        college: newUser.college
      }
    });
  } catch (err) {
    console.error('[API Signup Error]', err);
    return res.status(500).json({ success: false, error: 'Internal server error during registration.' });
  }
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ success: false, error: 'Please provide both email and password.' });
    }

    const user = await db.users.findByEmail(email);
    if (!user) {
      return res.status(401).json({ success: false, error: 'Invalid email or password.' });
    }

    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) {
      return res.status(401).json({ success: false, error: 'Invalid email or password.' });
    }

    const token = signToken(user);
    res.cookie(TOKEN_COOKIE_NAME, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000
    });

    return res.json({
      success: true,
      message: `Welcome back, ${user.name}!`,
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        college: user.college
      }
    });
  } catch (err) {
    console.error('[API Login Error]', err);
    return res.status(500).json({ success: false, error: 'Internal server error during login.' });
  }
});

// POST /api/auth/logout
router.post('/logout', (req, res) => {
  res.clearCookie(TOKEN_COOKIE_NAME, { path: '/' });
  return res.json({ success: true, message: 'Logged out successfully.' });
});

// GET /api/auth/me
router.get('/me', requireAuth, async (req, res) => {
  try {
    const user = await db.users.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found.' });
    }
    return res.json({ success: true, user });
  } catch (err) {
    return res.status(500).json({ success: false, error: 'Error fetching user profile.' });
  }
});

module.exports = router;
