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

// 1.  Ambil Daftar Pelanggan & Total Hutangnya
router.get('/pelanggan', verifikasiToken, async (req, res) => {
    try {
        const userId = req.userId;
        const [rows] = await db.promise().query(
            `SELECT p.pelanggan_id, p.nama_pelanggan, 
                COALESCE(SUM(CASE WHEN ch.jenis_transaksi = 'Hutang' THEN ch.nominal ELSE 0 END), 0) -
                COALESCE(SUM(CASE WHEN ch.jenis_transaksi = 'Bayar' THEN ch.nominal ELSE 0 END), 0) AS sisa_hutang
             FROM pelanggan p
             LEFT JOIN catatan_hutang ch ON p.pelanggan_id = ch.pelanggan_id
             WHERE p.user_id = ?
             GROUP BY p.pelanggan_id
             ORDER BY p.nama_pelanggan ASC`,
            [userId]
        );
        res.status(200).json(rows);
    } catch (error) {
        console.error(error);
        res.status(500).json({ pesan: 'Gagal mengambil data pelanggan' });
    }
});

// 2.  Ambil Detail Riwayat Hutang Satu Pelanggan
router.get('/pelanggan/:id', verifikasiToken, async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.userId;

        // Pastikan pelanggan tersebut milik user ini
        const [pelangganRows] = await db.promise().query(
            "SELECT nama_pelanggan FROM pelanggan WHERE pelanggan_id = ? AND user_id = ?",
            [id, userId]
        );

        if (pelangganRows.length === 0) {
            return res.status(404).json({ pesan: 'Pelanggan tidak ditemukan' });
        }

        const [riwayatRows] = await db.promise().query(
            `SELECT hutang_id, jenis_transaksi, nominal, keterangan, tanggal, created_at 
             FROM catatan_hutang 
             WHERE pelanggan_id = ? 
             ORDER BY tanggal DESC, created_at DESC`,
            [id]
        );

        res.status(200).json({
            nama_pelanggan: pelangganRows[0].nama_pelanggan,
            riwayat: riwayatRows
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({ pesan: 'Gagal mengambil riwayat hutang' });
    }
});

// 3.  Catat Transaksi Manual (Hutang Baru atau Pembayaran)
router.post('/catat', verifikasiToken, async (req, res) => {
    const { pelanggan_id, jenis_transaksi, nominal, keterangan, tanggal } = req.body;
    const userId = req.userId;

    if (!pelanggan_id || !jenis_transaksi || !nominal) {
        return res.status(400).json({ pesan: 'Data tidak lengkap' });
    }

    try {
        // Validasi kepemilikan pelanggan
        const [pelanggan] = await db.promise().query(
            "SELECT pelanggan_id FROM pelanggan WHERE pelanggan_id = ? AND user_id = ?",
            [pelanggan_id, userId]
        );

        if (pelanggan.length === 0) {
            return res.status(404).json({ pesan: 'Pelanggan tidak valid' });
        }

        const tanggalTransaksi = tanggal || new Date().toISOString().split('T')[0];

        await db.promise().query(
            "INSERT INTO catatan_hutang (pelanggan_id, jenis_transaksi, nominal, keterangan, tanggal) VALUES (?, ?, ?, ?, ?)",
            [pelanggan_id, jenis_transaksi, nominal, keterangan, tanggalTransaksi]
        );

        res.status(200).json({ pesan: 'Catatan berhasil disimpan!' });

    } catch (error) {
        console.error(error);
        res.status(500).json({ pesan: 'Gagal menyimpan catatan hutang' });
    }
});

// 4.  Tambah Pelanggan Baru secara Manual
router.post('/pelanggan', verifikasiToken, async (req, res) => {
    const { nama_pelanggan } = req.body;
    const userId = req.userId;

    if (!nama_pelanggan) {
        return res.status(400).json({ pesan: 'Nama pelanggan wajib diisi' });
    }

    try {
        const [result] = await db.promise().query(
            "INSERT INTO pelanggan (user_id, nama_pelanggan) VALUES (?, ?)",
            [userId, nama_pelanggan]
        );
        res.status(200).json({ pesan: 'Pelanggan berhasil ditambahkan', pelanggan_id: result.insertId });
    } catch (error) {
        console.error(error);
        res.status(500).json({ pesan: 'Gagal menambah pelanggan' });
    }
});

module.exports = router;
