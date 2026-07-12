const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const db = require('../koneksi'); 

// 1. API GET USERS
router.get('/users', (req, res) => {
    const querySQL = 'SELECT user_id, nama_toko, username, created_at FROM users';
    db.query(querySQL, (err, results) => {
        if (err) {
            console.error('Error saat mengambil data:', err);
            return res.status(500).json({ error: 'Terjadi kesalahan pada server' });
        }
        res.json({
            pesan: 'Berhasil mengambil data pemilik warung',
            jumlah_data: results.length,
            data: results
        });
    });
});

// 2. API REGISTER
router.post('/register', async (req, res) => {
    const { username, nama_toko, jawaban_keamanan, pin } = req.body;
    if (!username || !nama_toko || !jawaban_keamanan || !pin) {
        return res.status(400).json({ pesan: 'Semua kolom registrasi wajib diisi!' });
    }

    if (!/^\d{6}$/.test(pin)) {
        return res.status(400).json({ pesan: 'PIN harus berupa angka dan berjumlah 6 digit!' });
    }

    try {
        const saltRounds = 10;
        const hashedPin = await bcrypt.hash(pin, saltRounds);
        const hashedJawaban = await bcrypt.hash(jawaban_keamanan, saltRounds);
        const querySQL = `
            INSERT INTO users (nama_toko, username, pin, jawaban_keamanan, foto_profil, created_at) 
            VALUES (?, ?, ?, ?, '', NOW())
        `;
        const values = [nama_toko, username, hashedPin, hashedJawaban];
        db.query(querySQL, values, (err, results) => {
            if (err) {
                if (err.code === 'ER_DUP_ENTRY') {
                    return res.status(409).json({ pesan: 'Username ini sudah digunakan. Silakan gunakan username lain.' });
                }
                console.error('Gagal menyimpan data:', err);
                return res.status(500).json({ pesan: 'Terjadi kesalahan pada server saat menyimpan data.' });
            }
            res.status(201).json({
                pesan: 'Pendaftaran berhasil!',
                userId: results.insertId
            });
        });
    } catch (error) {
        console.error('Error keamanan:', error);
        res.status(500).json({ pesan: 'Terjadi kesalahan saat mengamankan data pengguna.' });
    }
});

// 3. API LOGIN
router.post('/login', async (req, res) => {
    const { username, pin } = req.body;

    if (!username || !pin) {
        return res.status(400).json({ pesan: 'Username dan PIN wajib diisi!' });
    }

    try {
        const querySQL = 'SELECT * FROM users WHERE username = ?';

        db.query(querySQL, [username], async (err, results) => {
            if (err) {
                console.error('Error saat login:', err);
                return res.status(500).json({ pesan: 'Terjadi kesalahan pada server.' });
            }

            if (results.length === 0) {
                return res.status(401).json({ pesan: 'Username tidak terdaftar!' });
            }

            const user = results[0];
            const isPinMatch = await bcrypt.compare(pin, user.pin);

            if (!isPinMatch) {
                return res.status(401).json({ pesan: 'PIN yang Anda masukkan salah!' });
            }

            const token = jwt.sign(
                { id: user.user_id, username: user.username },
                process.env.JWT_SECRET || 'rahasia_super_aman', // Menggunakan fallback jika env belum diset
                { expiresIn: '1d' }
            );

            res.status(200).json({
                pesan: 'Login berhasil!',
                token: token,
                data: {
                    user_id: user.user_id,
                    nama_toko: user.nama_toko,
                    username: user.username
                }
            });
        });
    } catch (error) {
        console.error('Error proses login:', error);
        res.status(500).json({ pesan: 'Terjadi kesalahan saat memproses login.' });
    }
});

// 4. API CEK KEAMANAN
router.post('/cek-keamanan', async (req, res) => {
    const { username, noTelepon } = req.body;
    try {
        const [users] = await db.promise().query('SELECT * FROM users WHERE username = ?', [username]);
        if (users.length === 0) {
            return res.status(404).json({ pesan: 'Username tidak ditemukan!' });
        }

        const user = users[0];
        const isJawabanCocok = await bcrypt.compare(noTelepon, user.jawaban_keamanan);
        if (!isJawabanCocok) {
            return res.status(401).json({ pesan: 'No Telepon salah!' });
        }

        res.status(200).json({ pesan: 'Verifikasi berhasil!' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ pesan: 'Terjadi kesalahan pada server' });
    }
});

// 5. API RESET PIN
router.post('/reset-pin', async (req, res) => {
    const { username, pinBaru } = req.body;
    try {
        const saltRounds = 10;
        const hashedPin = await bcrypt.hash(pinBaru, saltRounds);
        await db.promise().query('UPDATE users SET pin = ? WHERE username = ?', [hashedPin, username]);
        res.status(200).json({ pesan: 'PIN berhasil direset! Silakan login.' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ pesan: 'Terjadi kesalahan saat mereset PIN' });
    }
});

module.exports = router;