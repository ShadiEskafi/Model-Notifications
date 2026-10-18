# Dashboard Frontend Implementation Plan & Tasks (Spec 05)

**Specification Reference:** [`specs/05-dashboard-frontend-spec.md`](file:///f:/SHADI/2-Programming/Model%20Notifications/moodle-radar/specs/05-dashboard-frontend-spec.md)  
**Status:** 100% Completed & Verified in Arabic Light Mode (RTL) matching Figma Section `03 · Arabic Light Mode (RTL) · العربية الفاتحة` (`node-id=28:431`) ✅  
**Last Updated:** 2026-10-17  

---

## Task Progress Checklist

### Phase 1: Environment & Dependencies Setup
- [x] **Task 1.1:** Install required production dependencies (`@supabase/supabase-js`, `lucide-react`, `tailwindcss v4`, `@tailwindcss/vite`).
- [x] **Task 1.2:** Configure Tailwind CSS v4 in `vite.config.js` and `src/index.css`.
- [x] **Task 1.3:** Setup `.env.local` with Supabase project credentials and secure in `.gitignore`.
- [x] **Task 1.4:** Initialize Supabase client singleton in `src/lib/supabaseClient.js`.
- [x] **Task 1.5:** Validate build pipeline (`npm run build`) and linting (`npm run lint`).

---

### Phase 2: Authentication System & Session State
- [x] **Task 2.1:** Create `src/context/AuthContextDef.js` and `src/context/AuthProvider.jsx` with `src/hooks/useAuth.js` providing session listener, login, and logout.
- [x] **Task 2.2:** Build `src/components/auth/LoginView.jsx` matching Figma `28:432` ("Authentication — Normal · Arabic Light RTL") and `28:562` ("Invalid credentials").
- [x] **Task 2.3:** Update `src/App.jsx` with an `AuthGuard` that renders `LoginView` when unauthenticated and the main dashboard when logged in.

---

### Phase 3: Shell Layout & Navigation (Arabic Light RTL)
- [x] **Task 3.1:** Build `src/components/layout/Navbar.jsx` matching Figma `28:628`:
  - Moodle Radar brand badge with radar pulse indicator.
  - Live system connectivity status (`متصل / تشغيلي`).
  - Super Admin profile badge and Sign Out button.
  - Quick action buttons `[ + إضافة متبرع ]` and `[ سجلات التدقيق والتسليم ]`.
- [x] **Task 3.2:** Build Workspace Header matching Figma `28:658`:
  - "نظرة عامة على المراقبة" title and subtitle ("جداول الفحص النشطة، توكنات المتبرعين، وفلاتر تنبيهات المساقات.").
  - `[ + إضافة متبرع جديد ]` primary action button.
- [x] **Task 3.3:** Build `src/components/layout/Layout.jsx` with responsive container formatting (`max-w-7xl`), clean light background canvas (`bg-slate-50`), and Arabic footer.

---

### Phase 4: Operational KPI Metric Cards & Donor Token Management
- [x] **Task 4.1:** Build `src/components/metrics/MetricsGrid.jsx` matching Figma `28:665`:
  - **المساقات المراقبة:** Active count / Total onboarded count with percentage indicator.
  - **توكنات المتبرعين النشطة:** Healthy tokens count vs. Revoked/Expired alerts.
  - **الطلاب المشتركون بالبوت:** Unique student count from `bot_users`.
  - **إرساليات البث (24 ساعة):** Broadcast messages dispatched with success/failure counters.
- [x] **Task 4.2:** Build `src/components/donors/DonorList.jsx` matching Figma card grid `28:703`:
  - 4-column card grid with cohort label and health status badge (`نشط`, `ملغي`, `منتهي`).
  - Moodle user identity and Moodle ID.
  - Formatted last validated timestamp in Arabic locale.
  - Real-time diagnostic pill (`أساسي لـ X مساقات · Y احتياطي`).
  - Fallback empty state prompting token onboarding (Figma `28:1056`).
- [x] **Task 4.3:** Connect metrics and donor management to live Supabase queries with real-time recalculation.

---

### Phase 5: Monitored Courses Table & Granular Controls
- [x] **Task 5.1:** Build `src/components/courses/CoursesTable.jsx` and `CourseRow.jsx` matching Figma `28:863`:
  - Course ID & Fullname badge.
  - Cohort Tag badge (e.g. "الأمن السيبراني — السنة 3").
  - Donor Token badge with fallback status indicator.
  - 4 granular module filter buttons (`منتديات`, `إعلانات`, `واجبات`, `ملفات`) with optimistic updates.
  - Global `Active / Paused` toggle switch (`is_monitored`).
  - Diagnostic `[ فحص الآن ]` button with loading animation.
- [x] **Task 5.2:** Add search input by keyword and cohort tag filter dropdown in Arabic RTL.
- [x] **Task 5.3:** Empty state view when no courses are onboarded yet, prompting to add a donor token.

---

### Phase 6: Donor Token Onboarding Modal
- [x] **Task 6.1:** Build `src/components/donors/OnboardDonorModal.jsx` dialog matching Figma `28:1172`:
  - تسمية الدفعة أو التخصص (Cohort Label input - required).
  - رابط بوابة مودل الأساسي (Moodle Base URL input).
  - رمز وصول خدمة مودل (`wstoken`).
  - Security banner documenting AES-256-GCM encryption.
  - Validation progress spinner with Moodle API handshake.
  - Success confirmation & error toast handling in Arabic RTL.

---

### Phase 7: Delivery Audit Logs Drawer
- [x] **Task 7.1:** Build `src/components/logs/DeliveryLogsModal.jsx` as a slide-over flyout drawer matching Figma `28:2094`:
  - 4 summary statistics pills: `تم التسليم`, `قيد الانتظار`, `فشل الإرسال`, and `معدل النجاح`.
  - Filter tabs: `كافة السجلات`, `الناجحة`, `الجزئية`, and `الفاشلة`.
  - Feed items with Arabic timestamp, course name, event badge, and recipient delivery ratios.
  - Expandable diagnostic details card with log UUID, failure error telemetry, and retry states.

---

### Phase 8: Typography, RTL & Verification
- [x] **Task 8.1:** Setup `<html lang="ar" dir="rtl">` with Google Font `Cairo` for authentic Arabic typography.
- [x] **Task 8.2:** Global React Error Boundary in Arabic Light RTL (`src/components/common/ErrorBoundary.jsx`).
- [x] **Task 8.3:** Responsive layout testing (mobile, tablet, desktop).
- [x] **Task 8.4:** Execute `npm run lint` and verify 0 errors (Exit code 0).
- [x] **Task 8.5:** Execute `npm run build` and test production bundle (Exit code 0).
