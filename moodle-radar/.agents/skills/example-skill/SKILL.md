---
name: example-skill
description: Template for creating new project-specific skills and automated runbooks for Moodle Radar.
---

# Example Project Skill Template

Use this template as a reference when defining project-specific workflows, scripts, or operational procedures for Moodle Radar.

## When to Use

- When automating recurring tasks (e.g. scaffolding components, integrating Moodle web services/APIs, managing local environment configs).
- When standardizing multi-step developer procedures.

## Procedure Steps

1. **Prerequisites**:
   - Ensure dependencies are installed: `npm install`
   - Ensure the dev server or required mock services are available.

2. **Execution**:
   - Run relevant build or validation commands:
     ```bash
     npm run lint
     npm run build
     ```

3. **Verification**:
   - Verify that changes compile cleanly with Vite and meet all project guidelines in `.agents/rules/guidelines.md`.
