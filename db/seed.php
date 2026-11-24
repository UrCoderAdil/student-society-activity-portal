<?php
declare(strict_types=1);

require_once dirname(__DIR__) . '/app/bootstrap.php';

if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit;
}

$db = openDatabase(allowCreate: true);
$events = json_decode(file_get_contents(__DIR__ . '/events.json'), true, flags: JSON_THROW_ON_ERROR);

$db->beginTransaction();
try {
    $db->exec(file_get_contents(__DIR__ . '/schema.sql'));
    $insert = $db->prepare(
        'INSERT OR IGNORE INTO events
          (id, title, society, theme, event_date, start_time, end_time, venue, capacity, description)
         VALUES (:id, :title, :society, :theme, :date, :start, :end, :venue, :capacity, :description)'
    );
    foreach ($events as $event) {
        $insert->execute($event);
    }
    $db->commit();
} catch (Throwable $error) {
    $db->rollBack();
    throw $error;
}

printf("SQLite ready. Database has %d events. Existing rows were preserved.\n", $db->query('SELECT COUNT(*) FROM events')->fetchColumn());
