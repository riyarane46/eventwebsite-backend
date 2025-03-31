const express = require("express");
const router = express.Router();
const sql = require("mssql");
const connectDB = require("./db");

// Test route to verify API is working
router.get("/test", (req, res) => {
    res.json({ message: "API is working correctly" });
});

// Get all events
router.get("/events", async (req, res) => {
    try {
        let pool = await connectDB();
        let result = await pool.request().query("SELECT * FROM Events");
        res.json(result.recordset);
    } catch (err) {
        console.error("Error fetching events:", err);
        res.status(500).json({ error: "Database query failed", details: err.message });
    }
});

// Add a user registration endpoint
router.post("/users", async (req, res) => {
    try {
        const { username, email, password } = req.body;
        
        if (!username || !email || !password) {
            return res.status(400).json({ error: "Missing required fields" });
        }
        
        let pool = await connectDB();
        
        // Check if username or email already exists
        let checkResult = await pool.request()
            .input('username', sql.NVarChar, username)
            .input('email', sql.NVarChar, email)
            .query("SELECT * FROM Users WHERE username = @username OR email = @email");
        
        if (checkResult.recordset.length > 0) {
            return res.status(400).json({ error: "Username or email already exists" });
        }
        
        // Insert new user
        let result = await pool.request()
            .input('username', sql.NVarChar, username)
            .input('email', sql.NVarChar, email)
            .input('password', sql.NVarChar, password) // In production, hash this password
            .query(`
                INSERT INTO Users (username, email, password)
                OUTPUT INSERTED.userId, INSERTED.username, INSERTED.email
                VALUES (@username, @email, @password)
            `);
        
        res.status(201).json(result.recordset[0]);
    } catch (err) {
        console.error("Registration error:", err);
        res.status(500).json({ error: "Registration failed", details: err.message });
    }
});

// Add a login endpoint
router.post("/login", async (req, res) => {
    try {
        const { username, password } = req.body;
        
        if (!username || !password) {
            return res.status(400).json({ error: "Username and password are required" });
        }
        
        let pool = await connectDB();
        let result = await pool.request()
            .input('username', sql.NVarChar, username)
            .query("SELECT userId, username, email, password FROM Users WHERE username = @username");
        
        if (result.recordset.length === 0) {
            return res.status(401).json({ error: "Invalid credentials" });
        }
        
        const user = result.recordset[0];
        
        // In a real app, you should hash passwords and compare hashes
        if (user.password !== password) {
            return res.status(401).json({ error: "Invalid credentials" });
        }
        
        // Remove password from response
        delete user.password;
        
        res.json({
            success: true,
            user: user
        });
    } catch (err) {
        console.error("Login error:", err);
        res.status(500).json({ error: "Login failed", details: err.message });
    }
});

// Get user profile
router.get("/users/:userId", async (req, res) => {
    try {
        const userId = req.params.userId;
        
        let pool = await connectDB();
        let result = await pool.request()
            .input('userId', sql.Int, userId)
            .query("SELECT userId, username, email FROM Users WHERE userId = @userId");
        
        if (result.recordset.length === 0) {
            return res.status(404).json({ error: "User not found" });
        }
        
        res.json(result.recordset[0]);
    } catch (err) {
        console.error("Error fetching user profile:", err);
        res.status(500).json({ error: "Failed to fetch user profile", details: err.message });
    }
});

// Register user for an event - Updated to handle numeric IDs and proper error handling
router.post("/register-event", async (req, res) => {
    try {
        const { userId, eventId, username, email, eventTitle } = req.body;
        
        // Validate required fields
        if (!userId || !eventId || !username || !email || !eventTitle) {
            return res.status(400).json({ error: "Missing required fields" });
        }
        
        // Log the registration attempt for debugging
        console.log("Registration attempt:", { userId, eventId, username, email, eventTitle });
        
        // Ensure userId and eventId are numbers
        const userIdNum = parseInt(userId);
        const eventIdNum = parseInt(eventId);
        
        if (isNaN(userIdNum) || isNaN(eventIdNum)) {
            return res.status(400).json({ error: "Invalid userId or eventId format. Must be numbers." });
        }
        
        let pool = await connectDB();
        
        // First verify that both the user and event exist
        const userExists = await pool.request()
            .input('userId', sql.Int, userIdNum)
            .query("SELECT COUNT(*) as count FROM Users WHERE userId = @userId");
            
        if (userExists.recordset[0].count === 0) {
            return res.status(404).json({ error: "User not found" });
        }
        
        const eventExists = await pool.request()
            .input('eventId', sql.Int, eventIdNum)
            .query("SELECT COUNT(*) as count FROM Events WHERE eventId = @eventId");
            
        if (eventExists.recordset[0].count === 0) {
            return res.status(404).json({ error: "Event not found" });
        }
        
        // Check if user is already registered for this event
        let checkResult = await pool.request()
            .input('userId', sql.Int, userIdNum)
            .input('eventId', sql.Int, eventIdNum)
            .query("SELECT * FROM UserEvents WHERE userId = @userId AND eventId = @eventId");
        
        if (checkResult.recordset.length > 0) {
            return res.status(400).json({ error: "User is already registered for this event" });
        }
        
        // Register user for event
        const insertResult = await pool.request()
            .input('userId', sql.Int, userIdNum)
            .input('eventId', sql.Int, eventIdNum)
            .input('username', sql.NVarChar, username)
            .input('email', sql.NVarChar, email)
            .input('eventTitle', sql.NVarChar, eventTitle)
            .input('registrationDate', sql.DateTime, new Date())
            .query(`
                INSERT INTO UserEvents (userId, eventId, username, email, eventTitle, registrationDate)
                OUTPUT INSERTED.*
                VALUES (@userId, @eventId, @username, @email, @eventTitle, @registrationDate)
            `);
        
        // Log the insert result for debugging
        console.log("Insert result:", insertResult);
        
        if (insertResult.rowsAffected[0] === 0) {
            throw new Error("Insert operation did not affect any rows");
        }
        
        res.status(201).json({ 
            message: "Successfully registered for event",
            data: insertResult.recordset[0]
        });
    } catch (err) {
        console.error("Event registration error:", err);
        
        // Check for specific SQL errors
        if (err.number === 547) { // Foreign key constraint violation
            return res.status(400).json({ 
                error: "Registration failed due to foreign key constraint. User or event may not exist.",
                details: err.message
            });
        }
        
        if (err.number === 2627) { // Unique constraint violation
            return res.status(400).json({ 
                error: "User is already registered for this event",
                details: err.message
            });
        }
        
        res.status(500).json({ 
            error: "Failed to register for event", 
            details: err.message,
            stack: err.stack
        });
    }
});

// Get events registered by a user
router.get("/user-events/:userId", async (req, res) => {
    try {
        const userId = parseInt(req.params.userId);
        
        if (isNaN(userId)) {
            return res.status(400).json({ error: "Invalid userId format. Must be a number." });
        }
        
        let pool = await connectDB();
        let result = await pool.request()
            .input('userId', sql.Int, userId)
            .query(`
                SELECT ue.registrationId, ue.eventId, ue.userId, 
                       ue.username, ue.email, ue.eventTitle, ue.registrationDate,
                       e.eventDate, e.eventLocation, e.eventDescription
                FROM UserEvents ue
                LEFT JOIN Events e ON ue.eventId = e.eventId
                WHERE ue.userId = @userId
                ORDER BY ue.registrationDate DESC
            `);
        
        res.json(result.recordset);
    } catch (err) {
        console.error("Error fetching user events:", err);
        res.status(500).json({ error: "Failed to fetch user events", details: err.message });
    }
});

// Get a single event by ID
router.get("/events/:eventId", async (req, res) => {
    try {
        const eventId = parseInt(req.params.eventId);
        
        if (isNaN(eventId)) {
            return res.status(400).json({ error: "Invalid eventId format. Must be a number." });
        }
        
        let pool = await connectDB();
        let result = await pool.request()
            .input('eventId', sql.Int, eventId)
            .query(`
                SELECT 
                    eventId as id,
                    eventName,
                    eventDescription as description,
                    FORMAT(eventDate, 'MMMM d, yyyy') as date,
                    eventLocation as location,
                    eventImage as image
                FROM Events 
                WHERE eventId = @eventId
            `);
        
        if (result.recordset.length === 0) {
            return res.status(404).json({ error: "Event not found" });
        }
        
        res.json(result.recordset[0]);
    } catch (err) {
        console.error("Error fetching event:", err);
        res.status(500).json({ error: "Failed to fetch event", details: err.message });
    }
});

module.exports = router;
