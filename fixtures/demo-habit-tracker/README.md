# Habit Tracker

A tiny habit tracker: an Express API backed by Postgres, with a React client.

## Run it

1. Set `DB_URL` to your Postgres connection string.
2. Load the schema from `db/schema.sql`.
3. Start the API with `npm run dev`.

## How adding a habit works

`POST /api/habits` is handled by `createHabit()` in `server/controllers/habits.js`.
Every request goes through `requireAuth` first, which reads the `x-user-id` header.
