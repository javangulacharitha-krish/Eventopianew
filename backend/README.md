# Eventopia — Backend

Built with **Node.js + Express + SQLite** (better-sqlite3).

## Setup

```bash
npm install
node server.js
```

Server runs at `http://localhost:3000`

## Stack
- **Express** — REST API
- **better-sqlite3** — embedded SQLite database (no external DB needed)
- **bcryptjs** — password hashing
- **jsonwebtoken** — JWT auth

## API Endpoints

### Auth
| Method | Route | Access |
|--------|-------|--------|
| POST | `/api/auth/login` | Public |

### Events
| Method | Route | Access |
|--------|-------|--------|
| GET | `/api/events` | All |
| POST | `/api/events` | Admin |
| PUT | `/api/events/:id` | Admin |
| DELETE | `/api/events/:id` | Admin |

### Registrations
| Method | Route | Access |
|--------|-------|--------|
| POST | `/api/events/:id/register` | Student |
| GET | `/api/events/:id/registrations` | Admin, Coordinator |

### Tasks
| Method | Route | Access |
|--------|-------|--------|
| GET | `/api/events/:id/tasks` | All |
| POST | `/api/events/:id/tasks` | Admin |
| PATCH | `/api/tasks/:id/status` | Coordinator, Admin |
| POST | `/api/tasks/:id/notes` | Coordinator, Admin |

### Volunteers
| Method | Route | Access |
|--------|-------|--------|
| POST | `/api/events/:id/volunteers` | Coordinator, Admin |
| GET | `/api/events/:id/volunteers` | Coordinator, Admin |
| PATCH | `/api/volunteers/:id/status` | Coordinator, Admin |
| DELETE | `/api/volunteers/:id` | Coordinator, Admin |

### Users (Admin only)
| Method | Route | Access |
|--------|-------|--------|
| GET | `/api/users` | Admin |
| POST | `/api/users` | Admin |
| PUT | `/api/users/:id` | Admin |
| PATCH | `/api/users/:id/password` | Admin |
| DELETE | `/api/users/:id` | Admin |
