import os
import json
from google import genai


def get_client():
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        raise ValueError("GEMINI_API_KEY environment variable not set")
    return genai.Client(api_key=api_key)


CATEGORY_CRITERIA = {
    "Complex Puzzle": {
        "criteria": [
            "Logical Correctness (30%): Is the solution logically sound and does it arrive at the right answer?",
            "Problem Decomposition (25%): How well did the LLM break down the complex puzzle into manageable steps?",
            "Completeness (25%): Does the response address all parts of the puzzle?",
            "Clarity of Explanation (20%): Is the reasoning clear and easy to follow?",
        ],
    },
    "Math": {
        "criteria": [
            "Mathematical Accuracy (35%): Is the final answer correct?",
            "Step-by-Step Reasoning (25%): Are the intermediate steps shown and correct?",
            "Method Selection (20%): Was an appropriate mathematical approach chosen?",
            "Clarity & Notation (20%): Is the math well-formatted and clearly presented?",
        ],
    },
    "General Knowledge": {
        "criteria": [
            "Accuracy (30%): How factually correct is the response?",
            "Depth of Knowledge (25%): How thorough and detailed is the answer?",
            "Relevance (25%): How well does it address the specific question?",
            "Clarity & Coherence (20%): Is it well-structured and easy to understand?",
        ],
    },
}


async def judge_submission(challenge_prompt: str, response_text: str, team_name: str, category: str) -> dict:
    """
    Send submission to Gemini for scoring.
    Returns { "score": 0-100, "reasoning": "one-line explanation" }
    """
    criteria_info = CATEGORY_CRITERIA.get(category, CATEGORY_CRITERIA["General Knowledge"])
    criteria_text = "\n".join(f"- {c}" for c in criteria_info["criteria"])

    scoring_prompt = f"""You are an expert judge for the InferenceX LLM Battle Royale competition.

Round Category: {category}

The following challenge prompt was sent to a team's deployed LLM:
---
{challenge_prompt}
---

Team "{team_name}" LLM responded with:
---
{response_text}
---

Score this response on a scale of 0 to 100 based on these criteria:
{criteria_text}

You MUST respond with ONLY valid JSON in this exact format, no other text:
{{"score": <integer 0-100>, "reasoning": "<one concise sentence explaining the score>"}}"""

    try:
        client = get_client()
        response = client.models.generate_content(
            model="gemini-2.5-flash",
            contents=scoring_prompt,
        )

        text = response.text.strip()
        # Clean potential markdown wrapping
        if text.startswith("```"):
            text = text.split("\n", 1)[1] if "\n" in text else text[3:]
            if text.endswith("```"):
                text = text[:-3]
            text = text.strip()
        if text.startswith("json"):
            text = text[4:].strip()

        result = json.loads(text)
        score = max(0, min(100, int(result.get("score", 0))))
        reasoning = str(result.get("reasoning", "No reasoning provided"))

        return {"score": score, "reasoning": reasoning}

    except json.JSONDecodeError as e:
        print(f"[Gemini Judge] JSON parse error: {e}. Raw: {text[:200]}")
        return {"score": None, "reasoning": f"Judging error: could not parse response"}
    except Exception as e:
        print(f"[Gemini Judge] Error: {e}")
        return {"score": None, "reasoning": f"Judging error: {str(e)[:100]}"}
