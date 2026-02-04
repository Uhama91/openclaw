#!/bin/bash
# Mail Sorter Cron Script
# Loads environment and runs the intelligent mail sorter

# Load environment from .env file
set -a
source /opt/moltbot/.env 2>/dev/null || true
set +a

# Set additional required variables
export AZURE_TENANT_ID="consumers"
export HOME="/root"

# Run the sorter
cd /root/.moltbot/skills/mail-manager/scripts
python3 mail_sorter.py >> /var/log/mail_sorter.log 2>&1
