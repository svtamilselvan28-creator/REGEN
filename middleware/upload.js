/**
 * middleware/upload.js - File Upload Middleware
 * Uses multer memory storage for serverless-safe uploads to Supabase Storage.
 */

const multer = require('multer');
const path = require('path');

const ALLOWED_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg'];

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024 // 5 MB max
  },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (ALLOWED_EXTENSIONS.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid image format. Allowed formats: PNG, JPG, JPEG, GIF, WEBP, SVG.'));
    }
  }
});

module.exports = { upload };
