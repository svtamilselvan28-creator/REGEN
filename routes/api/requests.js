/**
 * routes/api/requests.js - Rental Requests & Messaging API Endpoints
 */

const express = require('express');
const { db } = require('../../lib/supabase');
const { requireAuth } = require('../../middleware/auth');

const router = express.Router();

// GET /api/requests - User's incoming and outgoing rental requests
router.get('/', requireAuth, async (req, res) => {
  try {
    const [incoming, outgoing] = await Promise.all([
      db.requests.getIncoming(req.user.id),
      db.requests.getOutgoing(req.user.id)
    ]);
    return res.json({ success: true, incoming, outgoing });
  } catch (err) {
    console.error('[API Requests Dashboard Error]', err);
    return res.status(500).json({ success: false, error: 'Failed to retrieve requests.' });
  }
});

// GET /api/requests/:id - Single request detail and messages
router.get('/:id', requireAuth, async (req, res) => {
  try {
    const requestRecord = await db.requests.findById(req.params.id);
    if (!requestRecord) {
      return res.status(404).json({ success: false, error: 'Request not found.' });
    }

    // Security check: Only the requester or owner can access
    if (requestRecord.owner_id !== req.user.id && requestRecord.requester_id !== req.user.id) {
      return res.status(403).json({ success: false, error: 'Unauthorized to view this request.' });
    }

    const messages = await db.messages.getByRequestId(req.params.id);
    const isOwner = requestRecord.owner_id === req.user.id;

    return res.json({ success: true, request: requestRecord, messages, isOwner });
  } catch (err) {
    console.error('[API Request Detail Error]', err);
    return res.status(500).json({ success: false, error: 'Failed to retrieve request details.' });
  }
});

// POST /api/requests - Submit a new rental or borrow request
router.post('/', requireAuth, async (req, res) => {
  try {
    const { item_id, start_date, end_date, message } = req.body;

    if (!item_id || !start_date || !end_date) {
      return res.status(400).json({ success: false, error: 'Please specify item, start date, and return date.' });
    }

    if (start_date > end_date) {
      return res.status(400).json({ success: false, error: 'Start date cannot be after return date.' });
    }

    const item = await db.items.findById(item_id);
    if (!item) {
      return res.status(404).json({ success: false, error: 'Item not found.' });
    }

    // Security check: Cannot rent your own item
    if (item.owner_id === req.user.id) {
      return res.status(400).json({ success: false, error: 'You cannot request your own item!' });
    }

    if (item.is_available !== 1) {
      return res.status(400).json({ success: false, error: 'This item is currently unavailable.' });
    }

    const newRequest = await db.requests.create({
      item_id,
      requester_id: req.user.id,
      owner_id: item.owner_id,
      start_date,
      end_date,
      message: message ? message.trim() : null
    });

    return res.status(201).json({
      success: true,
      message: 'Rental request submitted successfully!',
      request: newRequest
    });
  } catch (err) {
    console.error('[API Create Request Error]', err);
    return res.status(500).json({ success: false, error: 'Failed to create rental request.' });
  }
});

// POST /api/requests/:id/respond/:action - Owner responds (accept / reject)
router.post('/:id/respond/:action', requireAuth, async (req, res) => {
  try {
    const { id, action } = req.params;

    if (!['accept', 'reject'].includes(action)) {
      return res.status(400).json({ success: false, error: 'Invalid response action.' });
    }

    const requestRecord = await db.requests.findById(id);
    if (!requestRecord) {
      return res.status(404).json({ success: false, error: 'Request not found.' });
    }

    // Security check: Only item owner can respond
    if (requestRecord.owner_id !== req.user.id) {
      return res.status(403).json({ success: false, error: 'Unauthorized: Only the item owner can respond.' });
    }

    const newStatus = action === 'accept' ? 'Accepted' : 'Rejected';
    await db.requests.updateStatus(id, newStatus, requestRecord.item_id);

    return res.json({
      success: true,
      message: action === 'accept' ? 'Request accepted!' : 'Request rejected.',
      status: newStatus
    });
  } catch (err) {
    console.error('[API Respond Request Error]', err);
    return res.status(500).json({ success: false, error: 'Failed to update request status.' });
  }
});

// POST /api/requests/:id/messages - Post message to request thread
router.post('/:id/messages', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { message } = req.body;

    if (!message || !message.trim()) {
      return res.status(400).json({ success: false, error: 'Message cannot be empty.' });
    }

    const requestRecord = await db.requests.findById(id);
    if (!requestRecord) {
      return res.status(404).json({ success: false, error: 'Request not found.' });
    }

    // Security check: User must be part of this rental transaction
    if (requestRecord.owner_id !== req.user.id && requestRecord.requester_id !== req.user.id) {
      return res.status(403).json({ success: false, error: 'Unauthorized: You are not part of this request.' });
    }

    const newMsg = await db.messages.create({
      request_id: id,
      sender_id: req.user.id,
      message: message.trim()
    });

    return res.status(201).json({
      success: true,
      message: 'Message sent.',
      data: newMsg
    });
  } catch (err) {
    console.error('[API Send Message Error]', err);
    return res.status(500).json({ success: false, error: 'Failed to send message.' });
  }
});

module.exports = router;
