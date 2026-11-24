<?php
declare(strict_types=1);

const RSVP_MAX_SEATS = 4;

function dataDirectory(): string
{
    return getenv('PORTAL_DATA_DIR') ?: dirname(__DIR__) . DIRECTORY_SEPARATOR . 'var';
}

function ensureDirectory(string $path): void
{
    if (!is_dir($path) && !@mkdir($path, 0700, true) && !is_dir($path)) {
        throw new RuntimeException('Could not create the portal data directory.');
    }
}

function openDatabase(bool $allowCreate = false): PDO
{
    $directory = dataDirectory();
    $file = $directory . DIRECTORY_SEPARATOR . 'portal.sqlite';
    if ($allowCreate) {
        ensureDirectory($directory);
    } elseif (!is_file($file)) {
        throw new RuntimeException('Database missing. Run php db/seed.php.');
    }

    $db = new PDO('sqlite:' . $file, options: [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
    ]);
    $db->exec('PRAGMA foreign_keys = ON');
    $db->exec('PRAGMA busy_timeout = 4000');
    return $db;
}

function portalSession(): array
{
    $sessions = dataDirectory() . DIRECTORY_SEPARATOR . 'sessions';
    ensureDirectory($sessions);
    session_name('SocietyA2');
    session_save_path($sessions);
    $https = filter_var($_SERVER['HTTPS'] ?? false, FILTER_VALIDATE_BOOL);
    if (!session_start([
        'use_strict_mode' => 1,
        'use_only_cookies' => 1,
        'cookie_httponly' => true,
        'cookie_secure' => $https,
        'cookie_samesite' => 'Lax',
        'gc_maxlifetime' => 86400,
    ])) {
        throw new RuntimeException('Could not start the portal session.');
    }

    $_SESSION['owner'] ??= bin2hex(random_bytes(24));
    $_SESSION['csrf'] ??= bin2hex(random_bytes(32));
    $session = ['owner' => $_SESSION['owner'], 'csrf' => $_SESSION['csrf']];
    session_write_close();
    return $session;
}
