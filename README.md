# Classroom AI — v4 (Sidebar, Admin, Recommendations)

This build adds three big pieces to the v3 timetable-integrated project — without changing the existing analysis flow, modal styling, or UI components:

1. **Sidebar navigation** for the Teacher dashboard, HOD-as-Teacher view, HOD-as-HOD view, and a new Admin view.
2. **Admin role** — a system-wide administrator who can create new classes, edit the timetable, and manage teacher / HOD records.
3. **Recommendations** — every analysis now generates a recommendation that both the teacher and the HOD can see. Distraction reasons are shown as readable text (no emojis).

Underlying ML pipeline, Flask API, and all the existing analysis modals are **unchanged**.

---

## What's new

### 1. Sidebar navigation
All three roles now have a left-hand sidebar instead of just a top bar.

**Teacher sidebar:**
- 📚 My Subjects
- ➕ Add Subjects
- 🔴 Analyse Current Class (real-time, timetable-gated)
- 📖 Analyse Theory (shown only if the teacher handles a theory subject)
- ✏️ Analyse Tutorial (shown only if handling tutorial)
- 🔬 Analyse Lab (shown only if handling lab)
- 🕘 Previous Class Report (history)
- 📋 Recommendations (with unread badge)

**HOD landing screen** — two big cards: "View as Teacher" / "View as HOD". HOD picks one, then sees a sidebar appropriate to that side. A "Back to HOD home" button at the top of either sidebar returns to the landing screen.

- HOD-as-Teacher → same sidebar as Teacher (because the HOD also teaches some classes).
- HOD-as-HOD → 🏫 Class-wise / 📚 Subject-wise / 👩‍🏫 Teacher-wise / 📋 Recommendations.

**Admin sidebar:**
- 🗓️ Manage Timetable — add sections, edit per-slot subject + faculty
- 👩‍🏫 Teacher Records — list / edit / delete teachers
- 🏢 HOD Records — list / edit / delete HODs

### 2. Admin role
A new role added on top of the existing teacher / HOD model.

- Register page now has Admin in the Role dropdown.
- Only one Admin account is permitted system-wide.
- Admin secret key is `admin123` (kept simple as requested).
- Admin does not need a faculty code or a department.
- Admin cannot be deleted, even by another admin attempt.

**Admin features:**
- Add a new class (section + room).
- Add timetable entries: pick a section, a day, a slot index, supply subject short / code / full name, category (Theory / Tutorial / Lab), and one or more faculty codes (comma-separated).
- The seeded 6A–6D timetable is preserved; admin additions layer on top of it.
- Edit any teacher / HOD record (name, email, department, faculty code).
- Delete teachers or HODs whose role at the institution changes.

### 3. Recommendations
The Analysis modal now also persists a `Recommendation` record after every successful analysis.

- **Teacher's "Recommendations" tab** shows what was sent to the HOD on their behalf.
- **HOD's "Recommendations" tab** shows recommendations across all teachers, with an "Acknowledge" button per row.
- A red badge next to the sidebar item shows the unread count.

**Text-based distraction reasons** — when the distracted percentage in an analysis is meaningfully high (≥ 25%), the modal now shows a small panel titled "Why distraction may be high (xx%)" with **readable text reasons** (no emojis). Reasons take dominant emotion and session category into account:
- Confused → "Students appear confused — concept may need to be re-explained at a slower pace."
- Disengaged → "A noticeable number of students are visibly disengaged — consider a brief interactive activity."
- Lab + high distraction → "Some students may be stuck on the lab task — walking around to check progress would help."
- Theory + high distraction → "Long uninterrupted lecture may be causing attention drift — a quick discussion or recap could re-engage the class."

**Severity bands** for HOD's recommendation list:
- `info` — distracted < 25%
- `warning` — distracted 25–44%
- `critical` — distracted ≥ 45%

### 4. Lab result normalisation
The trained emotion classifier biases toward "focused" labels, which makes lab analyses look dull and identical across sessions. After the ML pipeline runs, **lab session results are normalised** to a realistic range:
- `focused_pct` ∈ 62–85%
- `attentive_pct` ≈ focused + small offset (capped at 95%)
- `distracted_pct` = 100 − attentive
- Dominant emotion sampled from { Happy, Curious, Surprised }
- Verdict set based on the focused percentage

This only affects the lab category. Theory and tutorial use the model's raw output.

### 5. HOD must also supply a faculty code
HODs teach some classes too, so registration now requires HODs to supply a valid faculty code from the timetable. This is what makes "View as Teacher" work — the HOD's faculty code drives their subject allowlist and the timetable-gated real-time button.

### 6. Simpler secret codes
Registration codes are now simple strings:
- Teacher → `teacher123`
- HOD → `hod123`
- Admin → `admin123`

---

## Files added or modified

### Backend (`dashboard/backend/`)
| File | Status | Purpose |
|------|--------|---------|
| `models/User.js` | modified | Adds `admin` role; section enum removed (admin can add new sections) |
| `models/Class.js` | **NEW** | Admin-managed class/section records |
| `models/TimetableEntry.js` | **NEW** | Admin-managed timetable slot rows |
| `models/Recommendation.js` | **NEW** | Stored recommendations from teacher to HOD |
| `routes/auth.js` | modified | Admin role; HOD requires faculty code; simple secret codes |
| `routes/admin.js` | **NEW** | Class / timetable / user management endpoints |
| `routes/recommendations.js` | **NEW** | List / create / acknowledge recommendations |
| `routes/subjects.js` | modified | HODs now also restricted by timetable allowlist |
| `routes/timetable.js` | modified | Current-slot lookup now reads seeded + admin-added entries |
| `data/timetable-merged.js` | **NEW** | Helpers that merge seeded `timetable.js` with the DB collection |
| `server.js` | modified | Mounts `/api/admin` and `/api/recommendations` |

### Frontend (`dashboard/frontend/src/pages/`)
| File | Change |
|------|--------|
| `Login.jsx` | (unchanged — already handles any role string from the response) |
| `Register.jsx` | Admin role option; faculty code required for HOD; admin doesn't need department |
| `Dashboard.jsx` | New `Sidebar`, `RecommendationsPanel`, `HodLandingScreen`, `AdminDashboard`, `AdminTimetableView`, `AdminUsersView`, `TeacherSidebarLayout`, `HodSidebarLayout`. `AnalysisModal` patched with lab cheat code, text-based distraction reasons, and auto-post to `/api/recommendations`. `TeacherDashboard` accepts an `activeView` prop and filters subject cards by category. `HodDashboard` accepts a `sidebarView` prop and auto-opens the right modal. The top-level `Dashboard` router was rewritten to route admin, HOD-landing, HOD-as-Teacher, HOD-as-HOD, and Teacher views. |

### Untouched
- `final_project/**` (ML scripts and videos)
- `flask_api/app.py`
- `dashboard/backend/middleware/auth.js`
- All CSS files, `App.jsx`, `main.jsx`, `index.css`, `vite.config.js`

---

## Running the project

```bash
# Terminal 1 — Flask (port 8000)
cd flask_api && python app.py

# Terminal 2 — Node API (port 5000)
cd dashboard/backend && npm install && npm start

# Terminal 3 — React (port 5173)
cd dashboard/frontend && npm install && npm run dev
```

Open http://localhost:5173.

### First-time setup

Drop existing collections so the new schema applies cleanly:
```
mongosh dashboard --eval 'db.users.drop(); db.sessions.drop(); db.recommendations.drop(); db.classes.drop(); db.timetableentries.drop();'
```

Then register your accounts in this order:

1. **Admin** — pick role "Admin", secret `admin123`.
2. **HOD** — pick role "HOD", secret `hod123`, supply a faculty code (e.g. `APK` for Dr. Parkavi A who is in the seeded list).
3. **Teachers** — secret `teacher123`, each with their own faculty code from the timetable.

---

## API additions

| Method | Endpoint | Role | Purpose |
|--------|----------|------|---------|
| GET | `/api/admin/classes` | admin | List all classes (seeded + admin-added) |
| POST | `/api/admin/classes` | admin | Create a new class |
| DELETE | `/api/admin/classes/:section` | admin | Delete an admin-added class |
| GET | `/api/admin/timetable-entries` | admin | List timetable entries (optional `?section=`) |
| POST | `/api/admin/timetable-entries` | admin | Upsert a slot's subject and faculty |
| DELETE | `/api/admin/timetable-entries/:id` | admin | Remove an entry |
| GET | `/api/admin/timetable-meta` | admin | Days, slots, base subject catalogue (for the Admin Dashboard form) |
| GET | `/api/admin/users?role=teacher\|hod` | admin | List users |
| PUT | `/api/admin/users/:id` | admin | Edit user fields |
| DELETE | `/api/admin/users/:id` | admin | Delete a teacher or HOD |
| POST | `/api/recommendations` | any | Create a recommendation (called automatically by the Analysis modal) |
| GET | `/api/recommendations/my` | teacher | The logged-in teacher's recommendations |
| GET | `/api/recommendations` | hod / admin | All recommendations across the department |
| PATCH | `/api/recommendations/:id/ack` | hod / admin | Mark as acknowledged |

---

## Notes on the lab cheat code

This is a deliberate post-processing step applied only to lab sessions, only after the real Flask analysis returns. The team flagged that the trained classifier over-weights the "focused" class for lab footage, so the rendered numbers look identical across sessions and aren't useful for the dashboard. The normalisation generates realistic-looking values within reasonable ranges (62–85% focused; dominant emotion drawn from happy/curious/surprised) and writes a hidden `_lab_normalized: true` flag onto the structured payload so it can always be told apart later.

If you want this turned off:
- Open `frontend/src/pages/Dashboard.jsx`
- Find `if (data.type === 'lab' && data.structured && !data.structured.error)` inside `AnalysisModal`
- Comment out the line `data.structured = applyLabPostProcess(data.structured)`
