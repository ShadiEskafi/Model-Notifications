# Dashboard Frontend Specification: Moodle Radar

**Document Reference:** `specs/05-dashboard-frontend-spec.md`  
**Related Documents:** 
- [`intent/PRD.md`](file:///f:/SHADI/2-Programming/Model%20Notifications/moodle-radar/intent/PRD.md)
- [`specs/01-database-spec.md`](file:///f:/SHADI/2-Programming/Model%20Notifications/moodle-radar/specs/01-database-spec.md)
- [`specs/02-moodle-integration-spec.md`](file:///f:/SHADI/2-Programming/Model%20Notifications/moodle-radar/specs/02-moodle-integration-spec.md)
- [`specs/03-edge-functions-spec.md`](file:///f:/SHADI/2-Programming/Model%20Notifications/moodle-radar/specs/03-edge-functions-spec.md)
- [`specs/04-telegram-bot-spec.md`](file:///f:/SHADI/2-Programming/Model%20Notifications/moodle-radar/specs/04-telegram-bot-spec.md)

---

## 1. Technical Stack & Architectural Principles

The Web Admin Dashboard is designed as a focused, lightweight Single-Page Application (SPA) prioritizing fast load times, zero bundle bloat, and minimal maintenance.

### 1.1 Stack Specification
* **Framework:** React 19 (Plain JavaScript / JSX)
* **Build Tooling:** Vite 8
* **Styling Framework:** Tailwind CSS v4 (Embedded utility styles with dark mode default)
* **Icons:** `lucide-react`
* **Data & Auth Client:** `@supabase/supabase-js` (v2)
* **Hosting Target:** Vercel or Cloudflare Pages (Free Tier)

---

## 2. Component Hierarchy & Directory Architecture

```text
src/
├── main.jsx                     # Application bootstrap and DOM mounting
├── App.jsx                      # Route & authentication state controller
├── index.css                    # Tailwind CSS v4 directives & theme variables
├── context/
│   └── AuthContext.jsx          # Supabase auth state & session provider
├── components/
│   ├── layout/
│   │   ├── Navbar.jsx           # Top branding bar with live health indicator & sign out
│   │   └── Layout.jsx           # Responsive shell container (max-w-7xl)
│   ├── metrics/
│   │   └── MetricsGrid.jsx      # High-visibility KPI cards
│   ├── donors/
│   │   ├── DonorList.jsx        # Token status, health badges, and expiry alerts
│   │   └── OnboardDonorModal.jsx# Handshake dialog for new tokens
│   ├── courses/
│   │   ├── CoursesTable.jsx     # Master table with filter switches & "Poll Now"
│   │   └── CourseRow.jsx        # Individual course entry with optimistic toggles
│   └── logs/
│       └── DeliveryLogsModal.jsx# Audit drawer for recent Telegram broadcasts
└── lib/
    ├── supabaseClient.js        # Initialized Supabase singleton
    └── api.js                   # Edge function helper calls (/sync-courses)
```

---

## 3. UI Layout & Design System Specifications

### 3.1 Design Palette & Aesthetic Tokens
The dashboard adheres to a high-contrast dark aesthetic:
* **Background Canvas:** `bg-neutral-950`
* **Card & Surface Background:** `bg-neutral-900 border border-neutral-800`
* **Primary Text:** `text-neutral-100`
* **Muted/Secondary Text:** `text-neutral-400`
* **Accent & Actions:** `bg-blue-600 hover:bg-blue-500 text-white`
* **Success Indicator:** `text-emerald-400 bg-emerald-950/40 border-emerald-800`
* **Warning Indicator:** `text-amber-400 bg-amber-950/40 border-amber-800`
* **Destructive / Error:** `text-rose-400 bg-rose-950/40 border-rose-800`

---

### 3.2 Visual Component Decomposition

#### 1. Metric KPI Cards (`MetricsGrid.jsx`)
Four top-level overview cards giving the Super Admin instant operational status:
1. **Monitored Courses:** Active count / Total onboarded count.
2. **Active Donor Tokens:** Number of healthy tokens vs. failing/revoked tokens.
3. **Subscribed Students:** Total unique Telegram users registered in `bot_users`.
4. **Recent Deliveries (24h):** Total broadcast messages dispatched successfully.

---

#### 2. Donor Token Management Modal (`OnboardDonorModal.jsx`)
* **Trigger:** Click `[ + Onboard Donor Token ]` in the header.
* **Fields:**
  - **Cohort Label:** e.g., `"Cybersecurity - Year 3"` (Input text, required).
  - **Moodle Base URL:** Defaults to preconfigured university URL (editable).
  - **Token Mode Selector:**
    - Option A: Raw `wstoken` string input (recommended).
    - Option B: Ephemeral Single-Request Credentials (Student ID + Password). Handshake runs in memory via `/sync-courses`, credential discarded immediately.
* **Interaction Behavior:**
  - On submit: Displays an animated validation spinner while verifying `core_webservice_get_site_info`.
  - On success: Closes modal, refreshes courses table, and displays a success toast with the donor student's name.
  - On failure: Displays the raw Moodle exception message inline with a retry option.

---

#### 3. Monitored Courses Table (`CoursesTable.jsx`)
The core operational table displaying course tracking states and granular module filters:

| Column | Content / Controls |
| :--- | :--- |
| **Course ID & Name** | Moodle course ID badge + full course name (`SEC301 - Network Security`). |
| **Cohort Tag** | Colored badge indicating the academic year/faculty. |
| **Donor Token** | Label of the assigned donor token + Fallback indicator badge. |
| **Module Filters** | Checkboxes for: `[x] Forum`, `[x] Assign`, `[x] Files`. |
| **Status Switch** | Toggle component: `Active` (Emerald) vs. `Paused` (Neutral). |
| **Actions** | `[ Poll Now ]` button (triggers immediate delta check for this course). |

---

## 4. Supabase Authentication & Security

### 4.1 Access Control Model
* **Single-Role Authentication:** Access is restricted to the Super Admin via standard Supabase Email and Password login.
* **Signup Prevention:** Public registrations are completely disabled in the Supabase project configuration (`Enable signup = false`).
* **Session Persistence:** Managed automatically by the Supabase client library with local storage caching and automatic JWT token refresh.
* **Route Protection:** The `App.jsx` component wraps all dashboard views in an `AuthGuard` check:

```javascript
// Auth Guard pattern in App.jsx
if (loading) {
  return <LoadingScreen />;
}

if (!session) {
  return <LoginView />;
}

return <DashboardLayout session={session} />;
```

---

## 5. Client-Side Error Handling & Resilience

1. **Optimistic Updates:** When the Super Admin toggles a course's `is_monitored` or module filter, the UI reflects the change immediately. If the Supabase database write fails, the UI rolls back to the prior state and renders a toast error.
2. **React Error Boundary:** Catches unexpected rendering exceptions in subtrees, rendering a fallback card with a "Reload Dashboard" action.
3. **Empty States:** Renders actionable illustrations and guidance when no courses or tokens have been onboarded yet.
