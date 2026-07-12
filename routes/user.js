const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const db = require('../koneksi');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');

// Konfigurasi Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

// Konfigurasi Multer-Cloudinary Storage untuk upload foto profil
const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: 'sakumama/profiles',
    allowed_formats: ['jpg', 'jpeg', 'png', 'webp'],
  }
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 2 * 1024 * 1024 },
});

// Middleware autentikasi
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (token == null) return res.status(401).json({ pesan: 'Belum login' });

  jwt.verify(token, process.env.JWT_SECRET || 'rahasia_super_aman', (err, user) => {
    if (err) return res.status(403).json({ pesan: 'Token tidak valid' });
    req.user = user;
    next();
  });
};

// 1. GET PROFILE
router.get('/profile', authenticateToken, (req, res) => {
  const querySQL = 'SELECT user_id, nama_toko, username, foto_profil FROM users WHERE user_id = ?';
  db.query(querySQL, [req.user.id], (err, results) => {
    if (err) {
      console.error('Error fetch profile:', err);
      return res.status(500).json({ pesan: 'Terjadi kesalahan pada server' });
    }
    if (results.length === 0) {
      return res.status(404).json({ pesan: 'User tidak ditemukan' });
    }
    res.json(results[0]);
  });
});

// 2. UPDATE PROFILE
router.put('/profile', authenticateToken, upload.single('foto_profil'), (req, res) => {
  const { nama_toko } = req.body;

  if (!nama_toko) {
    return res.status(400).json({ pesan: 'Nama toko wajib diisi' });
  }

  let querySQL = 'UPDATE users SET nama_toko = ? WHERE user_id = ?';
  let values = [nama_toko, req.user.id];

  if (req.file) {
    const fotoProfil = req.file.path; // Menyimpan URL gambar dari Cloudinary
    querySQL = 'UPDATE users SET nama_toko = ?, foto_profil = ? WHERE user_id = ?';
    values = [nama_toko, fotoProfil, req.user.id];
  }

  db.query(querySQL, values, (err, results) => {
    if (err) {
      console.error('Error update profile:', err);
      return res.status(500).json({ pesan: 'Terjadi kesalahan pada server' });
    }
    res.json({
      pesan: 'Profil berhasil diperbarui',
      foto_profil: req.file ? req.file.path : undefined
    });
  });
});

// 3. CHANGE PIN
router.put('/change-pin', authenticateToken, async (req, res) => {
  const { pinLama, pinBaru } = req.body;

  if (!pinLama || !pinBaru) {
    return res.status(400).json({ pesan: 'PIN lama dan PIN baru wajib diisi' });
  }

  if (!/^\d{6}$/.test(pinBaru)) {
    return res.status(400).json({ pesan: 'PIN baru harus berupa angka dan berjumlah 6 digit!' });
  }

  try {
    // Ambil PIN lama dari DB
    db.query('SELECT pin FROM users WHERE user_id = ?', [req.user.id], async (err, results) => {
      if (err) {
        return res.status(500).json({ pesan: 'Terjadi kesalahan pada server' });
      }

      const user = results[0];
      const isPinMatch = await bcrypt.compare(pinLama, user.pin);

      if (!isPinMatch) {
        return res.status(401).json({ pesan: 'PIN lama yang Anda masukkan salah!' });
      }

      // Hash PIN baru
      const saltRounds = 10;
      const hashedPinBaru = await bcrypt.hash(pinBaru, saltRounds);

      db.query('UPDATE users SET pin = ? WHERE user_id = ?', [hashedPinBaru, req.user.id], (err2) => {
        if (err2) {
          return res.status(500).json({ pesan: 'Terjadi kesalahan saat mengupdate PIN' });
        }
        res.json({ pesan: 'PIN berhasil diperbarui!' });
      });
    });
  } catch (error) {
    console.error('Error change PIN:', error);
    res.status(500).json({ pesan: 'Terjadi kesalahan saat memproses PIN' });
  }
});

module.exports = router;
