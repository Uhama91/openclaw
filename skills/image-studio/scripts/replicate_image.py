#!/usr/bin/env python3
"""
Image Studio — Multi-model image generation & editing via Replicate API.

Usage:
    python3 replicate_image.py generate --model MODEL --prompt "..." --output file.png [--resolution 2K] [--aspect-ratio 1:1]
    python3 replicate_image.py edit --model MODEL --prompt "..." --input img.png --output out.png
    python3 replicate_image.py compose --model MODEL --prompt "..." --input img1.png --input img2.png --output out.png

Models: nano-banana-pro, seedream, gpt-image, qwen-edit
"""

import argparse
import base64
import json
import os
import re
import sys
import time
import urllib.request
import urllib.error
from pathlib import Path
from datetime import datetime

REPLICATE_API_TOKEN = os.environ.get("REPLICATE_API_TOKEN", "")
REPLICATE_API_BASE = "https://api.replicate.com/v1"

# Allowed base directories for input/output paths (security: prevent path traversal)
ALLOWED_PATH_PREFIXES = [
    "/root/.moltbot/",
    "/root/.openclaw/",
    "/root/clawd/",
    "/tmp/",
    "/private/tmp/",
    os.path.expanduser("~/.clawdbot/"),
    os.path.expanduser("~/.moltbot/"),
    os.path.expanduser("~/.openclaw/"),
    # Allow the openclaw workspace and media directories
    os.path.expanduser("~/dev_project/openclaw/"),
]

# Max file size for data URL upload (5MB). Files larger use Replicate file upload.
DATA_URL_MAX_BYTES = 5 * 1024 * 1024

MODEL_MAP = {
    "nano-banana-pro": "google/nano-banana-pro",
    "seedream": "bytedance/seedream-4.5",
    "gpt-image": "openai/gpt-image-1.5",
    "qwen-edit": "qwen/qwen-image-edit-plus",
}


def validate_path(file_path, label="file"):
    """Validate that a file path is within allowed directories and has no traversal."""
    resolved = str(Path(file_path).resolve())
    # Block path traversal
    if ".." in file_path:
        print(f"Error: Path traversal detected in {label}: {file_path}", file=sys.stderr)
        sys.exit(1)
    # Check allowed prefixes
    if not any(resolved.startswith(prefix) for prefix in ALLOWED_PATH_PREFIXES):
        print(f"Error: {label} path not in allowed directories: {resolved}", file=sys.stderr)
        print(f"  Allowed: {', '.join(ALLOWED_PATH_PREFIXES)}", file=sys.stderr)
        sys.exit(1)
    return resolved


def api_request(method, path, data=None):
    url = f"{REPLICATE_API_BASE}{path}"
    headers = {
        "Authorization": f"Bearer {REPLICATE_API_TOKEN}",
        "Content-Type": "application/json",
        "Prefer": "wait",
    }
    body = json.dumps(data).encode() if data else None
    req = urllib.request.Request(url, data=body, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=300) as resp:
            return json.loads(resp.read().decode())
    except urllib.error.HTTPError as e:
        error_body = e.read().decode() if e.fp else ""
        print(f"API Error {e.code}: {error_body}", file=sys.stderr)
        sys.exit(1)


def upload_image_to_data_url(image_path):
    """Read local image and return a data URL. Only for small files."""
    path = Path(image_path)
    if not path.exists():
        print(f"Error: File not found: {image_path}", file=sys.stderr)
        sys.exit(1)
    ext = path.suffix.lower()
    mime_map = {".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
                ".webp": "image/webp", ".gif": "image/gif", ".bmp": "image/bmp"}
    mime = mime_map.get(ext, "image/png")
    with open(path, "rb") as f:
        b64 = base64.b64encode(f.read()).decode()
    return f"data:{mime};base64,{b64}"


def upload_to_replicate_files(image_path):
    """Upload file to Replicate's /files endpoint and return a serving URL."""
    path = Path(image_path)
    if not path.exists():
        print(f"Error: File not found: {image_path}", file=sys.stderr)
        sys.exit(1)

    ext = path.suffix.lower()
    mime_map = {".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
                ".webp": "image/webp", ".gif": "image/gif", ".bmp": "image/bmp"}
    content_type = mime_map.get(ext, "application/octet-stream")

    with open(path, "rb") as f:
        file_data = f.read()

    url = f"{REPLICATE_API_BASE}/files"
    headers = {
        "Authorization": f"Bearer {REPLICATE_API_TOKEN}",
        "Content-Type": content_type,
        "X-Filename": path.name,
    }
    req = urllib.request.Request(url, data=file_data, headers=headers, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=120) as resp:
            result = json.loads(resp.read().decode())
            serving_url = result.get("urls", {}).get("get")
            if not serving_url:
                print(f"Error: No serving URL in file upload response: {json.dumps(result)}", file=sys.stderr)
                sys.exit(1)
            return serving_url
    except urllib.error.HTTPError as e:
        error_body = e.read().decode() if e.fp else ""
        print(f"File upload error {e.code}: {error_body}", file=sys.stderr)
        # Fallback to data URL if file upload fails
        print("Falling back to data URL upload...", file=sys.stderr)
        return upload_image_to_data_url(image_path)


def upload_to_replicate(image_path):
    """Upload file to Replicate. Uses /files endpoint for large files, data URL for small ones."""
    path = Path(image_path)
    if not path.exists():
        print(f"Error: File not found: {image_path}", file=sys.stderr)
        sys.exit(1)

    file_size = path.stat().st_size
    if file_size > DATA_URL_MAX_BYTES:
        print(f"  Large file ({file_size / 1024 / 1024:.1f}MB), using file upload endpoint...", file=sys.stderr)
        return upload_to_replicate_files(image_path)
    else:
        return upload_image_to_data_url(image_path)


MAX_POLL_ATTEMPTS = 150  # 150 * 2s = 5 minutes max


def wait_for_prediction(prediction):
    """Poll until prediction completes, with timeout."""
    pred_id = prediction.get("id")
    status = prediction.get("status")
    attempts = 0
    while status in ("starting", "processing", "queued"):
        if attempts >= MAX_POLL_ATTEMPTS:
            print(f"Error: Prediction timed out after {MAX_POLL_ATTEMPTS * 2}s (status: {status})", file=sys.stderr)
            sys.exit(1)
        time.sleep(2)
        attempts += 1
        prediction = api_request("GET", f"/predictions/{pred_id}")
        status = prediction.get("status")
        print(f"  Status: {status} (attempt {attempts}/{MAX_POLL_ATTEMPTS})...", file=sys.stderr)
    if status == "failed":
        error = prediction.get("error", "Unknown error")
        print(f"Prediction failed: {error}", file=sys.stderr)
        sys.exit(1)
    if status == "canceled":
        print("Prediction was canceled.", file=sys.stderr)
        sys.exit(1)
    if status != "succeeded":
        print(f"Error: Unexpected prediction status: {status}", file=sys.stderr)
        sys.exit(1)
    return prediction


# Image magic bytes for output validation
IMAGE_MAGIC = {
    b'\x89PNG': 'png',
    b'\xff\xd8\xff': 'jpeg',
    b'RIFF': 'webp',  # RIFF....WEBP
    b'GIF8': 'gif',
}


def download_output(output_urls, output_path):
    """Download first output image with error handling and validation."""
    if not output_urls:
        print("Error: No output images returned", file=sys.stderr)
        sys.exit(1)
    url = output_urls[0] if isinstance(output_urls, list) else output_urls
    if isinstance(url, dict):
        url = url.get("url", url.get("uri", ""))

    req = urllib.request.Request(str(url))
    try:
        with urllib.request.urlopen(req, timeout=120) as resp:
            data = resp.read()
    except urllib.error.HTTPError as e:
        print(f"Error downloading output image: HTTP {e.code}", file=sys.stderr)
        sys.exit(1)
    except urllib.error.URLError as e:
        print(f"Error downloading output image: {e.reason}", file=sys.stderr)
        sys.exit(1)

    # Validate that the downloaded data looks like an image
    if len(data) < 100:
        print(f"Error: Downloaded file too small ({len(data)} bytes), likely not a valid image", file=sys.stderr)
        sys.exit(1)

    is_image = any(data[:len(magic)].startswith(magic) for magic in IMAGE_MAGIC)
    if not is_image:
        print(f"Warning: Downloaded file may not be a valid image (unrecognized header)", file=sys.stderr)

    out = Path(output_path)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_bytes(data)
    return str(out.resolve())


def build_input_nano_banana_pro(args, input_images):
    inp = {"prompt": args.prompt}
    if args.resolution:
        inp["resolution"] = args.resolution
    if args.aspect_ratio and args.aspect_ratio != "auto":
        inp["aspect_ratio"] = args.aspect_ratio
    if input_images:
        inp["image_input"] = input_images
    inp["output_format"] = "png"
    inp["safety_filter_level"] = "block_only_high"
    return inp


def build_input_seedream(args, input_images):
    inp = {"prompt": args.prompt}
    res = args.resolution or "2K"
    if res == "1K":
        res = "2K"  # Seedream doesn't support 1K
    inp["size"] = res
    if args.aspect_ratio and args.aspect_ratio != "auto":
        inp["aspect_ratio"] = args.aspect_ratio
    else:
        inp["aspect_ratio"] = "match_input_image" if input_images else "1:1"
    if input_images:
        inp["image_input"] = input_images
    return inp


def build_input_gpt_image(args, input_images):
    inp = {"prompt": args.prompt}
    size_map = {"1K": "1024x1024", "2K": "1536x1024"}
    if args.resolution == "4K":
        print("Warning: GPT Image 1.5 max resolution is 1536x1024. Using 1536x1024.", file=sys.stderr)
    inp["size"] = size_map.get(args.resolution, "1024x1024")
    inp["quality"] = "high"
    inp["output_format"] = "png"
    if input_images:
        inp["image"] = input_images[0]  # GPT Image takes single image
    return inp


def build_input_qwen_edit(args, input_images):
    inp = {"prompt": args.prompt}
    if args.aspect_ratio and args.aspect_ratio != "auto":
        inp["aspect_ratio"] = args.aspect_ratio
    else:
        inp["aspect_ratio"] = "match_input_image" if input_images else "1:1"
    inp["output_format"] = "png"
    inp["output_quality"] = 95
    if input_images:
        inp["image"] = input_images  # Qwen takes array of images
    return inp


INPUT_BUILDERS = {
    "google/nano-banana-pro": build_input_nano_banana_pro,
    "bytedance/seedream-4.5": build_input_seedream,
    "openai/gpt-image-1.5": build_input_gpt_image,
    "qwen/qwen-image-edit-plus": build_input_qwen_edit,
}


def sanitize_filename(text, max_len=30):
    """Sanitize a string for use in filenames."""
    # Keep only alphanumeric, hyphens, underscores
    safe = re.sub(r'[^a-zA-Z0-9_-]', '-', text[:max_len])
    # Collapse multiple hyphens
    safe = re.sub(r'-+', '-', safe).strip('-')
    return safe or "output"


def run(args):
    if not REPLICATE_API_TOKEN:
        print("Error: REPLICATE_API_TOKEN environment variable not set", file=sys.stderr)
        sys.exit(1)

    # Resolve model
    model_key = args.model.lower().strip()
    model_id = MODEL_MAP.get(model_key, model_key)
    if "/" not in model_id:
        print(f"Error: Unknown model '{model_key}'. Use: {', '.join(MODEL_MAP.keys())}", file=sys.stderr)
        sys.exit(1)

    print(f"Model: {model_id}", file=sys.stderr)
    print(f"Mode: {args.command}", file=sys.stderr)
    print(f"Prompt: {args.prompt}", file=sys.stderr)

    # Validate and upload input images
    input_images = []
    if args.input:
        for img_path in args.input:
            validated = validate_path(img_path, "input image")
            print(f"Uploading: {validated}...", file=sys.stderr)
            url = upload_to_replicate(validated)
            input_images.append(url)
            print(f"  Ready.", file=sys.stderr)

    # Build model-specific input
    builder = INPUT_BUILDERS.get(model_id)
    if not builder:
        # Fallback: generic input
        inp = {"prompt": args.prompt}
        if input_images:
            inp["image"] = input_images[0] if len(input_images) == 1 else input_images
    else:
        inp = builder(args, input_images)

    print(f"Running prediction...", file=sys.stderr)

    # Create prediction
    prediction = api_request("POST", "/models/" + model_id + "/predictions", {
        "input": inp,
    })

    # Wait if needed
    if prediction.get("status") not in ("succeeded",):
        prediction = wait_for_prediction(prediction)

    # Download output
    output = prediction.get("output")
    if not output:
        print("Error: No output in prediction response", file=sys.stderr)
        print(json.dumps(prediction, indent=2), file=sys.stderr)
        sys.exit(1)

    # Determine output filename
    out_path = args.output
    if not out_path:
        ts = datetime.now().strftime("%Y-%m-%d-%H-%M-%S")
        safe_prompt = sanitize_filename(args.prompt)
        out_path = f"{ts}-{safe_prompt}.png"

    # Validate output path
    validate_path(out_path, "output")

    saved_path = download_output(output, out_path)
    abs_path = str(Path(saved_path).resolve())

    print(f"\nImage saved: {abs_path}", file=sys.stderr)
    print(f"MEDIA:{abs_path}")


def main():
    parser = argparse.ArgumentParser(description="Image Studio — Multi-model image gen/edit via Replicate")
    parser.add_argument("command", choices=["generate", "edit", "compose"],
                        help="Action: generate (text-to-image), edit (modify image), compose (multi-image)")
    parser.add_argument("--model", "-m", required=True,
                        help="Model: nano-banana-pro, seedream, gpt-image, qwen-edit")
    parser.add_argument("--prompt", "-p", required=True, help="Text prompt or edit instructions")
    parser.add_argument("--input", "-i", action="append", help="Input image path (repeatable for multi-image)")
    parser.add_argument("--output", "-o", help="Output filename (default: timestamped)")
    parser.add_argument("--resolution", "-r", default="2K", help="Resolution: 1K, 2K, 4K (default: 2K)")
    parser.add_argument("--aspect-ratio", "-a", default="auto", help="Aspect ratio: 1:1, 16:9, 9:16, 4:3, 3:2, etc.")
    args = parser.parse_args()

    # Validate: edit/compose require input images
    if args.command in ("edit", "compose") and not args.input:
        print(f"Error: '{args.command}' requires at least one --input image", file=sys.stderr)
        sys.exit(1)

    run(args)


if __name__ == "__main__":
    main()
