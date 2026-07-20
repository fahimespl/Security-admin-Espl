FROM python:3.10-slim

# Install system dependencies needed for compiling dlib, face_recognition, and running OpenCV
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    cmake \
    libopenblas-dev \
    liblapack-dev \
    libx11-dev \
    libgl1 \
    libglx-mesa0 \
    libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Limit parallel compilation jobs to 1 to prevent OOM during dlib build
# dlib compiles thousands of C++ files — parallel jobs easily exhaust 8GB RAM
ENV CMAKE_BUILD_PARALLEL_LEVEL=1
ENV MAKEFLAGS="-j1"

# Copy requirements and install dependencies
COPY requirements.txt .

# Install dlib first in isolation with single-threaded build
RUN pip install --no-cache-dir --upgrade pip
RUN pip install --no-cache-dir "dlib==19.24.6"
RUN pip install --no-cache-dir -r requirements.txt

# Copy backend codebase
COPY . .

# Set dynamic port for Railway/Render compatibility
ENV PORT=8000
EXPOSE 8000

CMD ["sh", "-c", "uvicorn main:app --host 0.0.0.0 --port ${PORT}"]
