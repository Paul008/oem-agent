#!/usr/bin/env python3
"""Probe Scrapling as an external capture backend for hard OEM pages.

This script is intentionally not wired into the Worker. It is a local/ops probe used to answer:
can Scrapling fetch real rendered Toyota model content where Cloudflare Browser receives a
security-verification page?

Install dependency locally before running:
  python3 -m pip install "scrapling[fetchers]"

Example:
  python3 scripts/probe-scrapling-capture.py \
    --url https://www.toyota.com.au/rav4 \
    --expect-text "RAV4|Long live recreation|All-New RAV4" \
    --html-out /private/tmp/toyota-rav4-scrapling.html \
    --out /private/tmp/toyota-rav4-scrapling.json
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path
from typing import Any


CHALLENGE_SIGNALS = (
    "performing security verification",
    "security service to protect against malicious bots",
    "this page is displayed while the website verifies you are not a bot",
    "checking if the site connection is secure",
    "verify you are human",
    "cf-challenge",
    "cf-turnstile",
    "cloudflare turnstile",
    "challenge-platform",
)


def import_scrapling():
    try:
        from scrapling.fetchers import StealthyFetcher
    except ModuleNotFoundError as exc:
        raise SystemExit(
            'Missing dependency: install with `python3 -m pip install "scrapling[fetchers]"`',
        ) from exc

    return StealthyFetcher


def is_security_verification_page(html: str, title: str = "") -> bool:
    haystack = re.sub(r"\s+", " ", f"{title}\n{html}").lower()
    if any(signal in haystack for signal in CHALLENGE_SIGNALS):
        return True

    has_cloudflare_context = "cloudflare" in haystack or "cf-ray" in haystack
    has_challenge_copy = any(
        signal in haystack
        for signal in ("just a moment", "attention required", "please stand by", "browser check")
    )
    return has_cloudflare_context and has_challenge_copy


def response_html(response: Any) -> str:
    body = getattr(response, "body", b"")
    encoding = getattr(response, "encoding", None) or "utf-8"
    if isinstance(body, bytes):
        return body.decode(encoding, errors="replace")
    return str(body)


def extract_title(html: str) -> str:
    match = re.search(r"<title[^>]*>(.*?)</title>", html, flags=re.IGNORECASE | re.DOTALL)
    if not match:
        return ""
    return re.sub(r"\s+", " ", match.group(1)).strip()


def read_field(item: Any, name: str) -> Any:
    if isinstance(item, dict):
        return item.get(name)
    return getattr(item, name, None)


def capture(args: argparse.Namespace) -> dict[str, Any]:
    StealthyFetcher = import_scrapling()
    fetch_kwargs: dict[str, Any] = {
        "headless": not args.headful,
        "real_chrome": args.real_chrome,
        "solve_cloudflare": args.solve_cloudflare,
        "network_idle": args.network_idle,
        "timeout": args.timeout_ms,
        "wait": args.wait_ms,
        "block_webrtc": True,
        "hide_canvas": True,
        "allow_webgl": True,
        "locale": args.locale,
        "timezone_id": args.timezone,
        "extra_headers": {
            "Accept-Language": "en-AU,en;q=0.9",
            "Referer": "https://www.google.com/",
        },
    }

    if args.wait_selector:
        fetch_kwargs["wait_selector"] = args.wait_selector
        fetch_kwargs["wait_selector_state"] = args.wait_selector_state

    if args.proxy:
        fetch_kwargs["proxy"] = args.proxy

    if args.user_data_dir:
        fetch_kwargs["user_data_dir"] = args.user_data_dir

    if args.capture_xhr:
        fetch_kwargs["capture_xhr"] = args.capture_xhr

    response = StealthyFetcher.fetch(args.url, **fetch_kwargs)
    html = response_html(response)
    title = extract_title(html)
    challenge_detected = is_security_verification_page(html, title)
    expected_text_found = None
    if args.expect_text:
        expected_text_found = bool(re.search(args.expect_text, html, re.IGNORECASE))

    if args.html_out:
        Path(args.html_out).write_text(html, encoding="utf-8")

    captured_xhr = getattr(response, "captured_xhr", None)
    xhr_summary = None
    if captured_xhr is not None:
        try:
            xhr_summary = [
                {
                    "url": read_field(item, "url"),
                    "status": read_field(item, "status"),
                }
                for item in captured_xhr
            ][:50]
        except Exception:
            xhr_summary = str(captured_xhr)[:1000]

    return {
        "url": args.url,
        "final_url": getattr(response, "url", None),
        "status": getattr(response, "status", None),
        "reason": getattr(response, "reason", None),
        "title": title,
        "html_size": len(html),
        "challenge_detected": challenge_detected,
        "expected_text": args.expect_text or None,
        "expected_text_found": expected_text_found,
        "contains_rav4_copy": bool(re.search(r"rav4|long live recreation|all-new rav4", html, re.I)),
        "html_out": args.html_out,
        "captured_xhr": xhr_summary,
    }


def parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Probe Scrapling capture for a protected OEM page.")
    parser.add_argument("--url", required=True)
    parser.add_argument("--out", default="")
    parser.add_argument("--html-out", default="")
    parser.add_argument("--wait-selector", default="")
    parser.add_argument("--wait-selector-state", default="attached")
    parser.add_argument("--expect-text", default="", help="Case-insensitive regex that must appear in captured HTML.")
    parser.add_argument("--timeout-ms", type=int, default=90_000)
    parser.add_argument("--wait-ms", type=int, default=3_000)
    parser.add_argument("--locale", default="en-AU")
    parser.add_argument("--timezone", default="Australia/Melbourne")
    parser.add_argument("--proxy", default="")
    parser.add_argument("--user-data-dir", default="")
    parser.add_argument("--capture-xhr", default="")
    parser.add_argument("--headful", action="store_true")
    parser.add_argument("--real-chrome", action="store_true")
    parser.add_argument("--no-solve-cloudflare", dest="solve_cloudflare", action="store_false")
    parser.add_argument("--no-network-idle", dest="network_idle", action="store_false")
    parser.set_defaults(solve_cloudflare=True, network_idle=True)
    return parser.parse_args(argv)


def main(argv: list[str]) -> int:
    args = parse_args(argv)
    result = capture(args)
    text = json.dumps(result, indent=2, sort_keys=True)
    if args.out:
        Path(args.out).write_text(text + "\n", encoding="utf-8")
    print(text)
    if result["challenge_detected"]:
        return 2
    if result["expected_text"] and result["expected_text_found"] is False:
        return 3
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
