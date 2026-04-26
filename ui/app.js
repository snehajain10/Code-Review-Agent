// ── Config ──────────────────────────────────────────────────────────────────
const ADK_BASE  = "/adk";
const APP_NAME  = "my_agent";
const USER_ID   = "ui_user";
let   SESSION_ID = "";

// ── State — each section stores its result independently ────────────────────
const results = {
  security: null,
  docker:   null,
  tests:    null,
};

// ── DOM ──────────────────────────────────────────────────────────────────────
const $ = id => document.getElementById(id);

// ── Server Health ────────────────────────────────────────────────────────────
async function checkServer() {
  try {
    const r = await fetch(`${ADK_BASE}/list-apps`, { signal: AbortSignal.timeout(3000) });
    if (r.ok) {
      $("statusDot").className  = "status-indicator online";
      $("statusText").textContent = "ADK Online";
      return true;
    }
  } catch {}
  $("statusDot").className  = "status-indicator offline";
  $("statusText").textContent = "ADK Offline";
  return false;
}

// ── Session ──────────────────────────────────────────────────────────────────
async function createSession() {
  SESSION_ID = "s_" + Date.now();
  const r = await fetch(
    `${ADK_BASE}/apps/${APP_NAME}/users/${USER_ID}/sessions/${SESSION_ID}`,
    { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" }
  );
  if (!r.ok) {
    const t = await r.text();
    if (!t.includes("already exists")) throw new Error("Session failed: " + t);
  }
}

// ── Send Message ─────────────────────────────────────────────────────────────
async function sendMessage(text, retries = 4) {
  const body = {
    app_name:    APP_NAME,
    user_id:     USER_ID,
    session_id:  SESSION_ID,
    new_message: { role: "user", parts: [{ text }] }
  };

  for (let attempt = 0; attempt <= retries; attempt++) {
    const r = await fetch(`${ADK_BASE}/run`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify(body)
    });

    if (r.ok) {
      const events = await r.json();
      let response = "";
      for (const ev of events) {
        if (ev.content?.parts) {
          for (const p of ev.content.parts) {
            if (p.text) response = p.text;
          }
        }
      }
      return response || "No response received.";
    }

    const errText = await r.text();

    if (r.status === 500 && (errText.includes("RateLimitError") || errText.includes("rate_limit") || errText.includes("Internal Server Error"))) {
      const wait = 15 * (attempt + 1);
      setLoadingText("Rate limit hit. Waiting " + wait + "s then retrying (" + (attempt + 1) + "/" + retries + ")...");
      await new Promise(res => setTimeout(res, wait * 1000));
      continue;
    }

    if (r.status === 404) throw new Error("Agent not found. Make sure ADK server is running from the workspace root.");
    throw new Error("Server error " + r.status + ": " + errText.slice(0, 200));
  }

  throw new Error("Rate limit: too many retries. Please wait 1-2 minutes and try again.");
}

// ── Format Output ─────────────────────────────────────────────────────────────
function format(text) {
  if (!text) return "<em style='color:var(--text2)'>No response received.</em>";

  // Strip emojis
  text = text.replace(/[\u{1F000}-\u{1FFFF}]|[\u{2600}-\u{27BF}]|[\u{2300}-\u{23FF}]|[\u{2B00}-\u{2BFF}]|[\u{FE00}-\u{FEFF}]/gu, "").trim();

  return text
    .replace(/^### (.+)$/gm, "<h3>$1</h3>")
    .replace(/^## (.+)$/gm,  "<h3>$1</h3>")
    .replace(/^# (.+)$/gm,   "<h3>$1</h3>")
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/`([^`\n]+)`/g, "<code>$1</code>")
    .replace(/```[\w]*\n?([\s\S]*?)```/g, "<pre>$1</pre>")
    .replace(/\bPASS(ED)?\b/gi, '<span class="pass">$&</span>')
    .replace(/\bFAIL(ED)?\b/gi, '<span class="fail">$&</span>')
    .replace(/\bERROR\b/gi,     '<span class="fail">$&</span>')
    .replace(/^---+$/gm, "<hr>")
    .replace(/\n/g, "<br>");
}

// ── Pipeline step helper ──────────────────────────────────────────────────────
function setPipelineStep(id, state, statusText) {
  const el = $(id);
  if (!el) return;
  el.className = "pipeline-step " + (state || "");
  const s = $( id + "-status");
  if (s) s.textContent = statusText;
}

// ── Loading helpers ───────────────────────────────────────────────────────────
function setLoadingText(text) {
  ["securityLoadingText","dockerLoadingText","testsLoadingText"].forEach(id => {
    const el = $(id);
    if (el) el.textContent = text;
  });
}

function showLoading(panel, text) {
  const loading = $(panel + "Loading");
  const loadingText = $(panel + "LoadingText");
  const content = $(panel + "Content");
  if (loading) loading.classList.remove("hidden");
  if (loadingText) loadingText.textContent = text;
  if (content) {
    const ls = content.querySelector(".loading-state");
    if (ls) ls.classList.remove("hidden");
  }
  setNavState(panel, "running");
  setPanelStatus(panel, "running", "Running...");
}

function hideLoading(panel) {
  const el = $(panel + "Loading");
  if (el) el.classList.add("hidden");
}

function setPanelStatus(panel, state, text) {
  const el = $(panel + "Status");
  if (!el) return;
  el.className = "panel-status " + state;
  el.textContent = text;
}

function setNavState(panel, state) {
  const btn = document.querySelector(`[data-panel="${panel}"]`);
  if (!btn) return;
  btn.classList.remove("done", "running");
  if (state) btn.classList.add(state);
}

// ── Show a result panel ───────────────────────────────────────────────────────
function showPanel(panel) {
  // Hide all result panels
  document.querySelectorAll(".result-panel").forEach(p => p.classList.add("hidden"));
  // Build the panel ID
  const panelId = "panel" + panel.charAt(0).toUpperCase() + panel.slice(1);
  const el = $(panelId);
  if (el) el.classList.remove("hidden");
  // Update nav active state
  document.querySelectorAll(".result-nav-btn").forEach(b => b.classList.remove("active"));
  const btn = document.querySelector(`[data-panel="${panel}"]`);
  if (btn) btn.classList.add("active");
}

function setResult(panel, text) {
  results[panel] = text;
  const content = $(panel + "Content");
  if (content) content.innerHTML = format(text);
  hideLoading(panel);
  setNavState(panel, "done");
  setPanelStatus(panel, "done", "Complete");
}

// ── Tab switching ─────────────────────────────────────────────────────────────
document.querySelectorAll(".itab").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".itab").forEach(b => b.classList.remove("active"));
    document.querySelectorAll(".itab-content").forEach(c => c.classList.remove("active"));
    btn.classList.add("active");
    $("tab-" + btn.dataset.tab).classList.add("active");
  });
});

// ── Sidebar results nav ───────────────────────────────────────────────────────
document.querySelectorAll(".result-nav-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    showPanel(btn.dataset.panel);
  });
});

// ── Start Analysis ────────────────────────────────────────────────────────────
$("btnAnalyze").addEventListener("click", async () => {
  const activeTab = document.querySelector(".itab.active").dataset.tab;
  const input = activeTab === "local"
    ? $("localPath").value.trim()
    : $("githubUrl").value.trim();

  if (!input) { alert("Please enter a project path or GitHub URL."); return; }

  const online = await checkServer();
  if (!online) {
    alert("ADK server is not running.\n\nRun: adk api_server --port=8000\nThen: python ui/serve.py");
    return;
  }

  $("btnAnalyze").disabled = true;
  $("btnAnalyze").textContent = "Scanning...";

  try {
    await createSession();
    setPipelineStep("ps-scan", "active", "scanning...");
    const isGithub = input.includes("github.com") || /^[\w-]+\/[\w-]+$/.test(input);
    const msg = isGithub
      ? "Please analyze this GitHub repository: " + input
      : "Please review the project at: " + input;

    const response = await sendMessage(msg);
    setPipelineStep("ps-scan", "done", "done");

    // Show results nav and step actions
    $("resultsNav").classList.remove("hidden");
    $("stepActions").classList.remove("hidden");

    // Show a scan summary in security panel
    $("panelSecurity").classList.remove("hidden");
    $("securityContent").innerHTML = format(response);
    $("securityLoading").classList.add("hidden");
    setPanelStatus("security", "done", "Scan complete");
    setNavState("security", "done");

    // Scroll to security panel
    $("panelSecurity").scrollIntoView({ behavior: "smooth" });

  } catch (err) {
    alert("Error: " + err.message);
  } finally {
    $("btnAnalyze").disabled = false;
    $("btnAnalyze").textContent = "Start Analysis";
  }
});

// ── Security Button ───────────────────────────────────────────────────────────
$("btnSecurity").addEventListener("click", async () => {
  $("panelSecurity").classList.remove("hidden");
  showPanel("security");
  showLoading("security", "Running security analysis...");
  setPipelineStep("ps-security", "active", "running...");

  try {
    const r = await sendMessage("Run the security analysis and generate documentation.");
    setResult("security", r);
    setPipelineStep("ps-security", "done", "done");
  } catch (err) {
    setResult("security", "Error: " + err.message);
    setPanelStatus("security", "error", "Failed");
    setNavState("security", "");
    setPipelineStep("ps-security", "error", "error");
  }
});

// ── Docker Button ─────────────────────────────────────────────────────────────
$("btnDocker").addEventListener("click", async () => {
  $("panelDocker").classList.remove("hidden");
  showPanel("docker");
  showLoading("docker", "Creating Dockerfile and building container...");
  setPipelineStep("ps-docker", "active", "running...");

  try {
    const r = await sendMessage("Create the Dockerfile and run the container.");
    setResult("docker", r);
    setPipelineStep("ps-docker", "done", "done");
  } catch (err) {
    setResult("docker", "Error: " + err.message);
    setPanelStatus("docker", "error", "Failed");
    setNavState("docker", "");
    setPipelineStep("ps-docker", "error", "error");
  }
});

// ── Tests Button ──────────────────────────────────────────────────────────────
$("btnTests").addEventListener("click", async () => {
  $("panelTests").classList.remove("hidden");
  showPanel("tests");
  showLoading("tests", "Generating and running tests...");
  setPipelineStep("ps-tests", "active", "running...");

  try {
    const r = await sendMessage("Generate tests for all edge cases and run them.");
    setResult("tests", r);
    setPipelineStep("ps-tests", "done", "done");
  } catch (err) {
    setResult("tests", "Error: " + err.message);
    setPanelStatus("tests", "error", "Failed");
    setNavState("tests", "");
    setPipelineStep("ps-tests", "error", "error");
  }
});

// ── Run All ───────────────────────────────────────────────────────────────────
$("btnAll").addEventListener("click", async () => {
  const steps = [
    { panel: "security", pipelineId: "ps-security", msg: "Run the security analysis and generate documentation.", loading: "Running security analysis..." },
    { panel: "docker",   pipelineId: "ps-docker",   msg: "Create the Dockerfile and run the container.",          loading: "Building Docker container..." },
    { panel: "tests",    pipelineId: "ps-tests",    msg: "Generate tests for all edge cases and run them.",        loading: "Generating and running tests..." },
  ];

  for (const step of steps) {
    $("panel" + step.panel.charAt(0).toUpperCase() + step.panel.slice(1)).classList.remove("hidden");
    showPanel(step.panel);
    showLoading(step.panel, step.loading);
    setPipelineStep(step.pipelineId, "active", "running...");

    try {
      const r = await sendMessage(step.msg);
      setResult(step.panel, r);
      setPipelineStep(step.pipelineId, "done", "done");
    } catch (err) {
      setResult(step.panel, "Error: " + err.message);
      setPanelStatus(step.panel, "error", "Failed");
      setNavState(step.panel, "");
      setPipelineStep(step.pipelineId, "error", "error");
      break;
    }
  }
});

// ── Questions ─────────────────────────────────────────────────────────────────
$("navQuestions").addEventListener("click", () => {
  showPanel("questions");
});

document.querySelectorAll(".quick-q").forEach(btn => {
  btn.addEventListener("click", () => {
    $("questionInput").value = btn.dataset.q;
    $("btnAsk").click();
  });
});

$("btnAsk").addEventListener("click", async () => {
  const q = $("questionInput").value.trim();
  if (!q) return;
  const out = $("questionOutput");
  out.classList.remove("hidden");
  out.innerHTML = "<div class='loading-state'><div class='spinner'></div><span>Thinking...</span></div>";
  try {
    const r = await sendMessage(q);
    out.innerHTML = format(r);
  } catch (err) {
    out.innerHTML = "Error: " + err.message;
  }
});

$("questionInput").addEventListener("keydown", e => {
  if (e.key === "Enter") $("btnAsk").click();
});

// ── Init ──────────────────────────────────────────────────────────────────────
checkServer();
setInterval(checkServer, 10000);
