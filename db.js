require("dotenv").config();
const sql = require("mssql");

const config = {
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    server: process.env.DB_SERVER,
    database: process.env.DB_NAME,
    options: {
        encrypt: true,
        trustServerCertificate: false
    }
};

async function connectDB() {
    try {
        let pool = await sql.connect(config);
        console.log("Connected to Azure SQL Database");
        return pool;
    } catch (err) {
        console.error("Database Connection Error: ", err);
    }
}

module.exports = connectDB;