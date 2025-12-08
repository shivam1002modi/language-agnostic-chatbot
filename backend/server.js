const express = require("express");
const cors = require("cors");
const path = require("path");
// Ensure you have `dotenv` installed and a .env file configured
require('dotenv').config(); 

// --- Route Handlers Setup (Fixed for Robustness) ---
let chatRoutes;
let adminRoutes;

try {
    // Attempt to import route handlers
    chatRoutes = require("./routes/chatRoutes");
    adminRoutes = require("./routes/adminRoutes");
    console.log("SUCCESS: Route handlers imported successfully.");
} catch (error) {
    // CRITICAL: Log error if route files cannot be loaded
    console.error("FATAL ERROR: Failed to import route handlers (chatRoutes/adminRoutes).");
    console.error("This usually means files are missing, misnamed, or an error occurred during initialization (e.g., inside chatRoutes.js).");
    console.error("Details:", error.message);
    // You might want to exit the process here to avoid running a crippled server
    // process.exit(1); 
}

const app = express();
// Default to port 5001 if not specified in environment
const PORT = process.env.PORT || 5001; 

// --- Middleware ---
// Enable CORS for the frontend (React defaults to 3000)
app.use(cors()); 
// Body parser for JSON
app.use(express.json()); 

// --- Static File Serving (Crucial for 'View Source' Link) ---
// Define the path to the ai-service/documents/pdfs folder
const pdfsDir = path.join(__dirname, "..", "ai-service", "documents", "pdfs");
// Mount the static handler at the /api/documents endpoint
app.use("/api/documents", express.static(pdfsDir));
console.log(`Serving PDF documents statically from: ${pdfsDir}`);


// --- Route Definitions ---
// Check if routes were successfully loaded before mounting
if (chatRoutes && adminRoutes) {
    // All chat APIs start with /api/chat
    app.use("/api/chat", chatRoutes); 
    // All admin APIs start with /api/admin
    app.use("/api/admin", adminRoutes);
    console.log("SUCCESS: Chat and Admin routes mounted.");
} else {
    // If routes failed to load, register a generic error handler for the API paths
    app.use("/api/chat", (req, res) => {
        res.status(500).send({ error: "Server Initialization Failed: Chat route handler missing." });
    });
    app.use("/api/admin", (req, res) => {
        res.status(500).send({ error: "Server Initialization Failed: Admin route handler missing." });
    });
    console.warn("WARNING: Routes not mounted due to prior import failure.");
}


// Simple health check route
app.get('/', (req, res) => {
    res.send("Language Agnostic Chatbot Backend API is running on port " + PORT);
});

// Start Server
app.listen(PORT, () => console.log(`Backend server listening on port ${PORT}`));
