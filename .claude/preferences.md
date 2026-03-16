Claude behavior preferences

General behavior:
- Be concise and practical.
- Avoid unnecessary file exploration.
- Minimize token usage without sacrificing necessary reasoning.
- Respect project architecture and existing patterns.
- Avoid unnecessary dependencies.

Workflow:
- For medium or large tasks, first propose a short plan.
- After plan approval, work autonomously until the task is complete.
- Implement changes incrementally.
- After implementation, verify functionality.
- If something is broken, diagnose and fix it automatically.
- Continue iterating until the task works correctly or a real blocker is reached.

Editing rules:
- Prefer minimal edits over rewriting full files.
- Do not rewrite entire files unless necessary.
- Preserve formatting and comments when possible.

Approval rules:
- Ask before destructive, risky, or irreversible actions.
- Do not interrupt for every small implementation step once approval is given.

Tools and environment:
- Prefer Node.js or Python depending on project context.
- Prefer Playwright for browser automation tasks.
- Optimize for low token usage.

## Dependency Rules
- Do not install new dependencies unless the task clearly requires it.
- Prefer using existing project dependencies first.
- If a new dependency is required, explain why before installing it.
- Avoid heavy frameworks or large packages when a small solution exists.

## Change Safety Rules
- Before editing, identify the smallest file(s) that must change.
- Prefer small incremental edits over large rewrites.
- Do not modify unrelated files.
- Avoid refactoring large sections unless explicitly requested.
- Preserve existing architecture and naming conventions.

## Codebase Exploration Rules
- Do not scan the entire repository unless necessary.
- Start by inspecting the minimal set of relevant files.
- Prefer reading entry points first (package.json, main server file, main routes).
- Avoid exploring large directories like node_modules, build, dist, or cache.
- Respect .gitignore when searching files.

## Validation Rules
- After implementing a change, verify functionality.
- Run the smallest possible validation first.
- If errors occur, diagnose and fix automatically.
- Continue iterating until the task works or a true blocker is reached.

## Terminal Usage Rules
- Run only commands directly related to the task.
- Prefer safe read-only commands first.
- Avoid destructive commands unless explicitly approved.
- Do not remove files or directories without confirmation.

## Debugging Rules
- When an error occurs, inspect logs or console output first.
- Identify the root cause before modifying code.
- Avoid guessing fixes without checking the error source.
- Prefer targeted fixes over speculative changes.

## Efficiency Rules
- Minimize unnecessary explanations.
- Avoid repeating large code blocks.
- Focus on implementation steps rather than theory.
- Optimize for minimal token usage during development tasks.

## Environment
- Development environment is a Replit container accessed via VS Code SSH.
- All edits must remain compatible with the existing Replit runtime.
- Ask before installing packages or modifying the database schema.
