<?php
declare(strict_types=1);

require_once dirname(__DIR__, 2) . '/app/bootstrap.php';
require_once dirname(__DIR__, 2) . '/app/reservations.php';

ini_set('display_errors', '0');
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');

function reply(int $status, array $data): never
{
    http_response_code($status);
    echo json_encode($data, JSON_THROW_ON_ERROR | JSON_INVALID_UTF8_SUBSTITUTE);
    exit;
}

function readBody(): array
{
    $type = strtolower(trim(explode(';', $_SERVER['CONTENT_TYPE'] ?? '', 2)[0]));
    if ($type !== 'application/json') {
        throw new HttpError('Send the request as JSON.', 415);
    }
    $raw = file_get_contents('php://input', false, null, 0, 4097);
    if ($raw === false || strlen($raw) > 4096) {
        throw new HttpError('The request body is too large.', 413);
    }
    try {
        $data = json_decode($raw, flags: JSON_THROW_ON_ERROR);
    } catch (JsonException) {
        throw new HttpError('The request contains invalid JSON.', 400);
    }
    if (!is_object($data)) {
        throw new HttpError('Send a JSON object.', 400);
    }
    return (array) $data;
}

try {
    $method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
    if (!in_array($method, ['GET', 'POST', 'PATCH', 'DELETE'], true)) {
        header('Allow: GET, POST, PATCH, DELETE');
        throw new HttpError('This request method is not supported.', 405);
    }

    $session = portalSession();
    $owner = $session['owner'];
    if ($method === 'GET') {
        $db = openDatabase();
        $db->beginTransaction();
        $snapshot = portalSnapshot($db, $owner);
        $db->commit();
        reply(200, $snapshot);
    }

    if (!hash_equals($session['csrf'], $_SERVER['HTTP_X_CSRF_TOKEN'] ?? '')) {
        throw new HttpError('Your request could not be verified. Refresh the page and try again.', 403);
    }

    $body = readBody();
    $db = openDatabase();
    // Lock before checking availability so concurrent sessions cannot overbook the last seats.
    $db->exec('BEGIN IMMEDIATE');
    try {
        match ($method) {
            'POST' => createReservation($db, $owner, $body),
            'PATCH' => updateReservation($db, $owner, $body),
            'DELETE' => deleteReservation($db, $owner, $body),
        };
        $snapshot = portalSnapshot($db, $owner);
        $db->exec('COMMIT');
    } catch (Throwable $error) {
        $db->exec('ROLLBACK');
        throw $error;
    }

    reply($method === 'POST' ? 201 : 200, $snapshot);
} catch (HttpError $error) {
    reply($error->getCode(), ['error' => $error->getMessage()]);
} catch (Throwable $error) {
    error_log((string) $error);
    reply(500, ['error' => 'The portal service is unavailable. Try again in a moment.']);
}
