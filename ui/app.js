// ── ADK API Config ──────────────────────────────────────────────────────────
const ADK_BASE = "/adk";
const APP_NAME = "my_agent";
const USER_ID  = "ui_user";
let   SESSION_ID = "";
let   currentProject = "";
let   rawOutputBuffer = "";

// ── DOM Refs ────────────────────────────────────────────────────────────────
const $ = id => document.getElementById(id);

// ── Server Health Check ─────────────────────────────────────────────────────
async function checkServer() {
  try {
    const r = await fetch(`${ADK_BASE}/list-apps`, { signal: AbortSignal.timeout(3000) });
    if (r.ok) {
      $("serverStatus").className = "status-dot online";
      $("serverStatusText").textContent = "ADK Online";
      return true;
    }
  } catch {}
  $("serverStatus").className = "status-dot offline";
  $("serverStatusText").textContent = "ADK Offline";
  return false;
}
async function createSession() {
  SESSION_ID = "session_" + Date.now();
  const r = await fetch(
    `${ADK_BASE}/apps/${APP_NAME}/users/${USER_ID}/sessions/${SESSION_ID}`,
    { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" }
  );
  if (!r.ok) {
    const txt = await r.text();
    // Session already exists is fine — reuse it
    if (!txt.includes("already exists")) {
      throw new Error(`Session creation failed: ${txt}`);
    }
  }
}

// ── Send Message to ADK ─────────────────────────────────────────────────────
async function sendMessage(text, retries = 4) {
  const body = {
    app_name:   APP_NAME,
    user_id:    USER_ID,
    session_id: SESSION_ID,
    new_message: {
      role: "user",
      parts: [{ text }]
    }
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
      return response;
    }

    const errText = await r.text();

    if (r.status === 500 && (errText.includes("RateLimitError") || errText.includes("rate_limit") || errText.includes("Internal Server Error"))) {
      const waitSec = 15 * (attempt + 1);
      showSpinner(`Rate limit hit. Waiting ${waitSec}s then retrying (${attempt + 1}/${retries})...`);
      await new Promise(res => setTimeout(res, waitSec * 1000));
      continue;
    }

    if (errText.includes("RESOURCE_EXHAUSTED") || errText.includes("429")) {
      throw new Error("API quota exceeded. Please wait a minute and try again.");
    }
    if (r.status === 404) {
      throw new Error("Agent not found. Make sure ADK server is running from the workspace root.");
    }
    throw new Error(`Server error ${r.status}: ${errText.slice(0, 200)}`);
  }

  throw new Error("Rate limit: too many retries. Please wait 1-2 minutes and try again.");
}

// ── Format Output ───────────────────────────────────────────────────────────
function formatOutput(text) {
  if (!text) return "<em style='color:var(--text2)'>No response received.</em>";

  // Strip all emoji characters
  text = text.replace(/[\u{1F000}-\u{1FFFF}]|[\u{2600}-\u{27BF}]|[\u{2300}-\u{23FF}]|[\u{2B00}-\u{2BFF}]|[\u{FE00}-\u{FEFF}]/gu, "").trim();

  let html = text
    .replace(/^### (.+)$/gm, "<h3>$1</h3>")
    .replace(/^## (.+)$/gm,  "<h3>$1</h3>")
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/PASS|passed/gi, '<span class="badge-pass">$&</span>')
    .replace(/FAIL|failed/gi, '<span class="badge-fail">$&</span>')
    .replace(/WARN|warning/gi, '<span class="badge-warn">$&</span>')
    .replace(/```[\w]*\n?([\s\S]*?)```/g, "<pre style='background:var(--bg);padding:12px;border-radius:6px;overflow-x:auto;font-size:12px;margin:8px 0;border:1px solid var(--border)'>$1</pre>")
    .replace(/`([^`]+)`/g, "<code style='background:var(--bg);padding:2px 6px;border-radius:4px;font-size:12px;color:var(--accent-h)'>$1</code>")
    .replace(/^---+$/gm, "<hr>")
    .replace(/\n/g, "<br>");

  return html;
}

// ── Pipeline Step State ─────────────────────────────────────────────────────
function setPipelineStep(id, state, statusText) {
  const el = $(id);
  el.className = "pipeline-step " + state;
  el.querySelector(".ps-status").textContent = statusText;
}

// ── Show/Hide Spinner ───────────────────────────────────────────────────────
function showSpinner(text = "Processing...") {
  $("spinner").classList.remove("hidden");
  $("spinnerText").textContent = text;
}
function hideSpinner() {
  $("spinner").classList.add("hidden");
}

// ── Show Output ─────────────────────────────────────────────────────────────
function showOutput(text) {
  rawOutputBuffer = text;
  $("outputFormatted").innerHTML = formatOutput(text);
  $("outputRaw").textContent = text;
  $("stepOutput").classList.remove("hidden");
  hideSpinner();
}

// ── Build Summary ───────────────────────────────────────────────────────────
function buildSummary(results) {
  const rows = results.map(r =>
    `<tr>
      <td>${r.step}</td>
      <td>${r.status}</td>
      <td style="color:var(--text2);font-size:12px">${r.note || ""}</td>
    </tr>`
  ).join("");

  $("summaryContent").innerHTML = `
    <table class="summary-table">
      <thead><tr><th>Step</th><th>Status</th><th>Notes</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
  $("stepSummary").classList.remove("hidden");
}

// ── Tab Switching ───────────────────────────────────────────────────────────
document.querySelectorAll(".tab-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
    document.querySelectorAll(".tab-content").forEach(c => c.classList.remove("active"));
    btn.classList.add("active");
    $("tab-" + btn.dataset.tab).classList.add("active");
  });
});

document.querySelectorAll(".out-tab").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".out-tab").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    if (btn.dataset.out === "formatted") {
      $("outputFormatted").classList.remove("hidden");
      $("outputRaw").classList.add("hidden");
    } else {
      $("outputFormatted").classList.add("hidden");
      $("outputRaw").classList.remove("hidden");
    }
  });
});

// ── Start Analysis ──────────────────────────────────────────────────────────
$("btnStart").addEventListener("click", async () => {
  const activeTab = document.querySelector(".tab-btn.active").dataset.tab;
  const input = activeTab === "local"
    ? $("localPath").value.trim()
    : $("githubUrl").value.trim();

  if (!input) {
    alert("Please enter a project path or GitHub URL.");
    return;
  }

  const online = await checkServer();
  if (!online) {
    alert("ADK server is not running.\n\nStart it with:\n  adk api_server\n\nfrom the workspace root.");
    return;
  }

  currentProject = input;
  $("stepPipeline").classList.remove("hidden");
  $("stepOutput").classList.remove("hidden");
  $("stepSummary").classList.add("hidden");
  $("actionGrid").classList.add("hidden");
  $("outputFormatted").innerHTML = "";
  rawOutputBuffer = "";

  showSpinner("Creating session...");
  await createSession();

  // Determine message
  const isGithub = input.includes("github.com") || /^[\w-]+\/[\w-]+$/.test(input);
  const message = isGithub
    ? `Please analyze this GitHub repository: ${input}`
    : `Please review the project at: ${input}`;

  setPipelineStep("ps-scan", "active", "scanning...");
  showSpinner("Scanning project...");

  try {
    const response = await sendMessage(message);
    setPipelineStep("ps-scan", "done", "done ✅");
    showOutput(response);
    $("actionGrid").classList.remove("hidden");
  } catch (err) {
    setPipelineStep("ps-scan", "error", "error ❌");
    showOutput("Error: " + err.message);
  }
});

// ── Security Button ─────────────────────────────────────────────────────────
$("btnSecurity").addEventListener("click", async () => {
  setPipelineStep("ps-security", "active", "analyzing...");
  showSpinner("Running security analysis...");
  try {
    const r = await sendMessage("Run the security analysis and generate documentation.");
    setPipelineStep("ps-security", "done", "done ✅");
    showOutput(r);
  } catch (err) {
    setPipelineStep("ps-security", "error", "error ❌");
    showOutput("Error: " + err.message);
  }
});

// ── Docker Button ───────────────────────────────────────────────────────────
$("btnDocker").addEventListener("click", async () => {
  setPipelineStep("ps-docker", "active", "building...");
  showSpinner("Creating Dockerfile and building container...");
  try {
    const r = await sendMessage("Create the Dockerfile and run the container.");
    setPipelineStep("ps-docker", "done", "done ✅");
    showOutput(r);
  } catch (err) {
    setPipelineStep("ps-docker", "error", "error ❌");
    showOutput("Error: " + err.message);
  }
});

// ── Tests Button ────────────────────────────────────────────────────────────
$("btnTests").addEventListener("click", async () => {
  setPipelineStep("ps-tests", "active", "generating...");
  showSpinner("Generating and running tests...");
  try {
    const r = await sendMessage("Generate tests for all edge cases and run them.");
    setPipelineStep("ps-tests", "done", "done ✅");
    showOutput(r);
  } catch (err) {
    setPipelineStep("ps-tests", "error", "error ❌");
    showOutput("Error: " + err.message);
  }
});

// ── Run Everything ──────────────────────────────────────────────────────────
$("btnAll").addEventListener("click", async () => {
  const steps = [
    { id: "ps-security", msg: "Run the security analysis and generate documentation.", label: "Security Analysis", spinner: "Running security analysis..." },
    { id: "ps-docker",   msg: "Create the Dockerfile and run the container.",          label: "Docker",           spinner: "Building Docker container..." },
    { id: "ps-tests",    msg: "Generate tests for all edge cases and run them.",        label: "Tests",            spinner: "Generating and running tests..." },
  ];

  const summaryResults = [];

  for (const step of steps) {
    setPipelineStep(step.id, "active", "running...");
    showSpinner(step.spinner);
    try {
      const r = await sendMessage(step.msg);
      setPipelineStep(step.id, "done", "done ✅");
      showOutput(r);
      summaryResults.push({ step: step.label, status: "✅ Done", note: "" });
    } catch (err) {
      setPipelineStep(step.id, "error", "error ❌");
      showOutput("Error in " + step.label + ": " + err.message);
      summaryResults.push({ step: step.label, status: "❌ Failed", note: err.message });
      break;
    }
  }

  buildSummary(summaryResults);
});

// ── Copy Output ─────────────────────────────────────────────────────────────
$("btnCopy").addEventListener("click", () => {
  navigator.clipboard.writeText(rawOutputBuffer).then(() => {
    $("btnCopy").textContent = "✅ Copied!";
    setTimeout(() => { $("btnCopy").textContent = "📋 Copy"; }, 2000);
  });
});

// ── New Review ──────────────────────────────────────────────────────────────
$("btnNewReview").addEventListener("click", () => {
  $("localPath").value = "";
  $("githubUrl").value = "";
  $("stepPipeline").classList.add("hidden");
  $("stepOutput").classList.add("hidden");
  $("stepSummary").classList.add("hidden");
  $("stepQuestion").classList.add("hidden");
  ["ps-scan","ps-security","ps-docker","ps-tests"].forEach(id =>
    setPipelineStep(id, "", "waiting")
  );
  SESSION_ID = "";
  currentProject = "";
});

// ── Ask Question ────────────────────────────────────────────────────────────
$("btnAskQuestion").addEventListener("click", () => {
  $("stepQuestion").classList.remove("hidden");
  $("stepQuestion").scrollIntoView({ behavior: "smooth" });
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
  $("questionOutput").classList.remove("hidden");
  $("questionOutput").innerHTML = "<em style='color:var(--text2)'>Thinking...</em>";
  try {
    const r = await sendMessage(q);
    $("questionOutput").innerHTML = formatOutput(r);
  } catch (err) {
    $("questionOutput").innerHTML = "Error: " + err.message;
  }
});

$("questionInput").addEventListener("keydown", e => {
  if (e.key === "Enter") $("btnAsk").click();
});

// ── Nav ─────────────────────────────────────────────────────────────────────
document.querySelectorAll(".nav-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".nav-btn").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
  });
});

// ── Init ────────────────────────────────────────────────────────────────────
checkServer();
setInterval(checkServer, 10000);
