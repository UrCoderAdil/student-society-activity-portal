'use strict';

const STORAGE_KEY = 'society-portal:rsvps:v1';
const sortedEvents = [...events].sort((first, second) => {
  return first.date.localeCompare(second.date) || first.start.localeCompare(second.start);
});
const eventsById = new Map(sortedEvents.map((event) => [event.id, event]));
const shortMonth = new Intl.DateTimeFormat('en', { month: 'short', timeZone: 'UTC' });
const fullDate = new Intl.DateTimeFormat('en', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });

const search = document.querySelector('#event-search');
const society = document.querySelector('#society-filter');
const clearFilters = document.querySelector('#clear-filters');
const eventList = document.querySelector('#event-list');
const eventTemplate = document.querySelector('#event-card');
const resultCount = document.querySelector('#result-count');
const emptyEvents = document.querySelector('#empty-events');
const form = document.querySelector('#rsvp-form');
const eventInput = document.querySelector('#rsvp-event');
const seatsInput = document.querySelector('#rsvp-seats');
const feedback = document.querySelector('#form-feedback');
const savedList = document.querySelector('#rsvp-list');
const emptyRsvps = document.querySelector('#empty-rsvps');
const navCount = document.querySelector('#nav-count');
const storageNote = document.querySelector('#storage-note');

const seatLimit = Number(seatsInput.max);
let storageAvailable = true;
let rsvps = readSavedRsvps();

function readSavedRsvps() {
  let stored;
  try {
    stored = localStorage.getItem(STORAGE_KEY);
  } catch {
    useSessionOnly();
    return [];
  }

  let entries;
  try {
    entries = JSON.parse(stored);
  } catch {
    return [];
  }
  if (!Array.isArray(entries)) return [];

  const valid = [];
  for (const entry of entries) {
    const event = eventsById.get(entry?.eventId);
    if (event && !reservationIssue(event, entry.seats, valid)) {
      valid.push({ eventId: event.id, seats: entry.seats });
    }
  }
  return valid;
}

function useSessionOnly() {
  storageAvailable = false;
  storageNote.textContent = 'Browser storage is unavailable. RSVPs last until you reload.';
}

function saveRsvps() {
  if (!storageAvailable) return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(rsvps));
  } catch {
    useSessionOnly();
  }
}

function reservationIssue(event, seats, plan) {
  if (!event) return 'Choose a valid event.';
  if (!Number.isInteger(seats) || seats < 1 || seats > seatLimit) {
    return `Enter a whole number from 1 to ${seatLimit}.`;
  }
  if (plan.some((item) => item.eventId === event.id)) return 'You already have an RSVP for this event.';
  if (event.capacity === 0) return 'This event is full. Choose another event.';
  if (seats > event.capacity) return `Only ${seatLabel(event.capacity)} available for this event.`;

  const conflict = plan.map((item) => eventsById.get(item.eventId)).find((savedEvent) => {
    return savedEvent.date === event.date && savedEvent.start < event.end && event.start < savedEvent.end;
  });
  return conflict ? `This event overlaps with ${conflict.title} in your plan.` : '';
}

function seatLabel(seats) {
  return `${seats} ${seats === 1 ? 'seat' : 'seats'}`;
}

function dateFor(event) {
  return new Date(`${event.date}T00:00:00Z`);
}

function timeRange(event) {
  return `${event.start}–${event.end}`;
}

function setFeedback(message, tone = 'success') {
  feedback.dataset.tone = tone;
  feedback.textContent = message;
}

function populateOptions() {
  const societies = [...new Set(sortedEvents.map((event) => event.society))].sort();
  for (const name of societies) {
    society.add(new Option(name, name));
  }
  for (const event of sortedEvents) {
    const label = event.capacity === 0 ? `${event.title} (full)` : event.title;
    eventInput.add(new Option(label, event.id));
  }
}

function eventCard(event) {
  const card = eventTemplate.content.firstElementChild.cloneNode(true);
  const eventDate = dateFor(event);
  const dateTile = card.querySelector('time');
  dateTile.dateTime = event.date;
  dateTile.setAttribute('aria-label', fullDate.format(eventDate));
  card.querySelector('.event-month').textContent = shortMonth.format(eventDate);
  card.querySelector('.event-day').textContent = String(eventDate.getUTCDate()).padStart(2, '0');

  const tag = card.querySelector('.society-tag');
  tag.dataset.theme = event.theme;
  tag.textContent = event.society;
  card.querySelector('h3').textContent = event.title;
  card.querySelector('.event-description').textContent = event.description;
  card.querySelector('.event-time').textContent = timeRange(event);
  card.querySelector('.event-venue').textContent = event.venue;

  const saved = rsvps.find((item) => item.eventId === event.id);
  const availability = card.querySelector('.event-availability');
  if (saved) {
    availability.textContent = `${seatLabel(saved.seats)} reserved`;
  } else if (event.capacity === 0) {
    availability.textContent = 'Event full';
    availability.classList.add('is-full');
  } else {
    availability.textContent = `${seatLabel(event.capacity)} available`;
  }

  const button = card.querySelector('button');
  button.dataset.eventId = event.id;
  button.textContent = saved ? 'View RSVP' : 'RSVP';
  button.setAttribute('aria-label', `${button.textContent} for ${event.title}`);
  button.disabled = event.capacity === 0;
  return card;
}

function renderEvents() {
  const query = search.value.trim().toLowerCase();
  const selectedSociety = society.value;
  const matched = sortedEvents.filter((event) => {
    const words = `${event.title} ${event.society} ${event.venue} ${event.description}`.toLowerCase();
    return words.includes(query) && (!selectedSociety || event.society === selectedSociety);
  });

  eventList.replaceChildren(...matched.map(eventCard));
  emptyEvents.hidden = matched.length > 0;
  clearFilters.hidden = !search.value && !selectedSociety;
  resultCount.textContent = `${matched.length} ${matched.length === 1 ? 'event' : 'events'} shown`;
}

function renderRsvps() {
  const items = rsvps.map(({ eventId, seats }) => {
    const event = eventsById.get(eventId);
    const item = document.createElement('li');
    const title = document.createElement('strong');
    const details = document.createElement('small');
    const remove = document.createElement('button');

    title.textContent = event.title;
    details.textContent = `${fullDate.format(dateFor(event))} · ${timeRange(event)} · ${seatLabel(seats)}`;
    remove.type = 'button';
    remove.className = 'remove-button';
    remove.textContent = 'Remove';
    remove.dataset.eventId = eventId;
    remove.setAttribute('aria-label', `Remove RSVP for ${event.title}`);
    item.append(title, details, remove);
    return item;
  });

  savedList.replaceChildren(...items);
  emptyRsvps.hidden = rsvps.length > 0;
  navCount.textContent = String(rsvps.length);
}

search.addEventListener('input', renderEvents);
society.addEventListener('change', renderEvents);
clearFilters.addEventListener('click', () => {
  search.value = '';
  society.value = '';
  renderEvents();
  search.focus();
});

eventList.addEventListener('click', (event) => {
  const button = event.target.closest('button[data-event-id]');
  if (!button) return;
  const eventId = button.dataset.eventId;
  const savedButton = [...savedList.querySelectorAll('button')].find((item) => item.dataset.eventId === eventId);
  if (savedButton) {
    savedButton.focus();
    return;
  }
  eventInput.value = eventId;
  seatsInput.value = '1';
  setFeedback('');
  eventInput.focus();
});

form.addEventListener('input', () => setFeedback(''));
form.addEventListener('submit', (event) => {
  event.preventDefault();
  const selected = eventsById.get(eventInput.value);
  const seats = seatsInput.valueAsNumber;
  const issue = reservationIssue(selected, seats, rsvps);
  if (issue) {
    setFeedback(issue, 'error');
    return;
  }
  rsvps.push({ eventId: selected.id, seats });
  saveRsvps();
  renderRsvps();
  renderEvents();
  setFeedback(`RSVP saved for ${selected.title}. ${seatLabel(seats)} reserved.`);
});

savedList.addEventListener('click', (event) => {
  const button = event.target.closest('button[data-event-id]');
  if (!button) return;
  const index = rsvps.findIndex((item) => item.eventId === button.dataset.eventId);
  if (index === -1) return;

  const removed = rsvps.splice(index, 1)[0];
  saveRsvps();
  renderRsvps();
  renderEvents();
  setFeedback(`RSVP removed for ${eventsById.get(removed.eventId).title}.`);
  const next = savedList.querySelectorAll('button')[index] || savedList.querySelector('button') || eventInput;
  next.focus();
});

window.addEventListener('storage', (event) => {
  if (!storageAvailable || (event.key !== STORAGE_KEY && event.key !== null)) return;
  rsvps = readSavedRsvps();
  renderRsvps();
  renderEvents();
});

populateOptions();
renderEvents();
renderRsvps();
