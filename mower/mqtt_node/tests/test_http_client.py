"""HTTP client periodically POSTs to the server. Test the body shape
and the error tolerance — a failed POST must not stop the loop."""
from unittest.mock import MagicMock, patch

import pytest

from http_client import HttpClient


def test_net_check_posts_to_correct_endpoint():
    cli = HttpClient(host='192.168.0.222', port=80, sn='LFIN1231000211')
    with patch('http_client.requests.post') as mock_post:
        mock_post.return_value = MagicMock(status_code=200, text='OK')
        cli.net_check_once()
    args, kwargs = mock_post.call_args
    assert args[0] == 'http://192.168.0.222:80/api/nova-network/network/connection'
    body = kwargs.get('json', {})
    assert body.get('sn') == 'LFIN1231000211'


def test_net_check_swallows_connection_errors():
    cli = HttpClient(host='unreachable', port=80, sn='LFIN1231000211')
    with patch('http_client.requests.post', side_effect=Exception('refused')):
        cli.net_check_once()  # must not raise


def test_equipment_heartbeat_uses_provided_body_source():
    body = {'sn': 'LFIN1231000211', 'battery_power': 87}
    cli = HttpClient(host='h', port=80, sn='LFIN1231000211',
                     equipment_body=lambda: body)
    with patch('http_client.requests.post') as mock_post:
        mock_post.return_value = MagicMock(status_code=200)
        ok = cli.equipment_once()
    assert ok is True
    args, kwargs = mock_post.call_args
    assert args[0] == 'http://h:80/api/nova-data/equipment'
    assert kwargs.get('json') == body


def test_user_equipment_heartbeat_uses_correct_endpoint():
    cli = HttpClient(host='h', port=80, sn='X')
    with patch('http_client.requests.post') as mock_post:
        mock_post.return_value = MagicMock(status_code=200)
        cli.user_equipment_once()
    assert mock_post.call_args.args[0] == 'http://h:80/api/nova-user/equipment/machine'


def test_message_poll_uses_correct_endpoint():
    cli = HttpClient(host='h', port=80, sn='X')
    with patch('http_client.requests.post') as mock_post:
        mock_post.return_value = MagicMock(status_code=200)
        cli.message_once()
    assert mock_post.call_args.args[0] == 'http://h:80/api/nova-message/machine'


def test_net_check_increments_fail_count_on_5xx():
    cli = HttpClient(host='h', port=80, sn='X')
    with patch('http_client.requests.post') as mock_post:
        mock_post.return_value = MagicMock(status_code=500)
        cli.net_check_once()
    assert cli._fail_count == 1


def test_net_check_resets_fail_count_on_2xx():
    cli = HttpClient(host='h', port=80, sn='X')
    cli._fail_count = 5
    with patch('http_client.requests.post') as mock_post:
        mock_post.return_value = MagicMock(status_code=200)
        cli.net_check_once()
    assert cli._fail_count == 0


def test_upload_cut_grass_record_posts_multipart_fields():
    cli = HttpClient(host='h', port=80, sn='X')
    with patch('http_client.requests.post') as mock_post:
        mock_post.return_value = MagicMock(status_code=200)
        ok = cli.upload_cut_grass_record({'sn': 'X', 'workTime': 60})
    assert ok is True
    args, kwargs = mock_post.call_args
    assert args[0] == 'http://h:80/api/nova-data/cut'
    assert kwargs['data'] == {'sn': 'X', 'workTime': 60}


def test_upload_map_streams_file(tmp_path):
    cli = HttpClient(host='h', port=80, sn='X')
    p = tmp_path / 'map0.zip'
    p.write_bytes(b'\x00' * 64)
    with patch('http_client.requests.post') as mock_post:
        mock_post.return_value = MagicMock(status_code=200)
        ok = cli.upload_map('LFIN', str(p))
    assert ok is True
    args, kwargs = mock_post.call_args
    assert args[0] == 'http://h:80/api/nova-file-server/map/upload'
    assert kwargs['data'] == {'sn': 'LFIN'}
    assert 'file' in kwargs['files']
