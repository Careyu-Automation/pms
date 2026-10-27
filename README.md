# CareYu Automation — Project Management

Internal project management and project tracking workspace for CareYu Automation.

This repository is the application foundation. Authentication, the workspace shell, and module navigation are in place. Business modules such as leads, feasibility, costing, projects, tasks, and analytics are placeholders for later phases.

## Tech stack

- Frontend: React, React Router, Vite, modern CSS, Lucide icons
- Backend: Node.js, Express, REST
- Database: PostgreSQL through a single `pg` connection pool and parameterized SQL

The frontend never connects to PostgreSQL. The browser talks only to the Express API.

## Folder structure

```text
careyu-project-management/
├── client/                 React workspace
│   ├── src/
│   │   ├── assets/
│   │   ├── components/     layout, ui, auth, common
│   │   ├── pages/          auth and module placeholders
│   │   ├── routes/         navigation, protected routes
│   │   ├── services/       API client
│   │   ├── context/        auth, theme, sidebar, toasts
│   │   ├── hooks/
│   │   ├── utils/
│   │   └── styles/         design tokens and shared CSS
│   ├── .env.example
│   └── package.json
├── server/                 Express API
│   ├── config/
│   ├── db/                 shared pool and repositories
│   ├── routes/
│   ├── controllers/
│   ├── services/
│   ├── middleware/
│   ├── utils/
│   ├── validators/
│   ├── .env.example
│   └── package.json
├── database/
│   ├── schema.sql          roles and users
│   └── seed.sql            role records
├── .gitignore
└── README.md
```

## Frontend setup

```bash
cd client
npm install
```

Copy the example environment file:

```bash
# macOS / Linux
cp .env.example .env

# Windows PowerShell
Copy-Item .env.example .env
```

`client/.env`:

```text
VITE_API_BASE_URL=http://localhost:5000/api
```

Do not put database credentials or `JWT_SECRET` in the frontend environment.

## Backend setup

```bash
cd server
npm install
```

```bash
# macOS / Linux
cp .env.example .env

# Windows PowerShell
Copy-Item .env.example .env
```

Fill in `server/.env`:

```text
PORT=5000
NODE_ENV=development
CLIENT_ORIGIN=http://localhost:5176

DB_HOST=localhost
DB_PORT=5432
DB_NAME=careyu_pms
DB_USER=
DB_PASSWORD=
DB_MAX_CONNECTIONS=10
DB_IDLE_TIMEOUT_MS=10000

JWT_SECRET=
```

`JWT_SECRET` must be at least 32 characters. Generate one with:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

`CLIENT_ORIGIN` is the browser origin allowed by CORS. Separate multiple origins with commas. Real secrets stay in `.env`, which is gitignored. Commit only `.env.example`.

## PostgreSQL setup

Create a database named `careyu_pms`, then run the scripts in order.

### Local PostgreSQL

```bash
psql -U postgres -c "CREATE DATABASE careyu_pms;"
psql -U postgres -d careyu_pms -f database/schema.sql
psql -U postgres -d careyu_pms -f database/seed.sql
```

Run those commands from the repository root. Point `DB_USER` and `DB_PASSWORD` at the role that owns the database.

### Docker

```bash
docker run -d --name careyu-pms-db -e POSTGRES_USER=careyu -e POSTGRES_PASSWORD=choose-a-password -e POSTGRES_DB=careyu_pms -p 5432:5432 postgres:16-alpine
```

Apply the scripts:

```powershell
Get-Content database\schema.sql | docker exec -i careyu-pms-db psql -U careyu -d careyu_pms -v ON_ERROR_STOP=1
Get-Content database\seed.sql | docker exec -i careyu-pms-db psql -U careyu -d careyu_pms -v ON_ERROR_STOP=1
```

If port 5432 is already in use, publish another host port, such as `-p 55432:5432`, and set `DB_PORT` to that same host port.

The API uses one shared `pg` pool. Idle connections are closed after `DB_IDLE_TIMEOUT_MS` (10000 ms). Queries are parameterized. Do not open a new pool from a controller or service.

## Database initialization

`database/schema.sql` creates:

- `roles`
- `users`, with `role_id` referencing `roles`
- indexes on email, role, and active status
- `updated_at` triggers

`database/seed.sql` inserts role records. New accounts receive the `employee` role. No default password is seeded.

Later modules should add their own tables in new scripts. They should keep using the shared pool and parameterized queries.

## Running the frontend

```bash
cd client
npm run dev
```

The app runs at `http://localhost:5176`.

```bash
npm run build
npm run preview
```

## Running the backend

```bash
cd server
npm run dev
```

The API runs at `http://localhost:5000`. `npm start` runs it without file watching.

The process checks the database on startup and closes the pool on shutdown.

## Authentication

| Method | Path | Access |
| --- | --- | --- |
| POST | `/api/auth/signup` | Public |
| POST | `/api/auth/login` | Public |
| POST | `/api/auth/logout` | Public, clears the session cookie |
| GET | `/api/auth/me` | Signed-in users |
| GET | `/api/health` | Public |

Passwords are hashed with bcrypt before they are stored. Responses never include the password or the hash.

Login sets an HttpOnly cookie named `__session`. Firebase Hosting only forwards that cookie name to Cloud Run. The JSON body contains the user, not the token. Remember me keeps the cookie for 7 days. Otherwise the cookie lasts for the browser session and the token expires in 12 hours.

Every protected API request loads the current user from PostgreSQL after the token is verified, so a later permission model can sit in middleware without changing the React shell.

Signup and login are rate limited. Validation runs on the server even when the form already checked the same rules.

## Workspace

Authenticated routes use one application shell: sidebar, header, and page content. Navigation is defined in `client/src/routes/navigation.js`. Add a future module by replacing the placeholder for that route. Do not rebuild the shell.

Theme choice and sidebar state are stored in `localStorage`.

## Development commands

Frontend:

```bash
cd client
npm install
npm run dev
```

Backend:

```bash
cd server
npm install
npm run dev
```

Database, from the repository root after PostgreSQL is running:

```bash
psql -d careyu_pms -f database/schema.sql
psql -d careyu_pms -f database/seed.sql
```

## Current scope

Phase 1 is the foundation only. Placeholder pages do not include sample projects, statistics, or charts. Lead management, feasibility, costing, planning, tasks, time, leave, procurement, messaging, insights, and administration will be added one module at a time.
