require('dotenv').config();
const mysql = require('mysql2/promise');
const bcrypt = require('bcrypt');

const dbConfig = {
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASS,
    database: process.env.DB_NAME,
    port: process.env.PORT || 3306
};

const warungItems = [
    // 5 FAST MOVING (Untuk Rekomendasi Restock: stok <= ROP)
    // Target: stok_terjual = 57, sisa = 3, stok_awal = 60
    { nama: "Indomie Goreng", hb: 2500, hj: 3500, type: 'fast' },
    { nama: "Beras Pandan Wangi 5kg", hb: 55000, hj: 65000, type: 'fast' },
    { nama: "Telur Ayam 1kg", hb: 22000, hj: 26000, type: 'fast' },
    { nama: "Minyak Goreng Bimoli 1L", hb: 15000, hj: 18000, type: 'fast' },
    { nama: "Gula Pasir Gulaku 1kg", hb: 12000, hj: 15000, type: 'fast' },

    // 5 SLOW MOVING (Untuk Tidak Perlu Restock: tor < 1 AND stok > ROP)
    // Target: stok_terjual = 5, sisa = 50, stok_awal = 55
    { nama: "Sapu Lidi", hb: 10000, hj: 15000, type: 'slow' },
    { nama: "Ember Plastik Besar", hb: 25000, hj: 35000, type: 'slow' },
    { nama: "Panci Aluminium", hb: 45000, hj: 60000, type: 'slow' },
    { nama: "Sikat Wc", hb: 8000, hj: 12000, type: 'slow' },
    { nama: "Kemoceng Bulu", hb: 12000, hj: 18000, type: 'slow' },

    // 5 NORMAL (Stok aman & perputaran sehat: tor >= 1 AND stok > ROP)
    // Target: stok_terjual = 80, sisa = 30, stok_awal = 110
    { nama: "Kopi Kapal Api Sachet", hb: 1000, hj: 1500, type: 'normal' },
    { nama: "Aqua Botol 600ml", hb: 2500, hj: 3500, type: 'normal' },
    { nama: "Teh Pucuk Harum", hb: 3000, hj: 4000, type: 'normal' },
    { nama: "Roti Aoka", hb: 2000, hj: 3000, type: 'normal' },
    { nama: "Susu Beruang Bear Brand", hb: 8500, hj: 10500, type: 'normal' }
];

function randomDate(start, end) {
    return new Date(start.getTime() + Math.random() * (end.getTime() - start.getTime()));
}

async function seed() {
    let connection;
    try {
        connection = await mysql.createConnection(dbConfig);
        console.log("Koneksi berhasil!");

        // 1. Pastikan User Ada
        const [existingUsers] = await connection.query('SELECT user_id FROM users WHERE username = ?', ['firasfazhira']);
        let userId;

        if (existingUsers.length > 0) {
            userId = existingUsers[0].user_id;
            console.log(`User firasfazhira ditemukan (ID: ${userId}). Membersihkan data lama...`);
            
            // CLEAN UP DATA LAMA
            await connection.query(`DELETE FROM catatan_hutang WHERE pelanggan_id IN (SELECT pelanggan_id FROM pelanggan WHERE user_id = ?)`, [userId]);
            await connection.query(`DELETE FROM barang_masuk WHERE barang_id IN (SELECT barang_id FROM barang WHERE user_id = ?)`, [userId]);
            await connection.query(`DELETE FROM barang_keluar WHERE barang_id IN (SELECT barang_id FROM barang WHERE user_id = ?)`, [userId]);
            await connection.query(`DELETE FROM barang WHERE user_id = ?`, [userId]);
            await connection.query(`DELETE FROM pelanggan WHERE user_id = ?`, [userId]);
            
            console.log("Data lama berhasil dibersihkan!");
        } else {
            console.log("User firasfazhira tidak ditemukan. Membuat user baru...");
            const hashedPin = await bcrypt.hash('111111', 10);
            const [result] = await connection.query(
                'INSERT INTO users (nama_toko, username, pin, jawaban_keamanan, foto_profil) VALUES (?, ?, ?, ?, ?)',
                ['Toko Ibu Anis', 'firasfazhira', hashedPin, '081210734823', '']
            );
            userId = result.insertId;
        }

        // 2. Buat Pelanggan
        const pelangganNames = ['Bapak Budi', 'Bu Haji', 'Ibu Siti', 'Mas Joko'];
        const pelangganIds = [];
        for (const name of pelangganNames) {
            const [res] = await connection.query(
                'INSERT INTO pelanggan (user_id, nama_pelanggan, created_at) VALUES (?, ?, NOW())',
                [userId, name]
            );
            pelangganIds.push(res.insertId);
        }
        console.log("Pelanggan dummy berhasil dibuat.");

        // Tanggal untuk transaksi (dalam 30 hari terakhir agar masuk rumus ROP)
        const today = new Date();
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(today.getDate() - 29);

        // 3. Masukkan Barang & Transaksi
        for (const [index, item] of warungItems.entries()) {
            const barcode = '899' + Math.floor(Math.random() * 1000000000).toString().padStart(9, '0');
            
            // Set stok akhir berdasarkan tipe
            let sisaStok = 0;
            let targetTerjual = 0;
            
            if (item.type === 'fast') {
                sisaStok = 3; // Sangat rendah
                targetTerjual = 57; 
            } else if (item.type === 'slow') {
                sisaStok = 50; // Tinggi
                targetTerjual = 5;
            } else if (item.type === 'normal') {
                sisaStok = 30; // Sedang
                targetTerjual = 80;
            }

            // Insert barang
            const [bRes] = await connection.query(
                'INSERT INTO barang (user_id, barcode, nama_barang, harga_beli, harga_jual, stok, is_deleted, created_at) VALUES (?, ?, ?, ?, ?, ?, 0, NOW())',
                [userId, barcode, item.nama, item.hb, item.hj, sisaStok]
            );
            const barangId = bRes.insertId;

            // Insert Barang Masuk (Awal bulan)
            const stokAwal = sisaStok + targetTerjual;
            const tglMasuk = new Date(thirtyDaysAgo);
            await connection.query(
                'INSERT INTO barang_masuk (barang_id, jumlah, tanggal, nama_barang_snapshot, harga_beli_snapshot, harga_jual_snapshot) VALUES (?, ?, ?, ?, ?, ?)',
                [barangId, stokAwal, tglMasuk, item.nama, item.hb, item.hj]
            );

            // Insert Barang Keluar (Tersebar selama 30 hari terakhir)
            // Pecah targetTerjual menjadi 5 transaksi kecil
            const txCount = 5;
            const jumlahPerTx = Math.floor(targetTerjual / txCount);
            let sisaDistrib = targetTerjual;

            for (let i = 0; i < txCount; i++) {
                if (sisaDistrib <= 0) break;
                let qty = i === txCount - 1 ? sisaDistrib : jumlahPerTx;
                if (qty <= 0) continue;

                // Transaksi tunai atau hutang? (Lebanyakan tunai biar warung untung besar)
                const isTunai = Math.random() > 0.15;
                const tipeKeluar = isTunai ? 'Tunai' : 'Hutang';
                let pelangganId = null;

                if (!isTunai) {
                    pelangganId = pelangganIds[Math.floor(Math.random() * pelangganIds.length)];
                }

                const tglKeluar = randomDate(thirtyDaysAgo, today);
                const totalHarga = qty * item.hj;

                await connection.query(
                    'INSERT INTO barang_keluar (barang_id, pelanggan_id, jumlah, tipe_keluar, total_harga, tanggal, nama_barang_snapshot, harga_beli_snapshot, harga_jual_snapshot) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
                    [barangId, pelangganId, qty, tipeKeluar, totalHarga, tglKeluar, item.nama, item.hb, item.hj]
                );

                if (!isTunai) {
                    await connection.query(
                        "INSERT INTO catatan_hutang (pelanggan_id, jenis_transaksi, nominal, keterangan, tanggal) VALUES (?, 'Hutang', ?, 'Otomatis beli barang', ?)",
                        [pelangganId, totalHarga, tglKeluar]
                    );
                }

                sisaDistrib -= qty;
            }
        }
        
        console.log("✅ Berhasil! Data dummy dengan logika ROP untuk rekomendasi Dashboard telah disuntikkan.");
        
    } catch (err) {
        console.error("Terjadi kesalahan:", err);
    } finally {
        if (connection) {
            await connection.end();
        }
    }
}

seed();
