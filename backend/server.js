const express = require('express');
const cors = require('cors');
const path = require('path');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const Database = require('better-sqlite3');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'eventopia-secret-key-2024';

// ─── Middleware ───────────────────────────────────────────────────────────────
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ─── Database Setup ───────────────────────────────────────────────────────────
const db = new Database('eventopia.db');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    username  TEXT    UNIQUE NOT NULL,
    password  TEXT    NOT NULL,
    role      TEXT    NOT NULL CHECK(role IN ('admin','coordinator','student')),
    name      TEXT    NOT NULL,
    email     TEXT
  );

  CREATE TABLE IF NOT EXISTS events (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    title        TEXT    NOT NULL,
    description  TEXT,
    date         TEXT    NOT NULL,
    deadline     TEXT    NOT NULL,
    location     TEXT    NOT NULL,
    seat_limit   INTEGER NOT NULL DEFAULT 100,
    vols_needed  INTEGER NOT NULL DEFAULT 0,
    color        TEXT    NOT NULL DEFAULT 'bg-indigo-600',
    created_by   INTEGER,
    created_at   TEXT    DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS registrations (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    event_id   INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    user_id    INTEGER NOT NULL REFERENCES users(id)  ON DELETE CASCADE,
    name       TEXT    NOT NULL,
    email      TEXT    NOT NULL,
    created_at TEXT    DEFAULT (datetime('now')),
    UNIQUE(event_id, user_id)
  );

  CREATE TABLE IF NOT EXISTS tasks (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    event_id       INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    title          TEXT    NOT NULL,
    coordinator_id INTEGER REFERENCES users(id),
    status         TEXT    NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','in-progress','completed')),
    notes          TEXT    DEFAULT '',
    created_at     TEXT    DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS volunteers (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    event_id   INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    user_id    INTEGER REFERENCES users(id) ON DELETE SET NULL,
    name       TEXT    NOT NULL,
    email      TEXT    NOT NULL,
    phone      TEXT    DEFAULT '',
    role_desc  TEXT    DEFAULT 'General Volunteer',
    status     TEXT    NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected')),
    created_at TEXT    DEFAULT (datetime('now')),
    UNIQUE(event_id, email)
  );

  CREATE TABLE IF NOT EXISTS task_notes (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    task_id    INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    author_id  INTEGER NOT NULL REFERENCES users(id),
    note       TEXT    NOT NULL,
    created_at TEXT    DEFAULT (datetime('now'))
  );
`);

// ─── Seed default users ───────────────────────────────────────────────────────
function seedUsers() {
  const defaults = [
    { username: 'admin',       password: 'admin123',   role: 'admin',       name: 'Admin User',    email: 'admin@eventopia.edu' },
    { username: 'coordinator', password: 'coord123',   role: 'coordinator', name: 'Sarah Johnson', email: 'sarah@eventopia.edu' },
    { username: 'student',     password: 'student123', role: 'student',     name: 'Alex Student',  email: 'alex@eventopia.edu'  },
  ];
  const insert = db.prepare(`
    INSERT OR IGNORE INTO users (username, password, role, name, email)
    VALUES (@username, @password, @role, @name, @email)
  `);
  for (const u of defaults) {
    const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(u.username);
    if (!existing) {
      insert.run({ ...u, password: bcrypt.hashSync(u.password, 10) });
    }
  }
}

// ─── Seed sample events ───────────────────────────────────────────────────────
function seedEvents() {
  const count = db.prepare('SELECT COUNT(*) as c FROM events').get().c;
  if (count > 0) return;

  const adminId = db.prepare("SELECT id FROM users WHERE role='admin'").get()?.id || 1;
  const colors = ['bg-indigo-600', 'bg-rose-600', 'bg-blue-600', 'bg-emerald-600'];

  const sampleEvents = [
    {
      title: 'Visionary AI 2.0',
      description: 'Explore generative AI keynote speeches and hands-on LLM workshops.',
      date: '2026-11-20T10:00',
      deadline: '2026-11-15T23:59',
      location: 'Seminar Hall 4',
      seat_limit: 150,
      vols_needed: 12,
      color: colors[0],
      created_by: adminId
    },
    {
      title: 'Aurora Night',
      description: 'Annual cultural event with music, talent shows, and food stalls.',
      date: '2026-12-05T18:00',
      deadline: '2026-12-01T12:00',
      location: 'Open Arena',
      seat_limit: 200,
      vols_needed: 40,
      color: colors[1],
      created_by: adminId
    },
    {
      title: 'HackSprint 2026',
      description: '24-hour hackathon — build, pitch, and win exciting prizes.',
      date: '2026-10-10T09:00',
      deadline: '2026-10-05T23:59',
      location: 'Innovation Lab',
      seat_limit: 80,
      vols_needed: 10,
      color: colors[2],
      created_by: adminId
    }
  ];

  const insertEv = db.prepare(`
    INSERT INTO events (title, description, date, deadline, location, seat_limit, vols_needed, color, created_by)
    VALUES (@title, @description, @date, @deadline, @location, @seat_limit, @vols_needed, @color, @created_by)
  `);
  for (const ev of sampleEvents) insertEv.run(ev);
}

seedUsers();
seedEvents();

// ─── Auth Middleware ──────────────────────────────────────────────────────────
function authMiddleware(req, res, next) {
  const header = req.headers.authorization;
  if (!header) return res.status(401).json({ error: 'No token provided' });
  const token = header.split(' ')[1];
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.user.role))
      return res.status(403).json({ error: 'Forbidden' });
    next();
  };
}

// ─── AUTH ROUTES ─────────────────────────────────────────────────────────────
app.post('/api/auth/login', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password)
    return res.status(400).json({ error: 'Username and password required' });

  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
  if (!user || !bcrypt.compareSync(password, user.password))
    return res.status(401).json({ error: 'Invalid credentials' });

  const token = jwt.sign(
    { id: user.id, username: user.username, role: user.role, name: user.name },
    JWT_SECRET,
    { expiresIn: '8h' }
  );
  res.json({ token, user: { id: user.id, username: user.username, role: user.role, name: user.name, email: user.email } });
});

// ─── EVENTS ROUTES ────────────────────────────────────────────────────────────
// Get all events (with registration count)
app.get('/api/events', authMiddleware, (req, res) => {
  const events = db.prepare(`
    SELECT e.*,
           COUNT(DISTINCT r.id) AS reg_count,
           COUNT(DISTINCT v.id) AS vol_count,
           COUNT(DISTINCT t.id) AS task_count
    FROM   events e
    LEFT JOIN registrations r ON r.event_id = e.id
    LEFT JOIN volunteers    v ON v.event_id = e.id AND v.status != 'rejected'
    LEFT JOIN tasks         t ON t.event_id = e.id
    GROUP BY e.id
    ORDER BY e.date ASC
  `).all();
  res.json(events);
});

// Get single event
app.get('/api/events/:id', authMiddleware, (req, res) => {
  const ev = db.prepare(`
    SELECT e.*, COUNT(DISTINCT r.id) AS reg_count,
           COUNT(DISTINCT v.id) AS vol_count,
           COUNT(DISTINCT t.id) AS task_count
    FROM events e
    LEFT JOIN registrations r ON r.event_id = e.id
    LEFT JOIN volunteers    v ON v.event_id = e.id AND v.status != 'rejected'
    LEFT JOIN tasks         t ON t.event_id = e.id
    WHERE e.id = ?
    GROUP BY e.id
  `).get(req.params.id);
  if (!ev) return res.status(404).json({ error: 'Event not found' });
  res.json(ev);
});

// Create event (admin only)
app.post('/api/events', authMiddleware, requireRole('admin'), (req, res) => {
  const { title, description, date, deadline, location, seat_limit, vols_needed, color } = req.body;
  if (!title || !date || !deadline || !location)
    return res.status(400).json({ error: 'Missing required fields' });

  const colors = ['bg-indigo-600', 'bg-rose-600', 'bg-blue-600', 'bg-emerald-600', 'bg-violet-600', 'bg-amber-600'];
  const chosenColor = color || colors[Math.floor(Math.random() * colors.length)];

  const result = db.prepare(`
    INSERT INTO events (title, description, date, deadline, location, seat_limit, vols_needed, color, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(title, description || '', date, deadline, location, seat_limit || 100, vols_needed || 0, chosenColor, req.user.id);

  const newEvent = db.prepare('SELECT * FROM events WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json(newEvent);
});

// Update event (admin only)
app.put('/api/events/:id', authMiddleware, requireRole('admin'), (req, res) => {
  const { title, description, date, deadline, location, seat_limit, vols_needed, color } = req.body;
  if (!title || !date || !deadline || !location)
    return res.status(400).json({ error: 'Missing required fields' });

  const ev = db.prepare('SELECT id FROM events WHERE id = ?').get(req.params.id);
  if (!ev) return res.status(404).json({ error: 'Event not found' });

  db.prepare(`
    UPDATE events SET title=?, description=?, date=?, deadline=?, location=?, seat_limit=?, vols_needed=?, color=?
    WHERE id=?
  `).run(title, description || '', date, deadline, location, seat_limit || 100, vols_needed || 0, color || 'bg-indigo-600', req.params.id);

  const updated = db.prepare('SELECT * FROM events WHERE id = ?').get(req.params.id);
  res.json(updated);
});

// Delete event (admin only)
app.delete('/api/events/:id', authMiddleware, requireRole('admin'), (req, res) => {
  const ev = db.prepare('SELECT id FROM events WHERE id = ?').get(req.params.id);
  if (!ev) return res.status(404).json({ error: 'Event not found' });
  db.prepare('DELETE FROM events WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// ─── REGISTRATIONS ROUTES ─────────────────────────────────────────────────────
// Register for event (student)
app.post('/api/events/:id/register', authMiddleware, requireRole('student'), (req, res) => {
  const { name, email } = req.body;
  const eventId = req.params.id;

  const ev = db.prepare(`
    SELECT e.*, COUNT(r.id) AS reg_count
    FROM events e LEFT JOIN registrations r ON r.event_id = e.id
    WHERE e.id = ? GROUP BY e.id
  `).get(eventId);

  if (!ev) return res.status(404).json({ error: 'Event not found' });
  if (new Date(ev.deadline) < new Date()) return res.status(400).json({ error: 'Registration deadline passed' });
  if (ev.reg_count >= ev.seat_limit) return res.status(400).json({ error: 'Event is full' });

  const already = db.prepare('SELECT id FROM registrations WHERE event_id = ? AND user_id = ?').get(eventId, req.user.id);
  if (already) return res.status(400).json({ error: 'Already registered' });

  db.prepare('INSERT INTO registrations (event_id, user_id, name, email) VALUES (?, ?, ?, ?)')
    .run(eventId, req.user.id, name || req.user.name, email || '');

  res.status(201).json({ success: true, message: 'Registration successful!' });
});

// Check if current user is registered for an event
app.get('/api/events/:id/my-registration', authMiddleware, (req, res) => {
  const reg = db.prepare('SELECT id FROM registrations WHERE event_id = ? AND user_id = ?')
    .get(req.params.id, req.user.id);
  res.json({ registered: !!reg });
});

// Get all registrations for an event (admin/coordinator)
app.get('/api/events/:id/registrations', authMiddleware, requireRole('admin', 'coordinator'), (req, res) => {
  const regs = db.prepare(`
    SELECT r.*, u.username FROM registrations r
    JOIN users u ON u.id = r.user_id
    WHERE r.event_id = ?
    ORDER BY r.created_at DESC
  `).all(req.params.id);
  res.json(regs);
});

// ─── TASKS ROUTES ─────────────────────────────────────────────────────────────
// Get tasks for an event
app.get('/api/events/:id/tasks', authMiddleware, (req, res) => {
  const tasks = db.prepare(`
    SELECT t.*, u.name AS coordinator_name
    FROM tasks t
    LEFT JOIN users u ON u.id = t.coordinator_id
    WHERE t.event_id = ?
    ORDER BY t.created_at DESC
  `).all(req.params.id);
  res.json(tasks);
});

// Create task (admin only)
app.post('/api/events/:id/tasks', authMiddleware, requireRole('admin'), (req, res) => {
  const { title, coordinator_username } = req.body;
  if (!title) return res.status(400).json({ error: 'Task title required' });

  let coordId = null;
  if (coordinator_username) {
    const coord = db.prepare("SELECT id FROM users WHERE username = ? AND role = 'coordinator'").get(coordinator_username);
    if (!coord) return res.status(404).json({ error: `Coordinator "${coordinator_username}" not found` });
    coordId = coord.id;
  }

  const result = db.prepare('INSERT INTO tasks (event_id, title, coordinator_id) VALUES (?, ?, ?)')
    .run(req.params.id, title, coordId);

  const task = db.prepare(`
    SELECT t.*, u.name AS coordinator_name
    FROM tasks t LEFT JOIN users u ON u.id = t.coordinator_id
    WHERE t.id = ?
  `).get(result.lastInsertRowid);

  res.status(201).json(task);
});

// Update task status (coordinator)
app.patch('/api/tasks/:id/status', authMiddleware, requireRole('coordinator', 'admin'), (req, res) => {
  const { status } = req.body;
  if (!['pending', 'in-progress', 'completed'].includes(status))
    return res.status(400).json({ error: 'Invalid status' });

  const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(req.params.id);
  if (!task) return res.status(404).json({ error: 'Task not found' });

  db.prepare('UPDATE tasks SET status = ? WHERE id = ?').run(status, req.params.id);
  res.json({ success: true, status });
});

// ─── TASK NOTES ───────────────────────────────────────────────────────────────
// Add note to a task
app.post('/api/tasks/:id/notes', authMiddleware, requireRole('coordinator', 'admin'), (req, res) => {
  const { note } = req.body;
  if (!note || !note.trim()) return res.status(400).json({ error: 'Note cannot be empty' });

  const task = db.prepare('SELECT id FROM tasks WHERE id = ?').get(req.params.id);
  if (!task) return res.status(404).json({ error: 'Task not found' });

  const result = db.prepare(
    'INSERT INTO task_notes (task_id, author_id, note) VALUES (?, ?, ?)'
  ).run(req.params.id, req.user.id, note.trim());

  const newNote = db.prepare(`
    SELECT n.*, u.name AS author_name
    FROM task_notes n JOIN users u ON u.id = n.author_id
    WHERE n.id = ?
  `).get(result.lastInsertRowid);

  res.status(201).json(newNote);
});

// Get notes for a task
app.get('/api/tasks/:id/notes', authMiddleware, requireRole('coordinator', 'admin'), (req, res) => {
  const notes = db.prepare(`
    SELECT n.*, u.name AS author_name
    FROM task_notes n JOIN users u ON u.id = n.author_id
    WHERE n.task_id = ?
    ORDER BY n.created_at ASC
  `).all(req.params.id);
  res.json(notes);
});

// ─── VOLUNTEER ROUTES ─────────────────────────────────────────────────────────
// Register as volunteer for an event (coordinator can self-register or register anyone)
app.post('/api/events/:id/volunteers', authMiddleware, requireRole('coordinator', 'admin'), (req, res) => {
  const { name, email, phone, role_desc } = req.body;
  const eventId = req.params.id;

  if (!name || !email) return res.status(400).json({ error: 'Name and email are required' });

  const ev = db.prepare('SELECT * FROM events WHERE id = ?').get(eventId);
  if (!ev) return res.status(404).json({ error: 'Event not found' });

  // Check volunteer cap
  const volCount = db.prepare("SELECT COUNT(*) AS c FROM volunteers WHERE event_id = ? AND status != 'rejected'").get(eventId).c;
  if (volCount >= ev.vols_needed) return res.status(400).json({ error: `Volunteer slots full (${ev.vols_needed} needed)` });

  const already = db.prepare('SELECT id FROM volunteers WHERE event_id = ? AND email = ?').get(eventId, email);
  if (already) return res.status(400).json({ error: 'This email is already registered as a volunteer' });

  // Link to user account if email matches
  const linkedUser = db.prepare('SELECT id FROM users WHERE email = ?').get(email);

  const result = db.prepare(`
    INSERT INTO volunteers (event_id, user_id, name, email, phone, role_desc)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(eventId, linkedUser?.id || null, name, email, phone || '', role_desc || 'General Volunteer');

  const vol = db.prepare('SELECT * FROM volunteers WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json(vol);
});

// Get all volunteers for an event
app.get('/api/events/:id/volunteers', authMiddleware, requireRole('coordinator', 'admin'), (req, res) => {
  const vols = db.prepare(`
    SELECT v.*, u.username
    FROM volunteers v
    LEFT JOIN users u ON u.id = v.user_id
    WHERE v.event_id = ?
    ORDER BY v.created_at DESC
  `).all(req.params.id);
  res.json(vols);
});

// Update volunteer status (approve/reject)
app.patch('/api/volunteers/:id/status', authMiddleware, requireRole('coordinator', 'admin'), (req, res) => {
  const { status } = req.body;
  if (!['pending', 'approved', 'rejected'].includes(status))
    return res.status(400).json({ error: 'Invalid status' });

  const vol = db.prepare('SELECT * FROM volunteers WHERE id = ?').get(req.params.id);
  if (!vol) return res.status(404).json({ error: 'Volunteer not found' });

  db.prepare('UPDATE volunteers SET status = ? WHERE id = ?').run(status, req.params.id);
  res.json({ success: true, status });
});

// Remove a volunteer
app.delete('/api/volunteers/:id', authMiddleware, requireRole('coordinator', 'admin'), (req, res) => {
  const vol = db.prepare('SELECT id FROM volunteers WHERE id = ?').get(req.params.id);
  if (!vol) return res.status(404).json({ error: 'Volunteer not found' });
  db.prepare('DELETE FROM volunteers WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// Get all volunteer registrations for the logged-in coordinator's events
app.get('/api/my-volunteers', authMiddleware, requireRole('coordinator'), (req, res) => {
  const vols = db.prepare(`
    SELECT v.*, e.title AS event_title, e.color AS event_color
    FROM volunteers v
    JOIN events e ON e.id = v.event_id
    JOIN tasks t ON t.event_id = e.id AND t.coordinator_id = ?
    GROUP BY v.id
    ORDER BY v.created_at DESC
  `).all(req.user.id);
  res.json(vols);
});

// ─── COORDINATOR ROUTES ───────────────────────────────────────────────────────
// Get all tasks assigned to the logged-in coordinator
app.get('/api/my-tasks', authMiddleware, requireRole('coordinator'), (req, res) => {
  const tasks = db.prepare(`
    SELECT t.*, e.title AS event_title, e.color AS event_color,
           u.name AS coordinator_name
    FROM tasks t
    JOIN events e ON e.id = t.event_id
    LEFT JOIN users u ON u.id = t.coordinator_id
    WHERE t.coordinator_id = ?
    ORDER BY t.created_at DESC
  `).all(req.user.id);
  res.json(tasks);
});

// ─── STATS ROUTE (admin) ──────────────────────────────────────────────────────
app.get('/api/stats', authMiddleware, requireRole('admin'), (req, res) => {
  const totalEvents = db.prepare('SELECT COUNT(*) AS c FROM events').get().c;
  const totalRegs   = db.prepare('SELECT COUNT(*) AS c FROM registrations').get().c;
  const totalTasks  = db.prepare('SELECT COUNT(*) AS c FROM tasks').get().c;
  const totalVols   = db.prepare("SELECT COUNT(*) AS c FROM volunteers WHERE status != 'rejected'").get().c;
  const activeEvents = db.prepare(`SELECT COUNT(*) AS c FROM events WHERE deadline > datetime('now')`).get().c;
  const completedTasks = db.prepare("SELECT COUNT(*) AS c FROM tasks WHERE status='completed'").get().c;
  res.json({ totalEvents, totalRegs, totalTasks, totalVols, activeEvents, completedTasks });
});

// ─── USER MANAGEMENT ROUTES (admin) ──────────────────────────────────────────
// List all users
app.get('/api/users', authMiddleware, requireRole('admin'), (req, res) => {
  const users = db.prepare(`
    SELECT id, username, name, email, role,
           (SELECT COUNT(*) FROM registrations WHERE user_id = users.id) AS reg_count,
           (SELECT COUNT(*) FROM tasks WHERE coordinator_id = users.id) AS task_count
    FROM users ORDER BY role, name ASC
  `).all();
  res.json(users);
});

// Create user
app.post('/api/users', authMiddleware, requireRole('admin'), (req, res) => {
  const { username, password, name, email, role } = req.body;
  if (!username || !password || !name || !role)
    return res.status(400).json({ error: 'username, password, name and role are required' });
  if (!['admin','coordinator','student'].includes(role))
    return res.status(400).json({ error: 'Invalid role' });

  const exists = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
  if (exists) return res.status(400).json({ error: 'Username already taken' });

  const hashed = bcrypt.hashSync(password, 10);
  const result = db.prepare(
    'INSERT INTO users (username, password, name, email, role) VALUES (?, ?, ?, ?, ?)'
  ).run(username, hashed, name, email || '', role);

  const user = db.prepare('SELECT id, username, name, email, role FROM users WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json(user);
});

// Update user (name, email, role — not password)
app.put('/api/users/:id', authMiddleware, requireRole('admin'), (req, res) => {
  const { name, email, role } = req.body;
  if (!name || !role) return res.status(400).json({ error: 'name and role are required' });
  if (!['admin','coordinator','student'].includes(role))
    return res.status(400).json({ error: 'Invalid role' });

  const user = db.prepare('SELECT id FROM users WHERE id = ?').get(req.params.id);
  if (!user) return res.status(404).json({ error: 'User not found' });

  db.prepare('UPDATE users SET name=?, email=?, role=? WHERE id=?').run(name, email || '', role, req.params.id);
  const updated = db.prepare('SELECT id, username, name, email, role FROM users WHERE id = ?').get(req.params.id);
  res.json(updated);
});

// Reset user password
app.patch('/api/users/:id/password', authMiddleware, requireRole('admin'), (req, res) => {
  const { password } = req.body;
  if (!password || password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });

  const user = db.prepare('SELECT id FROM users WHERE id = ?').get(req.params.id);
  if (!user) return res.status(404).json({ error: 'User not found' });

  db.prepare('UPDATE users SET password=? WHERE id=?').run(bcrypt.hashSync(password, 10), req.params.id);
  res.json({ success: true });
});

// Delete user
app.delete('/api/users/:id', authMiddleware, requireRole('admin'), (req, res) => {
  if (parseInt(req.params.id) === req.user.id)
    return res.status(400).json({ error: 'Cannot delete your own account' });

  const user = db.prepare('SELECT id FROM users WHERE id = ?').get(req.params.id);
  if (!user) return res.status(404).json({ error: 'User not found' });

  db.prepare('DELETE FROM users WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// Get coordinators list (for delegate dropdown)
app.get('/api/coordinators', authMiddleware, requireRole('admin'), (req, res) => {
  const coords = db.prepare("SELECT id, username, name, email FROM users WHERE role='coordinator' ORDER BY name").all();
  res.json(coords);
});

// ─── Serve frontend ───────────────────────────────────────────────────────────
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ─── Start ────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n🚀 Eventopia server running at http://localhost:${PORT}\n`);
});
