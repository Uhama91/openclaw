---
name: image-studio
description: Generate or edit images using multiple AI models via Replicate API. Supports Nano Banana Pro, Seedream 4.5, GPT Image 1.5, and Qwen Image Edit Plus. Includes persistent workspace for iterative image editing.
metadata: {"openclaw":{"emoji":"🎨","requires":{"bins":["python3"],"env":["REPLICATE_API_TOKEN"]},"primaryEnv":"REPLICATE_API_TOKEN"}}
---

# Image Studio — Multi-Model Image Generation & Editing

Generate and edit images using the best AI models available via Replicate API.
The user's Replicate API token is available as `REPLICATE_API_TOKEN` in the environment.

## Available Models

You have 4 models at your disposal. **Choose the best model automatically based on the task**, or let the user pick if they specify one.

### 1. Nano Banana Pro (`google/nano-banana-pro`)
- **Best for**: Text in images, infographics, posters, mockups, diagrams, educational content, multi-image compositions (up to 14 images), context-rich visuals using real-world knowledge
- **Strengths**: Best text rendering, best multi-image blending, Google Search knowledge, professional creative control
- **Weaknesses**: Slower for simple generations
- **Cost**: $0.15/image (1K-2K), $0.30/image (4K)
- **Resolutions**: 1K, 2K (default), 4K

### 2. Seedream 4.5 (`bytedance/seedream-4.5`)
- **Best for**: Photorealistic images, spatial understanding, world knowledge, multi-reference generation, story scenes, character variations
- **Strengths**: Best photorealism, strong spatial awareness, can generate sequences of related images, supports up to 14 reference images
- **Weaknesses**: No 1K resolution (minimum 2K)
- **Cost**: ~$0.03/image
- **Resolutions**: 2K (default), 4K, custom (1024-4096px)

### 3. GPT Image 1.5 (`openai/gpt-image-1.5`)
- **Best for**: Precise edits preserving identity/composition, virtual try-ons, style transfer, logo generation, UI mockups, character consistency across scenes
- **Strengths**: Best editing precision (preserves face/lighting/composition), fastest (4x faster), text rendering, world knowledge reasoning
- **Weaknesses**: More expensive
- **Cost**: ~$0.08/image
- **Resolutions**: 1024x1024, 1536x1024, 1024x1536, auto

### 4. Qwen Image Edit Plus (`qwen/qwen-image-edit-plus`)
- **Best for**: Multi-image editing, identity-preserving edits, text modification in images, cross-image composition, ControlNet-based editing, pose transfer
- **Strengths**: Best for combining elements from multiple images (e.g. "girl from image 1 wears dress from image 2 in pose from image 3"), cheapest option, Apache 2.0 license
- **Weaknesses**: Less photorealistic for pure generation from text
- **Cost**: $0.03/image
- **Resolutions**: match_input_image (default), 1:1, 16:9, 9:16, 4:3, 3:4

## Auto-Selection Guide

Use this decision matrix to pick the model:

| Task | Recommended Model |
|------|-------------------|
| Generate image from text (general) | Seedream 4.5 |
| Generate image with text/typography | Nano Banana Pro |
| Generate infographic/diagram/poster | Nano Banana Pro |
| Edit existing image (change outfit, color, object) | GPT Image 1.5 |
| Style transfer / filter | GPT Image 1.5 |
| Combine multiple images into one | Qwen Image Edit Plus |
| Put person from photo A in scene B | Qwen Image Edit Plus |
| Change pose / clothing from reference | Qwen Image Edit Plus |
| Photorealistic scene generation | Seedream 4.5 |
| Logo / UI mockup | GPT Image 1.5 |
| Character consistency across scenes | GPT Image 1.5 |
| Sequential/story image generation | Seedream 4.5 |
| Image with real-world data (weather, sports) | Nano Banana Pro |

## CRITICAL — Response Style Rules (MANDATORY)

**EVERY text message you output is sent as a separate Telegram message to the user. The user HATES receiving many messages. You MUST minimize the number of messages.**

**STRICT RULES:**

1. **MAXIMUM 2 messages per request.** Message 1: short acknowledgment. Message 2: the result image + short caption. NOTHING in between.
2. **DO NOT output ANY text before or between tool calls.** When you need to run multiple tools (mkdir, cp, exec, read, write), call them back-to-back WITHOUT writing text. Every sentence you write becomes a Telegram notification that annoys the user.
3. **FORBIDDEN phrases** (never write these): "Let me check...", "Now let me...", "Let me find...", "Let me initialize...", "Still processing...", "Let me continue...", "Let me wait...", "Perfect! Now let me...". These all become spam messages.
4. **Acknowledgment message format:** One short sentence in the user's language. Examples: "Je modifie ton image." / "Editing your image." Then SILENCE until done.
5. **Result message format:** Send the image using the `message` tool with `filePath` parameter + a one-line caption. Example: `{"action": "send", "channel": "telegram", "message": "Voilà ton image modifiée.", "filePath": "/path/to/image.png"}`
6. **Do NOT mention model names** unless asked.
7. **The Python script handles polling internally.** The `exec` call will block until the image is ready. You do NOT need to poll or check. Just run the command and wait for it to return.
8. **If an error occurs**, explain it briefly in ONE message. Do not retry silently and narrate each attempt.

---

## How to Use — Image Generation

### When the user asks to generate an image (no input photo)

1. **Determine the task type** and **auto-select the best model** (or use the one the user specifies)
2. **Send one short message:** "Generating your image." (nothing more)
3. **Run the generation command** and wait for completion silently

### Generate command

```bash
python3 {baseDir}/scripts/replicate_image.py generate \
  --model "MODEL_ID" \
  --prompt "description" \
  --output "output.png" \
  --resolution "2K"
```

### Model IDs for --model flag:
- `nano-banana-pro` → google/nano-banana-pro
- `seedream` → bytedance/seedream-4.5
- `gpt-image` → openai/gpt-image-1.5
- `qwen-edit` → qwen/qwen-image-edit-plus

### Multi-Image Composition

When the user wants to combine multiple images (e.g. "put the person from this photo into this background"):

```bash
python3 {baseDir}/scripts/replicate_image.py compose \
  --model "MODEL_ID" \
  --prompt 'combine instructions (single-quoted)' \
  --input "/path/to/img1.png" --input "/path/to/img2.png" \
  --output "composed.png"
```

Best models for composition: **Qwen Image Edit Plus** (2-3 images, identity-preserving) or **Nano Banana Pro** (up to 14 images, creative blending).

### Output

- The script saves the output image to the specified path.
- Send the image using the `message` tool with `filePath` parameter. Do NOT use MEDIA: protocol.
- Do NOT try to read/display the image file content

---

## How to Use — Image Editing (Workspace Mode)

When the user sends a photo and asks to edit/modify it, use the **persistent workspace** for iterative editing. This allows multiple rounds of refinement across conversation turns.

### Workspace Location

```
{baseDir}/workspace/
├── original.png      # User's uploaded base image (never modified after initial save)
├── reference.png     # Optional inspiration/style image
├── current.png       # Latest iteration result (updated each round)
└── context.json      # Editing state tracker
```

### context.json Structure

```json
{
  "status": "active",
  "mode": "prompt-only",
  "original": "{baseDir}/workspace/original.png",
  "reference": null,
  "current": null,
  "createdAt": "2026-02-01T14:00:00Z",
  "lastActivityAt": "2026-02-01T14:00:00Z",
  "iterationCount": 0,
  "cronJobIds": {
    "reminder2h": null,
    "reminder6h": null,
    "cleanup24h": null
  }
}
```

### Editing Workflow — Step by Step

**IMPORTANT: Follow the Response Style Rules above. Send ONE short acknowledgment ("Editing your image."), then do everything silently until the result is ready.**

#### 1. Session Initialization (user sends photo + edit request)

Check if `{baseDir}/workspace/context.json` exists with `"status": "active"`:
- **If active session exists** → ask the user: "You have an active edit. Continue or start fresh?"
- **If no active session** → proceed silently

**Finding the user's image:**
When the user sends a photo via Telegram, the media pipeline downloads it to the inbound media directory. To find it:
```bash
ls -t ~/.openclaw/media/inbound/*.jpg ~/.openclaw/media/inbound/*.png 2>/dev/null | head -1
```
This returns the most recent image file path. Use this path as the source for copying.

**Initialize the workspace (all silently — no messages to user):**
1. `mkdir -p {baseDir}/workspace`
2. Find the user's image using the command above, then copy it:
   ```bash
   cp "$(ls -t ~/.openclaw/media/inbound/*.jpg ~/.openclaw/media/inbound/*.png 2>/dev/null | head -1)" "{baseDir}/workspace/original.png"
   ```
3. Write `{baseDir}/workspace/context.json` with `status: "active"`, `mode: "prompt-only"`, `iterationCount: 0`, timestamps, `cronJobIds: null`
4. Schedule inactivity reminders (see Lifecycle Management)
5. Execute the edit

#### 2. Reference Image Handling (optional — user sends a second image)

If the user sends a second image as inspiration/style reference during an active session:
1. Copy it to `{baseDir}/workspace/reference.png`:
   ```bash
   cp "<reference_image_path>" "{baseDir}/workspace/reference.png"
   ```
2. Update `context.json`: set `mode` to `"reference-guided"`, set `reference` to `"{baseDir}/workspace/reference.png"`
3. Update `lastActivityAt` to current timestamp
4. Reschedule inactivity reminders

**Mode switching:** If the session started as `prompt-only` and the user later sends a reference image, switch to `reference-guided` automatically.

#### 3. Execute the Edit

Choose the input image:
- **First iteration** (`iterationCount` is 0): use `{baseDir}/workspace/original.png`
- **Subsequent iterations** (`iterationCount` >= 1): use `{baseDir}/workspace/current.png`

Run the edit command based on mode:

**Important — shell safety:** The user's edit prompt may contain quotes, special characters, or shell metacharacters. Always pass the `--prompt` value using single quotes and escape any embedded single quotes (replace `'` with `'\''`). Never use double quotes for the prompt value.

**Prompt-only mode:**
```bash
python3 {baseDir}/scripts/replicate_image.py edit \
  --model "MODEL_ID" \
  --prompt 'user edit instructions here (single-quoted)' \
  --input "{baseDir}/workspace/original.png" \
  --output "{baseDir}/workspace/current.png"
```
(Use `current.png` as `--input` for iterations after the first)

**Reference-guided mode:**
```bash
python3 {baseDir}/scripts/replicate_image.py edit \
  --model "MODEL_ID" \
  --prompt 'user edit instructions here (single-quoted)' \
  --input "{baseDir}/workspace/original.png" --input "{baseDir}/workspace/reference.png" \
  --output "{baseDir}/workspace/current.png"
```

**Model selection for edits:** Use the Auto-Selection Guide above. For most edits, GPT Image 1.5 is best. For multi-image composition or style transfer from reference, use Qwen Image Edit Plus.

#### 4. After Each Edit — Deliver Result

1. Update `context.json`: increment `iterationCount`, set `current`, update `lastActivityAt`
2. Send the result image using the `message` tool with `filePath` parameter:
   ```json
   {"action": "send", "channel": "telegram", "message": "Voilà ton image modifiée.", "filePath": "{baseDir}/workspace/current.png"}
   ```
   **IMPORTANT:** Do NOT use `MEDIA:` protocol or `buffer` parameter — they don't deliver images on Telegram. You MUST use `filePath` to send images.
3. **Do NOT send multiple messages.** One message with the image + caption is enough.
4. If user wants changes → go back to step 3 with the new prompt. If satisfied → Completion Cleanup.

#### 5. Completion Cleanup (user is satisfied)

1. Send the final `current.png` one last time using the `message` tool with `filePath` (in case the user wants to save it)
2. Remove all cron reminder jobs (see Lifecycle Management)
3. Delete all workspace files. **Safety check:** before deleting, verify that `{baseDir}/workspace/context.json` exists (confirms this is a real workspace directory):
   ```bash
   test -f {baseDir}/workspace/context.json && rm -rf {baseDir}/workspace/
   ```
4. Confirm to the user: "Editing session complete. The final image has been sent."

### Two Editing Modes — Summary

**Prompt-only mode** (most common):
- User sends one image + text instructions
- Agent uses `original.png` (or `current.png` on iterations) + prompt
- Example: "Remove the background", "Make me look older", "Add a sunset"

**Reference-guided mode:**
- User sends base image + reference/inspiration image + text instructions
- Agent uses `original.png` + `reference.png` + prompt
- Example: "Apply the style from this painting to my photo", "Make me wear this outfit"
- The reference image stays the same across iterations; only the prompt changes

### Lifecycle Management — Inactivity Reminders & Auto-Cleanup

Use the **cron tool** to manage session timeouts. Schedule 3 one-shot jobs on session start:

**On session start (or after each iteration):**

Remove any existing cron jobs first, then schedule new ones:

1. **2-hour reminder** (`image-edit-reminder-2h`):
   - Schedule: `kind: "at"`, fire 2 hours from now
   - Action: Send message to user: "You have an unfinished image edit session. Want to continue editing or discard it?"
   - Config: `sessionTarget: "main"`, `payload.kind: "systemEvent"`

2. **6-hour reminder** (`image-edit-reminder-6h`):
   - Schedule: `kind: "at"`, fire 6 hours from now
   - Action: Send message to user: "Your image editing session is still open. Reply to continue, or it will be automatically cleaned up."
   - Config: `sessionTarget: "main"`, `payload.kind: "systemEvent"`

3. **24-hour auto-cleanup** (`image-edit-cleanup-24h`):
   - Schedule: `kind: "at"`, fire 24 hours from now
   - Action: Send final `current.png` (if exists) using `message` tool with `filePath`, then delete all workspace files and remove all cron jobs
   - Config: `sessionTarget: "main"`, `payload.kind: "systemEvent"`

**Timer reset:** After each user interaction (new edit iteration, reference image added), remove all 3 existing cron jobs and reschedule them from the current time. Update `cronJobIds` in `context.json`.

**On completion or discard:** Remove all 3 cron jobs. Clear `cronJobIds` in `context.json`.

### State Management — Reading and Writing context.json

**Before any edit operation:**
1. Read `{baseDir}/workspace/context.json` using the `read` tool
2. If the file doesn't exist → no active session
3. If it exists with `"status": "active"` → session is active, use its state

**After any state change:**
1. Write the updated `context.json` using the `write` tool
2. State changes include: new session, iteration completed, reference added, mode switched, cron jobs scheduled

**File operations:**
- Use `read` and `write` tools for `context.json`
- Use `exec` with `cp` to copy incoming images to workspace
- Use `exec` with `rm -rf` to clean up workspace on completion
- Use `exec` with `mkdir -p` to create workspace directory

### Orphaned Session Recovery

If the gateway restarts, cron jobs may be lost but `context.json` persists. On next invocation:
1. Read `context.json` — if `status` is `"active"`, the session is still open
2. Check if cron jobs exist (use cron tool `list` action)
3. If jobs are missing, reschedule them based on `lastActivityAt`
4. If `lastActivityAt` is more than 24 hours ago, auto-cleanup immediately

---

## User Interaction

1. **Auto-select model silently.** Do NOT tell the user which model you chose unless they ask.
2. If they ask which models are available, list all 4 briefly.
3. If they want to switch models, re-run with the specified model.
4. Use timestamps in filenames for generation: `YYYY-MM-DD-HH-MM-SS-description.png`
5. For editing, use the workspace paths (`original.png`, `current.png`, `reference.png`)
6. **Never narrate tool calls, file operations, or API steps.** The user only cares about the result.

## Notes

- API key is in env var `REPLICATE_API_TOKEN`
- Generated images are saved in the current working directory or workspace
- For editing, the user must provide the image (send it in chat or specify a path)
- Maximum 14 input images for multi-image composition (Nano Banana Pro and Seedream 4.5)
- Qwen Edit Plus works best with 1-3 input images
- The workspace stores up to 3 images (~30MB max per session). Auto-cleanup prevents accumulation.
- Sandbox mode is off — the skill reads/writes directly on the VPS filesystem.
