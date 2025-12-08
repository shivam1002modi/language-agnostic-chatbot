// backend/routes/adminRoutes.js
const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const axios = require("axios"); // Use axios to forward the request
const router = express.Router();

// Build absolute destination for PDF uploads
const pdfsDir = path.resolve(__dirname, "..", "..", "ai-service", "documents", "pdfs");

// Ensure directory exists
if (!fs.existsSync(pdfsDir)) {
  fs.mkdirSync(pdfsDir, { recursive: true });
  console.log("Created PDFs directory at:", pdfsDir);
}

// --- PDF Upload Configuration ---
const pdfStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, pdfsDir);
  },
  filename: (req, file, cb) => {
    // To avoid accidental overwrites, prefix with timestamp
    const timestamp = Date.now();
    const safeName = file.originalname.replace(/\s+/g, "_");
    cb(null, `${timestamp}-${safeName}`);
  },
});

const upload = multer({
  storage: pdfStorage,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB limit (adjust as needed)
  fileFilter: (req, file, cb) => {
    // Ensure that only PDF files can be uploaded
    if (file.mimetype === "application/pdf") {
      cb(null, true);
    } else {
      cb(new Error("Only .pdf files are allowed!"), false);
    }
  },
});

// @route   POST /api/admin/upload
// @desc    Handles the upload of a single PDF file
router.post("/upload", upload.single("pdf"), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ message: "No file uploaded." });
  }
  res.status(200).json({
    message: `File '${req.file.originalname}' uploaded successfully.`,
    savedAs: req.file.filename,
    filename: req.file.originalname,
  });
});

// --- Model Retraining Endpoint ---
// @route   POST /api/admin/retrain
// @desc    This endpoint now acts as a proxy to the Python admin server.
router.post("/retrain", async (req, res) => {
  console.log("Received retraining request. Forwarding to Python admin server...");

  const adminServerUrl = process.env.PYTHON_ADMIN_URL || "http://localhost:8000/retrain";

  try {
    const response = await axios({
      method: "post",
      url: adminServerUrl,
      responseType: "stream",
      timeout: 30 * 60 * 1000, // 30 minutes - retraining can be long
    });

    // Set status code from python server
    res.status(response.status);

    // Pipe python stream directly to the client
    response.data.pipe(res);

  } catch (error) {
    console.error("Error forwarding retraining request to Python server:", error.message);
    if (error.response && error.response.data) {
      // try to send python server's message
      res.status(error.response.status || 500).send("Error: Could not connect to the AI retraining service. Please ensure admin_server.py is running.");
    } else {
      res.status(500).send("Error: Could not connect to the AI retraining service. Please ensure admin_server.py is running.");
    }
  }
});

module.exports = router;
