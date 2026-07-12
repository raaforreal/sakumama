const express = require('express');
const router = express.Router();
const db = require('../koneksi');
const jwt = require('jsonwebtoken');

// verifikasi token JWT
const verifikasiToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) return res.status(401).json({ pesan: 'Akses ditolak' });

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'rahasia_super_aman');
        req.userId = decoded.id;
        next();
    } catch (err) {
        res.status(403).json({ pesan: 'Token tidak valid' });
    }
};

// 1. Cek Barcode 
router.get('/cek-barcode/:barcode', verifikasiToken, async (req, res) => {
    try {
        const { barcode } = req.params;
        const [rows] = await db.promise().query(
            "SELECT * FROM barang WHERE barcode = ? AND user_id = ?", 
            [barcode, req.userId]
        );

        if (rows.length > 0) {
            // Jika barang sudah ada di database, kirim datanya untuk auto-fill form
            return res.status(200).json({ ada: true, barang: rows[0] });
        } else {
            // Jika barang baru, beri tahu frontend untuk membuka form kosong
            return res.status(200).json({ ada: false });
        }
    } catch (error) {
        console.error(error);
        res.status(500).json({ pesan: 'Gagal mengecek barcode' });
    }
});

// 2. Simpan Barang Masuk (RESTOCK)
router.post('/simpan', verifikasiToken, async (req, res) => {
    const { barang_id, harga_beli, harga_jual, jumlah, tanggal_masuk } = req.body;
    const userId = req.userId;

    if (!barang_id) return res.status(400).json({ pesan: 'ID Barang diperlukan' });

    try {
        const [existingBarang] = await db.promise().query("SELECT * FROM barang WHERE barang_id = ? AND user_id = ?", [barang_id, userId]);

        if (existingBarang.length > 0) {
            const barang = existingBarang[0];
            const stokBaru = barang.stok + parseInt(jumlah);

            // Update stok dan update harga beli/jual terbaru
            await db.promise().query(
                "UPDATE barang SET harga_beli = ?, harga_jual = ?, stok = ? WHERE barang_id = ?",
                [harga_beli, harga_jual, stokBaru, barang_id]
            );

            // LOG RIWAYAT
            const tglMasuk = tanggal_masuk || new Date().toISOString().split('T')[0];
            await db.promise().query(
                "INSERT INTO barang_masuk (barang_id, jumlah, tanggal, nama_barang_snapshot, harga_beli_snapshot, harga_jual_snapshot) VALUES (?, ?, ?, ?, ?, ?)",
                [barang_id, jumlah, tglMasuk, barang.nama_barang, harga_beli, harga_jual]
            );

            res.status(200).json({ pesan: 'Restock barang berhasil disimpan!' });
        } else {
             res.status(404).json({ pesan: 'Barang tidak ditemukan' });
        }
    } catch (error) {
        console.error(error);
        res.status(500).json({ pesan: 'Gagal menyimpan barang masuk' });
    }
});

// 3. Ambil Riwayat Barang Masuk 
router.get('/riwayat', verifikasiToken, async (req, res) => {
    try {
        const [rows] = await db.promise().query(
            `SELECT bm.barang_masuk_id, bm.tanggal, 
             COALESCE(bm.nama_barang_snapshot, b.nama_barang) AS nama_barang, 
             COALESCE(bm.harga_beli_snapshot, b.harga_beli) AS harga_beli, 
             COALESCE(bm.harga_jual_snapshot, b.harga_jual) AS harga_jual, 
             bm.jumlah, b.barcode
             FROM barang_masuk bm
             JOIN barang b ON bm.barang_id = b.barang_id
             WHERE b.user_id = ?
             ORDER BY bm.tanggal DESC, bm.barang_masuk_id DESC LIMIT 20`, 
            [req.userId]
        );
        res.status(200).json(rows);
    } catch (error) {
        console.error(error);
        res.status(500).json({ pesan: 'Gagal mengambil data riwayat' });
    }
});

module.exports = router;