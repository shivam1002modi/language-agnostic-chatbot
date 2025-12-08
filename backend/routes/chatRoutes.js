const express = require("express");
const axios = require("axios");
const router = express.Router();

const AI_SERVICE_URL = process.env.RASA_URL || "http://localhost:5005/webhooks/rest/webhook";

// @route   POST /api/chat
// @desc    Handles chat messages from the user by proxying to the Rasa AI Server
// @access  Public
router.post("/", async (req, res) => {
    try {
        const { message, sender } = req.body;

        if (!message || !sender) {
            return res.status(400).json({ error: "Message and sender are required." });
        }

        console.log(`➡️  Received message: "${message}" from sender: ${sender}`);
        console.log(`➡️  Forwarding to Rasa AI service at ${AI_SERVICE_URL}`);

        try {
            const response = await axios.post(AI_SERVICE_URL, {
                sender: sender,
                message: message,
            }, { 
                // Increased timeout to allow for RAG and LLM calls
                timeout: 60 * 1000 
            }); 

            console.log("⬅️  Received response from AI service. Forwarding to client.");
            // Forward response.data as-is, which contains the text and json_message payload
            return res.json(response.data);

        } catch (aiError) {
            console.error("❌ Error communicating with the AI service:", aiError.message);
            // Check for connection timeout errors
            if (aiError.code === 'ECONNABORTED' || aiError.code === 'ETIMEDOUT') {
                return res.status(504).json({
                    error: "AI service connection timed out. It might be retraining or under heavy load.",
                });
            }
            if (aiError.response && aiError.response.data) {
                // forward Rasa error body if present
                return res.status(aiError.response.status || 500).json({ error: "AI service error", details: aiError.response.data });
            }
            return res.status(500).json({
                error: "Sorry, I'm having trouble connecting to my brain (the AI service).",
            });
        }

    } catch (error) {
        console.error("❌ Server error in chat route:", error.message);
        return res.status(500).json({ error: "An internal server error occurred." });
    }
});

module.exports = router;
