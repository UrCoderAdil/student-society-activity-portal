'use strict';

const search = document.querySelector('#event-search');
const society = document.querySelector('#society-filter');
const clearFilters = document.querySelector('#clear-filters');
const eventList = document.querySelector('#event-list');
const eventTemplate = document.querySelector('#event-card');
const resultCount = document.querySelector('#result-count');
const emptyEvents = document.querySelector('#empty-events');
const emptyEventsHeading = document.querySelector('#empty-events-heading');
const emptyEventsMessage = document.querySelector('#empty-events-message');
const loadError = document.querySelector('#load-error');
const loadErrorMessage = document.querySelector('#load-error-message');
const retryButton = document.querySelector('#retry-button');
const form = document.querySelector('#rsvp-form');
const fieldset = document.querySelector('#rsvp-fields');
const formTitle = document.querySelector('#plan-title');
const formIntro = document.querySelector('#plan-intro');
const eventInput = document.querySelector('#rsvp-event');
const seatsInput = document.querySelector('#rsvp-seats');
const noteInput = document.querySelector('#rsvp-note');
const saveButton = document.querySelector('#save-rsvp');
const cancelEdit = document.querySelector('#cancel-edit');
const feedback = document.querySelector('#form-feedback');
const savedList = document.querySelector('#rsvp-list');
const emptyRsvps = document.querySelector('#empty-rsvps');
const navCount = document.querySelector('#nav-count');
const csrfToken = document.querySelector('meta[name="csrf-token"]').content;

const dateOptions = { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' };
const fullDate = new Intl.DateTimeFormat('en', dateOptions);
const shortMonth = new Intl.DateTimeFormat('en', { month: 'short', timeZone: 'UTC' });
const state = { events: [], rsvps: [], editing: null, ready: false, busy: false };

async function request(method = 'GET', body) {
  const options = { method, credentials: 'same-origin', headers: { Accept: 'application/json' } };
  if (body !== undefined) {
    options.headers['Content-Type'] = 'application/json';
    options.headers['X-CSRF-Token'] = csrfToken;
    options.body = JSON.stringify(body);
  }

  let response;
  try {
    response = await fetch('./api/portal.php', options);
  } catch {
    throw new Error('The server could not be reached. Check the connection and try again.');
  }
  let data;
  try {
    data = await response.json();
  } catch {
    throw new Error('The server returned an unexpected response.');
  }
  if (!response.ok) throw new Error(data.error || 'The request failed. Try again.');
  return data;
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

function updateControls() {
  search.disabled = !state.ready;
  society.disabled = !state.ready;
  fieldset.disabled = !state.ready || state.busy || state.events.length === 0;
  eventInput.disabled = state.editing !== null;
  form.setAttribute('aria-busy', String(state.busy));
  for (const button of savedList.querySelectorAll('button')) button.disabled = state.busy;
}

function populateOptions() {
  const selectedSociety = society.value;
  const selectedEvent = eventInput.value;
  const societies = [...new Set(state.events.map((event) => event.society))].sort();
  society.replaceChildren(new Option('All societies', ''));
  eventInput.replaceChildren(new Option('Choose an event', ''));
  for (const name of societies) society.add(new Option(name, name));
  for (const event of state.events) {
    const label = event.availableSeats === 0 ? `${event.title} (full)` : event.title;
    eventInput.add(new Option(label, event.id));
  }
  society.value = societies.includes(selectedSociety) ? selectedSociety : '';
  eventInput.value = state.events.some((event) => event.id === selectedEvent) ? selectedEvent : '';
}

function eventCard(event) {
  const card = eventTemplate.content.firstElementChild.cloneNode(true);
  const date = dateFor(event);
  const dateTile = card.querySelector('time');
  dateTile.dateTime = event.date;
  dateTile.setAttribute('aria-label', fullDate.format(date));
  card.querySelector('.event-month').textContent = shortMonth.format(date);
  card.querySelector('.event-day').textContent = String(date.getUTCDate()).padStart(2, '0');

  const tag = card.querySelector('.society-tag');
  tag.dataset.theme = event.theme;
  tag.textContent = event.society;
  card.querySelector('h3').textContent = event.title;
  card.querySelector('.event-description').textContent = event.description;
  card.querySelector('.event-time').textContent = timeRange(event);
  card.querySelector('.event-venue').textContent = event.venue;

  const saved = state.rsvps.find((item) => item.eventId === event.id);
  const full = event.availableSeats === 0;
  const availability = card.querySelector('.event-availability');
  if (saved) {
    availability.textContent = `${seatLabel(saved.seats)} reserved`;
  } else if (full) {
    availability.textContent = 'Event full';
    availability.classList.add('is-full');
  } else {
    availability.textContent = `${seatLabel(event.availableSeats)} available`;
  }

  const button = card.querySelector('button');
  button.dataset.eventId = event.id;
  button.textContent = saved ? 'Edit RSVP' : 'RSVP';
  button.setAttribute('aria-label', `${button.textContent} for ${event.title}`);
  button.disabled = full && !saved;
  return card;
}

function renderEvents() {
  const query = search.value.trim().toLowerCase();
  const selectedSociety = society.value;
  const matched = state.events.filter((event) => {
    const words = `${event.title} ${event.society} ${event.venue} ${event.description}`.toLowerCase();
    return words.includes(query) && (!selectedSociety || event.society === selectedSociety);
  });
  eventList.replaceChildren(...matched.map(eventCard));
  emptyEvents.hidden = matched.length > 0;
  emptyEventsHeading.textContent = state.events.length ? 'No matching events' : 'No events available yet';
  emptyEventsMessage.textContent = state.events.length ? 'Try a different search term or choose another society.' : 'Check back when new events have been added.';
  clearFilters.hidden = !search.value && !selectedSociety;
  resultCount.textContent = `${matched.length} ${matched.length === 1 ? 'event' : 'events'} shown`;
}

function rsvpAction(label, action, record, event) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = action === 'remove' ? 'remove-button' : 'reserve-button';
  button.textContent = label;
  button.dataset.action = action;
  button.dataset.id = String(record.id);
  button.setAttribute('aria-label', `${label} RSVP for ${event.title}`);
  return button;
}

function renderRsvps() {
  const items = state.rsvps.map((record) => {
    const event = state.events.find((item) => item.id === record.eventId);
    const item = document.createElement('li');
    const title = document.createElement('strong');
    const details = document.createElement('small');
    const actions = document.createElement('div');
    title.textContent = event.title;
    details.textContent = `${fullDate.format(dateFor(event))} · ${timeRange(event)} · ${seatLabel(record.seats)}`;
    item.append(title, details);
    if (record.note) {
      const note = document.createElement('p');
      note.className = 'saved-note';
      note.textContent = record.note;
      item.append(note);
    }
    actions.className = 'rsvp-actions';
    actions.append(rsvpAction('Edit', 'edit', record, event), rsvpAction('Remove', 'remove', record, event));
    item.append(actions);
    return item;
  });
  savedList.replaceChildren(...items);
  emptyRsvps.textContent = 'Your saved events will appear here.';
  emptyRsvps.hidden = state.rsvps.length > 0;
  navCount.textContent = String(state.rsvps.length);
}

function applySnapshot(data) {
  state.events = data.events;
  state.rsvps = data.rsvps;
  populateOptions();
  renderEvents();
  renderRsvps();
}

async function loadPortal() {
  if (state.busy) return;
  state.busy = true;
  loadError.hidden = true;
  resultCount.textContent = 'Loading events…';
  emptyRsvps.textContent = 'Loading your RSVPs…';
  updateControls();
  try {
    const data = await request();
    state.ready = true;
    applySnapshot(data);
  } catch (error) {
    state.ready = false;
    resultCount.textContent = 'Events unavailable';
    emptyRsvps.textContent = 'Your RSVPs could not be loaded.';
    loadErrorMessage.textContent = error.message;
    loadError.hidden = false;
  } finally {
    state.busy = false;
    updateControls();
  }
}

function resetForm() {
  state.editing = null;
  form.reset();
  formTitle.textContent = 'Make an RSVP';
  formIntro.textContent = 'Choose an event and reserve seats for your plan.';
  saveButton.textContent = 'Save RSVP';
  cancelEdit.hidden = true;
  updateControls();
}

function editRsvp(record) {
  state.editing = record.id;
  eventInput.value = record.eventId;
  seatsInput.value = String(record.seats);
  noteInput.value = record.note;
  formTitle.textContent = 'Edit RSVP';
  formIntro.textContent = 'Change your seat count or personal note.';
  saveButton.textContent = 'Update RSVP';
  cancelEdit.hidden = false;
  setFeedback('');
  updateControls();
  seatsInput.focus();
}

async function mutate(method, payload, pending, success) {
  state.busy = true;
  updateControls();
  setFeedback(pending, 'pending');
  try {
    const data = await request(method, payload);
    applySnapshot(data);
    setFeedback(success);
    return true;
  } catch (error) {
    setFeedback(error.message, 'error');
    return false;
  } finally {
    state.busy = false;
    updateControls();
  }
}

search.addEventListener('input', renderEvents);
society.addEventListener('change', renderEvents);
retryButton.addEventListener('click', loadPortal);
clearFilters.addEventListener('click', () => {
  search.value = '';
  society.value = '';
  renderEvents();
  search.focus();
});

eventList.addEventListener('click', (click) => {
  const button = click.target.closest('button[data-event-id]');
  if (!button || state.busy) return;
  const eventId = button.dataset.eventId;
  const saved = state.rsvps.find((record) => record.eventId === eventId);
  if (saved) {
    editRsvp(saved);
  } else {
    resetForm();
    eventInput.value = eventId;
    setFeedback('');
    eventInput.focus();
  }
});

form.addEventListener('input', () => setFeedback(''));
cancelEdit.addEventListener('click', () => {
  const editLink = savedList.querySelector(`button[data-id="${state.editing}"][data-action="edit"]`);
  resetForm();
  setFeedback('');
  (editLink || eventInput).focus();
});

form.addEventListener('submit', async (submission) => {
  submission.preventDefault();
  if (state.busy || !state.ready) return;
  const id = state.editing;
  const event = state.events.find((item) => item.id === eventInput.value);
  if (!event) {
    setFeedback('Choose an event from the directory.', 'error');
    return;
  }
  const fields = { seats: seatsInput.valueAsNumber, note: noteInput.value };
  const success = id === null
    ? await mutate('POST', { eventId: event.id, ...fields }, 'Saving RSVP…', `RSVP saved for ${event.title}.`)
    : await mutate('PATCH', { id, ...fields }, 'Updating RSVP…', `RSVP updated for ${event.title}.`);
  if (success) resetForm();
  saveButton.focus({ preventScroll: true });
});

savedList.addEventListener('click', async (click) => {
  const button = click.target.closest('button[data-action]');
  if (!button || state.busy) return;
  const record = state.rsvps.find((item) => item.id === Number(button.dataset.id));
  if (!record) return;
  if (button.dataset.action === 'edit') {
    editRsvp(record);
    return;
  }
  const event = state.events.find((item) => item.id === record.eventId);
  if (!window.confirm(`Remove your RSVP for ${event.title}?`)) return;
  const success = await mutate('DELETE', { id: record.id }, 'Removing RSVP…', `RSVP removed for ${event.title}.`);
  if (success && state.editing === record.id) resetForm();
  const nextButton = savedList.querySelector('button');
  (success ? nextButton || eventInput : button).focus({ preventScroll: true });
});

loadPortal();
