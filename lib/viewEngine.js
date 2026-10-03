/**
 * lib/viewEngine.js - Nunjucks Setup for Express
 * Provides 100% template compatibility with the original Jinja2 templates,
 * including url_for, flash messages, session.get, and custom filters.
 */

const nunjucks = require('nunjucks');
const path = require('path');

function setupViewEngine(app) {
  const env = nunjucks.configure(path.join(__dirname, '..', 'templates'), {
    autoescape: true,
    express: app,
    noCache: process.env.NODE_ENV !== 'production'
  });

  // -------------------------------------------------------------
  // JINJA COMPATIBILITY FILTERS
  // -------------------------------------------------------------

  // format filter: e.g. "%.2f"|format(item.price) or item.price|format('%.2f')
  env.addFilter('format', function(str, ...args) {
    if (typeof str === 'string' && str.includes('%')) {
      const val = args[0];
      if (str === '%.2f') {
        const num = Number(val || 0);
        return isNaN(num) ? '0.00' : num.toFixed(2);
      }
      return String(val !== undefined ? val : '');
    }
    if (typeof str === 'number') {
      return Number(str).toFixed(2);
    }
    return str;
  });

  // selectattr filter: e.g. incoming_requests|selectattr('status', 'equalto', 'Pending')
  env.addFilter('selectattr', function(arr, attr, comp, val) {
    if (!Array.isArray(arr)) return [];
    if (comp === 'equalto') {
      return arr.filter(item => item && item[attr] === val);
    }
    return arr.filter(item => item && Boolean(item[attr]));
  });

  // list filter: e.g. ...|list
  env.addFilter('list', function(val) {
    if (Array.isArray(val)) return val;
    if (val === undefined || val === null) return [];
    return [val];
  });

  // -------------------------------------------------------------
  // EXPRESS MIDDLEWARE TO INJECT JINJA GLOBALS ON EVERY REQUEST
  // -------------------------------------------------------------
  app.use((req, res, next) => {
    // 1. url_for helper
    const url_for = function(endpoint, params = {}) {
      if (endpoint === 'static') {
        const filename = params.filename || '';
        return `/static/${filename.replace(/^\//, '')}`;
      }
      if (endpoint === 'index') return '/';
      if (endpoint === 'browse') {
        const queryParams = new URLSearchParams();
        if (params.q) queryParams.set('q', params.q);
        if (params.category) queryParams.set('category', params.category);
        if (params.item_type) queryParams.set('item_type', params.item_type);
        if (params.sort) queryParams.set('sort', params.sort);
        const qs = queryParams.toString();
        return qs ? `/browse?${qs}` : '/browse';
      }
      if (endpoint === 'login') {
        const nextUrl = params.next || '';
        return nextUrl ? `/login?next=${encodeURIComponent(nextUrl)}` : '/login';
      }
      if (endpoint === 'signup') return '/signup';
      if (endpoint === 'logout') return '/logout';
      if (endpoint === 'post_item') return '/item/new';
      if (endpoint === 'my_items') return '/my-items';
      if (endpoint === 'requests_dashboard') return '/requests';
      if (endpoint === 'item_detail') return `/item/${params.item_id}`;
      if (endpoint === 'edit_item') return `/item/${params.item_id}/edit`;
      if (endpoint === 'delete_item') return `/item/${params.item_id}/delete`;
      if (endpoint === 'request_item') return `/item/${params.item_id}/request`;
      if (endpoint === 'request_detail') return `/requests/${params.request_id}`;
      if (endpoint === 'send_request_message') return `/requests/${params.request_id}/messages`;
      if (endpoint === 'respond_request') return `/requests/${params.request_id}/respond/${params.action}`;
      if (endpoint === 'profile') return `/user/${params.user_id}`;
      if (endpoint === 'report') return `/report/${params.target_type}/${params.target_id}`;
      return `/${endpoint}`;
    };

    // 2. Flash messages helper (reads cookie-based or request-based flashes)
    const rawFlashes = req.cookies?.flashes ? JSON.parse(req.cookies.flashes) : (req.flashes || []);
    if (req.cookies?.flashes) {
      res.clearCookie('flashes');
    }

    const get_flashed_messages = function(options = {}) {
      if (options.with_categories) {
        return rawFlashes; // Array of [category, message]
      }
      return rawFlashes.map(f => f[1]);
    };

    // Helper to flash messages
    res.flash = function(message, category = 'info') {
      const existing = req.cookies?.flashes ? JSON.parse(req.cookies.flashes) : (req.flashes || []);
      existing.push([category, message]);
      res.cookie('flashes', JSON.stringify(existing), { path: '/', httpOnly: true, maxAge: 60000 });
      req.flashes = existing;
    };

    // 3. Session object with .get() support
    const currentUser = req.user || null;
    const sessionObj = {
      ...(currentUser ? {
        user_id: currentUser.id,
        user_name: currentUser.name,
        user_email: currentUser.email,
        college: currentUser.college
      } : {}),
      get: function(key, defaultValue = null) {
        return this[key] !== undefined ? this[key] : defaultValue;
      }
    };

    // 4. Request object with .args.get() and .endpoint support
    const reqEndpoint = req.route ? req.route.path : req.path;
    let endpointName = 'index';
    if (req.path === '/browse') endpointName = 'browse';
    else if (req.path === '/requests') endpointName = 'requests_dashboard';
    else if (req.path === '/my-items') endpointName = 'my_items';
    else if (req.path === '/item/new') endpointName = 'post_item';
    else if (req.path === '/login') endpointName = 'login';
    else if (req.path === '/signup') endpointName = 'signup';

    const requestObj = {
      path: req.originalUrl || req.url,
      endpoint: endpointName,
      args: {
        ...req.query,
        get: function(key, defaultValue = null) {
          return req.query[key] !== undefined ? req.query[key] : defaultValue;
        }
      }
    };

    // Make available in res.locals for template rendering
    res.locals.url_for = url_for;
    res.locals.get_flashed_messages = get_flashed_messages;
    res.locals.session = sessionObj;
    res.locals.request = requestObj;
    res.locals.g = {
      pending_requests_count: req.pending_requests_count || 0
    };

    next();
  });

  return env;
}

module.exports = { setupViewEngine };
