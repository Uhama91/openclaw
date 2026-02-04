#!/usr/bin/env python3
"""
Mail Notifier - Check for important emails and notify via Telegram
Runs every 3 hours + mandatory 9h check
"""

import os
import sys
import json
import subprocess
from datetime import datetime
import urllib.request
import urllib.parse

# Telegram configuration
TELEGRAM_BOT_TOKEN = os.environ.get("TELEGRAM_BOT_TOKEN", "")
TELEGRAM_CHAT_ID = os.environ.get("TELEGRAM_CHAT_ID", "")

# Script path
MAIL_MANAGER_SCRIPT = "/root/.moltbot/skills/mail-manager/scripts/mail_manager.py"

# Spam/newsletter patterns to ignore
IGNORE_PATTERNS = [
    "newsletter", "promo", "deal", "sale", "unsubscribe",
    "no-reply", "noreply", "notification", "alert",
    "marketing", "publicité", "pub@", "news@",
    "skrill", "paypal notification", "facebook", "linkedin",
    "twitter", "instagram", "tiktok", "youtube",
]

# Important sender patterns (always notify)
IMPORTANT_PATTERNS = [
    "ac-creteil", "education.gouv", "eduscol",
    "impots", "gouv.fr", "caf", "cpam", "ameli",
    "banque", "bank", "urgent", "important",
]


def run_mail_command(args):
    """Run mail_manager.py with given arguments"""
    cmd = ["python3", MAIL_MANAGER_SCRIPT] + args

    # Set up environment
    env = os.environ.copy()
    env["AZURE_CLIENT_ID"] = os.environ.get("AZURE_CLIENT_ID", "")
    env["AZURE_TENANT_ID"] = os.environ.get("AZURE_TENANT_ID", "consumers")

    try:
        result = subprocess.run(cmd, capture_output=True, text=True, env=env, timeout=60)
        return json.loads(result.stdout)
    except Exception as e:
        return {"success": False, "error": str(e)}


def is_important_email(email):
    """Check if email is important (should notify)"""
    sender = email.get("from", "").lower()
    subject = email.get("subject", "").lower()

    # Always notify for important patterns
    for pattern in IMPORTANT_PATTERNS:
        if pattern in sender or pattern in subject:
            return True

    # Skip spam/newsletter patterns
    for pattern in IGNORE_PATTERNS:
        if pattern in sender or pattern in subject:
            return False

    # Default: notify for unread emails from unknown senders
    return True


def get_unread_emails(account):
    """Get unread emails from account"""
    result = run_mail_command(["list", "--account", account, "--unread", "--limit", "20"])

    if not result.get("success"):
        return []

    return result.get("emails", [])


def send_telegram_notification(message):
    """Send notification via Telegram"""
    if not TELEGRAM_BOT_TOKEN or not TELEGRAM_CHAT_ID:
        print("Telegram not configured")
        return False

    url = f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/sendMessage"
    data = {
        "chat_id": TELEGRAM_CHAT_ID,
        "text": message,
        "parse_mode": "HTML",
        "disable_web_page_preview": True,
    }

    try:
        req = urllib.request.Request(
            url,
            data=urllib.parse.urlencode(data).encode(),
            headers={"Content-Type": "application/x-www-form-urlencoded"}
        )
        with urllib.request.urlopen(req, timeout=10) as response:
            return response.status == 200
    except Exception as e:
        print(f"Telegram error: {e}")
        return False


def format_notification(important_emails, account_name):
    """Format emails for Telegram notification"""
    if not important_emails:
        return None

    lines = [f"<b>📬 {len(important_emails)} email(s) - {account_name}</b>\n"]

    for email in important_emails[:5]:  # Max 5 emails per notification
        sender = email.get("from", "Unknown")
        # Clean sender name
        if "<" in sender:
            sender = sender.split("<")[0].strip().strip('"')
        if len(sender) > 30:
            sender = sender[:27] + "..."

        subject = email.get("subject", "(sans sujet)")
        if len(subject) > 50:
            subject = subject[:47] + "..."

        lines.append(f"• <b>{sender}</b>")
        lines.append(f"  {subject}\n")

    if len(important_emails) > 5:
        lines.append(f"<i>+ {len(important_emails) - 5} autres...</i>")

    return "\n".join(lines)


def check_and_notify():
    """Main function: check emails and send notifications only if important"""
    now = datetime.now()
    print(f"[{now.strftime('%Y-%m-%d %H:%M')}] Checking emails...")

    all_notifications = []

    # Check Gmail
    gmail_emails = get_unread_emails("gmail")
    gmail_important = [e for e in gmail_emails if is_important_email(e)]
    if gmail_important:
        notif = format_notification(gmail_important, "Gmail")
        if notif:
            all_notifications.append(notif)
    print(f"  Gmail: {len(gmail_emails)} unread, {len(gmail_important)} important")

    # Check Hotmail
    hotmail_emails = get_unread_emails("hotmail")
    hotmail_important = [e for e in hotmail_emails if is_important_email(e)]
    if hotmail_important:
        notif = format_notification(hotmail_important, "Hotmail")
        if notif:
            all_notifications.append(notif)
    print(f"  Hotmail: {len(hotmail_emails)} unread, {len(hotmail_important)} important")

    # Check AC Créteil (pro)
    ac_emails = get_unread_emails("ac-creteil")
    ac_important = [e for e in ac_emails if is_important_email(e)]
    if ac_important:
        notif = format_notification(ac_important, "AC Créteil (Pro)")
        if notif:
            all_notifications.append(notif)
    print(f"  AC Créteil: {len(ac_emails)} unread, {len(ac_important)} important")

    # Send notifications ONLY if important emails exist
    if all_notifications:
        message = "\n\n".join(all_notifications)
        if send_telegram_notification(message):
            print("  Notification sent!")
        else:
            print("  Failed to send notification")
    else:
        # Stay silent - no notification needed
        print("  No important emails - staying silent")


def main():
    """Entry point"""
    # Verify environment
    required_vars = ["GMAIL_ADDRESS", "GMAIL_APP_PASSWORD", "HOTMAIL_ADDRESS",
                     "AZURE_CLIENT_ID", "TELEGRAM_BOT_TOKEN",
                     "AC_CRETEIL_EMAIL", "AC_CRETEIL_PASSWORD", "AC_CRETEIL_IMAP_LOGIN"]

    missing = [v for v in required_vars if not os.environ.get(v)]
    if missing:
        print(f"Missing environment variables: {', '.join(missing)}")
        sys.exit(1)

    check_and_notify()


if __name__ == "__main__":
    main()
