/**
 * routes/api/users.js - User Profiles API Endpoint
 */

const express = require('express');
const { db } = require('../../lib/supabase');

const router = express.Router();

// GET /api/users/:id - Public student profile
router.get('/:id', async (req, res) => {
  try {
    const user = await db.users.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ success: false, error: 'Student not found.' });
    }

    const [items, activityCount] = await Promise.all([
      db.items.findByOwnerId(req.params.id),
      db.requests.getActivityCount(req.params.id)
    ]);

    return res.json({
      success: true,
      user,
      items,
      activity_count: activityCount
    });
  } catch (err) {
    console.error('[API User Profile Error]', err);
    return res.status(500).json({ success: false, error: 'Failed to retrieve profile.' });
  }
});

module.exports = router;
