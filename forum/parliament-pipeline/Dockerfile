FROM python:3.11-slim

# System dependencies for faster-whisper and audio processing
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY . .

# Create media storage directory
RUN mkdir -p /tmp/parliament-media

# Expose port for FastAPI
EXPOSE 8000

# Default command runs the FastAPI server
# Workers are started separately via docker-compose or Railway service
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
