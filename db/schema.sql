CREATE TABLE IF NOT EXISTS events (
    id TEXT PRIMARY KEY NOT NULL,
    title TEXT NOT NULL,
    society TEXT NOT NULL,
    theme TEXT NOT NULL,
    event_date TEXT NOT NULL,
    start_time TEXT NOT NULL,
    end_time TEXT NOT NULL CHECK (start_time < end_time),
    venue TEXT NOT NULL,
    capacity INTEGER NOT NULL CHECK (capacity >= 0),
    description TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS rsvps (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    owner_id TEXT NOT NULL,
    event_id TEXT NOT NULL REFERENCES events (id),
    seats INTEGER NOT NULL CHECK (seats BETWEEN 1 AND 4),
    note TEXT NOT NULL DEFAULT '' CHECK (length(note) <= 140),
    UNIQUE (owner_id, event_id)
);

CREATE INDEX IF NOT EXISTS rsvps_by_event ON rsvps (event_id);
