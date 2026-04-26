# Requirements Document

## Introduction

A multi-agent code review system built in Python using Google ADK (Agent Development Kit) with Gemini models. The system accepts a project folder path as input, recursively scans all files, and coordinates specialized sub-agents to perform security analysis, documentation generation, and Docker containerization. All agents and tools are contained in a single Python file.

The system consists of:
- An **Orchestrator Agent** that manages sub-agents, answers user questions, and determines execution flow
- A **Security & Documentation Agent** that summarizes code, detects vulnerabilities, generates markdown documentation, and produces a `requirements.txt`
- A **Docker Agent** that creates a `Dockerfile` from the `requirements.txt`, builds and runs it, and iteratively resolves any issues

## Glossary

- **Orchestrator_Agent**: The top-level LlmAgent that coordinates sub-agents and handles user interaction
- **Security_Documentation_Agent**: Sub-agent responsible for code analysis, vulnerability detection, documentation, and dependency extraction
- **Docker_Agent**: Sub-agent responsible for Dockerfile creation, image building, container execution, and iterative error resolution
- **Project_Folder**: The root directory path provided by the user, scanned recursively for source files
- **ADK**: Google Agent Development Kit — the framework used to define agents and tools
- **LlmAgent**: The ADK agent class backed by a Gemini language model
- **Tool**: A Python function registered with an agent to perform a discrete action
- **requirements.txt**: A pip-compatible file listing Python package dependencies extracted from the project
- **Dockerfile**: A text file containing instructions to build a Docker image for the project
- **Vulnerability**: A security weakness in source code such as hardcoded secrets, unsafe deserialization, SQL injection, or use of deprecated APIs

---

## Requirements

### Requirement 1: Project Folder Ingestion

**User Story:** As a developer, I want to provide a project folder path to the system, so that all source files are discovered and made available for analysis.

#### Acceptance Criteria

1. THE Orchestrator_Agent SHALL accept a project folder path as the initial user input.
2. WHEN a project folder path is provided, THE Orchestrator_Agent SHALL recursively scan all files within the folder and its subdirectories.
3. IF the provided path does not exist or is not a directory, THEN THE Orchestrator_Agent SHALL return a descriptive error message and halt execution.
4. WHEN scanning the project folder, THE Orchestrator_Agent SHALL collect the relative path and text content of each file that has a recognized source file extension (`.py`, `.js`, `.ts`, `.java`, `.go`, `.rb`, `.cs`, `.cpp`, `.c`, `.h`, `.html`, `.css`, `.json`, `.yaml`, `.yml`, `.toml`, `.env`, `.sh`).
5. WHILE scanning, THE Orchestrator_Agent SHALL skip binary files, hidden directories (prefixed with `.`), and common non-source directories (`node_modules`, `__pycache__`, `.git`, `venv`, `.venv`, `dist`, `build`).

---

### Requirement 2: Orchestration and Flow Control

**User Story:** As a developer, I want an orchestrator to manage the review pipeline, so that sub-agents are called in the correct order and I can ask questions about the process.

#### Acceptance Criteria

1. THE Orchestrator_Agent SHALL invoke the Security_Documentation_Agent before invoking the Docker_Agent.
2. WHEN the Security_Documentation_Agent completes successfully, THE Orchestrator_Agent SHALL pass the generated `requirements.txt` path to the Docker_Agent.
3. IF the Security_Documentation_Agent returns an error, THEN THE Orchestrator_Agent SHALL report the error to the user and SHALL NOT invoke the Docker_Agent.
4. WHEN a user asks a question about the project or the review process, THE Orchestrator_Agent SHALL answer using the collected file content and agent outputs without re-running the full pipeline.
5. THE Orchestrator_Agent SHALL present a final summary to the user after all sub-agents have completed, including paths to all generated artifacts.

---

### Requirement 3: Code Summarization

**User Story:** As a developer, I want a summary of my codebase, so that I can quickly understand the project structure and purpose.

#### Acceptance Criteria

1. WHEN the Security_Documentation_Agent is invoked, THE Security_Documentation_Agent SHALL produce a plain-language summary describing the overall purpose, structure, and key components of the project.
2. THE Security_Documentation_Agent SHALL include the summary as the first section of the generated markdown documentation file.
3. WHEN the project contains more than 20 files, THE Security_Documentation_Agent SHALL group the summary by subdirectory.

---

### Requirement 4: Vulnerability Detection

**User Story:** As a developer, I want my code scanned for security vulnerabilities, so that I can fix issues before deployment.

#### Acceptance Criteria

1. WHEN analyzing source files, THE Security_Documentation_Agent SHALL detect the following vulnerability categories: hardcoded secrets or credentials, SQL injection patterns, use of `eval` or `exec` on untrusted input, insecure deserialization, use of deprecated or known-vulnerable library versions, and missing input validation on external data.
2. FOR EACH detected vulnerability, THE Security_Documentation_Agent SHALL record the file path, line number, vulnerability category, and a plain-language description of the risk.
3. IF no vulnerabilities are detected, THEN THE Security_Documentation_Agent SHALL explicitly state that no vulnerabilities were found in the documentation.
4. THE Security_Documentation_Agent SHALL include all vulnerability findings in a dedicated "Security Findings" section of the markdown documentation file.

---

### Requirement 5: Markdown Documentation Generation

**User Story:** As a developer, I want auto-generated markdown documentation, so that my project is documented without manual effort.

#### Acceptance Criteria

1. WHEN analysis is complete, THE Security_Documentation_Agent SHALL create a markdown file named `CODE_REVIEW.md` in the root of the Project_Folder.
2. THE `CODE_REVIEW.md` file SHALL contain the following sections in order: Project Summary, File Structure, Security Findings, and Dependency List.
3. THE Security_Documentation_Agent SHALL overwrite any existing `CODE_REVIEW.md` file in the Project_Folder.
4. WHEN writing the documentation file, THE Security_Documentation_Agent SHALL use a tool that writes text content to a specified file path.

---

### Requirement 6: Dependency Extraction

**User Story:** As a developer, I want a `requirements.txt` generated from my project, so that dependencies are captured for containerization.

#### Acceptance Criteria

1. WHEN analyzing Python source files, THE Security_Documentation_Agent SHALL extract all third-party import statements and map them to their corresponding pip package names.
2. THE Security_Documentation_Agent SHALL create a `requirements.txt` file in the root of the Project_Folder listing one package per line.
3. IF a `requirements.txt` already exists in the Project_Folder, THEN THE Security_Documentation_Agent SHALL merge the existing entries with the newly detected dependencies, deduplicating the result.
4. THE Security_Documentation_Agent SHALL include the resolved `requirements.txt` path in its output to the Orchestrator_Agent.

---

### Requirement 7: Dockerfile Creation

**User Story:** As a developer, I want a Dockerfile generated for my project, so that I can containerize it without writing one manually.

#### Acceptance Criteria

1. WHEN the Docker_Agent is invoked, THE Docker_Agent SHALL read the `requirements.txt` file from the Project_Folder.
2. THE Docker_Agent SHALL create a `Dockerfile` in the root of the Project_Folder using a Python base image, copying project files, installing dependencies from `requirements.txt`, and specifying a default entry point.
3. WHEN determining the entry point, THE Docker_Agent SHALL look for a `main.py` or `app.py` file in the Project_Folder root; IF neither exists, THEN THE Docker_Agent SHALL use the first `.py` file found at the root level as the entry point.
4. THE Docker_Agent SHALL overwrite any existing `Dockerfile` in the Project_Folder.

---

### Requirement 8: Docker Build and Run

**User Story:** As a developer, I want the system to build and run the Docker container, so that I can verify the project runs correctly in isolation.

#### Acceptance Criteria

1. WHEN the Dockerfile is created, THE Docker_Agent SHALL execute a `docker build` command targeting the Project_Folder and tag the image with a name derived from the Project_Folder's base directory name.
2. WHEN the image builds successfully, THE Docker_Agent SHALL execute a `docker run` command on the built image and capture stdout and stderr output.
3. THE Docker_Agent SHALL report the build and run output to the Orchestrator_Agent upon completion.

---

### Requirement 9: Iterative Docker Error Resolution

**User Story:** As a developer, I want the Docker agent to automatically fix build or run errors, so that I don't have to debug container issues manually.

#### Acceptance Criteria

1. IF a `docker build` command exits with a non-zero status code, THEN THE Docker_Agent SHALL analyze the error output, modify the `Dockerfile`, and retry the build.
2. IF a `docker run` command exits with a non-zero status code, THEN THE Docker_Agent SHALL analyze the error output, update the `Dockerfile` or `requirements.txt` as needed, rebuild the image, and retry the run.
3. THE Docker_Agent SHALL attempt a maximum of 5 iterative fix-and-retry cycles before reporting failure to the Orchestrator_Agent.
4. WHEN the maximum retry limit is reached without success, THE Docker_Agent SHALL report the final error output and the last state of the `Dockerfile` to the Orchestrator_Agent.

---

### Requirement 10: Tool Design and Agent Structure

**User Story:** As a developer, I want all agents and tools in a single Python file using Google ADK patterns, so that the system is easy to run and maintain.

#### Acceptance Criteria

1. THE System SHALL implement all agents and tools in a single Python file.
2. THE System SHALL use the `google-adk` library's `LlmAgent` class for all agents.
3. THE System SHALL use Gemini as the backing language model for all agents.
4. EACH agent SHALL have only the tools it requires registered to it, with no shared mutable global state between agents.
5. THE Orchestrator_Agent SHALL reference the Security_Documentation_Agent and Docker_Agent as sub-agents using the ADK sub-agent pattern.
6. EACH tool SHALL be implemented as a plain Python function with a descriptive docstring that the ADK framework uses as the tool description.
7. THE System SHALL be invokable from the command line by passing the project folder path as an argument.
