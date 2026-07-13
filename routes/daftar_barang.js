const express = require('express');
const router = express.Router();
const db = require('../koneksi');
const jwt = require('jsonwebtoken');

// Verifikasi Token JWT
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

// 1. Ambil Semua Daftar Barang yang belum dihapu
router.get('/', verifikasiToken, async (req, res) => {
    try {
        const { search } = req.query;
        let query = "SELECT * FROM barang WHERE user_id = ? AND is_deleted = 0";
        let params = [req.userId];

        if (search) {
            query += " AND (nama_barang LIKE ? OR barcode LIKE ?)";
            params.push(`%${search}%`, `%${search}%`);
        }

        query += " ORDER BY nama_barang ASC";

        const [rows] = await db.promise().query(query, params);
        res.status(200).json(rows);
    } catch (error) {
        console.error(error);
        res.status(500).json({ pesan: 'Gagal mengambil daftar barang' });
    }
});

// 2. Tambah Barang Baru atau restock jika sudah ada
router.post('/', verifikasiToken, async (req, res) => {
    try {
        const { barcode, nama_barang, harga_beli, harga_jual, stok } = req.body;
        
        let checkQuery = "SELECT barang_id, stok, barcode, nama_barang FROM barang WHERE user_id = ? AND nama_barang = ?";
        let checkParams = [req.userId, nama_barang];
        
        if (barcode) {
            checkQuery = "SELECT barang_id, stok, barcode, nama_barang FROM barang WHERE user_id = ? AND (nama_barang = ? OR barcode = ?)";
            checkParams.push(barcode);
        }

        const [existing] = await db.promise().query(checkQuery, checkParams);

        let finalBarangId;
        const jumlahStok = stok || 0;

        if (existing.length > 0) {
            // KALO BARANG UDAH ADA (by nama atau barcode) -> UPDATE & RESTOCK
            const barang = existing[0];
            finalBarangId = barang.barang_id;
            const updatedBarcode = barcode || barang.barcode;

            await db.promise().query(
                "UPDATE barang SET harga_beli = ?, harga_jual = ?, stok = stok + ?, barcode = ?, is_deleted = 0 WHERE barang_id = ?",
                [harga_beli, harga_jual, jumlahStok, updatedBarcode, finalBarangId]
            );
        } else {
            // KALO BARANG BARU -> INSERT
            const generatedBarcode = barcode || `KB-${Date.now()}`;
            const [insertBarang] = await db.promise().query(
                "INSERT INTO barang (user_id, barcode, nama_barang, harga_beli, harga_jual, stok, is_deleted) VALUES (?, ?, ?, ?, ?, ?, 0)",
                [req.userId, generatedBarcode, nama_barang, harga_beli, harga_jual, jumlahStok]
            );
            finalBarangId = insertBarang.insertId;
        }
        
        // CATAT DI TABEL BARANG_MASUK AKLO ADA PENAMBAHAN STOK
        if (jumlahStok > 0) {
            const tglMasuk = new Date().toISOString().split('T')[0];
            await db.promise().query(
                "INSERT INTO barang_masuk (barang_id, jumlah, tanggal, nama_barang_snapshot, harga_beli_snapshot, harga_jual_snapshot) VALUES (?, ?, ?, ?, ?, ?)",
                [finalBarangId, jumlahStok, tglMasuk, nama_barang, harga_beli, harga_jual]
            );
        }
        
        if (existing.length > 0) {
            res.status(200).json({ pesan: 'Barang sudah ada, data berhasil diperbarui (Restock)', id: finalBarangId });
        } else {
            res.status(201).json({ pesan: 'Barang berhasil ditambahkan', id: finalBarangId });
        }
    } catch (error) {
        console.error(error);
        res.status(500).json({ pesan: 'Gagal memproses barang' });
    }
});

// 3. Update Barang
router.put('/:id', verifikasiToken, async (req, res) => {
    try {
        const { id } = req.params;
        const { barcode, nama_barang, harga_beli, harga_jual, stok } = req.body;
        
       //cuman pemilik barang yang bisa ubah
        const [cekBarang] = await db.promise().query("SELECT barang_id FROM barang WHERE barang_id = ? AND user_id = ?", [id, req.userId]);
        if (cekBarang.length === 0) {
            return res.status(403).json({ pesan: 'Akses ditolak' });
        }
        
        await db.promise().query(
            "UPDATE barang SET barcode = ?, nama_barang = ?, harga_beli = ?, harga_jual = ?, stok = ? WHERE barang_id = ?",
            [barcode || `KB-${Date.now()}`, nama_barang, harga_beli, harga_jual, stok, id]
        );
        
        res.status(200).json({ pesan: 'Data barang berhasil diperbarui' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ pesan: 'Gagal memperbarui data barang' });
    }
});

// 3. Soft Delete Barang
router.delete('/:id', verifikasiToken, async (req, res) => {
    try {
        const { id } = req.params;
        
        // Cek kepemilikan
        const [cekBarang] = await db.promise().query("SELECT barang_id FROM barang WHERE barang_id = ? AND user_id = ?", [id, req.userId]);
        if (cekBarang.length === 0) {
            return res.status(404).json({ pesan: 'Barang tidak ditemukan atau bukan milik Anda' });
        }

        await db.promise().query("UPDATE barang SET is_deleted = 1 WHERE barang_id = ?", [id]);
        
        res.status(200).json({ pesan: 'Barang berhasil dihapus' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ pesan: 'Gagal menghapus data barang' });
    }
});

module.exports = router;
