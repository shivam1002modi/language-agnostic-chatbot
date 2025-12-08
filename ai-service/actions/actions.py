# ai-service/actions/actions.py
import os
import re
import time
from typing import Any, Text, Dict, List
from rasa_sdk import Action, Tracker
from rasa_sdk.executor import CollectingDispatcher

from langchain_community.embeddings import HuggingFaceEmbeddings
from langchain_community.vectorstores import FAISS

from langdetect import detect, LangDetectException
from transformers import pipeline
# Import the CrossEncoder model for re-ranking
from sentence_transformers.cross_encoder import CrossEncoder
import torch
import traceback

# --- Configuration ---
BACKEND_URL = os.getenv("BACKEND_URL", "http://localhost:5001")
DB_FAISS_PATH = os.path.join(os.path.dirname(__file__), "..", "documents", "vectorstore")
TRANSLATION_MODEL_MAP = {
    'hi': 'Helsinki-NLP/opus-mt-en-hi',
}
# Confidence score threshold for the re-ranker. If the best document is below this,
# we conclude that we don't have a good enough answer.
CONFIDENCE_THRESHOLD = 0.1

def clean_text(text: str) -> str:
    """
    Cleans up text extracted from a PDF by removing excessive whitespace and line breaks.
    """
    if not text:
        return ""
    text = re.sub(r'\s+', ' ', text)
    return text.strip()

def is_translation_garbled(text: str) -> bool:
    """A simple heuristic to detect garbled or nonsensical translations."""
    if not text:
        return True
    if re.search(r'([A-Z]{2,})(\1{5,})', text, re.IGNORECASE):
        print("--- Gibberish Detected: Repetitive pattern found.")
        return True
    if text.strip().lower() in ['null', 'none', 'n/a', '']:
        return True
    return False

class ActionQueryDoc(Action):
    def __init__(self):
        super().__init__()
        self.device = 'cuda' if torch.cuda.is_available() else 'cpu'
        print(f"--- Using device: {self.device.upper()} ---")

        try:
            self.embeddings = HuggingFaceEmbeddings(
                model_name="paraphrase-xlm-r-multilingual-v1",
                model_kwargs={'device': self.device}
            )
        except Exception as e:
            print("FATAL: Could not initialize HuggingFaceEmbeddings model:", e)
            self.embeddings = None

        try:
            if os.path.exists(DB_FAISS_PATH):
                print(f"Loading FAISS vector store from: {DB_FAISS_PATH}")
                self.db = FAISS.load_local(DB_FAISS_PATH, self.embeddings, allow_dangerous_deserialization=True)
                print("Vector store loaded successfully.")
            else:
                print("WARNING: Vector store not found. The bot cannot answer document questions until it's retrained.")
                self.db = None
        except Exception as e:
            print("FATAL: Failed to load FAISS vector store:", e)
            traceback.print_exc()
            self.db = None

        # Initialize a Cross-Encoder for re-ranking search results
        try:
            print("Loading local Re-ranking model (Cross-Encoder)...")
            self.reranker = CrossEncoder('cross-encoder/ms-marco-MiniLM-L-6-v2', device=self.device)
            print("Re-ranking model loaded successfully.")
        except Exception as e:
            print(f"WARNING: Could not load local Re-ranking model: {e}.")
            self.reranker = None

        try:
            print("Loading local summarization model...")
            device_id = 0 if self.device == 'cuda' else -1
            self.summarizer = pipeline("summarization", model="sshleifer/distilbart-cnn-12-6", device=device_id)
            print("Summarization model loaded successfully.")
        except Exception as e:
            print(f"WARNING: Could not load local summarization model: {e}. Will fall back to direct text retrieval.")
            self.summarizer = None

        self.translator_cache = {}
        print("ActionQueryDoc initialized successfully (Pro Mode).")

    def name(self) -> Text:
        return "action_query_doc"

    def run(self, dispatcher: CollectingDispatcher, tracker: Tracker, domain: Dict[Text, Any]) -> List[Dict[Text, Any]]:
        original_query = tracker.latest_message.get("text", "").strip()
        print(f"\n--- New Request Received ---\nOriginal Query: '{original_query}'")

        if not self.db:
            dispatcher.utter_message(text="Sorry, the AI's knowledge base is currently unavailable. Please ask an administrator to check the system.")
            return []

        try:
            lang = detect(original_query) if original_query else 'en'
        except Exception:
            lang = 'en'
        print(f"Detected language: '{lang}'")

        # --- UPGRADED RAG PIPELINE ---
        # 1. RETRIEVE: Get a wide pool of potential documents (k=10)
        try:
            retrieved_docs = self.db.similarity_search(original_query, k=10)
        except Exception as e:
            print(f"ERROR: Document similarity_search failed: {e}")
            retrieved_docs = []

        if not retrieved_docs:
            dispatcher.utter_message(text="Sorry, I couldn't find any information related to your question.")
            return []

        # 2. RE-RANK: Use the Cross-Encoder for more accurate relevance scoring.
        if self.reranker:
            passages = [doc.page_content for doc in retrieved_docs]
            rerank_scores = self.reranker.predict([(original_query, passage) for passage in passages])
            
            scored_docs = list(zip(rerank_scores, retrieved_docs))
            scored_docs.sort(key=lambda x: x[0], reverse=True)
            
            top_score = scored_docs[0][0]
            if top_score < CONFIDENCE_THRESHOLD:
                dispatcher.utter_message(text="I found some documents, but I'm not confident they contain the right answer for your question.")
                return []
            
            final_docs = [doc for score, doc in scored_docs[:3]]
            best_doc = final_docs[0]
            print(f"Re-ranked top document score: {top_score:.4f}")
        else:
            final_docs = retrieved_docs[:3]
            best_doc = final_docs[0]

        # 3. GENERATE: Create the answer using ONLY the single best document's context.
        focused_context = clean_text(best_doc.page_content)
        english_answer = ""
        
        if self.summarizer:
            try:
                input_for_model = f"Question: {original_query} \n\nContext: {focused_context} \n\nAnswer:"
                summary_output = self.summarizer(input_for_model, max_length=150, min_length=20, do_sample=False)
                english_answer = summary_output[0]['summary_text']
                print(f"Locally generated answer: '{english_answer[:100]}...'")
            except Exception as e:
                print(f"ERROR: Local generation failed: {e}. Falling back to direct text retrieval.")
                english_answer = focused_context
        else:
            english_answer = focused_context

        sources = []
        for i, doc in enumerate(final_docs):
            metadata = getattr(doc, "metadata", {})
            source_filename = metadata.get("source", "Unknown")
            page_no = metadata.get("page", 0) + 1
            sources.append({
                "source": os.path.basename(str(source_filename)),
                "page": page_no,
                "rank": i + 1,
            })
        print(f"DEBUG: Top source retrieved: {sources[0] if sources else 'N/A'}")

        final_answer = english_answer
        if lang in TRANSLATION_MODEL_MAP:
            try:
                model_name = TRANSLATION_MODEL_MAP[lang]
                if lang not in self.translator_cache:
                    print(f"Loading translator for '{lang}': {model_name}")
                    device_id = 0 if self.device == 'cuda' else -1
                    self.translator_cache[lang] = pipeline('translation', model=model_name, device=device_id)
                
                translator = self.translator_cache[lang]
                translated_output = translator(final_answer)
                translated_text = translated_output[0].get('translation_text')
                if translated_text and not is_translation_garbled(translated_text):
                    final_answer = translated_text
                    print(f"Translated Answer: '{final_answer[:100]}...'")
                else:
                    print("WARN: Translation appears garbled. Falling back to English.")
            except Exception as e:
                print("ERROR: Translation failed:", e)
                
        sources_info = []
        for src in sources:
            pdf_name = os.path.basename(src["source"])
            page_number = src.get("page", 1)
            sources_info.append({
                "title": pdf_name,
                "page": page_number,
                "url": f"{BACKEND_URL}/api/documents/{pdf_name}#page={page_number}"
            })

        answer_payload = {
            "text": final_answer,
            "sources": sources_info
        }
        
        dispatcher.utter_message(json_message=answer_payload)
        print("--- Response Sent to User ---")
        return []

