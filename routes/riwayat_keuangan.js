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

//  Ambil Data Riwayat Keuangan
router.get('/data', verifikasiToken, async (req, res) => {
    try {
        const userId = req.userId;
        const limitParam = parseInt(req.query.limit) || 1000;

        // Pendapatan dari tabel barang_keluar di mana tipe_keluar = 'Tunai'
        // Pengeluaran dari tabel barang_masuk

        const query = `
            SELECT 
                COALESCE(bk.nama_barang_snapshot, b.nama_barang) AS nama_barang,
                bk.tanggal,
                'Pendapatan' AS kategori,
                bk.total_harga AS jumlah,
                'Transaksi Penjualan' AS keterangan
            FROM barang_keluar bk
            JOIN barang b ON bk.barang_id = b.barang_id
            WHERE b.user_id = ? AND bk.tipe_keluar = 'Tunai'

            UNION ALL

            SELECT 
                COALESCE(bm.nama_barang_snapshot, b.nama_barang) AS nama_barang,
                bm.tanggal,
                'Pengeluaran' AS kategori,
                (bm.jumlah * COALESCE(bm.harga_beli_snapshot, b.harga_beli)) AS jumlah,
                'Transaksi Pembelian' AS keterangan
            FROM barang_masuk bm
            JOIN barang b ON bm.barang_id = b.barang_id
            WHERE b.user_id = ?

            UNION ALL

            SELECT 
                p.nama_pelanggan AS nama_barang,
                ch.tanggal,
                'Pendapatan' AS kategori,
                ch.nominal AS jumlah,
                'Pembayaran Hutang' AS keterangan
            FROM catatan_hutang ch
            JOIN pelanggan p ON ch.pelanggan_id = p.pelanggan_id
            WHERE p.user_id = ? AND ch.jenis_transaksi = 'Bayar'

            ORDER BY tanggal DESC
            LIMIT ?
        `;

        const [rows] = await db.promise().query(query, [userId, userId, userId, limitParam]);

        // Hitung total pendapatan dan pengeluaran secara keseluruhan berdasarkan row yang diambil 
        const [totalPendapatan] = await db.promise().query(
            `SELECT 
                (SELECT COALESCE(SUM(bk.total_harga), 0) FROM barang_keluar bk JOIN barang b ON bk.barang_id = b.barang_id WHERE b.user_id = ? AND bk.tipe_keluar = 'Tunai') +
                (SELECT COALESCE(SUM(ch.nominal), 0) FROM catatan_hutang ch JOIN pelanggan p ON ch.pelanggan_id = p.pelanggan_id WHERE p.user_id = ? AND ch.jenis_transaksi = 'Bayar') AS total`
            , [userId, userId]
        );

        const [totalPengeluaran] = await db.promise().query(
            `SELECT SUM(bm.jumlah * COALESCE(bm.harga_beli_snapshot, b.harga_beli)) AS total 
             FROM barang_masuk bm 
             JOIN barang b ON bm.barang_id = b.barang_id 
             WHERE b.user_id = ?`, [userId]
        );

        res.status(200).json({
            riwayat: rows,
            total_pendapatan: Number(totalPendapatan[0].total) || 0,
            total_pengeluaran: Number(totalPengeluaran[0].total) || 0
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({ pesan: 'Gagal mengambil data riwayat keuangan' });
    }
});

module.exports = router;
