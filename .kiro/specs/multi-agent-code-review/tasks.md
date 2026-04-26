# Implementation Plan: Multi-Agent Code Review System

## Overview

Implement the multi-agent code review system across three files (`tools.py`, `agents.py`, `main.py`) using Google ADK `LlmAgent` instances backed by Gemini models. The orchestrator delegates to two sub-agents in sequence: `Security_Documentation_Agent` then `Docker_Agent`.

## Tasks

- [x] 1. Set up project structure and dependencies
  - Create the `multi-agent-code-review/` directory with empty `tools.py`, `agents.py`, and `main.py` files
  - Create `pyproject.toml` or `requirements.txt` listing `google-adk`, `hypothesis`, and `pytest` as dependencies
  - _Requirements: 10.1, 10.2, 10.3_

- [x] 2. Implement `tools.py` — core tool functions
  - [x] 2.1 Implement `scan_project_folder(folder_path: str) -> dict`
    - Recursively walk the folder, collect `{relative_path: content}` for recognized source extensions
    - Skip binary files, hidden directories, and skip-list directories (`node_modules`, `__pycache__`, `.git`, `venv`, `.venv`, `dist`, `build`)
    - Return `{"project_folder": str, "files": dict, "file_count": int, "error": str | None}`
    - If path does not exist or is not a directory, set `"error"` and return immediately
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5_

  - [x]* 2.2 Write property test for `scan_project_folder` — P1: File scan completeness and filtering
    - **Property 1: File scan completeness and filtering**
    - Generate random directory trees with mixed extensions and skip-list dirs using `hypothesis` and `tmp_path`
    - Assert every recognized-extension file outside skip dirs appears in output; assert no skipped files appear
    - Tag: `# Feature: multi-agent-code-review, Property 1: File scan completeness and filtering`
    - **Validates: Requirements 1.2, 1.4, 1.5**

  - [x]* 2.3 Write property test for `scan_project_folder` — P2: Invalid path produces no artifacts
    - **Property 2: Invalid path produces error and no artifacts**
    - Generate random non-existent path strings; assert `"error"` key is set and no files are written
    - Tag: `# Feature: multi-agent-code-review, Property 2: Invalid path produces error and no artifacts`
    - **Validates: Requirements 1.3, 2.3**

  - [x] 2.4 Implement `read_file(file_path: str) -> str`
    - Read and return text content of a file; raise or return an error string on failure
    - _Requirements: 10.6_

  - [x] 2.5 Implement `write_file(file_path: str, content: str) -> str`
    - Write text content to a file, creating or overwriting it; return a confirmation string
    - _Requirements: 5.4, 10.6_

  - [x]* 2.6 Write unit tests for `read_file` / `write_file` round-trip
    - Assert `write_file` then `read_file` on the same path returns identical content
    - _Requirements: 5.4_

  - [x] 2.7 Implement `run_shell_command(command: str, cwd: str) -> dict`
    - Execute the command in `cwd`, capture stdout, stderr, and exit code
    - Return `{"stdout": str, "stderr": str, "exit_code": int}`
    - _Requirements: 8.1, 8.2, 10.6_

  - [x]* 2.8 Write unit tests for `run_shell_command`
    - Assert exit codes, stdout, and stderr are correctly captured for known commands
    - _Requirements: 8.3_

- [x] 3. Checkpoint — Ensure all tool tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 4. Implement `agents.py` — Security_Documentation_Agent
  - [x] 4.1 Define `Security_Documentation_Agent` as an `LlmAgent`
    - Import `read_file`, `write_file` from `tools.py`
    - Register only `read_file` and `write_file` as tools
    - Write the instruction prompt covering: project summary (grouped by subdir if >20 files), vulnerability detection for all six categories, `CODE_REVIEW.md` structure (four sections in order: Project Summary, File Structure, Security Findings, Dependency List), dependency extraction and `requirements.txt` merge/dedup, and returning the `requirements.txt` path
    - _Requirements: 3.1, 3.2, 3.3, 4.1, 4.2, 4.3, 4.4, 5.1, 5.2, 5.3, 5.4, 6.1, 6.2, 6.3, 6.4, 10.2, 10.4_

  - [x]* 4.2 Write property test for `CODE_REVIEW.md` section ordering — P6
    - **Property 6: CODE_REVIEW.md section ordering**
    - Generate random project file sets; assert the four required sections appear in the correct order in the output markdown
    - Tag: `# Feature: multi-agent-code-review, Property 6: CODE_REVIEW.md section ordering`
    - **Validates: Requirements 5.2, 3.2**

  - [x]* 4.3 Write property test for `requirements.txt` deduplication — P4
    - **Property 4: requirements.txt deduplication and merge**
    - Generate random sets of existing and new package names with deliberate overlaps; assert merged output contains the exact union with no duplicates
    - Tag: `# Feature: multi-agent-code-review, Property 4: requirements.txt deduplication and merge`
    - **Validates: Requirements 6.3**

  - [x]* 4.4 Write property test for vulnerability record completeness — P3
    - **Property 3: Vulnerability record completeness**
    - Generate synthetic source files with injected vulnerability patterns; assert each injected pattern produces a finding with all four required fields (file path, line number, category, description)
    - Tag: `# Feature: multi-agent-code-review, Property 3: Vulnerability record completeness`
    - **Validates: Requirements 4.1, 4.2**

- [x] 5. Implement `agents.py` — Docker_Agent
  - [x] 5.1 Define `Docker_Agent` as an `LlmAgent`
    - Import `read_file`, `write_file`, `run_shell_command` from `tools.py`
    - Register only those three tools
    - Write the instruction prompt covering: reading `requirements.txt`, entry-point priority (`main.py` → `app.py` → first root `.py`), `Dockerfile` structure (FROM python, COPY, RUN pip install, CMD/ENTRYPOINT), `docker build` and `docker run` execution, iterative fix-and-retry loop (max 5 cycles), and failure reporting
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 8.1, 8.2, 8.3, 9.1, 9.2, 9.3, 9.4, 10.2, 10.4_

  - [x]* 5.2 Write property test for Dockerfile required elements — P7
    - **Property 7: Dockerfile required elements**
    - Generate random `requirements.txt` content; assert generated Dockerfile contains `FROM python`, `COPY`, `RUN pip install -r requirements.txt`, and `CMD`/`ENTRYPOINT`
    - Tag: `# Feature: multi-agent-code-review, Property 7: Dockerfile required elements`
    - **Validates: Requirements 7.2**

  - [x]* 5.3 Write property test for entry point selection priority — P8
    - **Property 8: Entry point selection priority**
    - Generate project root structures with various combinations of `main.py`, `app.py`, and other `.py` files; assert correct priority-based selection
    - Tag: `# Feature: multi-agent-code-review, Property 8: Entry point selection priority`
    - **Validates: Requirements 7.3**

  - [x]* 5.4 Write property test for Docker retry bound — P5
    - **Property 5: Docker retry bound and failure report**
    - Mock `run_shell_command` to always return non-zero exit codes; assert exactly 5 retry attempts are made, then a failure report containing error output and Dockerfile content is returned
    - Tag: `# Feature: multi-agent-code-review, Property 5: Docker retry bound and failure report`
    - **Validates: Requirements 9.3, 9.4**

- [x] 6. Implement `agents.py` — Orchestrator_Agent
  - [x] 6.1 Define `Orchestrator_Agent` as an `LlmAgent`
    - Import `scan_project_folder` from `tools.py`
    - Register only `scan_project_folder` as a tool
    - Set `sub_agents=[security_documentation_agent, docker_agent]`
    - Write the instruction prompt covering: accepting project folder path, calling `scan_project_folder`, validating the result (halt on error), delegating to `Security_Documentation_Agent` first then `Docker_Agent`, answering user questions without re-running the pipeline, and presenting a final summary with all artifact paths
    - _Requirements: 1.1, 2.1, 2.2, 2.3, 2.4, 2.5, 10.2, 10.4, 10.5_

  - [x]* 6.2 Write property test for security agent error halting pipeline — P9
    - **Property 9: Security agent error halts pipeline**
    - Generate random error messages from a mocked `Security_Documentation_Agent`; assert `Docker_Agent` is never invoked and the error is reported to the user
    - Tag: `# Feature: multi-agent-code-review, Property 9: Security agent error halts pipeline`
    - **Validates: Requirements 2.3**

- [x] 7. Checkpoint — Ensure all agent and property tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 8. Implement `main.py` — CLI entry point
  - [x] 8.1 Wire up `argparse` to accept `project_folder_path` as a positional argument
    - Import `orchestrator` from `agents.py`
    - Set up ADK `Runner` with `orchestrator` and call `asyncio.run(runner.run(...))`
    - Pass the parsed `project_folder_path` as the initial user message to the runner
    - _Requirements: 1.1, 10.7_

  - [ ]* 8.2 Write integration test for full pipeline against a synthetic project
    - Create a small synthetic Python project in a temp directory
    - Run the full pipeline (mocking LLM calls if needed) and assert `CODE_REVIEW.md`, `requirements.txt`, and `Dockerfile` are created with correct structure
    - _Requirements: 2.1, 2.2, 2.5, 5.1, 6.2, 7.1_

  - [ ]* 8.3 Write integration test for orchestrator halting on Security_Documentation_Agent error
    - Mock `Security_Documentation_Agent` to return an error; assert `Docker_Agent` is never invoked and the error surfaces to the user
    - _Requirements: 2.3_

  - [ ]* 8.4 Write integration test for Docker retry loop termination
    - Mock `run_shell_command` to always fail; assert the retry loop stops after 5 attempts and a failure report is returned
    - _Requirements: 9.3, 9.4_

- [x] 9. Final checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for a faster MVP
- Each task references specific requirements for traceability
- Property tests use `hypothesis` with a minimum of 100 iterations per property
- Each property test must include the tag comment: `# Feature: multi-agent-code-review, Property N: <property_text>`
- `tools.py` has no ADK imports — keep it that way for testability
- Agent instruction prompts are the primary mechanism for encoding business logic; keep them precise and complete
