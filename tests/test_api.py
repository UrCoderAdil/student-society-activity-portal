"""Run the PHP HTTP checks against a disposable SQLite database."""

import http.cookiejar
import json
import os
from pathlib import Path
import re
import shutil
import socket
import subprocess
import tempfile
import time
import unittest
from urllib.error import HTTPError, URLError
from urllib.request import HTTPCookieProcessor, Request, build_opener


ROOT = Path(__file__).resolve().parents[1]
ENDPOINT = '/api/portal.php'


class BrowserSession:
    def __init__(self, base_url):
        self.base_url = base_url
        self.opener = build_opener(HTTPCookieProcessor(http.cookiejar.CookieJar()))
        with self.opener.open(base_url, timeout=4) as page:
            self.csrf = re.search(rb'name="csrf-token" content="([a-f0-9]{64})"', page.read())[1].decode()

    def request(self, method='GET', body=None, *, csrf=None, raw=None, content_type='application/json'):
        headers = {'Accept': 'application/json'}
        if method != 'GET':
            headers['Content-Type'] = content_type
            if csrf is not False:
                headers['X-CSRF-Token'] = self.csrf if csrf is None else csrf
            if raw is None:
                raw = json.dumps(body).encode()
        request = Request(self.base_url.rstrip('/') + ENDPOINT, data=raw, headers=headers, method=method)
        try:
            response = self.opener.open(request, timeout=6)
        except HTTPError as error:
            response = error
        with response:
            return response.status, json.load(response)


class PortalTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        php = os.environ.get('PORTAL_PHP') or shutil.which('php')
        if not php:
            raise RuntimeError('PHP 8.5 is required. Add it to PATH or set PORTAL_PHP.')
        temporary_directory = tempfile.TemporaryDirectory(prefix='society-portal-tests-')
        cls.addClassCleanup(temporary_directory.cleanup)
        config = {**os.environ, 'PORTAL_DATA_DIR': temporary_directory.name}
        for _ in range(2):
            subprocess.run([php, 'db/seed.php'], cwd=ROOT, env=config, check=True, capture_output=True)
        with socket.socket() as port_socket:
            port_socket.bind(('127.0.0.1', 0))
            port = port_socket.getsockname()[1]
        cls.base_url = f'http://127.0.0.1:{port}/'
        with open(Path(temporary_directory.name) / 'server.log', 'wb') as log:
            server = subprocess.Popen(
                [php, '-S', f'127.0.0.1:{port}', '-t', 'public'], cwd=ROOT,
                env=config, stdout=log, stderr=subprocess.STDOUT,
            )
        cls.addClassCleanup(cls.stop_server, server)
        for _ in range(40):
            try:
                BrowserSession(cls.base_url)
                return
            except (OSError, URLError):
                if server.poll() is not None:
                    break
                time.sleep(0.1)
        raise RuntimeError('PHP server did not start.\n' + (Path(temporary_directory.name) / 'server.log').read_text())

    @staticmethod
    def stop_server(server):
        server.terminate()
        server.wait(timeout=5)

    def setUp(self):
        self.student = BrowserSession(self.base_url)

    def create(self, event_id='creative-sketch', seats=2, *, note='', session=None):
        session = session or self.student
        status, data = session.request('POST', {'eventId': event_id, 'seats': seats, 'note': note})
        self.assertEqual(status, 201, data)
        record = next(rsvp for rsvp in data['rsvps'] if rsvp['eventId'] == event_id)
        self.addCleanup(session.request, 'DELETE', {'id': record['id']})
        return record

    def available(self, event_id):
        status, data = self.student.request()
        self.assertEqual(status, 200)
        return next(event['availableSeats'] for event in data['events'] if event['id'] == event_id)

    def test_seeded_list_and_empty_session(self):
        status, data = self.student.request()
        self.assertEqual(status, 200)
        self.assertEqual(len(data['events']), 8)
        self.assertEqual(data['rsvps'], [])

    def test_invalid_or_missing_fields(self):
        for body in ({}, {'eventId': 'unknown', 'seats': 1}, {'eventId': 'creative-sketch'},
                     {'eventId': 'creative-sketch', 'seats': '2'}, {'eventId': 'creative-sketch', 'seats': 5},
                     {'eventId': 'creative-sketch', 'seats': 1, 'note': 'x' * 141}):
            with self.subTest(body=body):
                self.assertEqual(self.student.request('POST', body)[0], 422)
        self.assertEqual(self.student.request()[1]['rsvps'], [])

    def test_create_read_duplicate_and_seats(self):
        before = self.available('creative-sketch')
        rsvp = self.create()
        self.assertEqual(self.student.request()[1]['rsvps'], [rsvp])
        self.assertEqual(self.available('creative-sketch'), before - 2)
        self.assertEqual(self.student.request('POST', {'eventId': 'creative-sketch', 'seats': 1})[0], 409)

    def test_update_preserves_id_and_event(self):
        rsvp = self.create()
        note = '<b>Bring a sketchbook</b>'
        status, data = self.student.request('PATCH', {'id': rsvp['id'], 'seats': 3, 'note': note})
        self.assertEqual(status, 200)
        updated = {**rsvp, 'seats': 3, 'note': note}
        self.assertEqual(data['rsvps'], [updated])
        self.assertEqual(self.student.request()[1]['rsvps'], [updated])

    def test_delete_releases_seats(self):
        before = self.available('chess-ladder')
        rsvp = self.create('chess-ladder')
        status, data = self.student.request('DELETE', {'id': rsvp['id']})
        self.assertEqual(status, 200)
        self.assertEqual(data['rsvps'], [])
        self.assertEqual(self.available('chess-ladder'), before)
        self.assertEqual(self.student.request('DELETE', {'id': rsvp['id']})[0], 404)

    def test_another_session_cannot_read_update_or_delete(self):
        rsvp = self.create(note='Only visible to the owner')
        other = BrowserSession(self.base_url)
        self.assertEqual(other.request()[1]['rsvps'], [])
        self.assertEqual(other.request('PATCH', {'id': rsvp['id'], 'seats': 1})[0], 404)
        self.assertEqual(other.request('DELETE', {'id': rsvp['id']})[0], 404)
        self.assertEqual(self.student.request()[1]['rsvps'], [rsvp])

    def test_missing_or_wrong_csrf(self):
        other = BrowserSession(self.base_url)
        body = {'eventId': 'creative-sketch', 'seats': 1}
        for token in (False, 'invalid', other.csrf):
            with self.subTest(token_kind='missing' if token is False else 'invalid'):
                self.assertEqual(self.student.request('POST', body, csrf=token)[0], 403)

    def test_overlap_and_sold_out(self):
        self.create()
        status, data = self.student.request('POST', {'eventId': 'web-clinic', 'seats': 1})
        self.assertEqual(status, 409)
        self.assertIn('overlaps', data['error'])
        self.assertEqual(self.student.request('POST', {'eventId': 'poster-studio', 'seats': 1})[0], 409)

    def test_capacity_shared_but_own_seats_can_be_updated(self):
        first = self.create('native-plants', 2)
        second_student = BrowserSession(self.base_url)
        self.assertEqual(second_student.request('POST', {'eventId': 'native-plants', 'seats': 2})[0], 409)
        self.create('native-plants', 1, session=second_student)
        self.assertEqual(self.available('native-plants'), 0)
        self.assertEqual(self.student.request('PATCH', {'id': first['id'], 'seats': 2, 'note': 'Updated'})[0], 200)
        self.assertEqual(self.student.request('PATCH', {'id': first['id'], 'seats': 3})[0], 409)

    def test_json_media_and_method_validation(self):
        self.assertEqual(self.student.request('POST', raw=b'{')[0], 400)
        self.assertEqual(self.student.request('POST', {'eventId': 'creative-sketch'}, content_type='text/plain')[0], 415)
        self.assertEqual(self.student.request('PUT', {})[0], 405)

    def test_database_is_outside_document_root(self):
        with self.assertRaises(HTTPError) as result:
            self.student.opener.open(self.base_url + 'var/portal.sqlite', timeout=4)
        with result.exception as response:
            self.assertEqual(response.code, 404)


if __name__ == '__main__':
    unittest.main(verbosity=2)
