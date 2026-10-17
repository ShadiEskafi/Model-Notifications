# Project Guidelines & Code Standards

## Architecture & Component Design

- **Component Structure**:
  - Use functional components exclusively with React Hooks.
  - Keep components modular, focused, and single-responsibility.
  - Place shared components in `src/components/` and custom hooks in `src/hooks/`.
  - Place helper/utility functions in `src/utils/` or `src/lib/`.
- **File & Identifier Naming**:
  - React components: `PascalCase.jsx` (e.g., `CourseCard.jsx`, `NotificationBanner.jsx`).
  - Hooks: `camelCase.js` prefixed with `use` (e.g., `useMoodleNotifications.js`).
  - Utilities and configs: `camelCase.js` or `kebab-case.js`.
  - Constants: `UPPER_SNAKE_CASE`.

## React & State Management

- Use standard React 19 hooks (`useState`, `useReducer`, `useEffect`, `useCallback`, `useMemo`, `useId`).
- Keep state as local as possible; lift state up only when siblings or parents require access.
- Avoid derived state in `useState`; compute values during render or wrap in `useMemo` if computationally expensive.
- Keep `useEffect` dependency arrays exhaustive and accurate to comply with `eslint-plugin-react-hooks`.

## Data Fetching & Error Handling

- Always handle loading, error, and empty states explicitly when fetching data (e.g. Moodle feeds, notifications, LMS endpoints).
- Wrap network operations in `try...catch` blocks or appropriate async guards.
- Provide accessible, user-friendly fallback UI rather than letting uncaught errors break the entire render tree.

## Styling & Assets

- Place global styles and resets in `src/index.css`.
- Keep component styles localized in dedicated CSS files or CSS modules adjacent to their components.
- Optimize images and SVGs before committing them to `src/assets/` or `public/`.

## Code Quality & Verification

- Run `npm run lint` regularly and ensure 0 lint errors before pushing code.
- Avoid disabling ESLint rules with inline comments unless strictly justified with an explanation.
- Test production builds locally with `npm run build` followed by `npm run preview`.
