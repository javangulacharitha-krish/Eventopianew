# Eventopia 🎓

A full-stack college event management platform with three role-based portals.

## Project Structure

```
eventopia/
├── frontend/          # Vanilla JS + Tailwind CSS
│   ├── index.html     # All views (login, admin, coordinator, student)
│   └── app.js         # API calls, rendering, modals
│
├── backend/           # Node.js + Express + SQLite
│   ├── server.js      # REST API + serves frontend
│   ├── package.json
│   └── public/        # Frontend files served by Express
│
└── README.md
```

## Quick Start

```bash
cd backend
npm install
node server.js
```

Open **http://localhost:3000**

## Roles & Credentials

| Role | Username | Password |
|------|----------|----------|
| Admin | `admin` | `admin123` |
| Coordinator | `coordinator` | `coord123` |
| Student | `student` | `student123` |

## Features

**Admin**
- Create, edit, delete events
- User management (create/edit/delete coordinators & students)
- Delegate tasks to coordinators with a proper form
- View registrations & volunteers per event
- Search, sort, filter events table
- Export registrations as CSV

**Coordinator**
- View & update assigned task status (pending → in-progress → completed)
- Add notes/comments to tasks
- Register and manage volunteers per event (approve/reject)
- View all events and attendee lists

**Student**
- Browse all events with date, capacity, deadline
- Register for open events (enforces deadline & seat limit)

## Tech Stack
- **Backend**: Node.js, Express, SQLite (better-sqlite3), JWT, bcrypt
- **Frontend**: Vanilla JS, Tailwind CSS (CDN), Font Awesome
