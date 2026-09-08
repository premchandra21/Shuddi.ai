from typing import List, Literal, Optional
from pydantic import BaseModel, Field, model_validator


# ---------- Rubric generation ----------

class RubricGenerateRequest(BaseModel):
    title: str
    description: str
    type: Literal["IMAGE_TEXT", "BEFORE_AFTER", "TEXT_ONLY"]


class Rubric(BaseModel):
    criteria: List[str] = Field(
        description="List of specific checkable conditions the evidence must satisfy"
    )
    criteria_text: str = Field(
        description="Single paragraph summarizing all criteria, used for text-similarity matching"
    )


# ---------- Verification ----------

class VerifyRequest(BaseModel):
    verificationType: Literal["IMAGE_TEXT", "BEFORE_AFTER", "TEXT_ONLY"]

    # rubric text you fetched back from your DB (use Rubric.criteria_text)
    rubric: str

    # IMAGE_TEXT fields
    image_path: Optional[str] = None
    user_text: Optional[str] = None

    # BEFORE_AFTER fields
    image_before: Optional[str] = None
    image_after: Optional[str] = None

    @model_validator(mode="after")
    def check_required_fields(self):
        if self.verificationType == "IMAGE_TEXT" and not self.image_path:
            raise ValueError("image_path is required for IMAGE_TEXT verification")
        if self.verificationType == "BEFORE_AFTER" and not (self.image_before and self.image_after):
            raise ValueError("image_before and image_after are required for BEFORE_AFTER verification")
        if self.verificationType == "TEXT_ONLY" and not self.user_text:
            raise ValueError("user_text is required for TEXT_ONLY verification")
        return self


class VerifyResponse(BaseModel):
    confidence_score: int = Field(ge=0, le=100)
    reasoning: str = Field(
        default="",
        description="Human-readable explanation of the score, shown to the user when a submission is rejected.",
    )


# ---------- Internal: shared LLM verification output shape ----------
# Used for the structured-output call to Gemini (TEXT_ONLY path) and as the
# target shape the IMAGE_TEXT / BEFORE_AFTER prompts are asked to return as
# JSON. Kept separate from VerifyResponse so the API's public field name
# (confidence_score) doesn't have to match the LLM's output field (score).

class VerificationResult(BaseModel):
    score: int = Field(ge=0, le=100, description="0-100 score for how well the evidence satisfies the rubric")
    reasoning: str = Field(
        description=(
            "Specific, concrete explanation for the score, written in plain language for the "
            "end user. If the score is low, state exactly what was missing or didn't match the "
            "rubric. If the score is high, state what the submission got right. Never just "
            "restate the score itself as the reasoning."
        )
    )