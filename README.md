# Clienta

Clienta is a three-tier customer management app with a browser frontend, an Express API, and a MySQL database.

## Run locally

Start the app from `app/backend` with `npm start`. It reads database settings from `app/backend/.env`, creates the customer table when the database is available, and serves both the frontend and API on port 8080. Open `http://localhost:8080` to use the app. Copy the root `.env.example` to `app/backend/.env`, set your local database credentials, and create the configured MySQL database before starting.

## Deployment

The frontend uses the same-origin `/api/customers` path. Keep the frontend and API on the same origin. Never put database credentials in frontend files.

## Repository structure

- `app/` - application source code and database schema.
- `infra/` - placeholder for future infrastructure code.
- `scripts/` - placeholder for future operations scripts.
- `docs/` - project documentation and templates.
