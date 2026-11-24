<?php
declare(strict_types=1);

final class HttpError extends RuntimeException {}

function portalSnapshot(PDO $db, string $owner): array
{
    $events = $db->query(
        'SELECT e.id, e.title, e.society, e.theme, e.event_date AS date,
                e.start_time AS start, e.end_time AS end, e.venue, e.capacity, e.description,
                e.capacity - COALESCE(SUM(r.seats), 0) AS availableSeats
         FROM events e LEFT JOIN rsvps r ON r.event_id = e.id
         GROUP BY e.id ORDER BY e.event_date, e.start_time, e.id'
    )->fetchAll();
    $plan = $db->prepare(
        'SELECT r.id, r.event_id AS eventId, r.seats, r.note
         FROM rsvps r JOIN events e ON e.id = r.event_id WHERE r.owner_id = :owner
         ORDER BY e.event_date, e.start_time, e.id'
    );
    $plan->execute(['owner' => $owner]);
    return ['events' => $events, 'rsvps' => $plan->fetchAll()];
}

function reservationId(array $body): int
{
    $id = $body['id'] ?? null;
    if (!is_int($id) || $id < 1) {
        throw new HttpError('Choose a valid RSVP.', 422);
    }
    return $id;
}

function reservationFields(array $body): array
{
    $seats = $body['seats'] ?? null;
    if (!is_int($seats) || $seats < 1 || $seats > RSVP_MAX_SEATS) {
        throw new HttpError('Enter a whole number from 1 to ' . RSVP_MAX_SEATS . '.', 422);
    }
    $note = $body['note'] ?? '';
    if (!is_string($note) || preg_match('/\A[^\x00]{0,140}\z/u', trim($note)) !== 1) {
        throw new HttpError('Use a text note of up to 140 characters.', 422);
    }
    return [$seats, trim($note)];
}

function checkAvailability(PDO $db, string $owner, string $eventId, int $seats, int $excludeId = 0): void
{
    $eventQuery = $db->prepare(
        'SELECT e.event_date, e.start_time, e.end_time,
                e.capacity - COALESCE(SUM(r.seats), 0) AS available
         FROM events e LEFT JOIN rsvps r ON r.event_id = e.id AND r.id <> :exclude
         WHERE e.id = :event GROUP BY e.id'
    );
    $eventQuery->execute(['exclude' => $excludeId, 'event' => $eventId]);
    $event = $eventQuery->fetch();
    if (!$event) {
        throw new HttpError('Choose an event from the directory.', 422);
    }

    $duplicate = $db->prepare('SELECT 1 FROM rsvps WHERE owner_id = :owner AND event_id = :event AND id <> :exclude');
    $duplicate->execute(['owner' => $owner, 'event' => $eventId, 'exclude' => $excludeId]);
    if ($duplicate->fetchColumn()) {
        throw new HttpError('You already have an RSVP for this event. Edit it under My RSVPs.', 409);
    }
    if ($event['available'] <= 0) {
        throw new HttpError('This event is full. Choose another event.', 409);
    }
    if ($seats > $event['available']) {
        $unit = $event['available'] === 1 ? 'seat is' : 'seats are';
        throw new HttpError("Only {$event['available']} $unit available for this event.", 409);
    }

    $conflict = $db->prepare(
        'SELECT e.title FROM rsvps r JOIN events e ON e.id = r.event_id
         WHERE r.owner_id = :owner AND r.id <> :exclude AND e.event_date = :date
           AND e.start_time < :end AND :start < e.end_time
         ORDER BY e.start_time LIMIT 1'
    );
    $conflict->execute([
        'owner' => $owner, 'exclude' => $excludeId, 'date' => $event['event_date'],
        'end' => $event['end_time'], 'start' => $event['start_time'],
    ]);
    if ($title = $conflict->fetchColumn()) {
        throw new HttpError("This event overlaps with $title in your plan.", 409);
    }
}

function createReservation(PDO $db, string $owner, array $body): void
{
    $eventId = $body['eventId'] ?? null;
    if (!is_string($eventId) || preg_match('/\A[a-z0-9-]{1,60}\z/', $eventId) !== 1) {
        throw new HttpError('Choose an event from the directory.', 422);
    }
    [$seats, $note] = reservationFields($body);
    checkAvailability($db, $owner, $eventId, $seats);
    $insert = $db->prepare('INSERT INTO rsvps (owner_id, event_id, seats, note) VALUES (:owner, :event, :seats, :note)');
    $insert->execute(['owner' => $owner, 'event' => $eventId, 'seats' => $seats, 'note' => $note]);
}

function updateReservation(PDO $db, string $owner, array $body): void
{
    $id = reservationId($body);
    $record = $db->prepare('SELECT event_id FROM rsvps WHERE id = :id AND owner_id = :owner');
    $record->execute(['id' => $id, 'owner' => $owner]);
    $eventId = $record->fetchColumn();
    if ($eventId === false) {
        throw new HttpError('RSVP not found.', 404);
    }
    [$seats, $note] = reservationFields($body);
    checkAvailability($db, $owner, $eventId, $seats, $id);
    $update = $db->prepare('UPDATE rsvps SET seats = :seats, note = :note WHERE id = :id AND owner_id = :owner');
    $update->execute(['seats' => $seats, 'note' => $note, 'id' => $id, 'owner' => $owner]);
}

function deleteReservation(PDO $db, string $owner, array $body): void
{
    $id = reservationId($body);
    $remove = $db->prepare('DELETE FROM rsvps WHERE id = :id AND owner_id = :owner');
    $remove->execute(['id' => $id, 'owner' => $owner]);
    if ($remove->rowCount() !== 1) {
        throw new HttpError('RSVP not found.', 404);
    }
}
