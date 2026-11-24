<?php
declare(strict_types=1);

require_once dirname(__DIR__) . '/app/bootstrap.php';

if (!empty($_SERVER['PATH_INFO'])) {
    http_response_code(404);
    header('Content-Type: text/plain; charset=utf-8');
    exit('Not found.');
}

$session = portalSession();
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');
header("Content-Security-Policy: default-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'");
?>
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="description" content="Browse student society events and keep a local RSVP plan.">
  <meta name="csrf-token" content="<?= htmlspecialchars($session['csrf'], ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8') ?>">
  <title>Society Activity Portal</title>
  <link rel="stylesheet" href="./styles.css">
  <script src="./app.js" defer></script>
</head>
<body>
  <a class="skip-link" href="#events">Skip to events</a>
  <header class="site-header">
    <div class="wrap header-inner">
      <a class="brand" href="./" aria-label="Society Portal home">
        <span class="brand-mark" aria-hidden="true">✳</span>
        <span>Society Portal</span>
      </a>
      <nav aria-label="Main navigation">
        <a href="#events">Events</a>
        <a class="nav-plan" href="#saved">My RSVPs <span id="nav-count" aria-hidden="true">0</span></a>
      </nav>
    </div>
  </header>

  <main class="wrap">
    <section class="hero" aria-labelledby="page-title">
      <div class="hero-copy">
        <p class="hero-season">SPRING 2027</p>
        <h1 id="page-title">Find your next<br>campus event.</h1>
        <p>Explore what student societies are hosting and make a plan to join in.</p>
        <a class="hero-link" href="#events">Browse events</a>
      </div>
      <img class="hero-photo" src="./assets/campus-societies.webp" width="1200" height="800"
           alt="Students chatting at an outdoor campus society gathering" fetchpriority="high">
    </section>

    <div class="portal-layout">
      <section id="events" class="directory" aria-labelledby="events-title" tabindex="-1">
        <h2 id="events-title">Upcoming events</h2>
        <div class="filters" role="search" aria-label="Filter society events">
          <div class="filter-field search-field">
            <label for="event-search">Search events</label>
            <input id="event-search" type="search" placeholder="Try sketch, chess or library" maxlength="100" disabled>
          </div>
          <div class="filter-field">
            <label for="society-filter">Society</label>
            <select id="society-filter" disabled>
              <option value="">All societies</option>
            </select>
          </div>
          <button class="filter-reset" id="clear-filters" type="button" hidden>Clear</button>
        </div>
        <p id="result-count" class="result-count" role="status" aria-atomic="true">Loading events…</p>
        <div id="load-error" class="empty-events" hidden>
          <h3>Couldn't load the portal</h3>
          <p id="load-error-message"></p>
          <button id="retry-button" class="reserve-button" type="button">Try again</button>
        </div>
        <div id="event-list" class="event-grid"></div>
        <div id="empty-events" class="empty-events" hidden>
          <h3 id="empty-events-heading">No matching events</h3>
          <p id="empty-events-message">Try a different search term or choose another society.</p>
        </div>
        <noscript><p>Enable JavaScript to browse the demo events and save RSVPs.</p></noscript>
      </section>

      <aside id="plan" class="plan" aria-labelledby="plan-title" tabindex="-1">
        <section class="panel">
          <h2 id="plan-title">Make an RSVP</h2>
          <p id="plan-intro" class="panel-intro">Choose an event and reserve seats for your plan.</p>
          <form id="rsvp-form">
            <fieldset id="rsvp-fields" disabled>
              <legend class="sr-only">Reservation details</legend>
              <div class="form-field">
                <label for="rsvp-event">Event</label>
                <select id="rsvp-event" name="event" required>
                  <option value="">Choose an event</option>
                </select>
              </div>
              <div class="form-field">
                <label for="rsvp-seats">Seats including you</label>
                <input id="rsvp-seats" name="seats" type="number" inputmode="numeric" min="1" max="<?= RSVP_MAX_SEATS ?>" value="1" required aria-describedby="seats-help">
                <small id="seats-help">Up to <?= RSVP_MAX_SEATS ?> seats per RSVP.</small>
              </div>
              <div class="form-field">
                <label for="rsvp-note">Personal note <span class="optional">(optional)</span></label>
                <textarea id="rsvp-note" name="note" rows="2" maxlength="140" placeholder="E.g. Bring a sketchbook"></textarea>
              </div>
              <button id="save-rsvp" class="primary-button" type="submit">Save RSVP</button>
              <button id="cancel-edit" class="reserve-button" type="button" hidden>Cancel edit</button>
            </fieldset>
          </form>
          <p id="form-feedback" class="feedback" role="status" aria-atomic="true"></p>
        </section>

        <section id="saved" class="panel saved-panel" aria-labelledby="saved-title" tabindex="-1">
          <h2 id="saved-title">My RSVPs</h2>
          <p id="empty-rsvps" class="panel-intro">Loading your RSVPs…</p>
          <ul id="rsvp-list" class="rsvp-list"></ul>
          <p class="storage-note">Plans are private to this session. Use demo notes without personal details.</p>
        </section>
      </aside>
    </div>
  </main>

  <footer class="site-footer">
    <div class="wrap footer-inner">
      <span>Society Portal</span>
      <span>Web Engineering · Idea 08 · Assignment 2</span>
    </div>
  </footer>

  <template id="event-card">
    <article class="event-card">
      <div class="card-top">
        <time class="date-tile"><span class="event-month"></span><strong class="event-day"></strong></time>
        <span class="society-tag"></span>
      </div>
      <h3></h3>
      <p class="event-description"></p>
      <dl class="event-details">
        <div><dt>Time</dt><dd class="event-time"></dd></div>
        <div><dt>Venue</dt><dd class="event-venue"></dd></div>
      </dl>
      <div class="card-bottom">
        <p class="event-availability"></p>
        <button class="reserve-button" type="button">RSVP</button>
      </div>
    </article>
  </template>
</body>
</html>
