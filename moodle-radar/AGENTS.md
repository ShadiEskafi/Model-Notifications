# Moodle Radar

Moodle Radar is a React application built with Vite for tracking, monitoring, or notifying Moodle platform updates and activity.

## Tech Stack

- **Framework**: React 19 (JSX)
- **Bundler & Dev Server**: Vite 8
- **Compiler/Plugins**: `@vitejs/plugin-react`
- **Linting**: ESLint 10 (flat config with `eslint-plugin-react-hooks` and `eslint-plugin-react-refresh`)
- **Package Manager**: npm

## Development Commands

- `npm run dev` — Start the local Vite development server with HMR.
- `npm run build` — Build production assets to `dist/`.
- `npm run preview` — Preview the production build locally.
- `npm run lint` — Run ESLint across all `.js` and `.jsx` files.

## Project Structure & Key Entry Points

```text
moodle-radar/
├── index.html            # Main HTML template
├── vite.config.js        # Vite configuration
├── eslint.config.js      # ESLint flat config
├── public/               # Static public assets
└── src/
    ├── main.jsx          # Application entry point (DOM mount)
    ├── App.jsx           # Root application component
    ├── App.css           # Component styles
    ├── index.css         # Global styles
    └── assets/           # Bundled assets (images, icons)
```

## Testing

- Testing framework is currently **not configured**.
- When adding tests, Vitest + React Testing Library is recommended to align with the Vite build setup.

## Code & Quality Standards

- Always run `npm run lint` before committing changes.
- Adhere to the guidelines defined in [`.agents/rules/guidelines.md`](file:///f:/SHADI/2-Programming/Model%20Notifications/moodle-radar/.agents/rules/guidelines.md).
