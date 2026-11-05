CREATE TABLE users (
  id serial PRIMARY KEY,
  email text NOT NULL,
  name text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE habits (
  id serial PRIMARY KEY,
  user_id integer NOT NULL REFERENCES users(id),
  title text NOT NULL,
  frequency text NOT NULL DEFAULT 'daily'
);
