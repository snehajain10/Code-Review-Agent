"""
agent.py - Multi-Agent Code Review System
Uses OpenRouter via ADK + LiteLLM with automatic fallback between free models.

Requirements:
- OPENROUTER_API_KEY in .env
- Get free key at: https://openrouter.ai
"""

import os
import litellm
from google.adk.agents import LlmAgent
from google.adk.models.lite_llm import LiteLlm
from .tools import (
    scan_project_folder,
    read_file,
    write_file,
    run_shell_command,
    clone_github_repo,
    get_github_repo_info,
    web_search,
    fetch_webpage,
)

_KEY = os.getenv("OPENROUTER_API_KEY")
_BASE = "https://openrouter.ai/api/v1"

# Primary model — if rate limited, LiteLLM falls back to the next ones
MODEL = LiteLlm(
    model="openrouter/openai/gpt-oss-120b:free",
    api_key=_KEY,
    api_base=_BASE,
    extra_body={"thinking": {"type": "disabled"}},
)

# Configure LiteLLM fallbacks for rate limit resilience
litellm.set_verbose = False
litellm.fallbacks = [
    {
        "openrouter/openai/gpt-oss-120b:free": [
            "openrouter/openai/gpt-oss-20b:free",
            "openrouter/nvidia/nemotron-3-super-120b-a12b:free",
        ]
    }
]


# ---------------------------------------------------------------------------
# Security & Documentation Agent
# ---------------------------------------------------------------------------

security_documentation_agent = LlmAgent(
    name="Security_Documentation_Agent",
    model=MODEL,
    description="Analyzes code for vulnerabilities, writes CODE_REVIEW.md and requirements.txt.",
    instruction="""You are a code security analyst. You receive scanned project files.

Steps:
1. Write a short project summary (purpose, main files, tech stack).
2. Find security issues: hardcoded passwords/keys, SQL injection, eval() on user input, pickle.loads, missing input validation. For each finding: file path, line number, issue type, description.
3. Use write_file to save CODE_REVIEW.md with sections: Project Summary, File Structure, Security Findings, Dependency List.
4. Find third-party Python imports (not stdlib). Use write_file to save requirements.txt.
5. Reply in plain English: what the project does, files analyzed, issues found, files created.

If no issues found, say "No vulnerabilities detected."
""",
    tools=[read_file, write_file],
)


# ---------------------------------------------------------------------------
# Docker Agent
# ---------------------------------------------------------------------------

docker_agent = LlmAgent(
    name="Docker_Agent",
    model=MODEL,
    description="Creates Dockerfile, builds and runs Docker image, fixes errors up to 5 times.",
    instruction="""You are a DevOps engineer. You receive project_folder and requirements_txt_path.

Steps:
1. Use read_file to read requirements.txt.
2. Find entry point: check main.py first, then app.py, then first .py file at root.
3. Use write_file to create Dockerfile:
   FROM python:3.11-slim
   WORKDIR /app
   COPY . .
   RUN pip install --no-cache-dir -r requirements.txt
   CMD ["python", "<entry_point>"]
4. Use run_shell_command to run: docker build -t <folder_name_lowercase> <project_folder>
5. If build succeeds, run: docker run --rm <image_name>
6. If any step fails, analyze the error, fix Dockerfile or requirements.txt, retry up to 5 times.
7. Reply: Dockerfile path, image name, build result, run output or error.
""",
    tools=[read_file, write_file, run_shell_command],
)


# ---------------------------------------------------------------------------
# Test Agent
# ---------------------------------------------------------------------------

test_agent = LlmAgent(
    name="Test_Agent",
    model=MODEL,
    description="Generates pytest tests for all functions, runs them, reports pass/fail.",
    instruction="""You are a Python test engineer. You receive scanned project files.

Steps:
1. Find all functions in .py files (skip test files and __init__.py).
2. Use write_file to save test_generated.py with pytest tests:
   - 1 happy path test per function
   - 2 edge case tests (empty input, None, zero, wrong type)
   - 1 error case test
   - Use descriptive names: test_<function>_<scenario>
3. Use run_shell_command to run: pytest test_generated.py -v --tb=short in project_folder.
4. Reply: total tests, passed count, failed count. For each failure: what failed and how to fix it.
""",
    tools=[read_file, write_file, run_shell_command],
)


# ---------------------------------------------------------------------------
# GitHub Agent
# ---------------------------------------------------------------------------

github_agent = LlmAgent(
    name="GitHub_Agent",
    model=MODEL,
    description="Fetches GitHub repo info, researches it online, clones it, prepares for review.",
    instruction="""You are a GitHub research assistant. You receive a GitHub URL.

Steps:
1. Use get_github_repo_info to get: name, description, language, stars, license.
2. Use web_search to find 2 articles about the project. Summarize what it does in 2-3 sentences.
3. Show the user: repo name, description, language, stars, your summary.
4. Ask: "Shall I clone this repo? (yes/no)"
5. If yes, use clone_github_repo to clone it.
6. Use scan_project_folder on the cloned path.
7. Reply: what was cloned, file count, ask what to do next (security review / docker / tests / all).
""",
    tools=[get_github_repo_info, web_search, fetch_webpage, clone_github_repo, scan_project_folder],
)


# ---------------------------------------------------------------------------
# Orchestrator Agent
# ---------------------------------------------------------------------------

orchestrator_agent = LlmAgent(
    name="Orchestrator_Agent",
    model=MODEL,
    description="Coordinates the code review pipeline. Accepts a folder path or GitHub URL.",
    instruction="""You coordinate a multi-agent code review system.

Sub-agents available:
- GitHub_Agent: clones GitHub repos
- Security_Documentation_Agent: security analysis + docs
- Docker_Agent: containerization
- Test_Agent: test generation and execution

When user provides input:
- If it contains "github.com" or matches "owner/repo" pattern: transfer to GitHub_Agent.
- If it looks like a folder path: call scan_project_folder, then transfer to Security_Documentation_Agent.

After Security_Documentation_Agent completes, ask the user:
"What would you like to do next?
1. Create Dockerfile and run container
2. Generate and run tests
3. Both"

Route to Docker_Agent, Test_Agent, or both based on choice.

After all steps complete, show a summary:
- Security analysis: done/failed
- Documentation: created/failed
- Docker: success/failed
- Tests: X passed, Y failed

Rules:
- Never output raw JSON to the user
- Always explain what happened in plain English
- Keep responses concise and clear
""",
    tools=[scan_project_folder],
    sub_agents=[github_agent, security_documentation_agent, docker_agent, test_agent],
)

# ADK requires root_agent
root_agent = orchestrator_agent
