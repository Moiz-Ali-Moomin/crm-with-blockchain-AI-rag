# Security Policy

## Supported Versions

| Version | Supported |
|---|---|
| `main` (latest) | Yes |
| Older tags | No |

## Reporting a Vulnerability

**Do not open a public GitHub issue for security vulnerabilities.**

Email: `security@yourcrm.com`

Please include:
- A description of the vulnerability and its potential impact
- Steps to reproduce (proof-of-concept if possible)
- Any relevant logs or screenshots (mask secrets)

You will receive an acknowledgement within **48 hours** and a resolution timeline within **7 days**.

## Scope

In scope:
- Authentication bypass
- Tenant data isolation violations (one tenant accessing another's data)
- Privilege escalation (RBAC bypass)
- SQL injection / NoSQL injection
- Remote code execution
- Sensitive data exposure (secrets, PII)
- Blockchain private key exposure

Out of scope:
- Denial of service attacks
- Social engineering
- Issues in third-party dependencies (report to the dependency maintainer)
- Issues requiring physical access to the server

## Security Practices in This Codebase

- **JWT blacklist:** Logout invalidates tokens via Redis TTL
- **Tenant isolation:** Prisma middleware enforces `WHERE tenant_id = ?` on every query
- **RBAC:** Role-based access control guards on all sensitive routes
- **Input validation:** All request bodies validated with Zod schemas
- **Helmet:** HTTP security headers set globally
- **Rate limiting:** `@nestjs/throttler` applied globally
- **Secrets:** All credentials in `.env` — never committed to version control
- **Blockchain key:** Private key used only for on-chain writes; use KMS in production
- **Prompt injection defence:** AI system prompt is hardcoded; user input never reaches the system message
