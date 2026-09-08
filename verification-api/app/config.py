import os

# Load from environment variables. Set these in your shell or a .env file
# loaded by python-dotenv (see main.py) before starting the app.
GOOGLE_API_KEY = os.environ.get("GOOGLE_API_KEY", "")
QWEN_MODEL_NAME = os.environ.get("QWEN_MODEL_NAME", "Qwen/Qwen2.5-VL-3B-Instruct")
GEMINI_MODEL_NAME = os.environ.get("GEMINI_MODEL_NAME", "gemini-3.6-flash")

# --- Qwen -> Gemini bypass switch ---
# When true, the IMAGE_TEXT / BEFORE_AFTER verification chains call Gemini
# instead of the local Qwen2.5-VL model, and main.py skips loading Qwen
# (torch/transformers/bitsandbytes) at startup entirely. None of the Qwen
# code is deleted -- flip this back to false/unset on a GPU box and the
# original local-model pipeline runs exactly as before.
USE_GEMINI_VERIFICATION = os.environ.get("USE_GEMINI_VERIFICATION", "false").strip().lower() in ("1", "true", "yes")

# Vision-capable Gemini model used for verification when USE_GEMINI_VERIFICATION=true.
# Defaults to the same model used for rubric generation (gemini-2.5-flash is multimodal),
# but can be overridden independently if you want a different model for each job.
GEMINI_VISION_MODEL_NAME = os.environ.get("GEMINI_VISION_MODEL_NAME", GEMINI_MODEL_NAME)

if not GOOGLE_API_KEY:
    raise RuntimeError(
        "GOOGLE_API_KEY is not set. Export it as an environment variable "
        "or put it in a .env file before starting the server."
    )