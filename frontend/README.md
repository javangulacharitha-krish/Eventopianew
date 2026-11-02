# Eventopia — Frontend

Built with **Vanilla JS + Tailwind CSS** (CDN). No build step needed.

## Files
- `index.html` — All HTML views (login, admin, coordinator, student)
- `app.js` — All JS logic: API calls, rendering, modals

## How it works
The frontend talks to the backend REST API at `/api/*`.
When served via the backend (`node server.js`), it's available at `http://localhost:3000`.

## Roles
| Portal | Credentials |
|--------|-------------|
| Admin | `admin` / `admin123` |
| Coordinator | `coordinator` / `coord123` |
| Student | `student` / `student123` |
