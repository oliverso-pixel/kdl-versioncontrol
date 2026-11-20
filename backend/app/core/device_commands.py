"""Rules for commands an admin sends to a tablet from the web console.

Kept free of FastAPI and the database so the rules can be tested alone.
"""
from typing import Optional

from .lock_password_crypto import TooLongToSeal, seal_for_tablet

RESET_PASSWORD_ACTION = "DC_reset_password"
SWITCH_WIFI_ACTION = "DC_switch_wifi"

# Only a superuser may send these, and only through the command endpoint
# (the other paths to a tablet skip the checks and the masked history).
SUPERUSER_ONLY_ACTIONS = frozenset({RESET_PASSWORD_ACTION, SWITCH_WIFI_ACTION})

# Values that must never be saved or logged: they are replaced in the history copy.
SENSITIVE_KEYS = frozenset({
    "new_password", "new_password_enc", "wifi_password", "wifi_password_enc", "secret",
})
HIDDEN = "***"


class CommandRejected(Exception):
    """The command must not be sent. Carries the HTTP status to answer with."""

    def __init__(self, status_code: int, detail: str):
        super().__init__(detail)
        self.status_code = status_code
        self.detail = detail


def prepare_admin_command(command: dict, operator: dict, tablet: Optional[dict] = None) -> tuple[dict, dict]:
    """Check a command against the rules.

    tablet: what the target tablet last reported,
    {"android_id", "public_key", "nonce", "current_wifi"}. Only the
    superuser-only commands need it.

    Returns (to_device, for_history): what goes to the tablet, and the copy
    that is safe to save in the command history.
    Raises CommandRejected when the operator may not send it or it is malformed.
    """
    action = command.get("action")
    to_device = dict(command)

    if action in SUPERUSER_ONLY_ACTIONS and not operator.get("is_superuser"):
        raise CommandRejected(403, "Only a superuser can send this command")

    # The link is plain ws://: a password only ever travels sealed.
    # There is no fallback to plain text.
    if action == RESET_PASSWORD_ACTION:
        if not _is_valid_lock_screen_password(command.get("new_password")):
            raise CommandRejected(422, "The lock screen password must be 4 to 8 digits")
        del to_device["new_password"]
        to_device["new_password_enc"] = _seal("lock", {"p": command["new_password"]}, tablet)

    elif action == SWITCH_WIFI_ACTION:
        ssid = command.get("ssid")
        wifi_password = command.get("wifi_password")
        if wifi_password is None:
            wifi_password = ""
        if not _is_valid_wifi_name(ssid):
            raise CommandRejected(422, "The Wi-Fi name must be 1 to 32 bytes")
        if not _is_valid_wifi_password(wifi_password):
            raise CommandRejected(422, "The Wi-Fi password must be empty or 8 to 63 characters")
        if tablet and tablet.get("current_wifi") == ssid:
            raise CommandRejected(409, "The tablet is already on this Wi-Fi")
        to_device.pop("wifi_password", None)
        # The name is sealed in too, so it cannot be changed on the way.
        to_device["wifi_password_enc"] = _seal("wifi", {"p": wifi_password, "s": ssid}, tablet)

    for_history = {
        key: (HIDDEN if key in SENSITIVE_KEYS else value)
        for key, value in command.items()
    }
    if action in SUPERUSER_ONLY_ACTIONS:
        for_history["requested_by"] = operator.get("sub")
    return to_device, for_history


def _seal(purpose: str, fields: dict, tablet: Optional[dict]) -> str:
    not_ready = CommandRejected(409, "The tablet has not reported its key yet. Try again in a few minutes.")
    if not tablet or not tablet.get("public_key") or not tablet.get("nonce"):
        raise not_ready
    try:
        return seal_for_tablet(purpose, fields, tablet["android_id"], tablet["nonce"], tablet["public_key"])
    except TooLongToSeal:
        raise CommandRejected(422, "The Wi-Fi name and password are too long together") from None
    except ValueError:
        raise not_ready from None


def _is_valid_lock_screen_password(value) -> bool:
    # Not str.isdigit(): that also accepts digits from other scripts.
    return (
        isinstance(value, str)
        and 4 <= len(value) <= 8
        and all(ch in "0123456789" for ch in value)
    )


def _is_valid_wifi_name(value) -> bool:
    # The limit is 32 bytes, not 32 characters: a Chinese character takes 3.
    return (
        isinstance(value, str)
        and 1 <= len(value.encode("utf-8")) <= 32
        and all(ch.isprintable() for ch in value)
    )


def _is_valid_wifi_password(value) -> bool:
    # WPA: 8 to 63 printable ASCII characters. Empty = open network, or one
    # the tablet has already saved.
    if value == "":
        return True
    return (
        isinstance(value, str)
        and 8 <= len(value) <= 63
        and all(" " <= ch <= "~" for ch in value)
    )
