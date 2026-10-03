/**
 * routes/api/items.js - Items REST API Endpoints
 */

const express = require('express');
const { db } = require('../../lib/supabase');
const { requireAuth } = require('../../middleware/auth');
const { upload } = require('../../middleware/upload');

const router = express.Router();

// GET /api/items - Browse items with search & filtering
router.get('/', async (req, res) => {
  try {
    const { q, category, item_type, sort, limit } = req.query;
    const items = await db.items.list({
      search: q ? q.trim() : undefined,
      category: category ? category.trim() : undefined,
      item_type: item_type ? item_type.trim() : undefined,
      sort: sort ? sort.trim() : 'newest',
      limit: limit ? parseInt(limit, 10) : undefined
    });
    return res.json({ success: true, count: items.length, items });
  } catch (err) {
    console.error('[API Items List Error]', err);
    return res.status(500).json({ success: false, error: 'Failed to retrieve items.' });
  }
});

// GET /api/items/:id - Individual item details
router.get('/:id', async (req, res) => {
  try {
    const item = await db.items.findById(req.params.id);
    if (!item) {
      return res.status(404).json({ success: false, error: 'Item not found.' });
    }

    const owner = await db.users.findById(item.owner_id);
    return res.json({ success: true, item, owner });
  } catch (err) {
    console.error('[API Item Detail Error]', err);
    return res.status(500).json({ success: false, error: 'Failed to retrieve item.' });
  }
});

// POST /api/items - Post a new item
router.post('/', requireAuth, upload.single('image'), async (req, res) => {
  try {
    const {
      title,
      description,
      category,
      item_type = 'Rent',
      price: rawPrice,
      total_price: rawTotalPrice,
      deposit: rawDeposit,
      location,
      available_from,
      available_until
    } = req.body;

    if (!title || !description || !category || !location || !available_from || !available_until) {
      return res.status(400).json({ success: false, error: 'Please fill in all required fields.' });
    }

    if (available_from > available_until) {
      return res.status(400).json({ success: false, error: 'Available from date cannot be after available until date.' });
    }

    let price = 0;
    let deposit = 0;

    if (item_type === 'Borrow (Free)' || item_type === 'Borrow') {
      price = 0.0;
      deposit = rawDeposit ? parseFloat(rawDeposit) : 0.0;
      if (deposit < 0) {
        return res.status(400).json({ success: false, error: 'Deposit cannot be a negative number.' });
      }
    } else if (item_type === 'Reuse (Giveaway)' || item_type === 'Reuse') {
      deposit = 0.0;
      const reusePrice = rawTotalPrice || rawPrice || '0';
      price = parseFloat(reusePrice);
      if (price < 0) {
        return res.status(400).json({ success: false, error: 'Total price cannot be a negative number.' });
      }
    } else { // 'Rent'
      price = rawPrice ? parseFloat(rawPrice) : 0.0;
      deposit = rawDeposit ? parseFloat(rawDeposit) : 0.0;
      if (price < 0 || deposit < 0) {
        return res.status(400).json({ success: false, error: 'Rental price and deposit cannot be negative numbers.' });
      }
    }

    // Handle image upload or category default illustration
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
      title: title.trim(),
      description: description.trim(),
      category: category.trim(),
      item_type,
      price,
      deposit,
      location: location.trim(),
      available_from,
      available_until,
      image_path
    });

    return res.status(201).json({
      success: true,
      message: 'Item published successfully!',
      item: newItem
    });
  } catch (err) {
    console.error('[API Post Item Error]', err);
    return res.status(500).json({ success: false, error: 'Failed to post item.' });
  }
});

// PUT /api/items/:id - Edit an item
router.put('/:id', requireAuth, upload.single('image'), async (req, res) => {
  try {
    const existing = await db.items.findById(req.params.id);
    if (!existing) {
      return res.status(404).json({ success: false, error: 'Item not found.' });
    }

    // Security check: User must own this item
    if (existing.owner_id !== req.user.id) {
      return res.status(403).json({ success: false, error: 'Unauthorized: You can only edit your own listings.' });
    }

    const {
      title,
      description,
      category,
      item_type = 'Rent',
      price: rawPrice,
      total_price: rawTotalPrice,
      deposit: rawDeposit,
      location,
      available_from,
      available_until,
      is_available
    } = req.body;

    let price = existing.price;
    let deposit = existing.deposit;

    if (item_type === 'Borrow (Free)' || item_type === 'Borrow') {
      price = 0.0;
      deposit = rawDeposit !== undefined ? parseFloat(rawDeposit) : existing.deposit;
    } else if (item_type === 'Reuse (Giveaway)' || item_type === 'Reuse') {
      deposit = 0.0;
      const reusePrice = rawTotalPrice !== undefined ? rawTotalPrice : rawPrice;
      price = reusePrice !== undefined ? parseFloat(reusePrice) : existing.price;
    } else { // 'Rent'
      if (rawPrice !== undefined) price = parseFloat(rawPrice);
      if (rawDeposit !== undefined) deposit = parseFloat(rawDeposit);
    }

    let image_path = existing.image_path;
    if (req.file) {
      image_path = await db.storage.uploadImage(
        req.file.buffer,
        req.file.originalname,
        req.file.mimetype,
        req.user.id
      );
    }

    const updated = await db.items.update(req.params.id, {
      title: title ? title.trim() : existing.title,
      description: description ? description.trim() : existing.description,
      category: category ? category.trim() : existing.category,
      item_type: item_type || existing.item_type,
      price,
      deposit,
      location: location ? location.trim() : existing.location,
      available_from: available_from || existing.available_from,
      available_until: available_until || existing.available_until,
      image_path,
      is_available: is_available !== undefined ? (is_available ? 1 : 0) : existing.is_available
    });

    return res.json({ success: true, message: 'Item updated successfully!', item: updated });
  } catch (err) {
    console.error('[API Edit Item Error]', err);
    return res.status(500).json({ success: false, error: 'Failed to update item.' });
  }
});

// DELETE /api/items/:id - Permanently delete an item
router.delete('/:id', requireAuth, async (req, res) => {
  try {
    const existing = await db.items.findById(req.params.id);
    if (!existing) {
      return res.status(404).json({ success: false, error: 'Item not found.' });
    }

    if (existing.owner_id !== req.user.id) {
      return res.status(403).json({ success: false, error: 'Unauthorized: You can only delete your own listings.' });
    }

    await db.items.delete(req.params.id);
    return res.json({ success: true, message: 'Item deleted successfully.' });
  } catch (err) {
    console.error('[API Delete Item Error]', err);
    return res.status(500).json({ success: false, error: 'Failed to delete item.' });
  }
});

module.exports = router;
