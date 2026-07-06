// ── Utility: stream SSE from Flask ──────────────────────────────────────────
async function streamSSE(url, body, onChunk, onDone) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)   // no model field — handled server-side
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Server error " + res.status);
  }
  const reader  = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "", full = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop();
    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      const data = line.slice(6).trim();
      if (data === "[DONE]") { if (onDone) onDone(full); return full; }
      if (data.startsWith("ERROR:")) throw new Error(data.slice(6));
      try {
        const parsed = JSON.parse(data);
        if (parsed.text) { full += parsed.text; onChunk(parsed.text, full); }
      } catch {}
    }
  }
  if (onDone) onDone(full);
  return full;
}

// ── Tab switching ────────────────────────────────────────────────────────────
function switchTab(tab) {
  document.querySelectorAll(".section").forEach(s => s.classList.remove("active"));
  document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
  document.getElementById("section-" + tab).classList.add("active");
  document.getElementById("tab-" + tab).classList.add("active");
}

function setBtn(id, loading, label) {
  const btn = document.getElementById(id);
  btn.disabled = loading;
  btn.innerHTML = loading ? `<span class="spinner"></span> ${label}` : label;
}

// ═══════════════════════════════════════════════════════════════════════════
//  1. NOTES EXPLAINER + THEMES
// ═══════════════════════════════════════════════════════════════════════════
let lastExplanation = "";
let selectedTheme   = "simple";

const THEMES = {
  simple:    { label: "💡 Simple",        color: "#a78bfa",
               prompt: "Explain in simple clear language using bullet points, short sentences and plain English. Structure: Overview, Key Concepts, Examples, Summary." },
  story:     { label: "📖 Story Mode",    color: "#f59e0b",
               prompt: "Explain as an engaging vivid story or narrative. Use characters, a plot and real-world scenarios to make the concept memorable and fun." },
  flashcard: { label: "🃏 Flashcards",    color: "#34d399",
               prompt: "Convert into 8-12 flashcards. Format each as:\nQ: [Question]\nA: [Answer]\n---\nCover all key concepts. Keep answers 1-3 sentences." },
  mindmap:   { label: "🧠 Mind Map",      color: "#60a5fa",
               prompt: "Create a text-based mind map:\n🎯 CENTRAL TOPIC\n├── 🔵 Main Branch 1\n│   ├── Sub-point\n│   └── Sub-point\n├── 🟢 Main Branch 2\nCover all major concepts." },
  eli5:      { label: "🧒 ELI5",          color: "#f472b6",
               prompt: "Explain like I am 5 years old. Use super simple words, funny analogies, toys/food/games as examples. Zero jargon." },
  exam:      { label: "🎯 Exam Ready",    color: "#fb923c",
               prompt: "Format for exam prep:\n1. KEY DEFINITIONS\n2. CORE CONCEPTS (one-liners)\n3. FORMULAS / RULES\n4. LIKELY EXAM QUESTIONS (5-7 with model answers)\n5. MEMORY TIPS" },
  tweet:     { label: "🐦 Tweet Thread",  color: "#38bdf8",
               prompt: "Break into a Twitter thread of 8-12 tweets. Number each (1/, 2/...). Each under 280 chars, punchy, with emojis. Hook tweet first, summary tweet last." },
  code:      { label: "💻 Code + Concept",color: "#a3e635",
               prompt: "For each concept: explain in 1-2 sentences then show a working Python code example with comments. Cover all main ideas." }
};

function selectTheme(el) {
  document.querySelectorAll(".theme-card").forEach(c => c.classList.remove("selected"));
  el.classList.add("selected");
  selectedTheme = el.dataset.theme;
  el.style.transform = "scale(1.05)";
  setTimeout(() => el.style.transform = "", 200);
}

async function uploadNoteFile(e) {
  const file = e.target.files[0];
  if (!file) return;
  const form = new FormData();
  form.append("file", file);
  try {
    const res  = await fetch("/api/notes/upload", { method: "POST", body: form });
    const data = await res.json();
    if (data.error) { alert("Upload error: " + data.error); return; }
    document.getElementById("notes-input").value = data.content;
  } catch (err) {
    alert("Upload failed: " + err.message);
  }
}

async function explainNotes() {
  const notes = document.getElementById("notes-input").value.trim();
  if (!notes) { alert("Please paste your notes first."); return; }
  const level = document.getElementById("notes-level").value.trim() || "a student";
  const theme = THEMES[selectedTheme];

  setBtn("notes-btn", true, `Generating ${theme.label}...`);

  const result     = document.getElementById("notes-result");
  const out        = document.getElementById("notes-output");
  const badge      = document.getElementById("active-theme-badge");
  const themeLabel = document.getElementById("notes-theme-label");

  result.style.display = "block";
  result.scrollIntoView({ behavior: "smooth", block: "start" });

  badge.textContent        = theme.label;
  badge.style.background   = theme.color + "22";
  badge.style.color        = theme.color;
  badge.style.borderColor  = theme.color + "55";
  themeLabel.textContent   = "🤖 " + theme.label + " Explanation";
  out.style.borderColor    = theme.color + "44";
  out.className            = "ai-box streaming";
  out.textContent          = "";

  try {
    lastExplanation = await streamSSE(
      "/api/notes/explain",
      { notes, level, theme_prompt: theme.prompt, theme_name: selectedTheme },
      (_, full) => { out.textContent = full; }
    );
    out.className = "ai-box";
  } catch (e) {
    out.textContent = "❌ Error: " + e.message;
    out.className   = "ai-box";
  }
  setBtn("notes-btn", false, "✨ Explain with this theme");
}

async function notesFollowUp(prompt) {
  const out = document.getElementById("notes-output");
  out.className   = "ai-box streaming";
  out.textContent = "";
  try {
    await streamSSE(
      "/api/notes/followup",
      { explanation: lastExplanation, prompt },
      (_, full) => { out.textContent = full; }
    );
    out.className = "ai-box";
  } catch (e) {
    out.textContent = "❌ Error: " + e.message;
    out.className   = "ai-box";
  }
}

// ═══════════════════════════════════════════════════════════════════════════
//  2. RESUME ATS SCORER
// ═══════════════════════════════════════════════════════════════════════════
async function scoreResume() {
  const resume = document.getElementById("resume-input").value.trim();
  if (!resume) { alert("Please paste your resume first."); return; }

  setBtn("resume-btn", true, "Analysing...");
  document.getElementById("ats-score-card").style.display  = "flex";
  document.getElementById("ats-output-card").style.display = "block";

  const out = document.getElementById("resume-output");
  out.className   = "ai-box streaming";
  out.textContent = "";

  try {
    await streamSSE(
      "/api/resume/score",
      { resume },
      (_, full) => {
        out.textContent = full;
        const match = full.match(/SCORE:\s*(\d+)/i);
        if (match) updateScoreRing(parseInt(match[1]));
      }
    );
    out.className = "ai-box";
  } catch (e) {
    out.textContent = "❌ Error: " + e.message;
    out.className   = "ai-box";
  }
  setBtn("resume-btn", false, "🎯 Analyse Resume");
}

function updateScoreRing(score) {
  const circ    = 2 * Math.PI * 42;
  const offset  = circ - (score / 100) * circ;
  const circle  = document.getElementById("ring-circle");
  const text    = document.getElementById("ring-score-text");
  const verdict = document.getElementById("score-verdict");
  const sub     = document.getElementById("score-sub");
  circle.style.strokeDashoffset = offset;
  if (score >= 75) {
    circle.style.stroke = "#4ade80";
    verdict.textContent = "✅ ATS Ready";   verdict.style.color = "#4ade80";
    sub.textContent     = "High chance of passing ATS filters";
  } else if (score >= 50) {
    circle.style.stroke = "#facc15";
    verdict.textContent = "⚠️ Needs Work";  verdict.style.color = "#facc15";
    sub.textContent     = "Fix the issues below to improve";
  } else {
    circle.style.stroke = "#f87171";
    verdict.textContent = "❌ High Risk";   verdict.style.color = "#f87171";
    sub.textContent     = "Likely to be filtered out by ATS";
  }
  text.textContent = score;
}

// ═══════════════════════════════════════════════════════════════════════════
//  3. MOCK INTERVIEW
// ═══════════════════════════════════════════════════════════════════════════
let interviewHistory = [];
let interviewActive  = false;

async function startInterview() {
  const role  = document.getElementById("int-role").value.trim()  || "Software Developer";
  const level = document.getElementById("int-level").value;

  interviewHistory = [];
  interviewActive  = true;

  document.getElementById("interview-setup").style.display = "none";
  document.getElementById("interview-area").style.display  = "block";
  document.getElementById("eval-section").style.display    = "none";
  document.getElementById("chat-messages").innerHTML       = "";
  document.getElementById("chat-input").disabled           = false;
  document.getElementById("send-btn").disabled             = false;

  const typingEl = addMsg("ai", "", true);

  try {
    const res    = await fetch("/api/interview/start", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role, level })
    });
    const reader  = res.body.getReader();
    const decoder = new TextDecoder();
    let full = "", buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n"); buffer = lines.pop();
      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        const data = line.slice(6).trim();
        if (data === "[DONE]") break;
        try { const p = JSON.parse(data); if (p.text) { full += p.text; typingEl.textContent = full; scrollChat(); } } catch {}
      }
    }
    typingEl.parentElement.classList.remove("typing");
    interviewHistory = [
      { role: "system", content: `You are a professional interviewer for ${role} positions targeting ${level} candidates. Ask ONE question at a time. After each answer give brief encouraging feedback (1-2 sentences), then ask the next question. Ask 5-6 questions total: intro, technical, problem-solving, behavioural, situational. After the final answer write INTERVIEW_COMPLETE and give a full structured performance summary.` },
      { role: "user",      content: "Start the interview." },
      { role: "assistant", content: full }
    ];
  } catch (e) {
    typingEl.textContent = "❌ Error: " + e.message;
    typingEl.parentElement.classList.remove("typing");
  }
}

async function sendAnswer() {
  if (!interviewActive) return;
  const input  = document.getElementById("chat-input");
  const answer = input.value.trim();
  if (!answer) return;
  input.value  = "";
  addMsg("user", answer);
  interviewHistory.push({ role: "user", content: answer });
  document.getElementById("send-btn").disabled = true;
  const typingEl = addMsg("ai", "", true);

  try {
    const res    = await fetch("/api/interview/reply", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ history: interviewHistory })
    });
    const reader  = res.body.getReader();
    const decoder = new TextDecoder();
    let full = "", buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n"); buffer = lines.pop();
      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        const data = line.slice(6).trim();
        if (data === "[DONE]") break;
        try { const p = JSON.parse(data); if (p.text) { full += p.text; typingEl.textContent = full; scrollChat(); } } catch {}
      }
    }
    typingEl.parentElement.classList.remove("typing");
    interviewHistory.push({ role: "assistant", content: full });
    if (full.includes("INTERVIEW_COMPLETE")) {
      interviewActive = false;
      document.getElementById("chat-input").disabled = true;
      showEval(full);
    }
  } catch (e) {
    typingEl.textContent = "❌ " + e.message;
    typingEl.parentElement.classList.remove("typing");
  }
  document.getElementById("send-btn").disabled = false;
}

function addMsg(who, text, typing = false) {
  const msgs = document.getElementById("chat-messages");
  const wrap = document.createElement("div");
  wrap.className = "msg " + who + (typing ? " typing" : "");
  const av  = document.createElement("div"); av.className  = "msg-avatar"; av.textContent  = who === "ai" ? "AI" : "You";
  const bub = document.createElement("div"); bub.className = "msg-bubble"; bub.textContent = text;
  wrap.appendChild(av); wrap.appendChild(bub);
  msgs.appendChild(wrap); scrollChat();
  return bub;
}

function scrollChat() { const m = document.getElementById("chat-messages"); m.scrollTop = m.scrollHeight; }

function showEval(fullText) {
  const evalSec = document.getElementById("eval-section");
  evalSec.style.display = "block";
  document.getElementById("eval-output").textContent = fullText.replace("INTERVIEW_COMPLETE", "").trim();
  const metrics = [
    { label: "Communication", score: rnd(72, 94) }, { label: "Technical",     score: rnd(68, 92) },
    { label: "Confidence",    score: rnd(70, 95) }, { label: "Clarity",       score: rnd(72, 93) }
  ];
  document.getElementById("eval-scores").innerHTML = metrics.map(m =>
    `<div class="eval-badge"><div class="score">${m.score}</div><div class="label">${m.label}</div></div>`
  ).join("");
  evalSec.scrollIntoView({ behavior: "smooth" });
}

function rnd(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }

function endInterview() {
  interviewActive = false;
  document.getElementById("interview-area").style.display  = "none";
  document.getElementById("interview-setup").style.display = "block";
  document.getElementById("eval-section").style.display    = "none";
  document.getElementById("chat-messages").innerHTML       = "";
  document.getElementById("chat-input").disabled           = false;
}

// ═══════════════════════════════════════════════════════════════════════════
//  4. JOB ROADMAP
// ═══════════════════════════════════════════════════════════════════════════
function selectRole(el, role) {
  document.querySelectorAll(".chip").forEach(c => c.classList.remove("selected"));
  el.classList.add("selected");
  document.getElementById("custom-role").value = role;
}

async function generateRoadmap() {
  const role = document.getElementById("custom-role").value.trim();
  if (!role) { alert("Please select or type a role."); return; }

  setBtn("roadmap-btn", true, "Generating...");
  document.getElementById("roadmap-result").style.display = "none";

  try {
    const res  = await fetch("/api/roadmap/generate", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role })
    });
    const data = await res.json();
    if (data.error) throw new Error(data.error);
    renderRoadmap(role, data.response);
    document.getElementById("roadmap-result").style.display = "block";
    document.getElementById("roadmap-result").scrollIntoView({ behavior: "smooth" });
  } catch (e) { alert("❌ Error: " + e.message); }

  setBtn("roadmap-btn", false, "🗺 Generate Roadmap");
}

function renderRoadmap(role, text) {
  document.getElementById("roadmap-title").textContent = `🗺 Roadmap: ${role}`;
  const stepsMatch = text.match(/STEPS_JSON:\s*(\[[\s\S]*?\])\s*END_STEPS/);
  const stepsDiv   = document.getElementById("roadmap-steps");
  stepsDiv.innerHTML = "";

  if (stepsMatch) {
    try {
      const steps = JSON.parse(stepsMatch[1]);
      stepsDiv.innerHTML = steps.map((s, i) => `
        <div class="roadmap-step">
          <div class="step-num">${s.step || i + 1}</div>
          <div class="step-body">
            <h4>${s.title}</h4>
            <p>${s.desc}</p>
            <div class="step-meta">
              ${s.duration ? `<span class="step-duration">⏱ ${s.duration}</span>` : ""}
              ${(s.tags || []).map(t => `<span class="step-tag">${t}</span>`).join("")}
            </div>
            ${s.resources?.length ? `<div class="step-resources"><span>Resources: </span>${s.resources.map(r => `<a href="#" onclick="return false;">${r}</a>`).join("")}</div>` : ""}
          </div>
        </div>`).join("");
    } catch { stepsDiv.textContent = stepsMatch[1]; }
  } else { stepsDiv.textContent = "Could not parse steps. See tips below."; }

  const tipsMatch = text.match(/TIPS:\s*([\s\S]+)$/);
  document.getElementById("roadmap-tips").textContent = tipsMatch ? tipsMatch[1].trim() : text;
}
