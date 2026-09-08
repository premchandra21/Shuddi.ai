from contextlib import asynccontextmanager

from fastapi import FastAPI
from dotenv import load_dotenv

load_dotenv()  # loads .env before app.config reads GOOGLE_API_KEY

from app.config import QWEN_MODEL_NAME, USE_GEMINI_VERIFICATION  # noqa: E402
from app.services.model_registry import registry  # noqa: E402
from app.services.verification_chains import build_verification_router  # noqa: E402
from app.services.rubric_chain import build_rubric_chain  # noqa: E402
from app.routers import rubric, verify  # noqa: E402


@asynccontextmanager
async def lifespan(app: FastAPI):
    # ---- Startup: load everything ONCE ----
    if USE_GEMINI_VERIFICATION:
        # Bypass mode: don't touch torch/transformers/bitsandbytes or a GPU at
        # all. Set USE_GEMINI_VERIFICATION=false (or unset it) on a GPU box to
        # go back to loading Qwen exactly as before -- nothing below is deleted.
        print("USE_GEMINI_VERIFICATION=true -> skipping Qwen2.5-VL load, verification will call Gemini instead.")
        registry["model"] = None
        registry["processor"] = None
    else:
        import torch
        from transformers import Qwen2_5_VLForConditionalGeneration, AutoProcessor, BitsAndBytesConfig

        print("Loading Qwen2.5-VL model...")
        bnb_config = BitsAndBytesConfig(load_in_4bit=True, bnb_4bit_compute_dtype=torch.float16)
        registry["model"] = Qwen2_5_VLForConditionalGeneration.from_pretrained(
            QWEN_MODEL_NAME,
            quantization_config=bnb_config,
            device_map={"": 0},  # force GPU, fail loudly instead of silent CPU fallback
        )
        registry["processor"] = AutoProcessor.from_pretrained(QWEN_MODEL_NAME)
        print("Model device:", next(registry["model"].parameters()).device)

    # TEXT_ONLY verification now goes through Gemini (structured output) instead
    # of sentence-transformer cosine similarity, so the embeddings model is no
    # longer needed at all -- nothing loads it anymore.
    registry["embeddings"] = None

    print("Building verification chains...")
    registry["verification_router"] = build_verification_router()

    print("Building rubric generation chain (Gemini)...")
    registry["rubric_chain"] = build_rubric_chain()

    print("Startup complete.")
    yield
    # ---- Shutdown: nothing to clean up explicitly; process exit frees GPU memory ----


app = FastAPI(title="Task Verification API", lifespan=lifespan)

app.include_router(rubric.router)
app.include_router(verify.router)


@app.get("/health")
async def health():
    model = registry["model"]
    return {
        "status": "ok",
        "verification_backend": "gemini" if USE_GEMINI_VERIFICATION else "qwen-local",
        "model_loaded": True if USE_GEMINI_VERIFICATION else model is not None,
        "device": str(next(model.parameters()).device) if model is not None else None,
    }