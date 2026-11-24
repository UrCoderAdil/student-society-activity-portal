# Student Society Activity Portal

**Web Engineering · Assignment 2 · Idea 08**

Students can find society events and create, view, update, or remove a personal RSVP. This version keeps the layout and eight fictional event records from Assignment 1. PHP and SQLite handle availability checks and save the RSVP plan.

**Instructor rule or data variant** Pending. The demo carries forward the four-seat limit per RSVP and checks for overlapping events. These are demo rules.

## Run locally

Use PHP **8.5** with PDO and `pdo_sqlite`. Python 3 is optional for the tests.

```powershell
git clone --branch assignment-2 --single-branch https://github.com/UrCoderAdil/student-society-activity-portal.git
cd student-society-activity-portal
php -v
php --ri pdo_sqlite
php db/seed.php
php -S 127.0.0.1:8085 -t public
```

Open [http://127.0.0.1:8085/](http://127.0.0.1:8085/). Keep the server running while using the app. Press `Ctrl+C` to stop it. The seed command creates `var/portal.sqlite`, inserts the eight events, and preserves existing events and RSVPs when rerun. The database and PHP session files stay outside `public/` and are ignored by Git.

On Windows, if PHP 8.5 is missing, extract the official PHP 8.5 ZIP into `C:\php85` and prepend that folder to your terminal's PATH with `$env:Path = 'C:\php85;' + $env:Path`. If `php --ri pdo_sqlite` reports that the driver is missing, use `php --ini` to find the active configuration. In `C:\php85\php.ini` for a fresh ZIP, set these lines and run the driver check again. [Windows PHP downloads](https://windows.php.net/download/) · [PDO SQLite documentation](https://www.php.net/manual/en/ref.pdo-sqlite.php)

```ini
extension_dir = "C:\php85\ext"
extension=pdo_sqlite
```

Setup was verified with PHP 8.5.13 and SQLite 3.54.1. The PHP app uses the local class-demo option. GitHub Pages serves the Assignment 1 static site and cannot execute PHP. [GitHub Pages documentation](https://docs.github.com/en/pages/getting-started-with-github-pages/creating-a-github-pages-site)

## Demo walkthrough

1. Search for `library` and choose **Literary Society**. Two results appear. Choose **Computing Society** to see the empty state, then click **Clear**.
2. Open **Sketch the Courtyard**, enter `2` seats and add `Bring a sketchbook` as a demo note. Click **Save RSVP**. The success message and **My RSVPs** update in place.
3. Click **Edit** in **My RSVPs**, change the seat count to `3`, and click **Update RSVP**. Reload the page to confirm the edit is saved in the same session.
4. Try **Build Your First Web Page** while Sketch the Courtyard is still saved. The server rejects the time conflict. Try requesting `4` seats for **Campus Plant Walk** to see its capacity error.
5. Click **Remove** and confirm. The list and available seats update. Open a private window to see a separate RSVP plan.

For a small live change, change the search match in `public/app.js` to omit descriptions. Search for `independently` before and after the edit to show how the filter changes. For a data change, add a new event with a unique ID to `db/events.json`, rerun `php db/seed.php`, and reload to see it.

## Application flow

```text
Browser form → Fetch JSON request → PHP endpoint → PDO → SQLite
Browser DOM  ← JSON state/error  ← PHP response ← query result
```

| File | Responsibility |
| --- | --- |
| `public/index.php` | Accessible page and form. Starts the PHP session and escapes the CSRF token for the HTML meta attribute. |
| `public/app.js` | Uses `fetch` with `async`/`await`, updates the DOM, and shows loading, empty, success, and error states without a navigation. |
| `public/api/portal.php` | Parses JSON, checks CSRF on writes, runs the database operation, and responds with a status code and JSON. |
| `app/reservations.php` | Validates and executes RSVP operations. Queries that use variable values use PDO placeholders. |
| `app/bootstrap.php` | Sets session options and opens the private SQLite database. |
| `db/schema.sql`, `db/events.json`, `db/seed.php` | Define the `events` and `rsvps` tables and load the existing demo catalogue. |

`rsvps.event_id` references `events.id`. A unique constraint allows one RSVP per session owner and event. The server counts reservations from all sessions against event capacity and uses a write transaction to keep the check and write together. The owner comes from the PHP session. Listing, updating, and deleting a plan use that owner, and another session's RSVP ID returns `404`. Session cookies use HttpOnly and SameSite=Lax, with Secure enabled under HTTPS.

The browser sends the session's CSRF token in `X-CSRF-Token` for writes. The server checks event IDs, integer seat counts, note length, capacity, duplicates, and overlapping dates and times. Notes and catalogue text are inserted into the page through `textContent` or option text. The app does not use `localStorage` or `sessionStorage`. The local demo uses anonymous session ownership, so a new PHP session starts a new plan.

### JSON endpoint

All methods use `/api/portal.php`. Successful responses contain `events` with current availability and the current session's `rsvps`.

| Method | Purpose | Example JSON body | Success |
| --- | --- | --- | --- |
| `GET` | Read events and the current plan | None | `200` |
| `POST` | Create an RSVP | `{"eventId":"creative-sketch","seats":2,"note":"Bring a sketchbook"}` | `201` |
| `PATCH` | Update seat count and note | `{"id":1,"seats":3,"note":"Bring pencils"}` | `200` |
| `DELETE` | Remove an RSVP | `{"id":1}` | `200` |

Failures return `{"error":"..."}`. The main cases are `400` for malformed JSON, `403` for missing or invalid CSRF, `404` for a missing or inaccessible RSVP, `409` for conflicts or insufficient seats, and `422` for invalid fields.

## Tests

```powershell
py -3 tests/test_api.py
```

On systems where the Python executable is `python3`, run `python3 tests/test_api.py`. The test runner starts a PHP server on a free loopback port using a disposable SQLite database. Set `PORTAL_PHP` to the path of a PHP 8.5 executable if it is not first on PATH.

| Case | Verified result |
| --- | --- |
| Seed twice and load the directory | Eight events appear and a new session's plan is empty. |
| Missing or invalid input | Unknown events, missing seat counts, non-integers, out-of-range seats and long notes return `422`. |
| Create and read | The RSVP appears for its owner and available seats fall. A duplicate returns `409`. |
| Successful update | The new seat count and note persist while the RSVP ID and event stay the same. |
| Delete | The plan clears and the event's seats are released. Repeating the deletion returns `404`. |
| Another session and invalid CSRF | Another session cannot read, patch, or delete the RSVP. Missing and wrong tokens return `403`. |
| Conflicts and request errors | Overlap, sold-out events, shared capacity, malformed JSON, unsupported methods, and requests for the private database are covered. |

The automated API suite passed 11 tests. Browser checks covered four widths (320, 390, 768 and 1440 CSS pixels), loading and empty states, saving and editing without a page reload, safe note display, session isolation, and retry after a simulated HTTP failure.

## Screenshots

![Assignment 2 desktop event directory and RSVP form](screenshots/desktop.png)

[Mobile layout](screenshots/mobile.png) · [Fetch loading](screenshots/fetch-loading.png) · [Successful RSVP update](screenshots/rsvp-updated.png) · [No matching events](screenshots/no-results.png) · [Retry after a simulated HTTP 503](screenshots/error-retry.png)

## AI assistance and attribution

I used OpenAI Codex to extend the portal with the PHP API, SQLite schema, Fetch interactions, tests, and documentation. This version reuses the layout, styling, event records, and campus image from Assignment 1. The campus image was created with OpenAI ImageGen. [Assignment 1 source and image prompt](https://github.com/UrCoderAdil/student-society-activity-portal/tree/main#ai-assistance-and-attribution)
