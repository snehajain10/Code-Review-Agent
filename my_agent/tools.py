"""
tools.py — Pure Python tool functions for the multi-agent code review system.
No ADK imports. All functions are independently testable.
"""

import os
import re
import json
import subprocess
import tempfile
import urllib.request
import urllib.parse


# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

RECOGNIZED_EXTENSIONS = {
    ".py", ".js", ".ts", ".java", ".go", ".rb", ".cs",
    ".cpp", ".c", ".h", ".html", ".css", ".json",
    ".yaml", ".yml", ".toml", ".env", ".sh",
}

SKIP_DIRS = {
    "node_modules", "__pycache__", ".git",
    "venv", ".venv", "dist", "build",
}


# ---------------------------------------------------------------------------
# Tool: scan_project_folder
# ---------------------------------------------------------------------------

def scan_project_folder(folder_path: str) -> dict:
    """
    Recursively scan a project folder and return the contents of all
    recognized source files.

    Args:
        folder_path: Absolute or relative path to the project root directory.

    Returns:
        A dict with keys:
          - project_folder (str): The provided folder path.
          - files (dict): Mapping of relative_path -> file_content for each
            recognized source file found.
          - file_count (int): Number of files successfully read.
          - error (str | None): Descriptive error message if the path is
            invalid, otherwise None.
    """
    if not os.path.exists(folder_path):
        return {
            "project_folder": folder_path,
            "files": {},
            "file_count": 0,
            "error": f"Path does not exist: {folder_path}",
        }

    if not os.path.isdir(folder_path):
        return {
            "project_folder": folder_path,
            "files": {},
            "file_count": 0,
            "error": f"Path is not a directory: {folder_path}",
        }

    files = {}
    abs_root = os.path.abspath(folder_path)
    MAX_FILES = 15          # max files to include
    MAX_FILE_CHARS = 3000   # max chars per file
    MAX_TOTAL_CHARS = 30000 # stop scanning if total content exceeds this
    total_chars = 0

    for dirpath, dirnames, filenames in os.walk(abs_root):
        if len(files) >= MAX_FILES or total_chars >= MAX_TOTAL_CHARS:
            break
        # Prune skip-list and hidden directories in-place so os.walk won't
        # descend into them.
        dirnames[:] = [
            d for d in dirnames
            if d not in SKIP_DIRS and not d.startswith(".")
        ]

        for filename in filenames:
            if len(files) >= MAX_FILES or total_chars >= MAX_TOTAL_CHARS:
                break
            _, ext = os.path.splitext(filename)
            if ext.lower() not in RECOGNIZED_EXTENSIONS:
                continue

            abs_path = os.path.join(dirpath, filename)
            rel_path = os.path.relpath(abs_path, abs_root)

            # Skip files larger than 50KB
            try:
                if os.path.getsize(abs_path) > 50000:
                    continue
            except OSError:
                continue

            try:
                with open(abs_path, "r", encoding="utf-8", errors="strict") as f:
                    content = f.read(MAX_FILE_CHARS)
                files[rel_path] = content
                total_chars += len(content)
            except (UnicodeDecodeError, PermissionError):
                # Skip binary or unreadable files silently
                continue

    return {
        "project_folder": folder_path,
        "files": files,
        "file_count": len(files),
        "truncated": total_chars >= MAX_TOTAL_CHARS or len(files) >= MAX_FILES,
        "error": None,
    }


# ---------------------------------------------------------------------------
# Tool: read_file
# ---------------------------------------------------------------------------

def read_file(file_path: str) -> str:
    """
    Read and return the text content of a file.

    Args:
        file_path: Path to the file to read.

    Returns:
        The file content as a string, or an error message string if the
        file cannot be read.
    """
    try:
        with open(file_path, "r", encoding="utf-8") as f:
            return f.read()
    except Exception as e:
        return f"Error reading file: {e}"


# ---------------------------------------------------------------------------
# Tool: write_file
# ---------------------------------------------------------------------------

def write_file(file_path: str, content: str) -> str:
    """
    Write text content to a file, creating parent directories as needed.
    Overwrites the file if it already exists.

    Args:
        file_path: Path to the file to write.
        content: Text content to write.

    Returns:
        A confirmation string on success, or an error message string on
        failure.
    """
    try:
        os.makedirs(os.path.dirname(os.path.abspath(file_path)), exist_ok=True)
        with open(file_path, "w", encoding="utf-8") as f:
            f.write(content)
        return f"Successfully wrote to {file_path}"
    except Exception as e:
        return f"Error writing file: {e}"


# ---------------------------------------------------------------------------
# Tool: run_shell_command
# ---------------------------------------------------------------------------

def run_shell_command(command: str, cwd: str) -> dict:
    """
    Execute a shell command in the specified working directory and capture
    its output.

    Args:
        command: The shell command string to execute.
        cwd: The working directory in which to run the command.

    Returns:
        A dict with keys:
          - stdout (str): Standard output from the command.
          - stderr (str): Standard error from the command.
          - exit_code (int): Exit code (0 = success, non-zero = failure,
            -1 = timeout).
    """
    try:
        result = subprocess.run(
            command,
            shell=True,
            cwd=cwd,
            capture_output=True,
            text=True,
            timeout=300,
        )
        return {
            "stdout": result.stdout,
            "stderr": result.stderr,
            "exit_code": result.returncode,
        }
    except subprocess.TimeoutExpired:
        return {
            "stdout": "",
            "stderr": "Command timed out after 300 seconds.",
            "exit_code": -1,
        }
    except Exception as e:
        return {
            "stdout": "",
            "stderr": f"Error running command: {e}",
            "exit_code": -1,
        }


# ---------------------------------------------------------------------------
# Tool: web_search  (DuckDuckGo — no API key required)
# ---------------------------------------------------------------------------

def web_search(query: str, max_results: int = 5) -> list[dict]:
    """
    Search the web using DuckDuckGo and return a list of results.
    No API key required.

    Args:
        query: The search query string.
        max_results: Maximum number of results to return (default 5).

    Returns:
        A list of dicts, each with keys: title, url, snippet.
        On error, returns a list with a single dict containing an 'error' key.
    """
    try:
        from duckduckgo_search import DDGS
        results = []
        with DDGS() as ddgs:
            for r in ddgs.text(query, max_results=max_results):
                results.append({
                    "title": r.get("title", ""),
                    "url": r.get("href", ""),
                    "snippet": r.get("body", ""),
                })
        return results if results else [{"error": "No results found."}]
    except ImportError:
        return [{"error": "duckduckgo_search not installed. Run: pip install duckduckgo-search"}]
    except Exception as e:
        return [{"error": f"Search failed: {e}"}]


# ---------------------------------------------------------------------------
# Tool: fetch_webpage  (read a URL's text content)
# ---------------------------------------------------------------------------

def fetch_webpage(url: str, max_chars: int = 4000) -> dict:
    """
    Fetch the text content of a webpage.

    Args:
        url: The URL to fetch.
        max_chars: Maximum characters to return (default 4000).

    Returns:
        A dict with keys:
          - url (str): The fetched URL.
          - content (str): Extracted text content (HTML tags stripped).
          - error (str | None): Error message if fetch failed.
    """
    try:
        req = urllib.request.Request(
            url,
            headers={
                "User-Agent": (
                    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                    "AppleWebKit/537.36 (KHTML, like Gecko) "
                    "Chrome/120.0.0.0 Safari/537.36"
                )
            },
        )
        with urllib.request.urlopen(req, timeout=15) as response:
            raw = response.read().decode("utf-8", errors="ignore")

        # Strip HTML tags simply
        text = re.sub(r"<style[^>]*>.*?</style>", " ", raw, flags=re.DOTALL)
        text = re.sub(r"<script[^>]*>.*?</script>", " ", text, flags=re.DOTALL)
        text = re.sub(r"<[^>]+>", " ", text)
        text = re.sub(r"\s+", " ", text).strip()

        return {
            "url": url,
            "content": text[:max_chars],
            "error": None,
        }
    except Exception as e:
        return {
            "url": url,
            "content": "",
            "error": f"Failed to fetch {url}: {e}",
        }


# ---------------------------------------------------------------------------
# Tool: get_github_repo_info
# ---------------------------------------------------------------------------

def get_github_repo_info(github_url: str) -> dict:
    """
    Fetch metadata about a GitHub repository using the GitHub API.
    No authentication required for public repos.

    Args:
        github_url: Full GitHub URL or owner/repo shorthand.

    Returns:
        A dict with repo metadata: name, description, language, stars,
        forks, open_issues, topics, license, default_branch, or error.
    """
    url = github_url.strip().rstrip("/")
    match = re.search(r"github\.com[/:]([^/]+)/([^/\s.]+)", url)
    if not match:
        parts = url.split("/")
        if len(parts) == 2:
            owner, repo = parts[0], parts[1]
        else:
            return {"error": f"Could not parse GitHub URL: {github_url}"}
    else:
        owner, repo = match.group(1), match.group(2)

    repo = re.sub(r"\.git$", "", repo)
    api_url = f"https://api.github.com/repos/{owner}/{repo}"

    try:
        req = urllib.request.Request(
            api_url,
            headers={"User-Agent": "multi-agent-code-review/1.0"},
        )
        with urllib.request.urlopen(req, timeout=10) as response:
            data = json.loads(response.read().decode())

        return {
            "name": data.get("name", ""),
            "full_name": data.get("full_name", ""),
            "description": data.get("description", "No description provided."),
            "language": data.get("language", "Unknown"),
            "stars": data.get("stargazers_count", 0),
            "forks": data.get("forks_count", 0),
            "open_issues": data.get("open_issues_count", 0),
            "topics": data.get("topics", []),
            "license": data.get("license", {}).get("name", "No license") if data.get("license") else "No license",
            "default_branch": data.get("default_branch", "main"),
            "clone_url": data.get("clone_url", ""),
            "homepage": data.get("homepage", ""),
            "created_at": data.get("created_at", ""),
            "updated_at": data.get("updated_at", ""),
            "error": None,
        }
    except Exception as e:
        return {"error": f"Could not fetch repo info: {e}"}


# ---------------------------------------------------------------------------
# Tool: clone_github_repo
# ---------------------------------------------------------------------------

def clone_github_repo(github_url: str, target_dir: str = "") -> dict:
    """
    Clone a GitHub repository to a local directory.

    Accepts full GitHub URLs or shorthand like 'owner/repo'.
    If target_dir is empty, clones into a temp directory automatically.

    Args:
        github_url: Full GitHub URL (https://github.com/owner/repo)
                    or shorthand (owner/repo).
        target_dir: Local directory to clone into. If empty, a temp
                    directory is created automatically.

    Returns:
        A dict with keys:
          - clone_path (str): Absolute path where the repo was cloned.
          - repo_name (str): Name of the repository.
          - default_branch (str): The default branch name.
          - error (str | None): Error message if cloning failed.
    """
    url = github_url.strip()
    if not url.startswith("http"):
        url = f"https://github.com/{url}"

    url = url.rstrip("/")
    if not url.endswith(".git"):
        url = url + ".git"

    repo_name = re.sub(r"\.git$", "", url.split("/")[-1])

    if target_dir:
        clone_path = os.path.abspath(os.path.join(target_dir, repo_name))
    else:
        base = tempfile.mkdtemp(prefix="github_clone_")
        clone_path = os.path.join(base, repo_name)

    try:
        result = subprocess.run(
            f'git clone "{url}" "{clone_path}"',
            shell=True,
            capture_output=True,
            text=True,
            timeout=120,
        )

        if result.returncode != 0:
            return {
                "clone_path": "",
                "repo_name": repo_name,
                "default_branch": "",
                "error": result.stderr.strip() or "git clone failed with no output.",
            }

        branch_result = subprocess.run(
            "git rev-parse --abbrev-ref HEAD",
            shell=True,
            cwd=clone_path,
            capture_output=True,
            text=True,
            timeout=10,
        )
        default_branch = branch_result.stdout.strip() or "main"

        return {
            "clone_path": clone_path,
            "repo_name": repo_name,
            "default_branch": default_branch,
            "error": None,
        }

    except subprocess.TimeoutExpired:
        return {
            "clone_path": "",
            "repo_name": repo_name,
            "default_branch": "",
            "error": "git clone timed out after 120 seconds.",
        }
    except Exception as e:
        return {
            "clone_path": "",
            "repo_name": repo_name,
            "default_branch": "",
            "error": f"Unexpected error during clone: {e}",
        }

