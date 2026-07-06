import os
import json
import requests
from pathlib import Path
from flask import Flask, render_template, request, jsonify, Response, stream_with_context
from werkzeug.utils import secure_filename
from dotenv import load_dotenv

# ── Load .env — explicit path, works on Windows ──────────────────────────────
BASE_DIR = Path(__file__).resolve().parent
load_dotenv(dotenv_path=BASE_DIR / ".env", override=True)
app = Flask(__name__)
app.config['UPLOAD_FOLDER'] = 'uploads'
app.config['MAX_CONTENT_LENGTH'] = 5 * 1024 * 1024  # 5MB

os.makedirs("uploads", exist_ok=True)

# ── Config — all from .env, no model picker ──────────────────────────────────
API_KEY  = os.getenv("OPENROUTER_API_KEY", "")
MODEL    = "openai/gpt-4o-mini"  # free model, locked
API_URL  = "https://openrouter.ai/api/v1/chat/completions"
HEADERS  = lambda: {
    "Authorization": f"Bearer {API_KEY}",
    "Content-Type":  "application/json",
    "HTTP-Referer":  "http://localhost:5000",
    "X-Title":       "StudentLaunchPad"
}

# ── Streaming helper ─────────────────────────────────────────────────────────
def stream_ai(messages, max_tokens=2000):
    if not API_KEY:
        yield "data: ERROR:No API key found in .env\n\n"
        return
    payload = {"model": MODEL, "messages": messages,
                "stream": True, "max_tokens": max_tokens}
    try:
        with requests.post(API_URL, headers=HEADERS(), json=payload, stream=True, timeout=60) as resp:
            if resp.status_code != 200:
                try:    msg = resp.json().get("error", {}).get("message", f"HTTP {resp.status_code}")
                except: msg = f"HTTP {resp.status_code}"
                yield f"data: ERROR:{msg}\n\n"
                return
            for line in resp.iter_lines():
                if not line:
                    continue
                decoded = line.decode("utf-8")
                if not decoded.startswith("data: "):
                    continue
                raw = decoded[6:]
                if raw.strip() == "[DONE]":
                    yield "data: [DONE]\n\n"
                    return
                try:
                    chunk = json.loads(raw)
                    text  = chunk["choices"][0]["delta"].get("content", "")
                    if text:
                        yield f"data: {json.dumps({'text': text})}\n\n"
                except Exception:
                    pass
    except requests.exceptions.Timeout:
        yield "data: ERROR:Request timed out. Try again.\n\n"
    except Exception as e:
        yield f"data: ERROR:{str(e)}\n\n"


# ── Non-streaming helper ─────────────────────────────────────────────────────
def call_ai(messages, max_tokens=2000):
    if not API_KEY:
        raise Exception("No API key found in .env")
    payload = {"model": MODEL, "messages": messages, "max_tokens": max_tokens}
    resp = requests.post(API_URL, headers=HEADERS(), json=payload, timeout=60)
    data = resp.json()
    if resp.status_code != 200 or "choices" not in data:
        raise Exception(data.get("error", {}).get("message", f"API error {resp.status_code}"))
    return data["choices"][0]["message"]["content"]


# ── SSE response wrapper ─────────────────────────────────────────────────────
def sse(messages, max_tokens=2000):
    return Response(
        stream_with_context(stream_ai(messages, max_tokens)),
        mimetype="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"}
    )


# ════════════════════════════════════════════════════════════════════════════
# Page
# ════════════════════════════════════════════════════════════════════════════
@app.route("/")
def index():
    return render_template("index.html")


# ════════════════════════════════════════════════════════════════════════════
# 1. NOTES EXPLAINER
# ════════════════════════════════════════════════════════════════════════════
@app.route("/api/notes/explain", methods=["POST"])
def explain_notes():
    body  = request.json or {}
    notes = body.get("notes", "").strip()
    level = body.get("level", "a student").strip() or "a student"
    theme_prompt = body.get("theme_prompt", "Explain in simple clear bullet points.")

    if not notes:
        return jsonify({"error": "No notes provided"}), 400

    messages = [
        {"role": "system",
         "content": f"You are an expert tutor. {theme_prompt} Be encouraging and thorough."},
        {"role": "user",
         "content": f"Explain the following notes for {level}.\n\nInstruction: {theme_prompt}\n\nNotes:\n{notes}"}
    ]
    return sse(messages, max_tokens=2000)


@app.route("/api/notes/followup", methods=["POST"])
def notes_followup():
    body        = request.json or {}
    explanation = body.get("explanation", "")
    prompt      = body.get("prompt", "")

    messages = [
        {"role": "system",  "content": "You are an expert tutor."},
        {"role": "user",    "content": f"Explanation I received:\n{explanation}"},
        {"role": "assistant","content": "Understood."},
        {"role": "user",    "content": prompt}
    ]
    return sse(messages)


@app.route("/api/notes/upload", methods=["POST"])
def upload_notes():
    if "file" not in request.files:
        return jsonify({"error": "No file attached"}), 400
    f        = request.files["file"]
    filename = secure_filename(f.filename or "")
    if not filename:
        return jsonify({"error": "Empty filename"}), 400
    if not (filename.endswith(".txt") or filename.endswith(".md")):
        return jsonify({"error": "Only .txt or .md files allowed"}), 400
    content = f.read().decode("utf-8", errors="ignore")
    return jsonify({"content": content})


# ════════════════════════════════════════════════════════════════════════════
# 2. RESUME ATS SCORER
# ════════════════════════════════════════════════════════════════════════════
@app.route("/api/resume/score", methods=["POST"])
def score_resume():
    body   = request.json or {}
    resume = body.get("resume", "").strip()

    if not resume:
        return jsonify({"error": "No resume provided"}), 400

    messages = [
        {"role": "system",
         "content": "You are an expert ATS resume analyser and career coach. "
                    "Always start your response with SCORE: XX/100 on its own line."},
        {"role": "user",
         "content": f"""Analyse this resume for ATS compatibility:
1. Start EXACTLY with "SCORE: XX/100"
2. Strengths — 3 things working well
3. Critical Improvements — 5+ specific fixes
4. Missing Keywords / Sections
5. Formatting Issues
6. Rewrite Suggestions for weak bullet points

Resume:
{resume}"""}
    ]
    return sse(messages, max_tokens=2000)


# ════════════════════════════════════════════════════════════════════════════
# 3. MOCK INTERVIEW
# ════════════════════════════════════════════════════════════════════════════
@app.route("/api/interview/start", methods=["POST"])
def interview_start():
    body  = request.json or {}
    role  = body.get("role",  "Software Developer")
    level = body.get("level", "Fresher / Entry-level")

    messages = [
        {"role": "system",
         "content": (f"You are a professional interviewer for {role} positions targeting "
                     f"{level} candidates. Ask ONE question at a time. After each answer give "
                     "brief encouraging feedback (1-2 sentences), then ask the next question. "
                     "Ask 5-6 questions total: intro, technical, problem-solving, behavioural, "
                     "situational. After the final answer write INTERVIEW_COMPLETE followed by "
                     "a full structured performance summary with ratings.")},
        {"role": "user", "content": "Start the interview. Greet me warmly and ask the first question."}
    ]
    return sse(messages)


@app.route("/api/interview/reply", methods=["POST"])
def interview_reply():
    body    = request.json or {}
    history = body.get("history", [])
    return sse(history)


# ════════════════════════════════════════════════════════════════════════════
# 4. JOB ROADMAP
# ════════════════════════════════════════════════════════════════════════════
@app.route("/api/roadmap/generate", methods=["POST"])
def generate_roadmap():
    body = request.json or {}
    role = body.get("role", "").strip()

    if not role:
        return jsonify({"error": "No role provided"}), 400

    messages = [
        {"role": "system",
         "content": "You are a career coach expert. Generate detailed practical roadmaps in valid JSON."},
        {"role": "user",
         "content": f"""Create a complete roadmap to become a {role}.

Respond EXACTLY in this format:

STEPS_JSON:
[
  {{"step": 1, "title": "Step title", "desc": "What to learn/do in 2 sentences",
    "tags": ["Skill1", "Tool2"], "duration": "X weeks", "resources": ["Resource 1", "Resource 2"]}},
  ... 7-9 steps total ...
]
END_STEPS

TIPS:
5-6 practical paragraphs: free platforms, portfolio projects, GitHub, internships, resume tips, networking.
"""}
    ]

    try:
        response = call_ai(messages, max_tokens=2000)
        return jsonify({"response": response})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


# ════════════════════════════════════════════════════════════════════════════
# Run
# ════════════════════════════════════════════════════════════════════════════
if __name__ == "__main__":
    port  = int(os.getenv("FLASK_PORT",  5000))
    debug = os.getenv("FLASK_DEBUG", "True").lower() == "true"

    print("\n" + "="*50)
    print("  🚀 Student LaunchPad")
    print(f"  Open: http://localhost:{port}")
    print(f"  Model: {MODEL}")
    if not API_KEY:
        print("\n  ⚠️  WARNING: OPENROUTER_API_KEY not set in .env!")
    else:
        print(f"  ✅  APP is Ready to Use ")
    print("="*50 + "\n")

    app.run(
        debug=debug,
        port=port,
        exclude_patterns=["*.venv*", "*venv*", "*__pycache__*", "*.pyc"]
    )
