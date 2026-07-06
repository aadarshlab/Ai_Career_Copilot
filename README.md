# 🚀 Student LaunchPad
AI-powered platform: Notes Explainer → Resume ATS → Mock Interview → Job Roadmap

Built with Python (Flask) + OpenRouter API

---

## 📁 Project Structure

```
launchpad/
├── server.py              ← Flask backend (main app)
├── .env                   ← Your API key goes here (NEVER share this)
├── .gitignore             ← Keeps .env safe from git
├── requirements.txt       ← Python dependencies
├── templates/
│   └── index.html         ← Main HTML page
├── static/
│   ├── css/style.css      ← All styles
│   └── js/app.js          ← Frontend logic
└── uploads/               ← Temporary file uploads (auto-created)
```

---

## ⚙️ Setup (Do this once)

### Step 1 — Install Python dependencies
Open terminal in VS Code (`Ctrl + ~`) and run:
```bash
pip install -r requirements.txt
```

### Step 2 — Add your API key
Open `.env` and replace the placeholder:
```
OPENROUTER_API_KEY=sk-or-v1-your-actual-key-here
```
Get a free key at: https://openrouter.ai/keys

### Step 3 — Run the app
```bash
python server.py
```

### Step 4 — Open in browser
Visit: http://localhost:5000

---

## 🎯 Features

| Feature | What it does |
|---|---|
| 📖 **Notes AI** | Upload .txt or paste notes → AI explains simply, quiz, cheatsheet |
| 📄 **Resume ATS** | Paste resume → ATS score (0-100) + detailed improvements |
| 🎙 **Mock Interview** | Role-based AI interview → real-time answers → performance report |
| 🗺 **Job Roadmap** | Pick any role → step-by-step learning path with resources |

---

## 🔁 Auto-reload during development
```bash
pip install nodemon   # if you want auto-reload
# OR just use Flask's built-in (already enabled via FLASK_DEBUG=True in .env)
python server.py
```

---

## 🔒 Security
- Your API key is stored ONLY in `.env` — it never goes to the frontend
- `.env` is in `.gitignore` — safe to use Git
- Uploads are stored temporarily and not persisted

---

## 🛠 Changing the default AI model
Edit `.env`:
```
DEFAULT_MODEL=openai/gpt-4o-mini
```
Or change it live using the dropdown in the top-right of the app.

Available models (via OpenRouter):
- `anthropic/claude-3.5-sonnet` (best quality)
- `anthropic/claude-3.5-haiku` (faster, cheaper)
- `openai/gpt-4o-mini` (fast + cheap)
- `openai/gpt-4o`
- `google/gemini-flash-1.5`
- `meta-llama/llama-3.1-70b-instruct` (free tier)
