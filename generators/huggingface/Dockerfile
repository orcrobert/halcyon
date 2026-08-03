FROM pytorch/pytorch:2.1.2-cuda12.1-cudnn8-runtime

WORKDIR /app

ARG DEBIAN_FRONTEND=noninteractive
ENV TZ=Etc/UTC
ENV HF_HOME=/tmp/hf
ENV HF_HUB_CACHE=/tmp/hf
ENV TRANSFORMERS_CACHE=/tmp/hf
ENV XDG_CACHE_HOME=/tmp
ENV PYTHONUNBUFFERED=1
ENV PORT=7860

RUN apt-get update && apt-get install -y \
    git \
    ffmpeg \
    libsndfile1 \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
RUN pip install --no-cache-dir --no-deps git+https://github.com/facebookresearch/audiocraft.git

COPY . .

EXPOSE 7860
CMD ["python", "app.py"]
