import pytest
from main import get_user, divide

# Happy path

def test_get_user_happy_path(monkeypatch):
    """Test that get_user returns dict for valid user_id"""
    # Mock requests.get
    class MockResponse:
        def json(self):
            return {'id':1,'name':'Alice'}
    monkeypatch.setattr('requests.get', lambda url: MockResponse())
    result = get_user(1)
    assert isinstance(result, dict)
    assert result['id'] == 1


def test_divide_happy_path():
    assert divide(6,2) == 3

# Edge cases

def test_get_user_empty_input(monkeypatch):
    class MockResponse:
        def json(self):
            return {}
    monkeypatch.setattr('requests.get', lambda url: MockResponse())
    result = get_user('')
    assert result == {}


def test_get_user_none_input(monkeypatch):
    class MockResponse:
        def json(self):
            return None
    monkeypatch.setattr('requests.get', lambda url: MockResponse())
    result = get_user(None)
    assert result is None


def test_divide_zero_divisor():
    with pytest.raises(ZeroDivisionError):
        divide(5,0)


def test_divide_wrong_type():
    with pytest.raises(TypeError):
        divide('a',2)

# Error case

def test_get_user_http_error(monkeypatch):
    class MockResponse:
        def json(self):
            raise ValueError('bad json')
    monkeypatch.setattr('requests.get', lambda url: MockResponse())
    with pytest.raises(ValueError):
        get_user(1)
