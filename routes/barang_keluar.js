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

// 1. Cari Barang
router.get('/cari', verifikasiToken, async (req, res) => {
    try {
        const { q } = req.query;
        if (!q) {
            return res.status(400).json({ pesan: 'Kata kunci pencarian kosong' });
        }

        const searchTerm = `%${q}%`;
        const [rows] = await db.promise().query(
            "SELECT barang_id, barcode, nama_barang, harga_jual, stok FROM barang WHERE (nama_barang LIKE ? OR barcode LIKE ?) AND user_id = ? AND stok > 0", 
            [`%${q}%`, `%${q}%`, req.userId]
        );

        res.status(200).json(rows);
    } catch (error) {
        console.error(error);
        res.status(500).json({ pesan: 'Gagal mencari barang' });
    }
});

// 2. Simpan Transaksi Barang Keluar
router.post('/simpan', verifikasiToken, async (req, res) => {
    const { keranjang, kategori_pembayaran, total_harga_transaksi, pelanggan_id, nama_pelanggan_baru, catatan_hutang, tanggal_transaksi } = req.body;
    const userId = req.userId;

    if (!keranjang || keranjang.length === 0) {
        return res.status(400).json({ pesan: 'Keranjang belanja kosong' });
    }

    try {
        const connection = await db.promise().getConnection();
        await connection.beginTransaction();

        try {
            const tanggalTransaksi = tanggal_transaksi || new Date().toISOString().split('T')[0];

            for (const item of keranjang) {
                const total_harga_item = item.jumlah * item.harga_jual;

                // snapshot data barang
                const [itemDbData] = await connection.query("SELECT nama_barang, harga_beli, harga_jual FROM barang WHERE barang_id = ?", [item.barang_id]);
                const dbItem = itemDbData[0] || item;

                // snapshot barang keluar
                await connection.query(
                    "INSERT INTO barang_keluar (barang_id, jumlah, total_harga, tipe_keluar, tanggal, nama_barang_snapshot, harga_beli_snapshot, harga_jual_snapshot) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                    [item.barang_id, item.jumlah, total_harga_item, kategori_pembayaran, tanggalTransaksi, dbItem.nama_barang, dbItem.harga_beli, dbItem.harga_jual]
                );

                await connection.query(
                    "UPDATE barang SET stok = stok - ? WHERE barang_id = ? AND user_id = ?",
                    [item.jumlah, item.barang_id, userId]
                );
            }

            if (kategori_pembayaran === 'Hutang') {
                let finalPelangganId = pelanggan_id;

                if (nama_pelanggan_baru) {
                    const [insertPelanggan] = await connection.query(
                        "INSERT INTO pelanggan (user_id, nama_pelanggan) VALUES (?, ?)",
                        [userId, nama_pelanggan_baru]
                    );
                    finalPelangganId = insertPelanggan.insertId;
                }

                if (!finalPelangganId) {
                    throw new Error("Data pelanggan tidak valid untuk pencatatan hutang");
                }

                await connection.query(
                    "INSERT INTO catatan_hutang (pelanggan_id, jenis_transaksi, nominal, keterangan, tanggal) VALUES (?, 'Hutang', ?, ?, ?)",
                    [finalPelangganId, total_harga_transaksi, catatan_hutang || 'Dari transaksi Kasir (Barang Keluar)', tanggalTransaksi]
                );
            }

            await connection.commit();
            res.status(200).json({ pesan: 'Transaksi berhasil disimpan!' });
        } catch (err) {
            await connection.rollback();
            throw err;
        } finally {
            connection.release();
        }

    } catch (error) {
        console.error("Gagal menyimpan transaksi:", error);
        res.status(500).json({ pesan: 'Gagal menyimpan transaksi barang keluar' });
    }
});

// 3.  Ambil Riwayat Barang Keluar
router.get('/riwayat', verifikasiToken, async (req, res) => {
    try {
        const [rows] = await db.promise().query(
            `SELECT bk.barang_keluar_id, bk.tanggal, 
             COALESCE(bk.nama_barang_snapshot, b.nama_barang) AS nama_barang, 
             COALESCE(bk.harga_beli_snapshot, b.harga_beli) AS harga_beli,
             COALESCE(bk.harga_jual_snapshot, b.harga_jual) AS harga_jual,
             bk.jumlah, bk.total_harga, bk.tipe_keluar, b.barcode
             FROM barang_keluar bk
             JOIN barang b ON bk.barang_id = b.barang_id
             WHERE b.user_id = ?
             ORDER BY bk.tanggal DESC, bk.barang_keluar_id DESC LIMIT 10`, 
            [req.userId]
        );
        res.status(200).json(rows);
    } catch (error) {
        console.error(error);
        res.status(500).json({ pesan: 'Gagal mengambil data riwayat' });
    }
});

module.exports = router;
