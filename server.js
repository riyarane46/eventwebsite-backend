// server.js - Express server setup
require("dotenv").config();
const express = require("express");
const sql = require("mssql");
const routes = require("./routes");
const cors = require("cors"); // Add this line

const app = express();
const PORT = process.env.PORT || 5000;

// Enable CORS for all routes
app.use(cors()); // Add this line

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

app.use(express.json());
app.use("/api", routes);

connectDB().then(() => {
    app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
}).catch(err => console.error("Database connection failed", err));
