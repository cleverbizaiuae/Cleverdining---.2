from typing import Optional

from django.contrib.auth import get_user_model


User = get_user_model()


def _select_login_match(candidates, identifier: str, password: Optional[str], field: str):
    if len(candidates) == 1:
        return candidates[0]

    if password is not None:
        password_matches = [user for user in candidates if user.check_password(password)]
        if len(password_matches) == 1:
            return password_matches[0]
        if password_matches:
            exact_password_matches = [
                user for user in password_matches if getattr(user, field, None) == identifier
            ]
            if len(exact_password_matches) == 1:
                return exact_password_matches[0]
            return None

    exact_matches = [user for user in candidates if getattr(user, field, None) == identifier]
    return exact_matches[0] if len(exact_matches) == 1 else None


def find_user_for_login(identifier, password=None, *, allow_username=True):
    """Resolve an email without case sensitivity, safely handling legacy duplicates."""
    identifier = (identifier or "").strip()
    if not identifier:
        return None

    email_matches = list(User.objects.filter(email__iexact=identifier).order_by("id"))
    if email_matches:
        return _select_login_match(email_matches, identifier, password, "email")

    if not allow_username:
        return None

    username_matches = list(User.objects.filter(username=identifier).order_by("id"))
    if username_matches:
        return _select_login_match(username_matches, identifier, password, "username")
    return None
