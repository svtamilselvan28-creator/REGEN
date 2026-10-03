/**
 * middleware/auth.js - Authentication & Session Handling
 * Uses JWT stored in httpOnly cookies (for SSR Web UI)
 * or Authorization header (for REST API).
 */

const jwt = require('jsonwebtoken');
const { db } = require('../lib/supabase');

const JWT_SECRET = process.env.JWT_SECRET || 'recraft-production-jwt-token-campus-2026';
const TOKEN_COOKIE_NAME = 'recraft_token';

function signToken(user) {
  return jwt.sign(
    {
      id: user.id,
      name: user.name,
      email: user.email,
      college: user.college
    },
    JWT_SECRET,
    { expiresIn: '7d' }
  );
}

async function loadUser(req, res, next) {
  let token = null;

  // 1. Check Cookie
  if (req.cookies && req.cookies[TOKEN_COOKIE_NAME]) {
    token = req.cookies[TOKEN_COOKIE_NAME];
  }
  // 2. Check Authorization Header
  else if (req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
    token = req.headers.authorization.split(' ')[1];
  }

  if (!token) {
    req.user = null;
    req.pending_requests_count = 0;
    return next();
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;

    // Load pending requests count for navbar badge
    try {
      req.pending_requests_count = await db.requests.getPendingCount(decoded.id);
    } catch (countErr) {
      req.pending_requests_count = 0;
    }
  } catch (err) {
    // Expired or invalid token
    res.clearCookie(TOKEN_COOKIE_NAME);
    req.user = null;
    req.pending_requests_count = 0;
  }

  next();
}

function requireAuth(req, res, next) {
  if (req.user) {
    return next();
  }

  // If API request, respond with JSON
  if (req.originalUrl.startsWith('/api/')) {
    return res.status(401).json({
      success: false,
      error: 'Unauthorized: Please log in to perform this action.'
    });
  }

  // Web request - flash message and redirect to login
  if (res.flash) {
    res.flash('Please log in first to access this page.', 'warning');
  }
  return res.redirect(`/login?next=${encodeURIComponent(req.originalUrl)}`);
}

module.exports = {
  signToken,
  loadUser,
  requireAuth,
  TOKEN_COOKIE_NAME
};
