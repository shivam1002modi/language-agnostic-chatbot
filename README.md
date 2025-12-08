DocuBot: The Language Agnostic Chatbot 🤖📄

A locally-hosted, privacy-focused AI assistant that answers questions from your documents in multiple languages.

🎥 Watch the Demo Video  :https://youtu.be/v3KFLLyCE_g

🚀 Overview

DocuBot is a professional-grade Retrieval-Augmented Generation (RAG) system designed for educational institutions and organizations. It allows administrators to upload PDF documents (like exam timetables, policy documents, or educational material) and enables users to ask questions in natural language.

Key Differentiator: It runs entirely locally using open-source models. No data leaves your server, and no external API keys (like OpenAI or Google) are required, ensuring maximum privacy and zero recurring costs.

✨ Key Features

100% Local Intelligence: Powered by local Deep Learning models for retrieval, re-ranking, and text generation.

Advanced RAG Pipeline: Implements a sophisticated Retrieve -> Re-rank -> Generate architecture to ensure high-accuracy answers.

Multilingual Support: Automatically detects the user's language and translates answers (supports English, Hindi, Gujarati, etc.).

Admin Dashboard: Built-in interface to upload PDFs and trigger model retraining instantly with real-time log streaming.

Source Citations: Every answer links back to the specific source document and page number for verification.

🛠️ Tech Stack

Frontend

React.js: Modern, responsive user interface.

CSS: Custom styling with animations and responsive design.

Backend

Node.js & Express: Serves as a secure proxy, handles file uploads, and serves static assets.

AI Service (The Brain)

Rasa Open Source: Handles conversation flow and NLU (Intent Recognition).

Python (FastAPI): Handles asynchronous admin tasks and model retraining.

LangChain & FAISS: Vector database management for efficient document retrieval.

Hugging Face Transformers (Local Models):

Retrieval: paraphrase-xlm-r-multilingual-v1 (Bi-Encoder)

Re-ranking: cross-encoder/ms-marco-MiniLM-L-6-v2 (Cross-Encoder)

Generation: sshleifer/distilbart-cnn-12-6 (Summarization)

🧠 System Architecture

The system follows a microservices architecture, ensuring modularity and scalability.

graph TD
    User[User (Browser)] <-->|React UI| Frontend
    Frontend <-->|REST API| Backend[Node.js Proxy]
    Backend <-->|Admin API| AdminServer[Admin Server (Python/FastAPI)]
    Backend <-->|Conversational API| RasaNLU[Rasa NLU Server]
    RasaNLU <-->|Action Request| RasaActions[Action Server (RAG Pipeline)]
    RasaActions <-->|Similarity Search| VectorDB[(FAISS Vector Store)]
    RasaActions <-->|Local Inference| LocalModels[Hugging Face Models]


💻 How to Run Locally

This system uses a microservices architecture. You will need to run 5 separate terminals to start the complete system.

Prerequisites

Node.js & npm

Python 3.8+

Git

1. Clone the Repository

git clone [https://github.com/shivam1002modi/language-agnostic-chatbot.git](https://github.com/shivam1002modi/language-agnostic-chatbot.git)
cd language-agnostic-chatbot


2. Setup AI Environment

Open a terminal in the ai-service folder to install Python dependencies.

cd ai-service
python -m venv venv
.\venv\Scripts\activate  # Windows
# source venv/bin/activate # Mac/Linux
pip install -r requirements.txt


3. Start the Servers (5 Terminals)

Run each command block in a separate terminal window.

Terminal 1: Frontend (UI)

cd frontend

npm install

npm start

# Runs on http://localhost:3000



Terminal 2: Backend (API Proxy)

cd backend

npm install

node server.js

# Runs on http://localhost:5001



Terminal 3: AI Admin Server


cd ai-service

.\venv\Scripts\activate

python admin_server.py

# Runs on http://localhost:8000



Terminal 4: Rasa Action Server (RAG Pipeline)


cd ai-service

.\venv\Scripts\activate

rasa run actions

# Runs on http://localhost:5055



Terminal 5: Rasa NLU Server


cd ai-service

.\venv\Scripts\activate

rasa run --enable-api --cors "*"

# Runs on http://localhost:5005


