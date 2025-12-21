import React, { useState, useEffect, useRef } from "react";
import axios from "axios";
import './App.css';

// The proxy in package.json will handle the base URL
const API_BASE = "";

function App() {
  const [activeTab, setActiveTab] = useState("chat");

  // Load Google Fonts dynamically for modern typography
  useEffect(() => {
    const link = document.createElement('link');
    link.href = 'https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&display=swap';
    link.rel = 'stylesheet';
    document.head.appendChild(link);
  }, []);

  return (
    <div className="app-container">
      <div className="chat-card">
        <Header />
        <div className="tab-container">
          <TabButton
            title="Chat"
            icon={<ChatIcon isActive={activeTab === "chat"} />}
            isActive={activeTab === "chat"}
            onClick={() => setActiveTab("chat")}
          />
          <TabButton
            title="Admin Panel"
            icon={<AdminIcon isActive={activeTab === "admin"} />}
            isActive={activeTab === "admin"}
            onClick={() => setActiveTab("admin")}
          />
        </div>
        <div className="content-container">
          {activeTab === "chat" ? <ChatPanel /> : <AdminPanel />}
        </div>
      </div>
    </div>
  );
}

// --- Sub-components ---
const Header = () => (
  <div className="header">
    <h1 className="header-title">Language Agnostic Chatbot</h1>
    <p className="header-subtitle">AI-Powered Assistance for Educational Institutions</p>
  </div>
);

const TabButton = ({ title, isActive, onClick, icon }) => (
  <button
    onClick={onClick}
    className={`tab-button ${isActive ? "active" : ""}`}
  >
    {icon}
    {title}
  </button>
);

// --- Chat Panel Component (Text-to-Speech Enabled) ---
const ChatPanel = () => {
  const [messages, setMessages] = useState([
    {
      text: "Hello! I can answer questions from your documents. Ask me anything!",
      sender: "bot",
    },
  ]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  // Generate a random session ID for the user
  const [sessionId] = useState(() => Math.random().toString(36).substr(2, 9));
  
  // TTS State
  const [speechEnabled, setSpeechEnabled] = useState(true); 
  
  const messagesEndRef = useRef(null);
  const synthesisRef = useRef(window.speechSynthesis);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Safe Cleanup for Speech Synthesis
  useEffect(() => {
    const synth = synthesisRef.current;
    return () => {
      if (synth) synth.cancel();
    };
  }, []);

  // --- Helper: Speak Text ---
  const speakText = (text) => {
    if (!speechEnabled || !synthesisRef.current) return;
    
    // Stop any currently playing audio
    synthesisRef.current.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    
    // Attempt to use a Google voice if available (better quality)
    const voices = synthesisRef.current.getVoices();
    const preferredVoice = voices.find(voice => voice.name.includes("Google US English")) || voices[0];
    if (preferredVoice) utterance.voice = preferredVoice;

    utterance.rate = 1.0;
    utterance.pitch = 1.0;
    synthesisRef.current.speak(utterance);
  };

  const pushBotMessage = (botMsg) => {
    let messageText = "I received a response, but it was empty.";
    let sources = [];

    // Rasa sometimes sends 'custom' payload for rich data, or plain 'text'
    if (botMsg.custom) {
      messageText = botMsg.custom.text || messageText;
      sources = botMsg.custom.sources || [];
    } else if (botMsg.text) {
      messageText = botMsg.text;
    }

    // Read the response aloud
    speakText(messageText);

    setMessages((prev) => [
      ...prev,
      {
        text: messageText,
        sender: "bot",
        sources: sources,
      },
    ]);
  };

  const sendMessage = async (e) => {
    if (e) e.preventDefault();
    if (!input.trim() || isLoading) return;

    // Silence the bot if the user interrupts
    if (synthesisRef.current) synthesisRef.current.cancel();
    
    const userMessage = { text: input, sender: "user" };
    setMessages((prev) => [...prev, userMessage]);
    
    const query = input;
    setInput("");
    setIsLoading(true);

    try {
      const response = await axios.post(`${API_BASE}/api/chat`, {
        message: query,
        sender: sessionId,
      });

      let messageReceived = false;
      if (response.data && Array.isArray(response.data) && response.data.length > 0) {
          response.data.forEach((botMsg) => {
            if (botMsg.custom || botMsg.text) {
              pushBotMessage(botMsg);
              messageReceived = true;
            }
          });
      }

      if (!messageReceived) {
        const errorMsg = "Sorry, I didn’t get a specific response.";
        setMessages((prev) => [...prev, { text: errorMsg, sender: "bot" }]);
        speakText(errorMsg);
      }
    } catch (error) {
      console.error("Error sending message:", error);
      const errorText = error.response?.data?.error || "Sorry, I cannot connect to the AI brain.";
      setMessages((prev) => [...prev, { text: String(errorText), sender: "bot" }]);
      speakText(String(errorText));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="chat-container">
      <div className="message-area">
        {messages.map((msg, index) => {
          const isUser = msg.sender === "user";
          return (
            <div key={index} className={`message-row ${isUser ? 'message-row-user' : 'message-row-bot'}`}>
              <div className={`message-bubble ${isUser ? 'message-bubble-user' : 'message-bubble-bot'}`}>
                <p>{msg.text}</p>
                {msg.sender === "bot" && msg.sources && msg.sources.length > 0 && (
                  <div className="source-info">
                    <strong className="source-strong">Source:</strong>
                    <a
                      href={msg.sources[0].url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="full-pdf-button"
                    >
                      {msg.sources[0].title} (p.{msg.sources[0].page})
                    </a>
                  </div>
                )}
              </div>
            </div>
          );
        })}
        {isLoading && <TypingIndicator />}
        <div ref={messagesEndRef} />
      </div>

      <div className="input-controls">
         {/* Speaker Toggle */}
        <button 
          type="button" 
          className={`icon-button speaker-button ${speechEnabled ? 'active' : ''}`}
          onClick={() => setSpeechEnabled(!speechEnabled)}
          title={speechEnabled ? "Mute Text-to-Speech" : "Enable Text-to-Speech"}
        >
          {speechEnabled ? <SpeakerOnIcon /> : <SpeakerOffIcon />}
        </button>

        <form onSubmit={sendMessage} className="input-form">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask a question..."
            className="input-field"
            disabled={isLoading}
          />
          
          <button type="submit" className={`send-button ${isLoading ? 'disabled' : ''}`} disabled={isLoading}>
            <SendIcon />
          </button>
        </form>
      </div>
    </div>
  );
};

// --- Admin Panel Component ---
const AdminPanel = () => {
    const [file, setFile] = useState(null);
    const [uploadMessage, setUploadMessage] = useState("");
    const [isUploading, setIsUploading] = useState(false);
    
    const [logContent, setLogContent] = useState("");
    const [isRetraining, setIsRetraining] = useState(false);
    const logRef = useRef(null);
  
    useEffect(() => {
      if (logRef.current) {
        logRef.current.scrollTop = logRef.current.scrollHeight;
      }
    }, [logContent]);
  
    const handleFileChange = (e) => {
      setFile(e.target.files[0]);
      setUploadMessage("");
    };
  
    const handleFileUpload = async (e) => {
      e.preventDefault();
      if (!file) {
        setUploadMessage("Please select a PDF file first.");
        return;
      }
  
      setIsUploading(true);
      setUploadMessage("Uploading...");
      
      const formData = new FormData();
      formData.append("pdf", file);
  
      try {
        const response = await axios.post(`${API_BASE}/api/admin/upload`, formData);
        setUploadMessage(`✅ Success! '${response.data.filename}' was uploaded.`);
        setFile(null);
      } catch (error) {
        const errorMessage = error.response?.data?.message || "Failed to upload file.";
        setUploadMessage(`❌ Error: ${errorMessage}`);
      } finally {
        setIsUploading(false);
      }
    };
    
    const handleRetrain = async () => {
      if (isRetraining) return;
      setIsRetraining(true);
      setLogContent("--- Connecting to retraining service... ---\n");
  
      try {
        const response = await fetch(`${API_BASE}/api/admin/retrain`, {
          method: 'POST',
        }); 
  
        if (!response.ok || !response.body) {
          throw new Error(`Server responded with status: ${response.status}`);
        }
  
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
  
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const chunk = decoder.decode(value, { stream: true });
          setLogContent(prev => prev + chunk);
        }
  
      } catch (error) {
        setLogContent(prev => prev + `\n❌ CRITICAL ERROR: Could not connect. Is admin_server.py running?\nError: ${error.message}`);
      } finally {
        setIsRetraining(false);
        setLogContent(prev => prev + "\n--- Process finished ---\n");
      }
    };
  
    return (
      <div className="admin-container">
        <div className="admin-section">
          <h3 className="admin-title">1. Upload Knowledge (PDFs)</h3>
          <p className="admin-description">Add new documents to the chatbot's knowledge base.</p>
          <form onSubmit={handleFileUpload} className="upload-form">
            <input
              type="file"
              accept=".pdf"
              onChange={handleFileChange}
              disabled={isUploading || isRetraining}
              className="file-input"
            />
            <button type="submit" className={`upload-button ${isUploading || !file || isRetraining ? 'disabled' : ''}`} disabled={isUploading || !file || isRetraining}>
              {isUploading ? 'Uploading...' : 'Upload PDF'}
            </button>
          </form>
          {uploadMessage && <p className="upload-message">{uploadMessage}</p>}
        </div>
  
        <div className="admin-section">
          <h3 className="admin-title">2. Retrain AI</h3>
          <p className="admin-description">**MANDATORY** after uploading files. This rebuilds the AI's memory.</p>
          
          <button 
            onClick={handleRetrain} 
            className={`retrain-button ${isRetraining ? 'disabled' : ''}`}
            disabled={isRetraining}
          >
            {isRetraining ? <RetrainIconSpin /> : <RetrainIcon />}
            {isRetraining ? 'Retraining in Progress...' : 'Trigger Full Retraining'}
          </button>
          
          <h4 className="log-title">Retraining Logs:</h4>
          <div ref={logRef} className="log-viewer">
            <pre className="log-pre">{logContent}</pre>
          </div>
        </div>
      </div>
    );
};

// --- Icon Components ---
const SpeakerOnIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
    <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"></path>
  </svg>
);

const SpeakerOffIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
     <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
     <line x1="23" y1="9" x2="17" y2="15"></line>
     <line x1="17" y1="9" x2="23" y2="15"></line>
  </svg>
);

const ChatIcon = ({ isActive }) => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" style={{ marginRight: '8px' }}>
    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v10z" stroke={isActive ? "#2563eb" : "#475569"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);

const AdminIcon = ({ isActive }) => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" style={{ marginRight: '8px' }}>
    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 4c1.93 0 3.5 1.57 3.5 3.5S13.93 13 12 13s-3.5-1.57-3.5-3.5S10.07 6 12 6zm0 14c-2.03 0-4.43-.82-6.14-2.88C6.98 15.16 9.38 14 12 14s5.02 1.16 6.14 3.12C16.43 19.18 14.03 20 12 20z" fill={isActive ? "#2563eb" : "#475569"}/>
  </svg>
);

const RetrainIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '8px' }}>
    <path d="M21.5 2v6h-6"/><path d="M2.5 22v-6h6"/><path d="M20.4 17a8 8 0 1 0-15.3-2M3.6 7a8 8 0 1 0 15.3 2"/>
  </svg>
);

const RetrainIconSpin = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '8px', animation: 'spin 1s linear infinite' }}>
    <path d="M21.5 2v6h-6"/><path d="M2.5 22v-6h6"/><path d="M20.4 17a8 8 0 1 0-15.3-2M3.6 7a8 8 0 1 0 15.3 2"/>
  </svg>
);

const TypingIndicator = () => (
  <div className="message-row message-row-bot typing-indicator-row">
    <div className="message-bubble message-bubble-bot typing-indicator">
      <span className="typing-dot"></span>
      <span className="typing-dot"></span>
      <span className="typing-dot"></span>
    </div>
  </div>
);

const SendIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
    <path d="M2.01 21L23 12L2.01 3L2 10L17 12L2 14L2.01 21Z" fill="white" />
  </svg>
);

export default App;