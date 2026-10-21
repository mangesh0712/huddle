import hmac

from itsdangerous import BadSignature, URLSafeTimedSerializer

SESSION_MAX_AGE = 24 * 3600


class SessionError(Exception):
    pass


def check_keys(given: str, expected: str) -> bool:
    if not given or not expected:
        return False
    return hmac.compare_digest(given.encode(), expected.encode())


def make_session(secret: str, *, identity: str, name: str, is_admin: bool, emoji: str = "🙂") -> str:
    return URLSafeTimedSerializer(secret, salt="huddle-session").dumps(
        {"identity": identity, "name": name, "is_admin": is_admin, "emoji": emoji})


def read_session(secret: str, token: str, max_age: int = SESSION_MAX_AGE) -> dict:
    try:
        return URLSafeTimedSerializer(secret, salt="huddle-session").loads(token, max_age=max_age)
    except BadSignature as e:  # SignatureExpired subclasses BadSignature
        raise SessionError(str(e)) from e
