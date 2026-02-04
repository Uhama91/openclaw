#!/bin/bash
# Mail Notifier Cron Script
# Loads environment and runs the mail notifier

# Load environment from .env file
set -a
source /opt/moltbot/.env 2>/dev/null || true
set +a

# Set additional required variables
export TELEGRAM_CHAT_ID="1062627859"
export AZURE_TENANT_ID="consumers"
export HOME="/root"

# Run the notifier
cd /root/.moltbot/skills/mail-manager/scripts
python3 mail_notifier.py >> /var/log/mail_notifier.log 2>&1
