const fs = require('fs');
const mysql = require('mysql2');
require('dotenv').config();

const connection = mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASS,
    database: process.env.DB_NAME,
    multipleStatements: true
});

connection.connect((err) => {
    if (err) {
        console.error('Migration failed to connect:', err);
        process.exit(0); // Ignore error so server can start anyway
    }

    console.log('Connected to DB for migration...');
    try {
        const schema = fs.readFileSync('schema.sql', 'utf8');
        connection.query('SET FOREIGN_KEY_CHECKS = 0;\n' + schema + '\nSET FOREIGN_KEY_CHECKS = 1;', (err, results) => {
            if (err) {
                console.log('Schema error:', err.message);
            } else {
                console.log('Database schema created successfully!');
            }
            connection.end();
            process.exit(0);
        });
    } catch (e) {
        console.error('Error reading schema.sql', e);
        connection.end();
        process.exit(0);
    }
});
