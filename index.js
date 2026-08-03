const express = require('express');
const cors = require('cors');
const app = express();
const port = process.env.PORT || 3000;

// Hubungkan ke Router
const authRoutes = require('./routes/auth');
const dashboardRoutes = require('./routes/dashboard');
const barangMasukRoutes = require('./routes/barang_masuk');
const barangKeluarRoutes = require('./routes/barang_keluar');
const daftarBarangRoutes = require('./routes/daftar_barang');
const riwayatKeuanganRoutes = require('./routes/riwayat_keuangan');
const path = require('path');

// Middleware Utama
app.use(express.json());
app.use(cors({ origin: '*' }));
app.use('/public', express.static(path.join(__dirname, 'public')));

// Sajikan hasil build frontend React
app.use(express.static(path.join(__dirname, 'public/frontend')));

// Rute API
app.use('/api', authRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/barang-masuk', barangMasukRoutes);
app.use('/api/barang-keluar', barangKeluarRoutes);
app.use('/api/daftar-barang', daftarBarangRoutes);
app.use('/api/riwayat-keuangan', require('./routes/riwayat_keuangan'));
app.use('/api/hutang', require('./routes/hutang'));
app.use('/api/user', require('./routes/user'));

// Semua route selain /api
app.use((req, res) => {
    res.sendFile(path.join(__dirname, 'public/frontend', 'index.html'));
});

app.listen(port, () => {
    console.log(`Server SakuMama berjalan di http://localhost:${port}`);
});