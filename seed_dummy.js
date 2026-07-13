require('dotenv').config();
const mysql = require('mysql2/promise');
const bcrypt = require('bcrypt');

const dbConfig = {
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASS,
    database: process.env.DB_NAME,
    port: process.env.PORT
};

const warungItems = [
    // 5 FAST MOVING (Target on Day 0: stok <= rop)
    { nama: "Indomie Goreng", hb: 2500, hj: 3500, type: 'fast' },
    { nama: "Beras Pandan Wangi 5kg", hb: 55000, hj: 65000, type: 'fast' },
    { nama: "Telur Ayam 1kg", hb: 22000, hj: 26000, type: 'fast' },
    { nama: "Minyak Goreng Bimoli 1L", hb: 15000, hj: 18000, type: 'fast' },
    { nama: "Gula Pasir Gulaku 1kg", hb: 12000, hj: 15000, type: 'fast' },

    // 5 SLOW MOVING (Target on Day 0: tor < 1 AND stok > rop)
    { nama: "Sapu Lidi", hb: 10000, hj: 15000, type: 'slow' },
    { nama: "Ember Plastik Besar", hb: 25000, hj: 35000, type: 'slow' },
    { nama: "Panci Aluminium", hb: 45000, hj: 60000, type: 'slow' },
    { nama: "Sikat Wc", hb: 8000, hj: 12000, type: 'slow' },
    { nama: "Kemoceng Bulu", hb: 12000, hj: 18000, type: 'slow' },

    // 5 NORMAL (Target on Day 0: tor >= 1 AND stok > rop)
    { nama: "Kopi Kapal Api Sachet", hb: 1000, hj: 1500, type: 'normal' },
    { nama: "Aqua Botol 600ml", hb: 2500, hj: 3500, type: 'normal' },
    { nama: "Teh Pucuk Harum", hb: 3000, hj: 4000, type: 'normal' },
    { nama: "Roti Aoka", hb: 2000, hj: 3000, type: 'normal' },
    { nama: "Susu Beruang Bear Brand", hb: 8500, hj: 10500, type: 'normal' }
];

function randomDateTime(date) {
    const d = new Date(date);
    d.setHours(Math.floor(Math.random() * 12) + 8); // 8 AM to 8 PM
    d.setMinutes(Math.floor(Math.random() * 60));
    return d;
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

        // 3. Masukkan Barang & Transaksi
        const today = new Date();
        
        for (const item of warungItems) {
            const barcode = '899' + Math.floor(Math.random() * 1000000000).toString().padStart(9, '0');
            
            let targetStock = 0;
            if (item.type === 'fast') targetStock = 3; 
            else if (item.type === 'slow') targetStock = 45;
            else if (item.type === 'normal') targetStock = 30;

            // Generate daily sales for 90 days
            const dailySales = [];
            let totalSales = 0;
            for (let i = 0; i < 90; i++) {
                let sale = 0;
                if (item.type === 'fast') sale = Math.floor(Math.random() * 3) + 1; // 1-3
                else if (item.type === 'normal') sale = Math.floor(Math.random() * 3) + 1; // 1-3
                else if (item.type === 'slow') sale = Math.random() < 0.2 ? 1 : 0; // 0-1
                dailySales.push(sale);
                totalSales += sale;
            }

            // Simulate forward to generate barang_masuk events
            let currentStock = 0;
            const masukEvents = [];
            for (let i = 0; i < 90; i++) {
                let sale = dailySales[i];
                let minBuffer = item.type === 'slow' ? 0 : 15;
                if (item.type === 'fast' && i >= 75) minBuffer = 0; 
                
                if (i === 0 || currentStock < sale + minBuffer) {
                    let restockQty = 0;
                    if (item.type === 'slow') {
                        restockQty = totalSales + targetStock; 
                    } else {
                        let remainingSales = 0;
                        for(let j=i; j<90; j++) remainingSales += dailySales[j];
                        let exactNeeded = targetStock - currentStock + remainingSales;
                        
                        if (exactNeeded > 80 && i < 60) {
                            restockQty = 60 + sale; 
                        } else {
                            restockQty = exactNeeded;
                        }
                    }
                    if (restockQty > 0) {
                        masukEvents.push({ dayIndex: i, qty: restockQty });
                        currentStock += restockQty;
                    }
                }
                currentStock -= sale;
            }

            // Insert barang
            const [bRes] = await connection.query(
                'INSERT INTO barang (user_id, barcode, nama_barang, harga_beli, harga_jual, stok, is_deleted, created_at) VALUES (?, ?, ?, ?, ?, ?, 0, NOW())',
                [userId, barcode, item.nama, item.hb, item.hj, currentStock] // final stock
            );
            const barangId = bRes.insertId;

            // Insert Barang Masuk
            for (const ev of masukEvents) {
                const eventDate = new Date(today);
                eventDate.setDate(today.getDate() - (89 - ev.dayIndex));
                const tDate = randomDateTime(eventDate);
                
                await connection.query(
                    'INSERT INTO barang_masuk (barang_id, jumlah, tanggal, nama_barang_snapshot, harga_beli_snapshot, harga_jual_snapshot) VALUES (?, ?, ?, ?, ?, ?)',
                    [barangId, ev.qty, tDate, item.nama, item.hb, item.hj]
                );
            }

            // Insert Barang Keluar
            for (let i = 0; i < 90; i++) {
                let qty = dailySales[i];
                if (qty > 0) {
                    const eventDate = new Date(today);
                    eventDate.setDate(today.getDate() - (89 - i));
                    const tDate = randomDateTime(eventDate);

                    const isTunai = Math.random() > 0.15;
                    const tipeKeluar = isTunai ? 'Tunai' : 'Hutang';
                    let pelangganId = null;

                    if (!isTunai) {
                        pelangganId = pelangganIds[Math.floor(Math.random() * pelangganIds.length)];
                    }
                    const totalHarga = qty * item.hj;

                    await connection.query(
                        'INSERT INTO barang_keluar (barang_id, pelanggan_id, jumlah, tipe_keluar, total_harga, tanggal, nama_barang_snapshot, harga_beli_snapshot, harga_jual_snapshot) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
                        [barangId, pelangganId, qty, tipeKeluar, totalHarga, tDate, item.nama, item.hb, item.hj]
                    );

                    if (!isTunai) {
                        await connection.query(
                            "INSERT INTO catatan_hutang (pelanggan_id, jenis_transaksi, nominal, keterangan, tanggal) VALUES (?, 'Hutang', ?, 'Otomatis beli barang', ?)",
                            [pelangganId, totalHarga, tDate]
                        );
                    }
                }
            }
        }
        
        console.log("✅ Berhasil! Data dummy 90 hari dengan logika ROP untuk rekomendasi Dashboard telah disuntikkan.");
        
    } catch (err) {
        console.error("Terjadi kesalahan:", err);
    } finally {
        if (connection) {
            await connection.end();
        }
    }
}

seed();
