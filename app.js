/**
 * app.js - Main Express Application for Student ReCraft
 * Production-ready Express application connected to Supabase PostgreSQL,
 * deployable on Vercel or locally.
 */

const express = require('express');
const path = require('path');
const cookieParser = require('cookie-parser');
const cors = require('cors');
require('dotenv').config();

const { setupViewEngine } = require('./lib/viewEngine');
const { loadUser } = require('./middleware/auth');

// Route modules
const apiAuthRoutes = require('./routes/api/auth');
const apiItemsRoutes = require('./routes/api/items');
const apiRequestsRoutes = require('./routes/api/requests');
const apiUsersRoutes = require('./routes/api/users');
const apiReportsRoutes = require('./routes/api/reports');
const webRoutes = require('./routes/web/index');

const app = express();

// Enable reverse proxy support (for Vercel, Heroku, Nginx HTTPS detection)
app.set('trust proxy', 1);

// Standard Middlewares
app.use(cors({
  origin: true,
  credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Static file serving (/static)
app.use('/static', express.static(path.join(__dirname, 'static')));

// User session / JWT middleware
app.use(loadUser);

// Setup Nunjucks Template Engine
setupViewEngine(app);

// Mount REST API Routes
app.use('/api/auth', apiAuthRoutes);
app.use('/api/items', apiItemsRoutes);
app.use('/api/requests', apiRequestsRoutes);
app.use('/api/users', apiUsersRoutes);
app.use('/api/reports', apiReportsRoutes);

// Mount Web SSR Page Routes
app.use('/', webRoutes);

// 404 Handler
app.use((req, res) => {
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ success: false, error: 'Endpoint not found.' });
  }
  return res.status(404).render('404.html');
});

// Global Error Handler
app.use((err, req, res, next) => {
  console.error('[Application Error]', err.stack || err.message);

  if (req.path.startsWith('/api/')) {
    return res.status(err.status || 500).json({
      success: false,
      error: err.message || 'An internal server error occurred.'
    });
  }

  if (res.flash) {
    res.flash('An unexpected error occurred. Please try again.', 'danger');
  }
  return res.redirect('/');
});

module.exports = app;
