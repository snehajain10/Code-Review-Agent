Code Review Agent

A multi-agent AI system that analyzes, secures, documents, and prepares code for production using large language models.

Overview
AI tools have made code generation faster, but critical steps like review, security checks, testing, and documentation are often skipped.  
This project adds an automated validation layer that ensures code is reliable and production-ready.

Features
- Recursive project scanning  
- Code summarization in plain language  
- Security analysis for common vulnerabilities  
- Automatic documentation (`CODE_REVIEW.md`)  
- Dependency extraction (`requirements.txt`)  
- Dockerfile generation and container execution  
- Iterative Docker error resolution  
- GitHub repository analysis  
- Web-based interface  

Architecture
Built using a multi-agent design with Google ADK.

- **Orchestrator Agent**: Controls flow and coordinates execution  
- **Security & Documentation Agent**: Performs analysis, vulnerability detection, and documentation  
- **Docker Agent**: Handles containerization, build, run, and error resolution  

The system follows a sequential pipeline where each agent contributes to a complete end-to-end review.

Tech Stack

- Python  
- Google ADK (LlmAgent)  
- LiteLLM  
- OpenRouter models:
  - gpt-oss-120b (primary)  
  - gpt-oss-20b (fallback)  
  - NVIDIA Nemotron-3 (fallback)  
- Docker  

## Model Strategy

Uses LiteLLM with a fallback mechanism to ensure reliability.  
If the primary model fails or is rate-limited, the system automatically switches to alternative models.

How It Works

1. Input: project folder or GitHub repository  
2. Recursive file scanning  
3. Code analysis and documentation generation  
4. Dependency extraction  
5. Docker build and execution  
6. Final summarized output  

Getting Started

```bash
git clone https://github.com/your-username/Code-Review-Agent.git
cd Code-Review-Agent
python -m venv venv
venv\Scripts\activate
pip install -r requirements.txt
python main.py --path <project_folder>
