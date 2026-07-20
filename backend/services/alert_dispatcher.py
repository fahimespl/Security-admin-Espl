"""
Alert Dispatcher — sends alerts through enabled channels.

Each channel is independent: if WhatsApp fails, siren and door lock still fire.
"""

import os
import sys
import logging
from typing import List

logger = logging.getLogger(__name__)

# ---------- Twilio WhatsApp ----------
_twilio_client = None
_twilio_from = None

try:
    from twilio.rest import Client as TwilioClient
    sid = os.getenv("TWILIO_ACCOUNT_SID", "")
    token = os.getenv("TWILIO_AUTH_TOKEN", "")
    _twilio_from = os.getenv("TWILIO_FROM_WHATSAPP", "")
    if sid and token:
        _twilio_client = TwilioClient(sid, token)
        logger.info("Twilio client initialised for WhatsApp alerts.")
    else:
        logger.warning("Twilio credentials not set — WhatsApp alerts disabled.")
except ImportError:
    logger.warning("twilio package not installed — WhatsApp alerts disabled.")


def send_whatsapp(
    recipients: List[dict],
    message: str,
    media_url: str | None = None,
) -> list[dict]:
    """
    Send a WhatsApp message to all recipients.
    Returns a list of {phone, success, error?} dicts.
    """
    results = []
    if not _twilio_client or not _twilio_from:
        logger.warning("WhatsApp dispatch skipped — Twilio not configured.")
        for r in recipients:
            results.append({"phone": r["phone"], "success": False, "error": "Twilio not configured"})
        return results

    for r in recipients:
        to_number = f"whatsapp:{r['phone'].replace(' ', '')}"
        try:
            kwargs = {
                "from_": _twilio_from,
                "to": to_number,
                "body": message,
            }
            if media_url and media_url.startswith("http"):
                kwargs["media_url"] = [media_url]
            _twilio_client.messages.create(**kwargs)
            results.append({"phone": r["phone"], "success": True})
            logger.info("WhatsApp sent to %s", r["phone"])
        except Exception as exc:
            logger.error("WhatsApp send failed for %s: %s", r["phone"], exc)
            results.append({"phone": r["phone"], "success": False, "error": str(exc)})

    return results


def trigger_siren():
    """
    Stand-in siren trigger.
    Plays a system beep on Windows; logs on other platforms.
    Replace this function with GPIO/relay control for real hardware.
    """
    try:
        if sys.platform == "win32":
            import winsound
            # Play a 1-second 1000 Hz beep
            winsound.Beep(1000, 1000)
            logger.info("Siren triggered (winsound beep).")
        else:
            # On Linux/Mac, just log — no reliable cross-platform beep
            logger.info("Siren triggered (logged only — no hardware connected).")
    except Exception as exc:
        logger.error("Siren trigger failed: %s", exc)


def trigger_door_lock():
    """
    Stand-in door lock trigger.
    Logs the action for now — replace with real hardware integration later.
    """
    logger.info("Door lock triggered (logged only — no hardware connected).")


def dispatch_alert(
    channels: dict,
    recipients: List[dict],
    detection_info: dict,
    snapshot_url: str | None = None,
):
    """
    Dispatch alert through all enabled channels independently.

    channels: { whatsapp: bool, siren: bool, autoLock: bool }
    detection_info: { name, confidence, known, timestamp }
    """
    info = detection_info
    status = "Known" if info.get("known") else "Unknown"
    name_str = info.get("name", "Unknown")
    ts = info.get("timestamp", "N/A")
    message = (
        f"🚨 Esamyak Alert\n"
        f"Status: {status}\n"
        f"Name: {name_str}\n"
        f"Confidence: {info.get('confidence', 0):.0f}%\n"
        f"Time: {ts}\n"
        f"Store is CLOSED — presence detected."
    )

    results = {"whatsapp": None, "siren": None, "auto_lock": None}

    if channels.get("whatsapp"):
        try:
            results["whatsapp"] = send_whatsapp(recipients, message, snapshot_url)
        except Exception as exc:
            logger.error("WhatsApp dispatch error: %s", exc)
            results["whatsapp"] = {"error": str(exc)}

    if channels.get("siren"):
        try:
            trigger_siren()
            results["siren"] = {"success": True}
        except Exception as exc:
            logger.error("Siren dispatch error: %s", exc)
            results["siren"] = {"error": str(exc)}

    if channels.get("autoLock") or channels.get("auto_lock"):
        try:
            trigger_door_lock()
            results["auto_lock"] = {"success": True}
        except Exception as exc:
            logger.error("Door lock dispatch error: %s", exc)
            results["auto_lock"] = {"error": str(exc)}

    return results
