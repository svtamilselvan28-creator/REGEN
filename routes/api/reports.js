/**
 * routes/api/reports.js - Campus Trust & Safety Reports API Endpoint
 */

const express = require('express');
const { db } = require('../../lib/supabase');
const { requireAuth } = require('../../middleware/auth');

const router = express.Router();

// POST /api/reports - Submit a safety/trust report
router.post('/', requireAuth, async (req, res) => {
  try {
    const { target_type, target_id, reason, details } = req.body;

    if (!['item', 'user'].includes(target_type)) {
      return res.status(400).json({ success: false, error: 'Invalid target type. Must be "item" or "user".' });
    }

    if (!target_id || !reason || !details) {
      return res.status(400).json({ success: false, error: 'Please provide target, reason, and details.' });
    }

    const report = await db.reports.create({
      reporter_id: req.user.id,
      target_type,
      target_id: Number(target_id),
      reason: reason.trim(),
      details: details.trim()
    });

    return res.status(201).json({
      success: true,
      message: 'Report submitted to campus moderators.',
      report
    });
  } catch (err) {
    console.error('[API Create Report Error]', err);
    return res.status(500).json({ success: false, error: 'Failed to submit report.' });
  }
});

module.exports = router;
