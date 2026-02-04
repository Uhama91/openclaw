# Moltbot Deploy Template

A production-ready OpenClaw/Moltbot deployment template with custom skills and security hardening.

## Features

### Multi-Provider LLM Support
- **Primary Model**: Kimi K2.5 via OpenRouter (262k context, cost-effective)
- **Fallbacks**: DeepSeek V3.2, Claude Haiku 4.5
- **Image Analysis**: Claude Sonnet 4.5
- **Audio Transcription**: OpenAI Whisper (gpt-4o-mini-transcribe)

### Web Tools
- **Web Search**: Brave Search API integration
- **Web Fetch**: URL content retrieval (50k chars max)

### Custom Skills

#### Mail Manager
Multi-account email management system supporting:
- **Gmail**: App Password authentication
- **Hotmail**: Microsoft OAuth 2.0 with automatic token refresh
- **AC Creteil**: Standard IMAP/SMTP with SSL

Features:
- Read, send, move, delete emails
- List folders
- Clean text previews (HTML stripped, escape sequences removed)
- Background notification service
- Automatic email sorting rules

#### Image Studio
AI image generation and editing via Replicate API:
- **Nano Banana Pro**: Best for text in images, infographics
- **Seedream 4.5**: Photorealistic generation
- **GPT Image 1.5**: Precise editing, style transfer
- **Qwen Image Edit Plus**: Multi-image composition

Features:
- Auto-select best model per task
- Persistent workspace for iterative editing
- Session management with auto-cleanup

## Security Features

### Credential Protection
- All sensitive data in environment variables only
- No hardcoded credentials in any files
- Token files with 600 permissions (owner read/write only)
- OAuth 2.0 for Microsoft accounts with secure token storage

### Logging Security
- Sensitive data redaction enabled (`redactSensitive: "tools"`)
- Pattern-based redaction for tokens, passwords, secrets, API keys
- Diagnostic flags limited to specific modules

### Network Security
- Gateway token authentication required
- Telegram group policy: allowlist mode
- Require mention in groups to prevent spam

### Sandbox Configuration
- Sandbox mode available (currently off for direct execution)
- Custom sandbox image ready: `openclaw-sandbox-python:bookworm-slim`
- Tool allowlist/denylist configured
- Browser sandbox profile available

## Directory Structure

```
moltbot-deploy-template/
├── .env.example          # Environment variables template
├── docker-compose.yml    # Docker services configuration
├── moltbot.json          # Main bot configuration
├── credentials/          # Credential files (gitignored)
│   └── README.md
├── settings/             # Additional settings
└── skills/
    ├── image-studio/
    │   ├── SKILL.md      # Skill documentation
    │   └── scripts/
    │       └── replicate_image.py
    └── mail-manager/
        ├── SKILL.md      # Skill documentation
        └── scripts/
            ├── mail_manager.py
            ├── mail_notifier.py
            ├── mail_sorter.py
            ├── run_mail_notifier.sh
            └── run_mail_sorter.sh
```

## Setup Instructions

### 1. Prerequisites
- Docker and Docker Compose
- VPS with Ubuntu 22.04+ recommended
- API keys for desired services

### 2. Configuration

```bash
# Clone this template
cp -r moltbot-deploy-template /opt/moltbot

# Create .env file
cp /opt/moltbot/.env.example /opt/moltbot/.env

# Edit .env with your credentials
nano /opt/moltbot/.env
```

### 3. Environment Variables

Required variables in `.env`:

```bash
# OpenClaw Gateway
OPENCLAW_GATEWAY_TOKEN=your-secure-gateway-token
OPENCLAW_GATEWAY_BIND=0.0.0.0
OPENCLAW_GATEWAY_PORT=18789

# Telegram Bot
TELEGRAM_BOT_TOKEN=your-telegram-bot-token

# LLM Provider (OpenRouter)
OPENROUTER_API_KEY=your-openrouter-key

# Web Search (optional)
BRAVE_SEARCH_API_KEY=your-brave-key

# Audio Transcription (optional)
OPENAI_API_KEY=your-openai-key

# Image Generation (optional)
REPLICATE_API_TOKEN=your-replicate-token

# Gmail (optional)
GMAIL_ADDRESS=your@gmail.com
GMAIL_APP_PASSWORD=your-app-password

# Hotmail OAuth (optional)
HOTMAIL_ADDRESS=your@hotmail.com
AZURE_CLIENT_ID=your-azure-client-id
AZURE_CLIENT_SECRET=your-azure-client-secret
AZURE_TENANT_ID=consumers

# AC Creteil (optional)
AC_CRETEIL_EMAIL=your@ac-creteil.fr
AC_CRETEIL_PASSWORD=your-password
AC_CRETEIL_IMAP_LOGIN=your-login
```

### 4. Create Config Directory

```bash
mkdir -p /root/.moltbot/credentials
mkdir -p /root/.moltbot/settings
mkdir -p /root/.moltbot/skills

# Copy skills
cp -r /opt/moltbot/skills/* /root/.moltbot/skills/

# Set permissions
chmod 700 /root/.moltbot/credentials
```

### 5. Deploy

```bash
cd /opt/moltbot
docker compose up -d
```

### 6. Verify

```bash
# Check logs
docker logs -f moltbot-openclaw-gateway-1

# Check status
docker ps
```

## Hotmail OAuth Setup

For Hotmail/Outlook.com accounts:

1. Register an app in [Azure Portal](https://portal.azure.com/#blade/Microsoft_AAD_RegisteredApps/ApplicationsListBlade)
2. Set redirect URI to `https://login.microsoftonline.com/common/oauth2/nativeclient`
3. Add API permissions: `IMAP.AccessAsUser.All`, `SMTP.Send`, `offline_access`
4. Create client secret
5. Add credentials to `.env`
6. Run initial OAuth flow via the bot

## Customization

### Modify Models

Edit `moltbot.json` to change:
- Primary model: `agents.defaults.model.primary`
- Fallback models: `agents.defaults.model.fallbacks`
- Image model: `agents.defaults.imageModel.primary`

### Enable Sandbox Mode

In `moltbot.json`, change:
```json
"sandbox": {
  "mode": "non-main"  // or "all"
}
```

### Add New Skills

1. Create directory: `/root/.moltbot/skills/your-skill/`
2. Add `SKILL.md` with documentation
3. Add scripts in `scripts/` subdirectory
4. Restart the gateway

## Troubleshooting

### Gateway won't start
```bash
docker compose logs openclaw-gateway
```

### Telegram not connecting
- Verify `TELEGRAM_BOT_TOKEN` is correct
- Check firewall allows outbound HTTPS

### Email issues
- Gmail: Ensure App Password is enabled (not regular password)
- Hotmail: Run OAuth flow again if tokens expired
- Check IMAP/SMTP ports are not blocked

### Permission denied errors
```bash
# Fix credential file permissions
chmod 600 /root/.moltbot/credentials/*
chown 1000:1000 /root/.moltbot/credentials/*  # for container access
```

## Version

Based on OpenClaw v2026.2.1 with custom security enhancements and skills.

## License

This template is provided as-is for personal use.
