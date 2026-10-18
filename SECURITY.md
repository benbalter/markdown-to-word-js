# Security Policy

## Reporting a vulnerability

**Please do not report security vulnerabilities through public GitHub issues.**

Instead, report them privately using one of the following:

- [GitHub private vulnerability reporting](https://github.com/benbalter/markdown-to-word-js/security/advisories/new) (preferred), or
- email **ben@balter.com**.

Please include as much of the following as you can, to help us triage quickly:

- The type of issue (e.g. XSS through the Markdown preview, a Content-Security-Policy bypass, prototype pollution, ReDoS).
- The affected component: the `markdown-to-word` npm package (`src/`), the md2word.app site (`web/`, plus `src/index.ts`, its browser entry), or the Worker that handles redirects for `/` (`worker/`).
- Step-by-step instructions to reproduce, including the Markdown input, and a proof-of-concept if possible.
- The impact, including how an attacker might exploit it.

You can expect an initial response within a few days. We will keep you informed as we work on a fix and will credit you in the release notes unless you prefer to remain anonymous.

## Scope

`markdown-to-word` converts Markdown to `.docx` entirely locally: the npm package runs in your own Node process or browser, and md2word.app performs all conversion in your browser. **No document content is ever uploaded.** Security reports that assume server-side processing of document content do not apply.
