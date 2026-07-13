const express = require('express');
const router = express.Router();
const db = require('../koneksi');
const jwt = require('jsonwebtoken'); 

router.get('/data', async (req, res) => {
    try {
        // Ambil token dari header Authorization
        const authHeader = req.headers['authorization'];
        const token = authHeader && authHeader.split(' ')[1];

        if (!token) {
            return res.status(401).json({ pesan: 'Akses ditolak, token tidak ditemukan!' });
        }

        // Verifikasi token JWT
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'rahasia_super_aman');
        const userId = decoded.id; 

        // 1. Ambil Nama Toko Pemilik
        const [userRows] = await db.promise().query(
            "SELECT nama_toko FROM users WHERE user_id = ?", [userId]
        );
        const namaToko = userRows[0]?.nama_toko || "Toko SakuMama";

        // 2. Ambil Total Pemasukan Hari Ini 
        const [pemasukanRows] = await db.promise().query(
            `SELECT 
                (SELECT COALESCE(SUM(bk.total_harga), 0) FROM barang_keluar bk JOIN barang b ON bk.barang_id = b.barang_id WHERE b.user_id = ? AND bk.tipe_keluar = 'Tunai' AND DATE(bk.tanggal) = CURRENT_DATE()) +
                (SELECT COALESCE(SUM(ch.nominal), 0) FROM catatan_hutang ch JOIN pelanggan p ON ch.pelanggan_id = p.pelanggan_id WHERE p.user_id = ? AND ch.jenis_transaksi = 'Bayar' AND DATE(ch.tanggal) = CURRENT_DATE()) AS total`
            , [userId, userId]
        );

        // 3. Ambil Total Pengeluaran Hari Ini 
        const [pengeluaranRows] = await db.promise().query(
            `SELECT SUM(bm.jumlah * COALESCE(bm.harga_beli_snapshot, b.harga_beli)) AS total 
             FROM barang_masuk bm 
             JOIN barang b ON bm.barang_id = b.barang_id 
             WHERE b.user_id = ? AND DATE(bm.tanggal) = CURRENT_DATE()`, [userId]
        );

         // 4. Data Grafik Bulanan/Mingguan Toko Ini
        const filter = req.query.filter || 'bulan';
        
        let grafikQuery = "";
        if (filter === 'minggu') {
            grafikQuery = `
            SELECT 
                DAYNAME(tanggal) as label, 
                DAYOFWEEK(tanggal) as urutan,
                SUM(total) as total 
             FROM (
                SELECT bk.tanggal, bk.total_harga as total 
                FROM barang_keluar bk
                JOIN barang b ON bk.barang_id = b.barang_id
                WHERE b.user_id = ? AND bk.tipe_keluar = 'Tunai' AND YEARWEEK(bk.tanggal, 1) = YEARWEEK(CURRENT_DATE(), 1)
                
                UNION ALL
                
                SELECT ch.tanggal, ch.nominal as total 
                FROM catatan_hutang ch
                JOIN pelanggan p ON ch.pelanggan_id = p.pelanggan_id
                WHERE p.user_id = ? AND ch.jenis_transaksi = 'Bayar' AND YEARWEEK(ch.tanggal, 1) = YEARWEEK(CURRENT_DATE(), 1)
             ) as combined_data
             GROUP BY urutan, label 
             ORDER BY urutan`;
        } else {
            grafikQuery = `
            SELECT 
                MONTHNAME(tanggal) as label, 
                MONTH(tanggal) as urutan,
                SUM(total) as total 
             FROM (
                SELECT bk.tanggal, bk.total_harga as total 
                FROM barang_keluar bk
                JOIN barang b ON bk.barang_id = b.barang_id
                WHERE b.user_id = ? AND bk.tipe_keluar = 'Tunai' AND YEAR(bk.tanggal) = YEAR(CURRENT_DATE())
                
                UNION ALL
                
                SELECT ch.tanggal, ch.nominal as total 
                FROM catatan_hutang ch
                JOIN pelanggan p ON ch.pelanggan_id = p.pelanggan_id
                WHERE p.user_id = ? AND ch.jenis_transaksi = 'Bayar' AND YEAR(ch.tanggal) = YEAR(CURRENT_DATE())
             ) as combined_data
             GROUP BY urutan, label 
             ORDER BY urutan`;
        }

        const [grafikRows] = await db.promise().query(grafikQuery, [userId, userId]);
        
        const mapDay = {
            'Monday': 'Senin', 'Tuesday': 'Selasa', 'Wednesday': 'Rabu',
            'Thursday': 'Kamis', 'Friday': 'Jumat', 'Saturday': 'Sabtu', 'Sunday': 'Minggu'
        };
        const mapMonth = {
            'January': 'Januari', 'February': 'Februari', 'March': 'Maret',
            'April': 'April', 'May': 'Mei', 'June': 'Juni', 'July': 'Juli',
            'August': 'Agustus', 'September': 'September', 'October': 'Oktober',
            'November': 'November', 'December': 'Desember'
        };

        const grafikFormatted = grafikRows.map(item => ({
            label: filter === 'minggu' ? mapDay[item.label] || item.label : mapMonth[item.label] || item.label,
            total: Number(item.total)
        }));

        const queryRekomendasi = `
            WITH DataBarang AS (
                SELECT 
                    b.barang_id,
                    b.nama_barang,
                    b.stok AS stok_akhir,
                    COALESCE((SELECT SUM(jumlah) FROM barang_keluar WHERE barang_id = b.barang_id AND tanggal >= DATE_SUB(CURRENT_DATE(), INTERVAL 30 DAY)), 0) AS stok_terjual,
                    COALESCE((SELECT SUM(jumlah) FROM barang_masuk WHERE barang_id = b.barang_id AND tanggal >= DATE_SUB(CURRENT_DATE(), INTERVAL 30 DAY)), 0) AS stok_masuk
                FROM barang b
                WHERE b.user_id = ?
            ),
            Perhitungan1 AS (
                SELECT 
                    nama_barang,
                    stok_akhir AS stok,
                    stok_terjual,
                    (stok_akhir + stok_terjual - stok_masuk) AS stok_awal
                FROM DataBarang
            ),
            Perhitungan2 AS (
                SELECT
                    nama_barang,
                    stok,
                    stok_terjual,
                    (stok_awal + stok) / 2.0 AS rata_rata_stok
                FROM Perhitungan1
            ),
            Perhitungan3 AS (
                SELECT
                    nama_barang,
                    stok,
                    CASE WHEN rata_rata_stok <= 0 THEN 0 ELSE stok_terjual / rata_rata_stok END AS tor_bulanan,
                    stok_terjual / 30.0 AS daily_demand
                FROM Perhitungan2
            ),
            HasilAkhir AS (
                SELECT
                    nama_barang,
                    stok,
                    tor_bulanan,
                    CEIL((daily_demand * 1.0) + GREATEST(2.0, daily_demand * 2.0)) AS rop
                FROM Perhitungan3
            )
            SELECT
                nama_barang,
                stok,
                rop
            FROM HasilAkhir
            WHERE stok <= rop
            ORDER BY (rop - stok) DESC, tor_bulanan DESC
            LIMIT 5
        `;
        const [stokRows] = await db.promise().query(queryRekomendasi, [userId]);

        const queryRekomendasiSlow = `
            WITH DataBarang AS (
                SELECT 
                    b.barang_id,
                    b.nama_barang,
                    b.stok AS stok_akhir,
                    COALESCE((SELECT SUM(jumlah) FROM barang_keluar WHERE barang_id = b.barang_id AND tanggal >= DATE_SUB(CURRENT_DATE(), INTERVAL 30 DAY)), 0) AS stok_terjual,
                    COALESCE((SELECT SUM(jumlah) FROM barang_masuk WHERE barang_id = b.barang_id AND tanggal >= DATE_SUB(CURRENT_DATE(), INTERVAL 30 DAY)), 0) AS stok_masuk
                FROM barang b
                WHERE b.user_id = ? AND DATEDIFF(CURRENT_DATE(), b.created_at) >= 7
            ),
            Perhitungan1 AS (
                SELECT 
                    nama_barang,
                    stok_akhir AS stok,
                    stok_terjual,
                    (stok_akhir + stok_terjual - stok_masuk) AS stok_awal
                FROM DataBarang
            ),
            Perhitungan2 AS (
                SELECT
                    nama_barang,
                    stok,
                    stok_terjual,
                    (stok_awal + stok) / 2.0 AS rata_rata_stok
                FROM Perhitungan1
            ),
            Perhitungan3 AS (
                SELECT
                    nama_barang,
                    stok,
                    CASE WHEN rata_rata_stok <= 0 THEN 0 ELSE stok_terjual / rata_rata_stok END AS tor_bulanan,
                    stok_terjual / 30.0 AS daily_demand
                FROM Perhitungan2
            ),
            HasilAkhir AS (
                SELECT
                    nama_barang,
                    stok,
                    tor_bulanan,
                    CEIL((daily_demand * 1.0) + GREATEST(2.0, daily_demand * 2.0)) AS rop
                FROM Perhitungan3
            )
            SELECT
                nama_barang,
                stok,
                tor_bulanan
            FROM HasilAkhir
            WHERE tor_bulanan < 1 AND stok > rop
            ORDER BY tor_bulanan ASC
            LIMIT 5
        `;
        const [stokSlowRows] = await db.promise().query(queryRekomendasiSlow, [userId]);

        // Kirimkan semua data ke frontend
        res.status(200).json({
            nama_toko: namaToko,
            pemasukan_hari_ini: Number(pemasukanRows[0].total) || 0,
            pengeluaran_hari_ini: Number(pengeluaranRows[0].total) || 0,
            grafik: grafikFormatted,
            rekomendasi: stokRows,
            rekomendasi_slow: stokSlowRows
        });

    } catch (error) {
        console.error(error);
        res.status(403).json({ pesan: 'Token tidak valid atau kedaluwarsa' });
    }
});

module.exports = router;