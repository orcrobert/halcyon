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

ARG HALCYON_REPO=github.com/orcrobert/halcyon
ARG HALCYON_REF=main

RUN --mount=type=secret,id=GH_TOKEN,mode=0444,required=false \
    CREDS="$([ -s /run/secrets/GH_TOKEN ] && echo "$(cat /run/secrets/GH_TOKEN)@")" \
    && pip install --no-cache-dir \
        "halcyon-generator[audiocraft] @ git+https://${CREDS}${HALCYON_REPO}@${HALCYON_REF}#subdirectory=generators/core"

RUN pip install --no-cache-dir --no-deps git+https://github.com/facebookresearch/audiocraft.git

COPY . .

EXPOSE 7860
CMD ["python", "app.py"]
