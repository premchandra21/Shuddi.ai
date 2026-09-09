import base64
import json
import mimetypes
import re

import requests
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.runnables import Runnable, RunnableLambda, RunnableBranch
from langchain_google_genai import ChatGoogleGenerativeAI

from app.config import USE_GEMINI_VERIFICATION, GEMINI_VISION_MODEL_NAME, GEMINI_MODEL_NAME
from app.schemas import VerifyResponse, VerificationResult
from app.services.model_registry import registry


class QwenVLRunnable(Runnable):
    """Wraps the local Qwen2.5-VL model so it behaves like a LangChain Runnable.
    Identical logic to the notebook version -- text-only and image inputs both go
    through the same code path so process_vision_info handles the empty-image case.

    Still used whenever USE_GEMINI_VERIFICATION is false/unset. The prompt it's
    fed now asks for a JSON {"score", "reasoning"} object instead of a bare
    integer (see build_image_text_input / build_before_after_input below), so
    max_tokens needs enough headroom for a sentence or two of reasoning.

    NOTE: the torch and qwen_vl_utils imports are done lazily inside invoke()
    (rather than at module level) so this file -- and the whole app -- can
    still be imported and run in Gemini-only mode on a host where torch /
    qwen-vl-utils / transformers / bitsandbytes aren't installed at all.
    """

    def invoke(self, input: dict, config=None):
        import torch
        from qwen_vl_utils import process_vision_info

        model = registry["model"]
        processor = registry["processor"]

        image_paths = input.get("images", [])
        prompt_text = input["prompt"]
        max_tokens = input.get("max_tokens", 300)

        messages = [
            {"role": "system", "content": "You are a helpful assistant that outputs strictly valid JSON."}
        ]

        if image_paths:
            content = [{"type": "image", "image": p} for p in image_paths]
            content.append({"type": "text", "text": prompt_text})
            messages.append({"role": "user", "content": content})
            image_inputs, video_inputs = process_vision_info(messages)
        else:
            messages.append({"role": "user", "content": prompt_text})
            image_inputs, video_inputs = None, None

        text = processor.apply_chat_template(
            messages, tokenize=False, add_generation_prompt=True
        )

        inputs = processor(
            text=[text],
            images=image_inputs,
            videos=video_inputs,
            padding=True,
            return_tensors="pt",
        ).to(model.device)

        with torch.no_grad():
            output_ids = model.generate(**inputs, max_new_tokens=max_tokens, do_sample=False)

        generated_ids = output_ids[:, inputs.input_ids.shape[1]:]
        return processor.batch_decode(
            generated_ids, skip_special_tokens=True, clean_up_tokenization_spaces=True
        )[0]


class GeminiVLRunnable(Runnable):
    """Drop-in replacement for QwenVLRunnable with the SAME invoke() contract:
    a dict with 'images' (a list of URLs -- evidenceUrls are already URLs from
    the file storage service, not local paths), 'prompt', and 'max_tokens'.

    Because the contract matches, build_verification_router() below can swap
    this in for QwenVLRunnable without touching build_image_text_input,
    build_before_after_input, or extract_score_and_reasoning at all.

    Used only when USE_GEMINI_VERIFICATION=true.
    """

    def __init__(self):
        self._llm = ChatGoogleGenerativeAI(model=GEMINI_VISION_MODEL_NAME, temperature=0)

    @staticmethod
    def _url_to_data_url(url: str) -> str:
        resp = requests.get(url, timeout=30)
        resp.raise_for_status()
        mime = resp.headers.get("Content-Type") or mimetypes.guess_type(url)[0] or "image/jpeg"
        b64 = base64.b64encode(resp.content).decode("utf-8")
        return f"data:{mime};base64,{b64}"

    def invoke(self, input: dict, config=None):
        image_urls = input.get("images", [])
        prompt_text = input["prompt"]
        max_tokens = input.get("max_tokens", 300)

        content = [{"type": "text", "text": prompt_text}]
        for url in image_urls:
            content.append({"type": "image_url", "image_url": self._url_to_data_url(url)})

        messages = [
            ("system", "You are a helpful assistant that outputs strictly valid JSON."),
            ("user", content),
        ]

        response = self._llm.bind(max_output_tokens=max_tokens).invoke(messages)
        return response.content


def extract_score_and_reasoning(raw_text: str) -> VerifyResponse:
    """Parses the {"score": int, "reasoning": str} JSON both VLM runnables are
    prompted to return. Falls back gracefully if a model ignores the format
    instruction (mainly a concern for the local Qwen model, which -- unlike
    Gemini's structured-output path used for TEXT_ONLY -- isn't guaranteed to
    emit valid JSON) so a rejection is never shown to the user with no reason
    at all.
    """
    text = (raw_text or "").strip()
    # Strip markdown code fences some models still add despite instructions.
    text = re.sub(r"^```(?:json)?\s*|\s*```$", "", text, flags=re.IGNORECASE).strip()

    score = 0
    reasoning = ""
    try:
        data = json.loads(text)
        score = int(data.get("score", 0))
        reasoning = str(data.get("reasoning", "")).strip()
    except (json.JSONDecodeError, ValueError, TypeError, AttributeError):
        # Model didn't return valid JSON -- pull a plausible score out of the
        # raw text and fall back to the raw text itself as the reasoning
        # rather than losing the explanation entirely.
        match = re.search(r"\d{1,3}", text)
        score = int(match.group()) if match else 0
        reasoning = text[:400]

    score = max(0, min(100, score))
    if not reasoning:
        reasoning = "The verification model did not return a specific reason for this score."

    return VerifyResponse(confidence_score=score, reasoning=reasoning)


def build_image_text_input(data: dict) -> dict:
    prompt = f"""You are a task verification assistant for a civic/environmental app.
Rubric: {data['rubric']}
User's description: {data.get('user_text', 'N/A')}

Look at the image and judge how well it satisfies the rubric.

Respond with ONLY a JSON object in exactly this format, no markdown fences, no extra text:
{{"score": <integer 0-100>, "reasoning": "<one or two sentences, in plain language, explaining exactly why you gave this score -- if the image doesn't satisfy the rubric, say specifically what's missing or wrong>"}}"""
    return {"images": [data["image_path"]], "prompt": prompt, "max_tokens": 300}


def build_before_after_input(data: dict) -> dict:
    prompt = f"""You are a task verification assistant for a civic/environmental app.
Rubric: {data['rubric']}
You are given a BEFORE image and an AFTER image. Judge how well the change satisfies the rubric.

Respond with ONLY a JSON object in exactly this format, no markdown fences, no extra text:
{{"score": <integer 0-100>, "reasoning": "<one or two sentences, in plain language, explaining exactly why you gave this score -- if the change doesn't satisfy the rubric, say specifically what's missing or wrong>"}}"""
    return {"images": [data["image_before"], data["image_after"]], "prompt": prompt, "max_tokens": 300}


def build_text_only_chain() -> RunnableLambda:
    """TEXT_ONLY verification, backed by Gemini instead of sentence-transformer
    cosine similarity. Uses structured output (rather than the JSON-in-prompt
    approach the VLM chains use) since this is a pure text call to Gemini and
    structured output is reliable there -- no manual parsing/fallback needed.
    """
    llm = ChatGoogleGenerativeAI(model=GEMINI_MODEL_NAME, temperature=0)
    structured_llm = llm.with_structured_output(VerificationResult)

    prompt = ChatPromptTemplate.from_messages([
        (
            "system",
            "You are a strict but fair task-verification assistant for a civic/environmental "
            "app. You are given a rubric describing what a user needed to do or report, and "
            "the user's submitted text. Score from 0 (does not satisfy the rubric at all) to "
            "100 (fully satisfies it) how well the submission satisfies the rubric. Always give "
            "a specific, concrete reason for the score in plain language a non-technical user "
            "can understand: if the score is low, say exactly what is missing, vague, or "
            "inconsistent with the rubric; if the score is high, say what the submission got "
            "right. Never just restate the score as the reasoning.",
        ),
        (
            "user",
            "Rubric (what the user needed to do):\n{rubric}\n\n"
            "User's submitted response:\n{user_text}",
        ),
    ])

    chain = prompt | structured_llm

    def _invoke(data: dict) -> VerifyResponse:
        result: VerificationResult = chain.invoke(
            {"rubric": data["rubric"], "user_text": data.get("user_text") or ""}
        )
        score = max(0, min(100, result.score))
        reasoning = result.reasoning.strip() or "The verification model did not return a specific reason for this score."
        return VerifyResponse(confidence_score=score, reasoning=reasoning)

    return RunnableLambda(_invoke)


def build_verification_router() -> RunnableBranch:
    """Called once at startup. Picks which VLM runnable backs the
    IMAGE_TEXT / BEFORE_AFTER chains based on USE_GEMINI_VERIFICATION --
    everything downstream (input builders, score/reasoning parser, branch
    logic) is identical either way. TEXT_ONLY always goes through Gemini now
    (see build_text_only_chain), regardless of USE_GEMINI_VERIFICATION.
    """
    vlm_runnable = GeminiVLRunnable() if USE_GEMINI_VERIFICATION else QwenVLRunnable()
    score_parser = RunnableLambda(extract_score_and_reasoning)

    image_text_input = RunnableLambda(build_image_text_input)
    before_after_input = RunnableLambda(build_before_after_input)

    image_text_chain = image_text_input | vlm_runnable | score_parser
    before_after_chain = before_after_input | vlm_runnable | score_parser
    text_only_chain = build_text_only_chain()

    return RunnableBranch(
        (lambda x: x["verificationType"] == "IMAGE_TEXT", image_text_chain),
        (lambda x: x["verificationType"] == "BEFORE_AFTER", before_after_chain),
        text_only_chain,  # default = TEXT_ONLY
    )