import pytest
import builtins
from unittest.mock import patch
from main import get_user, divide

# Happy path tests

def test_get_user_happy_path(monkeypatch):
    """Should return JSON dict for a valid user_id"""
    class MockResponse:
        def json(self):
            return {"id": 1, "name": "Alice"}
    monkeypatch.setattr('requests.get', lambda url: MockResponse())
    result = get_user(1)
    assert isinstance(result, dict)
    assert result["id"] == 1
    assert result["name"] == "Alice"

def test_divide_happy_path():
    assert divide(10, 2) == 5

# Edge case tests for get_user

def test_get_user_empty_string(monkeypatch):
    class MockResponse:
        def json(self):
            return {}
    monkeypatch.setattr('requests.get', lambda url: MockResponse())
    result = get_user("")
    assert result == {}

def test_get_user_none_input(monkeypatch):
    class MockResponse:
        def json(self):
            return None
    monkeypatch.setattr('requests.get', lambda url: MockResponse())
    result = get_user(None)
    assert result is None

def test_get_user_zero_id(monkeypatch):
    class MockResponse:
        def json(self):
            return {"id": 0}
    monkeypatch.setattr('requests.get', lambda url: MockResponse())
    result = get_user(0)
    assert result["id"] == 0

def test_get_user_invalid_type(monkeypatch):
    # Simulate requests raising TypeError for non‑int URL formatting
    def bad_get(url):
        raise TypeError("URL must be a string")
    monkeypatch.setattr('requests.get', bad_get)
    with pytest.raises(TypeError):
        get_user({})

# Edge case tests for divide

def test_divide_by_one():
    assert divide(5, 1) == 5

def test_divide_negative_numbers():
    assert divide(-6, -2) == 3

def test_divide_zero_divisor():
    with pytest.raises(ZeroDivisionError):
        divide(5, 0)

def test_divide_non_numeric():
    with pytest.raises(TypeError):
        divide('a', 2)

def test_divide_none_input():
    with pytest.raises(TypeError):
        divide(None, 1)

# Error case tests

def test_get_user_http_error(monkeypatch):
    class MockResponse:
        def json(self):
            raise ValueError("bad json")
    monkeypatch.setattr('requests.get', lambda url: MockResponse())
    with pytest.raises(ValueError):
        get_user(1)

def test_divide_unexpected_error(monkeypatch):
    # Force an unexpected exception inside divide by monkeypatching builtins
    with patch('builtins.__builtins__', {}):
        with pytest.raises(Exception):
            divide(1, 1)
