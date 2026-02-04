---
name: mail-manager
description: Multi-account email management system supporting Gmail, Hotmail (OAuth 2.0), and AC Creteil. Provides IMAP/SMTP operations for reading, sending, and organizing emails across all configured accounts.
metadata: {"openclaw":{"emoji":"📧","requires":{"bins":["python3"],"env":["GMAIL_ADDRESS","GMAIL_APP_PASSWORD"]}}}
---

# Mail Manager — Multi-Account Email Management

## IMPORTANT: Pre-configured Accounts

**ALL ACCOUNTS ARE ALREADY CONFIGURED. NEVER ask the user for passwords or credentials.**

The credentials are stored in environment variables. Use the commands below directly.

## Configured Accounts

| Account | Read | Send | Address |
|---------|------|------|---------|
| **gmail** | Ready | Ready | (set via GMAIL_ADDRESS) |
| **hotmail** | Ready (OAuth) | Ready (OAuth) | (set via HOTMAIL_ADDRESS) |
| **ac-creteil** | Ready | Ready (SSL) | (set via AC_CRETEIL_EMAIL) |

## Commands

All commands use the Python script at `{baseDir}/scripts/mail_manager.py`.

### List Emails

```bash
python3 {baseDir}/scripts/mail_manager.py list --account ACCOUNT [--folder FOLDER] [--limit N]
```

- `ACCOUNT`: `gmail`, `hotmail`, or `ac-creteil`
- `FOLDER`: IMAP folder (default: INBOX)
- `limit`: Number of emails to fetch (default: 10)

**Examples:**
```bash
python3 {baseDir}/scripts/mail_manager.py list --account gmail --limit 5
python3 {baseDir}/scripts/mail_manager.py list --account hotmail --folder "Sent"
python3 {baseDir}/scripts/mail_manager.py list --account ac-creteil --limit 20
```

### Read Email

```bash
python3 {baseDir}/scripts/mail_manager.py read --account ACCOUNT --uid UID [--folder FOLDER]
```

- `UID`: Email unique identifier (from list output)

### Send Email

```bash
python3 {baseDir}/scripts/mail_manager.py send --account ACCOUNT --to RECIPIENT --subject "SUBJECT" --body "BODY"
```

**Examples:**
```bash
python3 {baseDir}/scripts/mail_manager.py send --account gmail --to "user@example.com" --subject "Hello" --body "Message content"
python3 {baseDir}/scripts/mail_manager.py send --account hotmail --to "user@example.com" --subject "Test" --body "OAuth email"
```

### List Folders

```bash
python3 {baseDir}/scripts/mail_manager.py folders --account ACCOUNT
```

### Move Email

```bash
python3 {baseDir}/scripts/mail_manager.py move --account ACCOUNT --uid UID --to-folder "FOLDER"
```

### Delete Email

```bash
python3 {baseDir}/scripts/mail_manager.py delete --account ACCOUNT --uid UID
```

## Account-Specific Notes

### Gmail
- Uses App Password authentication
- Requires: `GMAIL_ADDRESS`, `GMAIL_APP_PASSWORD`
- IMAP: imap.gmail.com:993
- SMTP: smtp.gmail.com:587

### Hotmail (OAuth 2.0)
- Uses Microsoft OAuth 2.0 with XOAUTH2
- Tokens stored in `/home/node/.openclaw/credentials/hotmail_tokens.json`
- Token refresh is automatic
- Requires: `HOTMAIL_ADDRESS`, `AZURE_CLIENT_ID`, `AZURE_CLIENT_SECRET`, `AZURE_TENANT_ID`
- IMAP: outlook.office365.com:993
- SMTP: smtp.office365.com:587

### AC Creteil
- Standard password authentication with SSL
- Requires: `AC_CRETEIL_EMAIL`, `AC_CRETEIL_PASSWORD`, `AC_CRETEIL_IMAP_LOGIN`
- Custom IMAP/SMTP servers via env vars

## Additional Scripts

### Mail Notifier
Background service for new email notifications:
```bash
{baseDir}/scripts/run_mail_notifier.sh
```

### Mail Sorter
Automatic email organization based on rules:
```bash
{baseDir}/scripts/run_mail_sorter.sh
```

## Security Features

- Credentials stored only in environment variables
- OAuth 2.0 tokens with automatic refresh
- Token files protected with 600 permissions
- No hardcoded credentials in scripts
- Sensitive data redaction in logs
