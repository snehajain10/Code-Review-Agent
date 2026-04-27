// Config
const ADK_BASE = "/adk";
const APP_NAME = "my_agent";
const USER_ID  = "ui_user";
let SESSION_ID = "";

const results = { security: null, docker: null, tests: null };
const $ = id => document.getElementById(id);

// Server health check
async function checkServer() {
  try {
    const r = await fetch(ADK_BASE + "/list-apps", { signal: AbortSignal.timeout(3000) });
    if (r.ok) {
      $("statusDot").className = "status-indicator online";
      $("statusText").textContent = "ADK Online";
      return true;
    }
  } catch {}
  $("statusDot").className = "status-indicator offline";
  $("statusText").textContent = "ADK Offline";
  return false;
}

// Session
async function createSession() {
  SESSION_ID = "s_" + Date.now();
  const r = await fetch(
    ADK_BASE + "/apps/" + APP_NAME + "/users/" + USER_ID + "/sessions/" + SESSION_ID,
    { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" }
  );
  if (!r.ok) {
    const t = await r.text();
    if (!t.includes("already exists")) throw new Error("Session failed: " + t);
  }
}

// Send message with retry on rate limit
async function sendMessage(text, retries) {
  if (retries === undefined) retries = 4;
  const body = {
    app_name: APP_NAME,
    user_id: USER_ID,
    session_id: SESSION_ID,
    new_message: { role: "user", parts: [{ text: text }] }
  };

  for (let attempt = 0; attempt <= retries; attempt++) {
    const r = await fetch(ADK_BASE + "/run", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });

    if (r.ok) {
      const events = await r.json();
      let response = "";
      for (let i = 0; i < events.length; i++) {
        const ev = events[i];
        if (ev.content && ev.content.parts) {
          for (let j = 0; j < ev.content.parts.length; j++) {
            if (ev.content.parts[j].text) response = ev.content.parts[j].text;
          }
        }
      }
      return response || "No response received.";
    }

    const errText = await r.text();
    if (r.status === 500 && (errText.indexOf("RateLimitError") >= 0 || errText.indexOf("rate_limit") >= 0 || errText.indexOf("Internal Server Error") >= 0)) {
      const wait = 15 * (attempt + 1);
      setLoadingText("Rate limit hit. Waiting " + wait + "s then retrying (" + (attempt + 1) + "/" + retries + ")...");
      await new Promise(function(res) { setTimeout(res, wait * 1000); });
      continue;
    }
    if (r.status === 404) throw new Error("Agent not found. Make sure ADK server is running.");
    throw new Error("Server error " + r.status + ": " + errText.slice(0, 200));
  }
  throw new Error("Rate limit: too many retries. Please wait 1-2 minutes and try again.");
}

// Format output — no emoji, highlight pass/fail
function format(text) {
  if (!text) return "<em style='color:var(--text2)'>No response received.</em>";

  // Remove emojis
  text = text.replace(/[\u{1F000}-\u{1FFFF}]/gu, "")
             .replace(/[\u{2600}-\u{27BF}]/gu, "")
             .replace(/[\u{2300}-\u{23FF}]/gu, "")
             .replace(/[\u{2B00}-\u{2BFF}]/gu, "")
             .trim();

  // Markdown to HTML
  text = text.replace(/^### (.+)$/gm, "<h3>$1</h3>");
  text = text.replace(/^## (.+)$/gm,  "<h3>$1</h3>");
  text = text.replace(/^# (.+)$/gm,   "<h3>$1</h3>");
  text = text.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  text = text.replace(/```[\w]*\n?([\s\S]*?)```/g, "<pre>$1</pre>");
  text = text.replace(/`([^`\n]+)`/g, "<code>$1</code>");
  text = text.replace(/^---+$/gm, "<hr>");

  // Highlight pass/fail words
  text = text.replace(/\b(PASSED|PASS)\b/gi, function(m) { return '<span class="pass">' + m + '</span>'; });
  text = text.replace(/\b(FAILED|FAIL)\b/gi, function(m) { return '<span class="fail">' + m + '</span>'; });
  text = text.replace(/\bERROR\b/gi,          function(m) { return '<span class="fail">' + m + '</span>'; });

  text = text.replace(/\n/g, "<br>");
  return text;
}

// Pipeline step
function setPipelineStep(id, state, statusText) {
  const el = $(id);
  if (!el) return;
  el.className = "pipeline-step " + (state || "");
  const s = $(id + "-status");
  if (s) s.textContent = statusText;
}

// Loading helpers
function setLoadingText(text) {
  ["securityLoadingText", "dockerLoadingText", "testsLoadingText"].forEach(function(id) {
    const el = $(id);
    if (el) el.textContent = text;
  });
}

function showLoading(panel, text) {
  const loading = $(panel + "Loading");
  const loadingText = $(panel + "LoadingText");
  if (loading) loading.classList.remove("hidden");
  if (loadingText) loadingText.textContent = text;
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
  const btn = document.querySelector("[data-panel='" + panel + "']");
  if (!btn) return;
  btn.classList.remove("done", "running");
  if (state) btn.classList.add(state);
}

// Show a result panel
function showPanel(panel) {
  document.querySelectorAll(".result-panel").forEach(function(p) { p.classList.add("hidden"); });
  const cap = panel.charAt(0).toUpperCase() + panel.slice(1);
  const el = $("panel" + cap);
  if (el) el.classList.remove("hidden");
  document.querySelectorAll(".result-nav-btn").forEach(function(b) { b.classList.remove("active"); });
  const btn = document.querySelector("[data-panel='" + panel + "']");
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

// Tab switching
document.querySelectorAll(".itab").forEach(function(btn) {
  btn.addEventListener("click", function() {
    document.querySelectorAll(".itab").forEach(function(b) { b.classList.remove("active"); });
    document.querySelectorAll(".itab-content").forEach(function(c) { c.classList.remove("active"); });
    btn.classList.add("active");
    const tab = $("tab-" + btn.dataset.tab);
    if (tab) tab.classList.add("active");
  });
});

// Sidebar results nav
document.querySelectorAll(".result-nav-btn").forEach(function(btn) {
  btn.addEventListener("click", function() { showPanel(btn.dataset.panel); });
});

// Start Analysis
$("btnAnalyze").addEventListener("click", async function() {
  const activeTab = document.querySelector(".itab.active");
  if (!activeTab) return;
  const input = activeTab.dataset.tab === "local"
    ? ($("localPath") ? $("localPath").value.trim() : "")
    : ($("githubUrl") ? $("githubUrl").value.trim() : "");

  if (!input) { alert("Please enter a project path or GitHub URL."); return; }

  const online = await checkServer();
  if (!online) {
    alert("ADK server is not running.\n\nRun in terminal:\n  adk api_server --port=8000\n  python ui/serve.py");
    return;
  }

  $("btnAnalyze").disabled = true;
  $("btnAnalyze").textContent = "Scanning...";

  try {
    await createSession();
    setPipelineStep("ps-scan", "active", "scanning...");

    const isGithub = input.indexOf("github.com") >= 0 || /^[\w-]+\/[\w-]+$/.test(input);
    const msg = isGithub
      ? "Please analyze this GitHub repository: " + input
      : "Please review the project at: " + input;

    const response = await sendMessage(msg);
    setPipelineStep("ps-scan", "done", "done");

    const rn = $("resultsNav");
    const sa = $("stepActions");
    if (rn) rn.classList.remove("hidden");
    if (sa) sa.classList.remove("hidden");

    const ps = $("panelSecurity");
    const sc = $("securityContent");
    const sl = $("securityLoading");
    if (ps) ps.classList.remove("hidden");
    if (sc) sc.innerHTML = format(response);
    if (sl) sl.classList.add("hidden");
    setPanelStatus("security", "done", "Scan complete");
    setNavState("security", "done");

    if (ps) ps.scrollIntoView({ behavior: "smooth" });

  } catch (err) {
    setPipelineStep("ps-scan", "error", "error");
    alert("Error: " + err.message);
  } finally {
    $("btnAnalyze").disabled = false;
    $("btnAnalyze").textContent = "Start Analysis";
  }
});

// Security
$("btnSecurity").addEventListener("click", async function() {
  const ps = $("panelSecurity");
  if (ps) ps.classList.remove("hidden");
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

// Docker
$("btnDocker").addEventListener("click", async function() {
  const pd = $("panelDocker");
  if (pd) pd.classList.remove("hidden");
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

// Tests
$("btnTests").addEventListener("click", async function() {
  const pt = $("panelTests");
  if (pt) pt.classList.remove("hidden");
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

// Run All
$("btnAll").addEventListener("click", async function() {
  const steps = [
    { panel: "security", pid: "ps-security", msg: "Run the security analysis and generate documentation.", loading: "Running security analysis..." },
    { panel: "docker",   pid: "ps-docker",   msg: "Create the Dockerfile and run the container.",          loading: "Building Docker container..." },
    { panel: "tests",    pid: "ps-tests",    msg: "Generate tests for all edge cases and run them.",        loading: "Generating and running tests..." }
  ];

  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    const cap = step.panel.charAt(0).toUpperCase() + step.panel.slice(1);
    const panelEl = $("panel" + cap);
    if (panelEl) panelEl.classList.remove("hidden");
    showPanel(step.panel);
    showLoading(step.panel, step.loading);
    setPipelineStep(step.pid, "active", "running...");
    try {
      const r = await sendMessage(step.msg);
      setResult(step.panel, r);
      setPipelineStep(step.pid, "done", "done");
    } catch (err) {
      setResult(step.panel, "Error: " + err.message);
      setPanelStatus(step.panel, "error", "Failed");
      setNavState(step.panel, "");
      setPipelineStep(step.pid, "error", "error");
      break;
    }
  }
});

// Questions nav
const navQ = $("navQuestions");
if (navQ) navQ.addEventListener("click", function() { showPanel("questions"); });

document.querySelectorAll(".quick-q").forEach(function(btn) {
  btn.addEventListener("click", function() {
    const qi = $("questionInput");
    if (qi) qi.value = btn.dataset.q;
    const ba = $("btnAsk");
    if (ba) ba.click();
  });
});

const btnAsk = $("btnAsk");
if (btnAsk) {
  btnAsk.addEventListener("click", async function() {
    const qi = $("questionInput");
    if (!qi) return;
    const q = qi.value.trim();
    if (!q) return;
    const out = $("questionOutput");
    if (!out) return;
    out.classList.remove("hidden");
    out.innerHTML = "<div class='loading-state'><div class='spinner'></div><span>Thinking...</span></div>";
    try {
      const r = await sendMessage(q);
      out.innerHTML = format(r);
    } catch (err) {
      out.innerHTML = "Error: " + err.message;
    }
  });
}

const qi = $("questionInput");
if (qi) qi.addEventListener("keydown", function(e) { if (e.key === "Enter") { const ba = $("btnAsk"); if (ba) ba.click(); } });

// Init
checkServer();
setInterval(checkServer, 10000);
