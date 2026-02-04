#!/usr/bin/env python3
"""
Mail Manager - Read and send emails via IMAP/SMTP
Supports Gmail (read), AC Créteil (send), and Hotmail (read + send with OAuth)
"""

import imaplib
import smtplib
import email
from email.header import decode_header
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
import json
import argparse
import os
import sys
from datetime import datetime
import ssl
import base64
import urllib.request
import urllib.parse

# Token storage path
TOKEN_FILE = os.path.join(os.environ.get("HOME", "/root"), ".openclaw", "credentials", "hotmail_tokens.json")

# Azure OAuth configuration
AZURE_CLIENT_ID = os.environ.get("AZURE_CLIENT_ID", "")
AZURE_CLIENT_SECRET = os.environ.get("AZURE_CLIENT_SECRET", "")
AZURE_TENANT_ID = os.environ.get("AZURE_TENANT_ID", "consumers")
AZURE_REDIRECT_URI = "https://login.microsoftonline.com/common/oauth2/nativeclient"
AZURE_SCOPES = "https://outlook.office.com/IMAP.AccessAsUser.All https://outlook.office.com/SMTP.Send offline_access"

# Server configurations
SERVERS = {
    "gmail": {
        "imap": "imap.gmail.com",
        "imap_port": 993,
        "smtp": "smtp.gmail.com",
        "smtp_port": 587,
        "email_env": "GMAIL_ADDRESS",
        "password_env": "GMAIL_APP_PASSWORD",
        "use_ssl_smtp": False,
        "use_oauth": False,
    },
    "ac-creteil": {
        "imap": os.environ.get("AC_CRETEIL_IMAP", "imap.ac-creteil.fr"),
        "imap_port": int(os.environ.get("AC_CRETEIL_IMAP_PORT", "993")),
        "smtp": os.environ.get("AC_CRETEIL_SMTP", "smtp.ac-creteil.fr"),
        "smtp_port": int(os.environ.get("AC_CRETEIL_SMTP_PORT", "465")),
        "email_env": "AC_CRETEIL_EMAIL",
        "password_env": "AC_CRETEIL_PASSWORD",
        "imap_login_env": "AC_CRETEIL_IMAP_LOGIN",  # Different login format for IMAP
        "use_ssl_smtp": True,
        "use_oauth": False,
    },
    "hotmail": {
        "imap": "outlook.office365.com",
        "imap_port": 993,
        "smtp": "smtp.office365.com",
        "smtp_port": 587,
        "email_env": "HOTMAIL_ADDRESS",
        "password_env": "HOTMAIL_APP_PASSWORD",
        "use_ssl_smtp": False,
        "use_oauth": True,
    },
}


# =============================================================================
# OAuth Functions for Microsoft/Hotmail
# =============================================================================

def get_oauth_authorize_url():
    """Generate OAuth authorization URL for user to visit"""
    if not AZURE_CLIENT_ID:
        return None, "AZURE_CLIENT_ID not configured"

    params = {
        "client_id": AZURE_CLIENT_ID,
        "response_type": "code",
        "redirect_uri": AZURE_REDIRECT_URI,
        "response_mode": "query",
        "scope": AZURE_SCOPES,
        "state": "12345",
    }

    url = f"https://login.microsoftonline.com/{AZURE_TENANT_ID}/oauth2/v2.0/authorize?" + urllib.parse.urlencode(params)
    return url, None


def exchange_code_for_tokens(auth_code):
    """Exchange authorization code for access and refresh tokens"""
    if not all([AZURE_CLIENT_ID, AZURE_TENANT_ID]):
        return None, "Azure OAuth credentials not configured"

    token_url = f"https://login.microsoftonline.com/{AZURE_TENANT_ID}/oauth2/v2.0/token"

    # Public client (desktop/mobile app) - no client_secret
    data = {
        "client_id": AZURE_CLIENT_ID,
        "code": auth_code,
        "redirect_uri": AZURE_REDIRECT_URI,
        "grant_type": "authorization_code",
        "scope": AZURE_SCOPES,
    }

    try:
        req = urllib.request.Request(
            token_url,
            data=urllib.parse.urlencode(data).encode(),
            headers={"Content-Type": "application/x-www-form-urlencoded"}
        )
        with urllib.request.urlopen(req) as response:
            tokens = json.loads(response.read().decode())
            save_tokens(tokens)
            return tokens, None
    except urllib.error.HTTPError as e:
        error_body = e.read().decode()
        return None, f"Token exchange failed: {error_body}"
    except Exception as e:
        return None, f"Token exchange failed: {str(e)}"


def refresh_access_token(refresh_token):
    """Refresh access token using refresh token"""
    if not all([AZURE_CLIENT_ID, AZURE_TENANT_ID]):
        return None, "Azure OAuth credentials not configured"

    token_url = f"https://login.microsoftonline.com/{AZURE_TENANT_ID}/oauth2/v2.0/token"

    # Public client (desktop/mobile app) - no client_secret
    data = {
        "client_id": AZURE_CLIENT_ID,
        "refresh_token": refresh_token,
        "grant_type": "refresh_token",
        "scope": AZURE_SCOPES,
    }

    try:
        req = urllib.request.Request(
            token_url,
            data=urllib.parse.urlencode(data).encode(),
            headers={"Content-Type": "application/x-www-form-urlencoded"}
        )
        with urllib.request.urlopen(req) as response:
            tokens = json.loads(response.read().decode())
            save_tokens(tokens)
            return tokens, None
    except urllib.error.HTTPError as e:
        error_body = e.read().decode()
        return None, f"Token refresh failed: {error_body}"
    except Exception as e:
        return None, f"Token refresh failed: {str(e)}"


def save_tokens(tokens):
    """Save tokens to file"""
    os.makedirs(os.path.dirname(TOKEN_FILE), exist_ok=True)
    tokens["saved_at"] = datetime.now().isoformat()
    with open(TOKEN_FILE, "w") as f:
        json.dump(tokens, f, indent=2)


def load_tokens():
    """Load tokens from file"""
    try:
        with open(TOKEN_FILE, "r") as f:
            return json.load(f)
    except FileNotFoundError:
        return None
    except json.JSONDecodeError:
        return None


def get_valid_access_token():
    """Get a valid access token, refreshing if necessary"""
    tokens = load_tokens()
    if not tokens:
        return None, "No tokens found. Run 'oauth-init' first."

    # Try to use existing access token first
    # If it fails during IMAP/SMTP, we'll refresh
    if "access_token" in tokens:
        return tokens["access_token"], None

    return None, "No access token found"


def generate_oauth2_string(username, access_token, encode_base64=False):
    """Generate XOAUTH2 string for IMAP/SMTP authentication"""
    auth_string = f"user={username}\x01auth=Bearer {access_token}\x01\x01"
    if encode_base64:
        return base64.b64encode(auth_string.encode()).decode()
    return auth_string


# =============================================================================
# Email Functions
# =============================================================================

def get_credentials(account="gmail"):
    """Get credentials for specified account"""
    config = SERVERS.get(account)
    if not config:
        return None, None, f"Unknown account: {account}"

    address = os.environ.get(config["email_env"])
    password = os.environ.get(config["password_env"])

    if not address:
        return None, None, f"Missing {config['email_env']}"

    if not config.get("use_oauth") and not password:
        return None, None, f"Missing {config['password_env']}"

    if password:
        password = password.replace(" ", "")
    return address, password, None


def decode_mime_header(header):
    """Decode MIME encoded header"""
    if not header:
        return ""

    decoded_parts = []
    for part, encoding in decode_header(header):
        if isinstance(part, bytes):
            try:
                decoded_parts.append(part.decode(encoding or 'utf-8', errors='replace'))
            except:
                decoded_parts.append(part.decode('utf-8', errors='replace'))
        else:
            decoded_parts.append(part)
    return ''.join(decoded_parts)



def html_to_text(html):
    """Convert HTML to plain text"""
    import re
    # Remove script and style elements
    text = re.sub(r'<(script|style)[^>]*>.*?</\1>', '', html, flags=re.DOTALL | re.IGNORECASE)
    # Replace common block elements with newlines
    text = re.sub(r'<(br|p|div|tr|li)[^>]*/?>', '\n', text, flags=re.IGNORECASE)
    # Remove all remaining HTML tags
    text = re.sub(r'<[^>]+>', '', text)
    # Decode common HTML entities
    text = text.replace('&nbsp;', ' ').replace('&amp;', '&').replace('&lt;', '<').replace('&gt;', '>').replace('&quot;', '"')
    # Collapse multiple whitespace/newlines
    text = re.sub(r'[ \t]+', ' ', text)
    text = re.sub(r'\n\s*\n+', '\n\n', text)
    return text.strip()


def clean_text_for_preview(text):
    """Clean text for preview display"""
    import re
    # Replace literal backslash-n and backslash-r with spaces
    text = text.replace("\\n", " ").replace("\\r", " ")
    # Replace actual newlines and carriage returns
    text = text.replace("\n", " ").replace("\r", " ")
    # Collapse multiple spaces
    text = " ".join(text.split())
    return text

def get_email_body(msg):
    """Extract email body from message"""
    body = ""
    html_body = ""

    if msg.is_multipart():
        for part in msg.walk():
            content_type = part.get_content_type()
            content_disposition = str(part.get("Content-Disposition"))

            if "attachment" not in content_disposition:
                try:
                    charset = part.get_content_charset() or 'utf-8'
                    payload = part.get_payload(decode=True).decode(charset, errors='replace')
                    if content_type == "text/plain" and not body:
                        body = payload
                    elif content_type == "text/html" and not html_body:
                        html_body = payload
                except:
                    pass
    else:
        try:
            charset = msg.get_content_charset() or 'utf-8'
            payload = msg.get_payload(decode=True).decode(charset, errors='replace')
            if msg.get_content_type() == "text/html":
                html_body = payload
            else:
                body = payload
        except:
            body = str(msg.get_payload())

    # Prefer plain text, fall back to converted HTML
    if body:
        return body.strip()
    elif html_body:
        return html_to_text(html_body)
    return ""


def connect_imap(account="gmail"):
    """Connect to IMAP server"""
    config = SERVERS.get(account)
    if not config or not config["imap"]:
        return None, {"success": False, "error": f"IMAP not configured for {account}"}

    address, password, error = get_credentials(account)
    if error:
        return None, {"success": False, "error": error}

    try:
        mail = imaplib.IMAP4_SSL(config["imap"], config["imap_port"])

        if config.get("use_oauth"):
            # OAuth authentication for Hotmail
            access_token, token_error = get_valid_access_token()
            if token_error:
                return None, {"success": False, "error": token_error}

            auth_string = generate_oauth2_string(address, access_token, encode_base64=False)
            try:
                mail.authenticate("XOAUTH2", lambda x: auth_string)
            except imaplib.IMAP4.error as e:
                # Token might be expired, try to refresh
                tokens = load_tokens()
                if tokens and "refresh_token" in tokens:
                    new_tokens, refresh_error = refresh_access_token(tokens["refresh_token"])
                    if refresh_error:
                        return None, {"success": False, "error": f"Token refresh failed: {refresh_error}"}

                    auth_string = generate_oauth2_string(address, new_tokens["access_token"], encode_base64=False)
                    mail.authenticate("XOAUTH2", lambda x: auth_string)
                else:
                    return None, {"success": False, "error": f"OAuth failed and no refresh token: {str(e)}"}
        else:
            # Basic authentication
            # Use special IMAP login if configured (e.g., AC Créteil uses different login format)
            imap_login = os.environ.get(config.get("imap_login_env", ""), "") or address
            mail.login(imap_login, password)

        return mail, None
    except imaplib.IMAP4.error as e:
        return None, {"success": False, "error": f"Authentication failed: {str(e)}"}
    except Exception as e:
        return None, {"success": False, "error": f"Connection failed: {str(e)}"}


def list_emails(account="gmail", unread_only=False, limit=10, from_filter=None):
    """List emails from inbox"""
    mail, error = connect_imap(account)
    if error:
        return error

    try:
        mail.select("INBOX")

        criteria = []
        if unread_only:
            criteria.append("UNSEEN")
        if from_filter:
            criteria.append(f'FROM "{from_filter}"')

        if not criteria:
            search_string = "ALL"
        else:
            search_string = " ".join(criteria)

        status, messages = mail.search(None, search_string)

        if status != "OK":
            return {"success": False, "error": "Failed to search emails"}

        email_ids = messages[0].split()
        email_ids = email_ids[-limit:] if len(email_ids) > limit else email_ids
        email_ids.reverse()

        emails = []
        for email_id in email_ids:
            status, msg_data = mail.fetch(email_id, "(RFC822 FLAGS)")
            if status != "OK":
                continue

            raw_email = msg_data[0][1]
            msg = email.message_from_bytes(raw_email)

            flags = msg_data[0][0].decode() if msg_data[0][0] else ""
            is_unread = "\\Seen" not in flags

            date_str = msg.get("Date", "")
            try:
                date_tuple = email.utils.parsedate_tz(date_str)
                if date_tuple:
                    date_formatted = datetime(*date_tuple[:6]).strftime("%Y-%m-%d %H:%M")
                else:
                    date_formatted = date_str
            except:
                date_formatted = date_str

            body = get_email_body(msg)
            preview = clean_text_for_preview(body)[:150] + "..." if len(body) > 150 else clean_text_for_preview(body)

            emails.append({
                "id": email_id.decode(),
                "from": decode_mime_header(msg.get("From", "")),
                "to": decode_mime_header(msg.get("To", "")),
                "subject": decode_mime_header(msg.get("Subject", "(no subject)")),
                "date": date_formatted,
                "unread": is_unread,
                "preview": preview
            })

        mail.logout()
        return {"success": True, "count": len(emails), "emails": emails, "account": account}

    except Exception as e:
        return {"success": False, "error": str(e)}


def read_email(email_id, account="gmail"):
    """Read a specific email by ID"""
    mail, error = connect_imap(account)
    if error:
        return error

    try:
        mail.select("INBOX")

        status, msg_data = mail.fetch(email_id.encode(), "(RFC822)")
        if status != "OK":
            return {"success": False, "error": f"Email {email_id} not found"}

        raw_email = msg_data[0][1]
        msg = email.message_from_bytes(raw_email)

        date_str = msg.get("Date", "")
        try:
            date_tuple = email.utils.parsedate_tz(date_str)
            if date_tuple:
                date_formatted = datetime(*date_tuple[:6]).strftime("%Y-%m-%d %H:%M")
            else:
                date_formatted = date_str
        except:
            date_formatted = date_str

        body = get_email_body(msg)

        mail.logout()
        return {
            "success": True,
            "email": {
                "id": email_id,
                "from": decode_mime_header(msg.get("From", "")),
                "to": decode_mime_header(msg.get("To", "")),
                "reply_to": decode_mime_header(msg.get("Reply-To", msg.get("From", ""))),
                "subject": decode_mime_header(msg.get("Subject", "(no subject)")),
                "date": date_formatted,
                "message_id": msg.get("Message-ID", ""),
                "body": body
            },
            "account": account
        }

    except Exception as e:
        return {"success": False, "error": str(e)}


def search_emails(account="gmail", from_addr=None, subject=None, keyword=None, unread_only=False, limit=10):
    """Search emails with criteria"""
    mail, error = connect_imap(account)
    if error:
        return error

    try:
        mail.select("INBOX")

        criteria = []
        if from_addr:
            criteria.append(f'FROM "{from_addr}"')
        if subject:
            criteria.append(f'SUBJECT "{subject}"')
        if keyword:
            criteria.append(f'BODY "{keyword}"')
        if unread_only:
            criteria.append("UNSEEN")

        if not criteria:
            criteria = ["ALL"]

        search_string = " ".join(criteria)
        status, messages = mail.search(None, search_string)

        if status != "OK":
            return {"success": False, "error": "Search failed"}

        email_ids = messages[0].split()
        email_ids = email_ids[-limit:] if len(email_ids) > limit else email_ids
        email_ids.reverse()

        emails = []
        for email_id in email_ids:
            status, msg_data = mail.fetch(email_id, "(RFC822 FLAGS)")
            if status != "OK":
                continue

            raw_email = msg_data[0][1]
            msg = email.message_from_bytes(raw_email)

            flags = msg_data[0][0].decode() if msg_data[0][0] else ""
            is_unread = "\\Seen" not in flags

            date_str = msg.get("Date", "")
            try:
                date_tuple = email.utils.parsedate_tz(date_str)
                if date_tuple:
                    date_formatted = datetime(*date_tuple[:6]).strftime("%Y-%m-%d %H:%M")
                else:
                    date_formatted = date_str
            except:
                date_formatted = date_str

            body = get_email_body(msg)
            preview = clean_text_for_preview(body)[:150] + "..." if len(body) > 150 else clean_text_for_preview(body)

            emails.append({
                "id": email_id.decode(),
                "from": decode_mime_header(msg.get("From", "")),
                "subject": decode_mime_header(msg.get("Subject", "(no subject)")),
                "date": date_formatted,
                "unread": is_unread,
                "preview": preview
            })

        mail.logout()
        return {"success": True, "count": len(emails), "emails": emails, "account": account}

    except Exception as e:
        return {"success": False, "error": str(e)}


def send_email(account, to_addr, subject, body, reply_to_id=None, in_reply_to=None):
    """Send an email via SMTP"""
    config = SERVERS.get(account)
    if not config or not config["smtp"]:
        return {"success": False, "error": f"SMTP not configured for {account}"}

    from_addr, password, error = get_credentials(account)
    if error:
        return {"success": False, "error": error}

    try:
        msg = MIMEMultipart()
        msg["From"] = from_addr
        msg["To"] = to_addr
        msg["Subject"] = subject

        if in_reply_to:
            msg["In-Reply-To"] = in_reply_to
            msg["References"] = in_reply_to

        msg.attach(MIMEText(body, "plain", "utf-8"))

        context = ssl.create_default_context()

        if config.get("use_oauth"):
            # OAuth authentication for Hotmail
            access_token, token_error = get_valid_access_token()
            if token_error:
                return {"success": False, "error": token_error}

            with smtplib.SMTP(config["smtp"], config["smtp_port"]) as server:
                server.ehlo()
                server.starttls(context=context)
                server.ehlo()

                # XOAUTH2 authentication
                auth_string = generate_oauth2_string(from_addr, access_token, encode_base64=False)

                def xoauth2_handler(challenge=None):
                    return auth_string

                try:
                    server.auth("XOAUTH2", xoauth2_handler, initial_response_ok=True)
                except smtplib.SMTPAuthenticationError:
                    # Try refresh
                    tokens = load_tokens()
                    if tokens and "refresh_token" in tokens:
                        new_tokens, refresh_error = refresh_access_token(tokens["refresh_token"])
                        if refresh_error:
                            return {"success": False, "error": f"Token refresh failed: {refresh_error}"}
                        auth_string = generate_oauth2_string(from_addr, new_tokens["access_token"], encode_base64=False)
                        server.auth("XOAUTH2", xoauth2_handler, initial_response_ok=True)
                    else:
                        raise
                server.send_message(msg)
        elif config.get("use_ssl_smtp", False):
            with smtplib.SMTP_SSL(config["smtp"], config["smtp_port"], context=context) as server:
                server.login(from_addr, password)
                server.send_message(msg)
        else:
            with smtplib.SMTP(config["smtp"], config["smtp_port"]) as server:
                server.starttls(context=context)
                server.login(from_addr, password)
                server.send_message(msg)

        return {
            "success": True,
            "message": f"Email sent successfully from {from_addr} to {to_addr}",
            "details": {
                "from": from_addr,
                "to": to_addr,
                "subject": subject,
                "account": account
            }
        }

    except smtplib.SMTPAuthenticationError as e:
        return {"success": False, "error": f"Authentication failed: {str(e)}"}
    except smtplib.SMTPException as e:
        return {"success": False, "error": f"SMTP error: {str(e)}"}
    except Exception as e:
        return {"success": False, "error": f"Failed to send: {str(e)}"}


def draft_email(account, to_addr, subject, body):
    """Create a draft for validation before send"""
    from_addr, _, error = get_credentials(account)
    if error:
        return {"success": False, "error": error}

    return {
        "success": True,
        "draft": {
            "from": from_addr,
            "to": to_addr,
            "subject": subject,
            "body": body,
            "account": account,
            "status": "PENDING_VALIDATION",
            "instructions": "Review this draft. Reply with 'send' to send, 'edit: [changes]' to modify, or 'cancel' to discard."
        }
    }


def oauth_init():
    """Initialize OAuth - get authorization URL"""
    url, error = get_oauth_authorize_url()
    if error:
        return {"success": False, "error": error}

    return {
        "success": True,
        "action": "OAUTH_INIT",
        "auth_url": url,
        "instructions": (
            "1. Open this URL in your browser\n"
            "2. Sign in with your Hotmail account (harounjean@hotmail.fr)\n"
            "3. Accept the permissions\n"
            "4. You will be redirected to a blank page\n"
            "5. Copy the ENTIRE URL from your browser's address bar\n"
            "6. Run: python mail_manager.py oauth-callback --url 'PASTE_URL_HERE'"
        )
    }


def oauth_callback(callback_url):
    """Process OAuth callback URL to get tokens"""
    try:
        parsed = urllib.parse.urlparse(callback_url)
        params = urllib.parse.parse_qs(parsed.query)

        if "error" in params:
            return {"success": False, "error": f"OAuth error: {params.get('error_description', params['error'])}"}

        if "code" not in params:
            return {"success": False, "error": "No authorization code in URL"}

        code = params["code"][0]
        tokens, error = exchange_code_for_tokens(code)

        if error:
            return {"success": False, "error": error}

        return {
            "success": True,
            "message": "OAuth configured successfully! You can now use Hotmail for reading and sending emails.",
            "token_saved": TOKEN_FILE
        }
    except Exception as e:
        return {"success": False, "error": f"Failed to process callback: {str(e)}"}


def oauth_status():
    """Check OAuth token status"""
    tokens = load_tokens()
    if not tokens:
        return {
            "success": True,
            "status": "NOT_CONFIGURED",
            "message": "OAuth not configured. Run 'oauth-init' to start."
        }

    return {
        "success": True,
        "status": "CONFIGURED",
        "saved_at": tokens.get("saved_at", "unknown"),
        "has_refresh_token": "refresh_token" in tokens,
        "token_file": TOKEN_FILE
    }


def list_folders(account="gmail"):
    """List available folders/labels"""
    mail, error = connect_imap(account)
    if error:
        return error

    try:
        status, folders = mail.list()
        if status != "OK":
            return {"success": False, "error": "Failed to list folders"}

        folder_list = []
        for folder in folders:
            # Parse folder name from IMAP response
            parts = folder.decode().split(' "/" ')
            if len(parts) >= 2:
                folder_list.append(parts[-1].strip('"'))

        mail.logout()
        return {"success": True, "folders": folder_list, "account": account}
    except Exception as e:
        return {"success": False, "error": str(e)}


def move_email(email_id, folder, account="gmail"):
    """Move email to a folder (archive)"""
    mail, error = connect_imap(account)
    if error:
        return error

    try:
        mail.select("INBOX")

        # Create folder if it doesn't exist
        mail.create(folder)  # Ignore error if exists

        # Copy to destination folder
        status, _ = mail.copy(email_id.encode(), folder)
        if status != "OK":
            return {"success": False, "error": f"Failed to copy email to {folder}"}

        # Mark original as deleted
        mail.store(email_id.encode(), '+FLAGS', '\\Deleted')
        mail.expunge()

        mail.logout()
        return {
            "success": True,
            "message": f"Email {email_id} moved to {folder}",
            "account": account
        }
    except Exception as e:
        return {"success": False, "error": str(e)}


def mark_read(email_id, account="gmail"):
    """Mark email as read"""
    mail, error = connect_imap(account)
    if error:
        return error

    try:
        mail.select("INBOX")
        mail.store(email_id.encode(), '+FLAGS', '\\Seen')
        mail.logout()
        return {"success": True, "message": f"Email {email_id} marked as read", "account": account}
    except Exception as e:
        return {"success": False, "error": str(e)}


def main():
    parser = argparse.ArgumentParser(description="Mail Manager - Read and send emails")
    subparsers = parser.add_subparsers(dest="command", help="Commands")

    # OAuth commands
    subparsers.add_parser("oauth-init", help="Initialize OAuth for Hotmail")

    oauth_cb_parser = subparsers.add_parser("oauth-callback", help="Process OAuth callback")
    oauth_cb_parser.add_argument("--url", required=True, help="Full callback URL from browser")

    subparsers.add_parser("oauth-status", help="Check OAuth status")

    # List command
    list_parser = subparsers.add_parser("list", help="List emails")
    list_parser.add_argument("--account", default="gmail", help="Account (gmail, hotmail, ac-creteil)")
    list_parser.add_argument("--unread", action="store_true", help="Only show unread emails")
    list_parser.add_argument("--limit", type=int, default=10, help="Number of emails to show")
    list_parser.add_argument("--from", dest="from_filter", help="Filter by sender")

    # Read command
    read_parser = subparsers.add_parser("read", help="Read a specific email")
    read_parser.add_argument("--account", default="gmail", help="Account (gmail, hotmail)")
    read_parser.add_argument("--id", required=True, help="Email ID to read")

    # Search command
    search_parser = subparsers.add_parser("search", help="Search emails")
    search_parser.add_argument("--account", default="gmail", help="Account (gmail, hotmail)")
    search_parser.add_argument("--from", dest="from_addr", help="Search by sender")
    search_parser.add_argument("--subject", help="Search by subject")
    search_parser.add_argument("--keyword", help="Search by keyword in body")
    search_parser.add_argument("--unread", action="store_true", help="Only unread emails")
    search_parser.add_argument("--limit", type=int, default=10, help="Number of results")

    # Draft command
    draft_parser = subparsers.add_parser("draft", help="Create a draft for review")
    draft_parser.add_argument("--account", default="ac-creteil", help="Account to send from (ac-creteil, hotmail)")
    draft_parser.add_argument("--to", required=True, help="Recipient email")
    draft_parser.add_argument("--subject", required=True, help="Email subject")
    draft_parser.add_argument("--body", required=True, help="Email body")

    # Send command
    send_parser = subparsers.add_parser("send", help="Send an email")
    send_parser.add_argument("--account", default="ac-creteil", help="Account to send from (ac-creteil, hotmail)")
    send_parser.add_argument("--to", required=True, help="Recipient email")
    send_parser.add_argument("--subject", required=True, help="Email subject")
    send_parser.add_argument("--body", required=True, help="Email body")
    send_parser.add_argument("--in-reply-to", help="Message-ID for threading")

    # Folders command
    folders_parser = subparsers.add_parser("folders", help="List folders")
    folders_parser.add_argument("--account", default="gmail", help="Account")

    # Move command (archive)
    move_parser = subparsers.add_parser("move", help="Move email to folder")
    move_parser.add_argument("--account", default="gmail", help="Account")
    move_parser.add_argument("--id", required=True, help="Email ID")
    move_parser.add_argument("--folder", required=True, help="Destination folder")

    # Mark read command
    markread_parser = subparsers.add_parser("mark-read", help="Mark email as read")
    markread_parser.add_argument("--account", default="gmail", help="Account")
    markread_parser.add_argument("--id", required=True, help="Email ID")

    args = parser.parse_args()

    if args.command == "oauth-init":
        result = oauth_init()
    elif args.command == "oauth-callback":
        result = oauth_callback(args.url)
    elif args.command == "oauth-status":
        result = oauth_status()
    elif args.command == "list":
        result = list_emails(
            account=args.account,
            unread_only=args.unread,
            limit=args.limit,
            from_filter=args.from_filter
        )
    elif args.command == "read":
        result = read_email(args.id, account=args.account)
    elif args.command == "search":
        result = search_emails(
            account=args.account,
            from_addr=args.from_addr,
            subject=args.subject,
            keyword=args.keyword,
            unread_only=args.unread,
            limit=args.limit
        )
    elif args.command == "draft":
        result = draft_email(
            account=args.account,
            to_addr=args.to,
            subject=args.subject,
            body=args.body
        )
    elif args.command == "send":
        result = send_email(
            account=args.account,
            to_addr=args.to,
            subject=args.subject,
            body=args.body,
            in_reply_to=args.in_reply_to
        )
    elif args.command == "folders":
        result = list_folders(account=args.account)
    elif args.command == "move":
        result = move_email(args.id, args.folder, account=args.account)
    elif args.command == "mark-read":
        result = mark_read(args.id, account=args.account)
    else:
        parser.print_help()
        sys.exit(1)

    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
