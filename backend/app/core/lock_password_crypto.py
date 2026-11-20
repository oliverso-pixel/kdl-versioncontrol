"""Seals a secret (a new Lock Screen Password, a Wi-Fi password) so only one tablet can read it.

The link to the tablets is plain ws://, so secrets are encrypted with the
tablet's own public key before they are sent. The private key never leaves
the tablet's Android Keystore.

What this does NOT stop: someone who can change messages on the link can swap
the public key a tablet reports. Only wss:// closes that.
"""
import base64
import json

from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import padding, rsa

MIN_KEY_BITS = 2048
_HASH_BYTES = 32  # SHA-256


class TooLongToSeal(ValueError):
    """The message does not fit in one RSA block of the tablet's key."""


def seal_for_tablet(purpose: str, fields: dict, android_id: str, nonce: str, public_key_b64: str) -> str:
    """Return base64 text that only the tablet owning the key can open.

    Sealed in with the secret fields: the purpose ("lock", "wifi"), the tablet
    id and the tablet's one-time nonce. So the message cannot be replayed,
    sent to another tablet, or passed off as a different command.
    Raises ValueError when the public key is unusable, TooLongToSeal when the
    message does not fit.
    """
    try:
        key = serialization.load_der_public_key(base64.b64decode(public_key_b64, validate=True))
    except Exception:
        raise ValueError("unusable public key") from None
    if not isinstance(key, rsa.RSAPublicKey) or key.key_size < MIN_KEY_BITS:
        raise ValueError("unusable public key")

    message = json.dumps(
        {"a": purpose, **fields, "d": android_id, "n": nonce},
        separators=(",", ":"), ensure_ascii=False,
    ).encode()
    if len(message) > key.key_size // 8 - 2 * _HASH_BYTES - 2:
        raise TooLongToSeal("message too long to seal")

    # Must match the tablet (admin/SealedCommand.kt): Android Keystore
    # does OAEP with SHA-256 but MGF1 with SHA-1.
    sealed = key.encrypt(
        message,
        padding.OAEP(mgf=padding.MGF1(hashes.SHA1()), algorithm=hashes.SHA256(), label=None),
    )
    return base64.b64encode(sealed).decode()
