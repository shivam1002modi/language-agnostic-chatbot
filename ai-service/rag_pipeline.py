# ai-service/rag_pipeline.py
import os
import sys
import shutil
from pathlib import Path
import traceback

from langchain_community.document_loaders import PyPDFDirectoryLoader
from langchain.text_splitter import RecursiveCharacterTextSplitter
from langchain_community.embeddings import HuggingFaceEmbeddings
from langchain_community.vectorstores import FAISS
import torch

def print_flush(*args, **kwargs):
    print(*args, **kwargs)
    sys.stdout.flush()

# Paths relative to this file
script_dir = os.path.dirname(__file__)
DOCUMENTS_PATH = os.path.join(script_dir, "documents")
PDFS_PATH = os.path.join(DOCUMENTS_PATH, "pdfs")
DB_FAISS_PATH = os.path.join(DOCUMENTS_PATH, "vectorstore")

def create_vector_db():
    """Loads PDFs, splits them into chunks, and creates a FAISS vector store with metadata."""
    print_flush("\n--- Starting RAG pipeline ---")
    try:
        # Remove the old vector store if it exists
        if os.path.exists(DB_FAISS_PATH):
            print_flush(f"Removing old vector store at {DB_FAISS_PATH}...")
            shutil.rmtree(DB_FAISS_PATH)

        # Ensure PDFs folder exists and has files
        if not os.path.exists(PDFS_PATH) or not os.listdir(PDFS_PATH):
            print_flush("WARNING: The 'pdfs' directory is either missing or empty.")
            print_flush("--- RAG pipeline finished: No new vector store created. ---")
            sys.exit(0)

        print_flush(f"Loading PDFs from: {PDFS_PATH}")
        loader = PyPDFDirectoryLoader(PDFS_PATH)
        documents = loader.load()

        if not documents:
            print_flush("WARNING: No documents were found in the 'pdfs' folder.")
            print_flush("--- RAG pipeline finished: No new vector store created. ---")
            return

        print_flush(f"Successfully loaded content from {len(documents)} pages (loader output).")

        # Ensure metadata contains 'source' (filename) and 'page' when possible.
        normalized_docs = []
        for doc in documents:
            # The loader typically sets doc.metadata['source'] to the filepath.
            metadata = doc.metadata or {}
            # Derive nice source filename
            source = metadata.get('source') or metadata.get('filename') or getattr(doc, "source", None)
            if source:
                source_name = os.path.basename(str(source))
            else:
                source_name = "unknown.pdf"

            # Try to capture page info - loaders sometimes include 'page'
            page = metadata.get("page") or metadata.get("page_number") or metadata.get("pageno")
            # Update metadata in-place
            metadata["source"] = source_name
            if page:
                metadata["page"] = page
            doc.metadata = metadata
            normalized_docs.append(doc)

        print_flush("Splitting documents into smaller text chunks...")
        text_splitter = RecursiveCharacterTextSplitter(chunk_size=500, chunk_overlap=50)
        chunks = text_splitter.split_documents(normalized_docs)
        print_flush(f"Created {len(chunks)} text chunks.")

        print_flush("Loading multilingual embeddings model (this may take a moment)...")
        device = 'cuda' if torch.cuda.is_available() else 'cpu'
        embeddings = HuggingFaceEmbeddings(
            model_name="paraphrase-xlm-r-multilingual-v1",
            model_kwargs={'device': device}
        )

        print_flush("Creating and saving new FAISS vector store...")
        db = FAISS.from_documents(chunks, embeddings)
        db.save_local(DB_FAISS_PATH)
        print_flush(f"--- Vector store created successfully at {DB_FAISS_PATH} ---")

    except Exception as e:
        print_flush("\n--- AN ERROR OCCURRED ---")
        print_flush("Error during RAG pipeline execution:", e)
        traceback.print_exc()
        sys.exit(1)

if __name__ == "__main__":
    create_vector_db()
