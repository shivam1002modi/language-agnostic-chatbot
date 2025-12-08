# ai-service/admin_server.py
import os
import sys
import asyncio
from fastapi import FastAPI
from fastapi.responses import StreamingResponse
import uvicorn

app = FastAPI()
# Get the directory where this script is located
script_dir = os.path.dirname(__file__)
# Define the path to the retraining batch script
script_path = os.path.join(script_dir, "retrain.bat")

async def stream_subprocess_output(stream, queue):
    """Reads lines from a stream and puts them into an async queue."""
    while True:
        line = await stream.readline()
        if not line:
            break
        await queue.put(line)

async def run_retraining():
    """
    A robust method to run the retraining script and stream its stdout and stderr
    to the client without race conditions.
    """
    if not os.path.exists(script_path):
        yield b"ERROR: retrain.bat script not found in the ai-service directory.\n"
        return

    # Create a queue to merge stdout and stderr while maintaining order
    queue = asyncio.Queue()

    # Start the subprocess using cmd.exe to run the .bat file
    process = await asyncio.create_subprocess_exec(
        'cmd.exe', '/c', script_path,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
        cwd=script_dir  # Ensure the script runs in its own directory
    )

    # Start two concurrent tasks to read from stdout and stderr
    stdout_reader = asyncio.create_task(stream_subprocess_output(process.stdout, queue))
    stderr_reader = asyncio.create_task(stream_subprocess_output(process.stderr, queue))

    # Main loop to yield lines from the queue as they arrive
    while not (stdout_reader.done() and stderr_reader.done() and queue.empty()):
        try:
            # Wait for a line to appear in the queue, with a short timeout
            line = await asyncio.wait_for(queue.get(), timeout=0.1)
            yield line
        except asyncio.TimeoutError:
            # If the queue is empty but readers are not done, continue waiting
            continue
    
    # Wait for the subprocess to fully complete
    await process.wait()
    
    # Ensure any final cleanup is done on the reader tasks
    await asyncio.gather(stdout_reader, stderr_reader)

    yield b"\n--- Retraining process finished ---\n"


@app.post("/retrain")
async def trigger_retraining():
    """Endpoint to trigger the retraining process and stream logs."""
    return StreamingResponse(run_retraining(), media_type="text/plain")


if __name__ == "__main__":
    # Standard entry point to run the server with uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)

