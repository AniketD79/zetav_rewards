const mysql = require('mysql2/promise');
require('dotenv').config();

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
});

// 🚀 Test DB Connection on Startup
async function testDatabaseConnection() {
  try {
    const connection = await pool.getConnection();
    console.log('Database connected!');
    connection.release(); // Release back to pool
  } catch (err) {
    console.error('Database connection failed:', err.message);
    process.exit(1); // exit to prevent app from starting
  }
}

testDatabaseConnection();

module.exports = pool;
