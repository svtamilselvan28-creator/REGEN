/**
 * routes/web/index.js - SSR Web UI Routes for ReCraft
 * Preserves the exact user interface, routes, validation, and styling.
 */

const express = require('express');
const bcrypt = require('bcryptjs');
const { db } = require('../../lib/supabase');
const { signToken, requireAuth, TOKEN_COOKIE_NAME } = require('../../middleware/auth');
const { upload } = require('../../middleware/upload');

const router = express.Router();

const CATEGORIES = [
  'Stationery & Drawing',
  'Electronics',
  'Books',
  'Lab & Medical',
  'Bicycles & Sports',
  'Dorm & Living',
  'Other'
];

// Helper for today's ISO date string (YYYY-MM-DD)
function getTodayIso() {
  return new Date().toISOString().split('T')[0];
}

// -------------------------------------------------------------
// PUBLIC BROWSING & HOME
// -------------------------------------------------------------

// GET / - Home landing page
router.get('/', async (req, res, next) => {
  try {
    const [featured_items, total_items_count] = await Promise.all([
      db.items.list({ limit: 6 }),
      db.items.countAvailable()
    ]);

    return res.render('index.html', {
      featured_items,
      total_items_count
    });
  } catch (err) {
    next(err);
  }
});

// GET /browse - Catalog browse page with filters & search
router.get('/browse', async (req, res, next) => {
  try {
    const search_query = (req.query.q || '').trim();
    const category = (req.query.category || '').trim();
    const item_type = (req.query.item_type || '').trim();
    const sort_option = (req.query.sort || 'newest').trim();

    const items = await db.items.list({
      search: search_query || undefined,
      category: category || undefined,
      item_type: item_type || undefined,
      sort: sort_option
    });

    return res.render('browse.html', {
      items,
      categories: CATEGORIES,
      current_query: search_query,
      current_category: category,
      current_type: item_type,
      current_sort: sort_option
    });
  } catch (err) {
    next(err);
  }
});

// GET /item/:id - Individual item details
router.get('/item/:id', async (req, res, next) => {
  try {
    const item = await db.items.findById(req.params.id);
    if (!item) {
      return res.status(404).render('404.html');
    }

    const owner = await db.users.findById(item.owner_id);
    return res.render('item_detail.html', {
      item,
      owner,
      today_iso: getTodayIso()
    });
  } catch (err) {
    next(err);
  }
});

// -------------------------------------------------------------
// ITEM MANAGEMENT (POST, EDIT, DELETE, MY ITEMS)
// -------------------------------------------------------------

// GET /item/new - Post item page
router.get('/item/new', requireAuth, (req, res) => {
  return res.render('post_item.html', {
    today_iso: getTodayIso()
  });
});

// POST /item/new - Publish item
router.post('/item/new', requireAuth, upload.single('image'), async (req, res, next) => {
  try {
    const title = (req.body.title || '').trim();
    const category = (req.body.category || '').trim();
    const item_type = (req.body.item_type || 'Rent').trim();
    const location = (req.body.location || '').trim();
    const available_from = (req.body.available_from || '').trim();
    const available_until = (req.body.available_until || '').trim();
    const description = (req.body.description || '').trim();

    if (!title || !category || !location || !available_from || !available_until || !description) {
      res.flash('Please fill in all required fields marked with an asterisk (*).', 'danger');
      return res.redirect('/item/new');
    }

    let price = 0.0;
    let deposit = 0.0;

    try {
      if (item_type === 'Borrow (Free)') {
        price = 0.0;
        const depRaw = (req.body.deposit || '0').trim();
        deposit = depRaw ? parseFloat(depRaw) : 0.0;
        if (deposit < 0 || isNaN(deposit)) {
          res.flash('Deposit cannot be a negative number.', 'danger');
          return res.redirect('/item/new');
        }
      } else if (item_type === 'Reuse (Giveaway)') {
        deposit = 0.0;
        const totalRaw = (req.body.total_price || req.body.price || '0').trim();
        price = totalRaw ? parseFloat(totalRaw) : 0.0;
        if (price < 0 || isNaN(price)) {
          res.flash('Total price cannot be a negative number.', 'danger');
          return res.redirect('/item/new');
        }
      } else { // 'Rent'
        const priceRaw = (req.body.price || '0').trim();
        const depRaw = (req.body.deposit || '0').trim();
        price = priceRaw ? parseFloat(priceRaw) : 0.0;
        deposit = depRaw ? parseFloat(depRaw) : 0.0;
        if (price < 0 || deposit < 0 || isNaN(price) || isNaN(deposit)) {
          res.flash('Rental price and deposit cannot be negative numbers.', 'danger');
          return res.redirect('/item/new');
        }
      }
    } catch (parseErr) {
      res.flash('Please enter a valid numeric amount.', 'danger');
      return res.redirect('/item/new');
    }

    if (available_from > available_until) {
      res.flash('The "Available From" date cannot be after the "Available Until" date.', 'danger');
      return res.redirect('/item/new');
    }

    let image_path = db.getDefaultImageForCategory(category);
    if (req.file) {
      image_path = await db.storage.uploadImage(
        req.file.buffer,
        req.file.originalname,
        req.file.mimetype,
        req.user.id
      );
    }

    const newItem = await db.items.create({
      owner_id: req.user.id,
      title,
      description,
      category,
      item_type,
      price,
      deposit,
      location,
      available_from,
      available_until,
      image_path
    });

    res.flash(`Your item "${title}" has been published successfully!`, 'success');
    return res.redirect(`/item/${newItem.id}`);
  } catch (err) {
    next(err);
  }
});

// GET /my-items - Student's listed items dashboard
router.get('/my-items', requireAuth, async (req, res, next) => {
  try {
    const user_items = await db.items.findByOwnerId(req.user.id);
    return res.render('my_items.html', { items: user_items });
  } catch (err) {
    next(err);
  }
});

// GET /item/:id/edit - Edit item form
router.get('/item/:id/edit', requireAuth, async (req, res, next) => {
  try {
    const item = await db.items.findById(req.params.id);
    if (!item) {
      return res.status(404).render('404.html');
    }

    if (item.owner_id !== req.user.id) {
      res.flash('You are not authorized to edit this item.', 'danger');
      return res.redirect('/browse');
    }

    return res.render('edit_item.html', { item });
  } catch (err) {
    next(err);
  }
});

// POST /item/:id/edit - Update item listing
router.post('/item/:id/edit', requireAuth, upload.single('image'), async (req, res, next) => {
  try {
    const item = await db.items.findById(req.params.id);
    if (!item) {
      return res.status(404).render('404.html');
    }

    if (item.owner_id !== req.user.id) {
      res.flash('You are not authorized to edit this item.', 'danger');
      return res.redirect('/browse');
    }

    const title = (req.body.title || '').trim();
    const category = (req.body.category || '').trim();
    const item_type = (req.body.item_type || 'Rent').trim();
    const location = (req.body.location || '').trim();
    const available_from = (req.body.available_from || '').trim();
    const available_until = (req.body.available_until || '').trim();
    const description = (req.body.description || '').trim();
    const is_available = req.body.is_available ? 1 : 0;

    if (!title || !category || !location || !available_from || !available_until || !description) {
      res.flash('All required fields must be filled.', 'danger');
      return res.redirect(`/item/${req.params.id}/edit`);
    }

    let price = 0.0;
    let deposit = 0.0;

    try {
      if (item_type === 'Borrow (Free)') {
        price = 0.0;
        const depRaw = (req.body.deposit || '0').trim();
        deposit = depRaw ? parseFloat(depRaw) : 0.0;
        if (deposit < 0 || isNaN(deposit)) {
          res.flash('Deposit cannot be a negative number.', 'danger');
          return res.redirect(`/item/${req.params.id}/edit`);
        }
      } else if (item_type === 'Reuse (Giveaway)') {
        deposit = 0.0;
        const totalRaw = (req.body.total_price || req.body.price || '0').trim();
        price = totalRaw ? parseFloat(totalRaw) : 0.0;
        if (price < 0 || isNaN(price)) {
          res.flash('Total price cannot be a negative number.', 'danger');
          return res.redirect(`/item/${req.params.id}/edit`);
        }
      } else { // 'Rent'
        const priceRaw = (req.body.price || '0').trim();
        const depRaw = (req.body.deposit || '0').trim();
        price = priceRaw ? parseFloat(priceRaw) : 0.0;
        deposit = depRaw ? parseFloat(depRaw) : 0.0;
        if (price < 0 || deposit < 0 || isNaN(price) || isNaN(deposit)) {
          res.flash('Rental price and deposit cannot be negative numbers.', 'danger');
          return res.redirect(`/item/${req.params.id}/edit`);
        }
      }
    } catch (parseErr) {
      res.flash('Invalid price or deposit entered.', 'danger');
      return res.redirect(`/item/${req.params.id}/edit`);
    }

    let image_path = item.image_path;
    if (req.file) {
      image_path = await db.storage.uploadImage(
        req.file.buffer,
        req.file.originalname,
        req.file.mimetype,
        req.user.id
      );
    }

    await db.items.update(req.params.id, {
      title,
      description,
      category,
      item_type,
      price,
      deposit,
      location,
      available_from,
      available_until,
      image_path,
      is_available
    });

    res.flash('Your item listing has been updated!', 'success');
    return res.redirect(`/item/${req.params.id}`);
  } catch (err) {
    next(err);
  }
});

// POST /item/:id/delete - Delete item listing
router.post('/item/:id/delete', requireAuth, async (req, res, next) => {
  try {
    const item = await db.items.findById(req.params.id);
    if (!item) {
      return res.status(404).render('404.html');
    }

    if (item.owner_id !== req.user.id) {
      res.flash('Unauthorized: You cannot delete another student’s item.', 'danger');
      return res.redirect('/browse');
    }

    await db.items.delete(req.params.id);
    res.flash(`Listing "${item.title}" has been removed.`, 'info');
    return res.redirect('/my-items');
  } catch (err) {
    next(err);
  }
});

// -------------------------------------------------------------
// RENTAL & BORROW REQUESTS
// -------------------------------------------------------------

// POST /item/:id/request - Submit a rental request
router.post('/item/:id/request', requireAuth, async (req, res, next) => {
  try {
    const item = await db.items.findById(req.params.id);
    if (!item) {
      return res.status(404).render('404.html');
    }

    if (item.owner_id === req.user.id) {
      res.flash('You cannot request your own item!', 'warning');
      return res.redirect(`/item/${req.params.id}`);
    }

    if (item.is_available !== 1) {
      res.flash('This item is currently reserved or unavailable.', 'warning');
      return res.redirect(`/item/${req.params.id}`);
    }

    const start_date = (req.body.start_date || '').trim();
    const end_date = (req.body.end_date || '').trim();
    const message = (req.body.message || '').trim();

    if (!start_date || !end_date) {
      res.flash('Please specify both start and return dates.', 'danger');
      return res.redirect(`/item/${req.params.id}`);
    }

    if (start_date > end_date) {
      res.flash('Start date cannot be after the return date.', 'danger');
      return res.redirect(`/item/${req.params.id}`);
    }

    const newReq = await db.requests.create({
      item_id: req.params.id,
      requester_id: req.user.id,
      owner_id: item.owner_id,
      start_date,
      end_date,
      message
    });

    res.flash('Your rental request has been submitted! The owner will review it.', 'success');
    return res.redirect(`/requests/${newReq.id}`);
  } catch (err) {
    next(err);
  }
});

// GET /requests - Requests dashboard
router.get('/requests', requireAuth, async (req, res, next) => {
  try {
    const [incoming_requests, outgoing_requests] = await Promise.all([
      db.requests.getIncoming(req.user.id),
      db.requests.getOutgoing(req.user.id)
    ]);

    return res.render('requests.html', {
      incoming_requests,
      outgoing_requests
    });
  } catch (err) {
    next(err);
  }
});

// POST /requests/:id/respond/:action - Owner accepts or declines
router.post('/requests/:id/respond/:action', requireAuth, async (req, res, next) => {
  try {
    const { id, action } = req.params;
    const reqRecord = await db.requests.findById(id);

    if (!reqRecord) {
      return res.status(404).render('404.html');
    }

    if (reqRecord.owner_id !== req.user.id) {
      res.flash('Unauthorized: You are not the owner of this requested item.', 'danger');
      return res.redirect('/requests');
    }

    if (action === 'accept') {
      await db.requests.updateStatus(id, 'Accepted', reqRecord.item_id);
      res.flash('Request accepted! Contact details and handover notes are now unlocked.', 'success');
    } else if (action === 'reject') {
      await db.requests.updateStatus(id, 'Rejected');
      res.flash('Request declined.', 'info');
    } else {
      return res.status(400).send('Invalid action');
    }

    return res.redirect(`/requests/${id}`);
  } catch (err) {
    next(err);
  }
});

// GET /requests/:id - Request details and messaging stream
router.get('/requests/:id', requireAuth, async (req, res, next) => {
  try {
    const reqRecord = await db.requests.findById(req.params.id);
    if (!reqRecord) {
      return res.status(404).render('404.html');
    }

    if (req.user.id !== reqRecord.requester_id && req.user.id !== reqRecord.owner_id) {
      res.flash('Unauthorized: You do not have permission to view this request.', 'danger');
      return res.redirect('/requests');
    }

    const messages = await db.messages.getByRequestId(req.params.id);
    const is_owner = (req.user.id === reqRecord.owner_id);

    return res.render('request_detail.html', {
      req: reqRecord,
      messages,
      is_owner
    });
  } catch (err) {
    next(err);
  }
});

// POST /requests/:id/messages - Post message to request thread
router.post('/requests/:id/messages', requireAuth, async (req, res, next) => {
  try {
    const message = (req.body.message || '').trim();
    if (!message) {
      res.flash('Cannot send an empty message.', 'warning');
      return res.redirect(`/requests/${req.params.id}`);
    }

    const reqRecord = await db.requests.findById(req.params.id);
    if (!reqRecord) {
      return res.status(404).render('404.html');
    }

    if (req.user.id !== reqRecord.requester_id && req.user.id !== reqRecord.owner_id) {
      return res.status(403).send('Forbidden');
    }

    await db.messages.create({
      request_id: req.params.id,
      sender_id: req.user.id,
      message
    });

    return res.redirect(`/requests/${req.params.id}`);
  } catch (err) {
    next(err);
  }
});

// -------------------------------------------------------------
// USER PROFILES & REPORTS
// -------------------------------------------------------------

// GET /user/:id - Student public profile
router.get('/user/:id', async (req, res, next) => {
  try {
    const profile_user = await db.users.findById(req.params.id);
    if (!profile_user) {
      return res.status(404).render('404.html');
    }

    const [user_items, activity_count] = await Promise.all([
      db.items.findByOwnerId(req.params.id),
      db.requests.getActivityCount(req.params.id)
    ]);

    return res.render('profile.html', {
      profile_user,
      user_items,
      activity_count
    });
  } catch (err) {
    next(err);
  }
});

// GET /report/:target_type/:target_id - Campus Trust & Safety Report
router.get('/report/:target_type/:target_id', requireAuth, async (req, res, next) => {
  try {
    const { target_type, target_id } = req.params;
    if (!['item', 'user'].includes(target_type)) {
      return res.status(400).send('Invalid target type');
    }

    let target_name = 'Listing';
    if (target_type === 'item') {
      const it = await db.items.findById(target_id);
      if (it) target_name = it.title;
    } else {
      const u = await db.users.findById(target_id);
      if (u) target_name = u.name;
    }

    return res.render('report.html', {
      target_type,
      target_id,
      target_name
    });
  } catch (err) {
    next(err);
  }
});

// POST /report/:target_type/:target_id - Submit Report
router.post('/report/:target_type/:target_id', requireAuth, async (req, res, next) => {
  try {
    const { target_type, target_id } = req.params;
    const reason = (req.body.reason || '').trim();
    const details = (req.body.details || '').trim();

    if (!reason || !details) {
      res.flash('Please provide both a reason and details for the report.', 'danger');
      return res.redirect(`/report/${target_type}/${target_id}`);
    }

    await db.reports.create({
      reporter_id: req.user.id,
      target_type,
      target_id,
      reason,
      details
    });

    res.flash('Thank you for helping keep our campus safe. Your report has been submitted to campus moderators.', 'success');
    return res.redirect('/browse');
  } catch (err) {
    next(err);
  }
});

// -------------------------------------------------------------
// AUTHENTICATION (SIGNUP, LOGIN, LOGOUT)
// -------------------------------------------------------------

// GET /signup - Registration page
router.get('/signup', (req, res) => {
  if (req.user) return res.redirect('/browse');
  return res.render('signup.html');
});

// POST /signup - Process registration
router.post('/signup', async (req, res, next) => {
  try {
    if (req.user) return res.redirect('/browse');

    const name = (req.body.name || '').trim();
    const email = (req.body.email || '').trim().toLowerCase();
    const college = (req.body.college || '').trim();
    const phone = (req.body.phone || '').trim();
    const password = req.body.password || '';
    const confirm_password = req.body.confirm_password || '';

    if (!name || !email || !college || !password) {
      res.flash('Please complete all required fields.', 'danger');
      return res.render('signup.html');
    }

    if (password !== confirm_password) {
      res.flash('Passwords do not match. Please try again.', 'danger');
      return res.render('signup.html');
    }

    if (password.length < 6) {
      res.flash('Password must be at least 6 characters long.', 'danger');
      return res.render('signup.html');
    }

    const existing = await db.users.findByEmail(email);
    if (existing) {
      res.flash('An account with that email already exists. Please log in.', 'warning');
      return res.redirect('/login');
    }

    const salt = await bcrypt.genSalt(10);
    const password_hash = await bcrypt.hash(password, salt);

    const newUser = await db.users.create({
      name,
      email,
      password_hash,
      college,
      phone
    });

    const token = signToken(newUser);
    res.cookie(TOKEN_COOKIE_NAME, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000
    });

    res.flash(`Welcome to ReCraft, ${name}! Your campus account is ready.`, 'success');
    return res.redirect('/browse');
  } catch (err) {
    next(err);
  }
});

// GET /login - Login page
router.get('/login', (req, res) => {
  if (req.user) return res.redirect('/browse');
  return res.render('login.html');
});

// POST /login - Process login
router.post('/login', async (req, res, next) => {
  try {
    if (req.user) return res.redirect('/browse');

    const email = (req.body.email || '').trim().toLowerCase();
    const password = req.body.password || '';
    const next_page = req.query.next;

    if (!email || !password) {
      res.flash('Please enter both your email and password.', 'danger');
      return res.render('login.html');
    }

    const user = await db.users.findByEmail(email);
    if (user && await bcrypt.compare(password, user.password_hash)) {
      const token = signToken(user);
      res.cookie(TOKEN_COOKIE_NAME, token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 7 * 24 * 60 * 60 * 1000
      });

      res.flash(`Welcome back, ${user.name}!`, 'success');
      if (next_page && next_page.startsWith('/')) {
        return res.redirect(next_page);
      }
      return res.redirect('/browse');
    } else {
      res.flash('Invalid email or password. Please verify and try again.', 'danger');
      return res.render('login.html');
    }
  } catch (err) {
    next(err);
  }
});

// GET /logout - Process logout
router.get('/logout', (req, res) => {
  res.clearCookie(TOKEN_COOKIE_NAME, { path: '/' });
  res.flash('You have been logged out successfully.', 'info');
  return res.redirect('/');
});

module.exports = router;
