@echo off
ECHO --- Starting Full Retraining Process ---

REM Activate the virtual environment
CALL .\venv\Scripts\activate.bat

ECHO.
ECHO --- Step 1 of 2: Re-building document knowledge base (RAG Pipeline)... ---
python -m rag_pipeline
IF %ERRORLEVEL% NEQ 0 (
    ECHO.
    ECHO !!! ERROR: RAG pipeline failed. Aborting retraining. !!!
    exit /b %ERRORLEVEL%
)

ECHO.
ECHO --- Step 2 of 2: Retraining Rasa NLU model... ---
python -m rasa train
IF %ERRORLEVEL% NEQ 0 (
    ECHO.
    ECHO !!! ERROR: Rasa training failed. !!!
    exit /b %ERRORLEVEL%
)

ECHO.
ECHO --- Full retraining process completed successfully! ---