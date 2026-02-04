#!/usr/bin/env python3
"""
Mail Sorter - Intelligent email sorting using LLM
Categorizes emails and archives newsletters/spam automatically
"""

import os
import sys
import json
import subprocess
import urllib.request
import urllib.parse
from datetime import datetime

# Configuration
MAIL_MANAGER_SCRIPT = "/root/.moltbot/skills/mail-manager/scripts/mail_manager.py"
OPENROUTER_API_KEY = os.environ.get("OPENROUTER_API_KEY", "")

# Folders for each category
FOLDERS = {
    "newsletter": "_Newsletters",
    "spam": "_Spam",
    "promo": "_Promotions",
}

# Categories that stay in INBOX
INBOX_CATEGORIES = ["urgent", "important", "normal"]


def run_mail_command(args):
    """Run mail_manager.py with given arguments"""
    cmd = ["python3", MAIL_MANAGER_SCRIPT] + args
    env = os.environ.copy()
    env["AZURE_CLIENT_ID"] = os.environ.get("AZURE_CLIENT_ID", "")
    env["AZURE_TENANT_ID"] = os.environ.get("AZURE_TENANT_ID", "consumers")

    try:
        result = subprocess.run(cmd, capture_output=True, text=True, env=env, timeout=60)
        return json.loads(result.stdout)
    except Exception as e:
        return {"success": False, "error": str(e)}


def classify_emails_llm(emails):
    """Use LLM to classify emails into categories"""
    if not emails:
        return {}

    if not OPENROUTER_API_KEY:
        print("  Warning: No OPENROUTER_API_KEY, using basic classification")
        return classify_emails_basic(emails)

    # Prepare email summaries for LLM
    email_summaries = []
    for i, email in enumerate(emails):
        summary = f"{i+1}. From: {email.get('from', 'Unknown')[:50]} | Subject: {email.get('subject', '(no subject)')[:60]}"
        email_summaries.append(summary)

    prompt = f"""Classify these emails into categories. For each email number, respond with ONLY the category.

Categories:
- urgent: Time-sensitive, requires immediate action (deadlines, emergencies)
- important: Work emails, government, bank, health, school
- normal: Personal emails, regular correspondence
- newsletter: Newsletters, subscriptions, regular updates
- promo: Promotions, sales, marketing, deals
- spam: Unwanted, suspicious, or junk mail

Emails:
{chr(10).join(email_summaries)}

Respond in JSON format like: {{"1": "category", "2": "category", ...}}
Only output the JSON, nothing else."""

    try:
        url = "https://openrouter.ai/api/v1/chat/completions"
        data = {
            "model": "moonshotai/kimi-k2",
            "messages": [{"role": "user", "content": prompt}],
            "max_tokens": 500,
            "temperature": 0.1,
        }

        req = urllib.request.Request(
            url,
            data=json.dumps(data).encode(),
            headers={
                "Content-Type": "application/json",
                "Authorization": f"Bearer {OPENROUTER_API_KEY}",
            }
        )

        with urllib.request.urlopen(req, timeout=30) as response:
            result = json.loads(response.read().decode())
            content = result["choices"][0]["message"]["content"]

            # Parse JSON from response
            # Find JSON in response
            start = content.find("{")
            end = content.rfind("}") + 1
            if start >= 0 and end > start:
                classifications = json.loads(content[start:end])
                # Convert string keys to int and map to email IDs
                return {emails[int(k)-1]["id"]: v.lower() for k, v in classifications.items() if int(k) <= len(emails)}

    except Exception as e:
        print(f"  LLM classification error: {e}")

    return classify_emails_basic(emails)


def classify_emails_basic(emails):
    """Basic rule-based classification fallback"""
    classifications = {}

    newsletter_patterns = ["newsletter", "unsubscribe", "subscription", "weekly", "daily digest", "news@", "updates@"]
    promo_patterns = ["promo", "sale", "deal", "discount", "offer", "% off", "limited time", "marketing@"]
    spam_patterns = ["winner", "lottery", "claim", "urgent action", "verify account", "suspended"]
    important_patterns = ["ac-creteil", "gouv.fr", "impots", "banque", "bank", "caf", "cpam", "ameli", "education"]

    for email in emails:
        sender = email.get("from", "").lower()
        subject = email.get("subject", "").lower()
        text = sender + " " + subject

        if any(p in text for p in spam_patterns):
            classifications[email["id"]] = "spam"
        elif any(p in text for p in newsletter_patterns):
            classifications[email["id"]] = "newsletter"
        elif any(p in text for p in promo_patterns):
            classifications[email["id"]] = "promo"
        elif any(p in text for p in important_patterns):
            classifications[email["id"]] = "important"
        else:
            classifications[email["id"]] = "normal"

    return classifications


def sort_account(account):
    """Sort emails for a single account"""
    print(f"\n  [{account}]")

    # Get unread emails
    result = run_mail_command(["list", "--account", account, "--unread", "--limit", "30"])
    if not result.get("success"):
        print(f"    Error: {result.get('error')}")
        return {"sorted": 0, "errors": 1}

    emails = result.get("emails", [])
    if not emails:
        print("    No unread emails")
        return {"sorted": 0, "errors": 0}

    print(f"    {len(emails)} unread emails")

    # Classify emails
    classifications = classify_emails_llm(emails)

    # Count categories
    category_counts = {}
    for cat in classifications.values():
        category_counts[cat] = category_counts.get(cat, 0) + 1
    print(f"    Categories: {category_counts}")

    # Archive emails that need to be moved
    sorted_count = 0
    error_count = 0

    for email_id, category in classifications.items():
        if category in FOLDERS:
            folder = FOLDERS[category]
            move_result = run_mail_command(["move", "--account", account, "--id", email_id, "--folder", folder])
            if move_result.get("success"):
                sorted_count += 1
            else:
                error_count += 1
                print(f"    Failed to move {email_id}: {move_result.get('error')}")

    if sorted_count > 0:
        print(f"    Archived {sorted_count} emails")

    return {"sorted": sorted_count, "errors": error_count}


def main():
    """Main entry point"""
    now = datetime.now()
    print(f"[{now.strftime('%Y-%m-%d %H:%M')}] Mail Sorter - Intelligent email organization")

    # Verify environment
    if not OPENROUTER_API_KEY:
        print("Warning: OPENROUTER_API_KEY not set, using basic classification")

    total_sorted = 0
    total_errors = 0

    # Sort each account
    for account in ["gmail", "hotmail", "ac-creteil"]:
        try:
            result = sort_account(account)
            total_sorted += result["sorted"]
            total_errors += result["errors"]
        except Exception as e:
            print(f"  [{account}] Error: {e}")
            total_errors += 1

    print(f"\n  Total: {total_sorted} emails archived, {total_errors} errors")


if __name__ == "__main__":
    main()
