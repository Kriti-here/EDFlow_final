#!/usr/bin/env python3
"""
scripts/spike_paypal.py
Throwaway spike script to inspect PayPal Sandbox JSON responses.

Requirements:
    Python 3.12+
    httpx
    python-dotenv

Environment Variables (from .env):
    PAYPAL_CLIENT_ID (or CLIENT_ID)
    PAYPAL_CLIENT_SECRET (or SECRET_KEY)
    BUYER_EMAIL (primary recipient email for invoicing)
"""

import argparse
from datetime import datetime, timedelta, timezone
import glob
import json
import os
from pathlib import Path
import sys
from typing import Any, Dict, Optional
import uuid

import httpx
try:
    from dotenv import load_dotenv
except ImportError:
    # Graceful fallback if python-dotenv is not installed
    def load_dotenv(dotenv_path=None, **kwargs):
        if not dotenv_path:
            dotenv_path = Path.cwd() / ".env"
        p = Path(dotenv_path)
        if not p.is_file():
            return False
        with open(p, "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith("#") and "=" in line:
                    k, v = line.split("=", 1)
                    k = k.strip()
                    v = v.strip().strip("'\"")
                    if k not in os.environ:
                        os.environ[k] = v
        return True

# ---------------------------------------------------------------------------
# Configuration & Paths
# ---------------------------------------------------------------------------
BASE_URL = "https://api-m.sandbox.paypal.com"
INVOICING_SCOPE = "https://uri.paypal.com/services/invoicing"
DEFAULT_ALL_SCOPES = (
    "https://uri.paypal.com/services/invoicing "
    "https://api.paypal.com/v1/payments/.* "
    "https://uri.paypal.com/services/reporting/search/read"
)

# Global inspect flag
INSPECT_MODE = False

# Resolve directories
SCRIPT_DIR = Path(__file__).resolve().parent
REPO_ROOT = SCRIPT_DIR.parent
SPIKE_OUT_DIR = SCRIPT_DIR / "spike_out"
SPIKE_OUT_DIR.mkdir(parents=True, exist_ok=True)

# Locate and load .env from common possible locations
ENV_CANDIDATES = [
    Path.cwd() / ".env",
    Path.cwd() / "backend" / ".env",
    Path.cwd() / "EDFlow_" / ".env",
    Path.cwd() / "EDFlow_" / "backend" / ".env",
    REPO_ROOT / ".env",
    REPO_ROOT / "backend" / ".env",
    REPO_ROOT / "EDFlow_" / ".env",
    REPO_ROOT / "EDFlow_" / "backend" / ".env",
]

for env_path in ENV_CANDIDATES:
    if env_path.is_file():
        load_dotenv(env_path)

load_dotenv()  # Fallback to default search


def get_credentials() -> tuple[str, str]:
    """Retrieve PayPal client credentials from environment without exposing secrets."""
    client_id = os.getenv("PAYPAL_CLIENT_ID") or os.getenv("CLIENT_ID")
    client_secret = os.getenv("PAYPAL_CLIENT_SECRET") or os.getenv("SECRET_KEY")

    if not client_id or not client_secret:
        print(
            "ERROR: Missing PAYPAL_CLIENT_ID (or CLIENT_ID) and/or "
            "PAYPAL_CLIENT_SECRET (or SECRET_KEY) in .env file.",
            file=sys.stderr,
        )
        sys.exit(1)

    return client_id.strip(), client_secret.strip()


def get_buyer_email(cli_override: Optional[str] = None) -> str:
    """Retrieve BUYER_EMAIL from CLI arg or .env."""
    email = cli_override or os.getenv("BUYER_EMAIL") or os.getenv("PAYPAL_BUYER_EMAIL")
    if not email:
        print(
            "ERROR: Missing BUYER_EMAIL in .env or via --buyer-email option.",
            file=sys.stderr,
        )
        sys.exit(1)
    return email.strip()


# ---------------------------------------------------------------------------
# Utility Helpers & Sanitization
# ---------------------------------------------------------------------------
def redact_sensitive(obj: Any) -> Any:
    """Recursively redacts secrets and access tokens from logs and inspect displays."""
    if isinstance(obj, dict):
        clean = {}
        for k, v in obj.items():
            k_lower = str(k).lower()
            if any(term in k_lower for term in ["access_token", "client_secret", "secret", "refresh_token"]):
                clean[k] = "[REDACTED]"
            elif k_lower == "authorization":
                clean[k] = "[REDACTED]"
            else:
                clean[k] = redact_sensitive(v)
        return clean
    elif isinstance(obj, list):
        return [redact_sensitive(elem) for elem in obj]
    return obj


def print_inspect(label: str, data: Any) -> None:
    """Pretty-print JSON data in inspect mode with all secrets redacted."""
    print(f"\n==================== [INSPECT: {label}] ====================")
    clean = redact_sensitive(data)
    print(json.dumps(clean, indent=2, default=str))
    print("=" * 60 + "\n")


def save_response(filename: str, data: Any) -> Path:
    """Save response data to scripts/spike_out/ as indented JSON and optionally inspect."""
    out_path = SPIKE_OUT_DIR / filename
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, default=str)
    print(f"-> Full response saved to: {out_path}")

    if INSPECT_MODE:
        print_inspect(filename, data)

    return out_path


def handle_http_error(resp: httpx.Response, action_name: str) -> None:
    """
    Handle HTTP errors safely by printing status code and response body.
    Never prints credentials or sensitive headers.
    """
    print(f"\n[HTTP ERROR] {action_name} failed with status {resp.status_code}")
    try:
        err_json = resp.json()
        print(json.dumps(err_json, indent=2))
        if resp.status_code == 403:
            print("\nTIP: If this is an Invoicing 403 NOT_AUTHORIZED error:")
            print("1. Ensure 'Invoicing' is checked under App Settings in your PayPal Developer Dashboard.")
            print("2. Invoicing requires the 'https://uri.paypal.com/services/invoicing' OAuth scope.")
    except Exception:
        print(resp.text)


# ---------------------------------------------------------------------------
# Core API Functions
# ---------------------------------------------------------------------------
def fetch_token(
    client: httpx.Client, scope: Optional[str] = None
) -> tuple[Optional[str], Optional[int], Optional[str]]:
    """
    Fetch OAuth access token via POST /v1/oauth2/token.
    Returns (access_token, expires_in, scope).
    Never prints or leaks the token or secret.
    """
    client_id, client_secret = get_credentials()
    url = f"{BASE_URL}/v1/oauth2/token"

    data = {"grant_type": "client_credentials"}
    if scope:
        data["scope"] = scope

    try:
        resp = client.post(
            url,
            data=data,
            auth=(client_id, client_secret),
            headers={"Accept": "application/json", "Accept-Language": "en_US"},
        )
    except Exception as exc:
        print(f"[NETWORK ERROR] Failed to connect to token endpoint: {exc}", file=sys.stderr)
        return None, None, None

    if resp.status_code != 200:
        handle_http_error(resp, "OAuth Token Request")
        return None, None, None

    token_data = resp.json()
    token = token_data.get("access_token")
    expires_in = token_data.get("expires_in")
    granted_scope = token_data.get("scope", "")

    if INSPECT_MODE:
        inspect_data = dict(token_data)
        inspect_data["access_token"] = "[REDACTED - TOKEN SECURED]"
        print_inspect("oauth2/token", inspect_data)

    return token, expires_in, granted_scope


def cmd_token() -> None:
    """Command: token -> print expiry only. Never prints secret or access token."""
    with httpx.Client(timeout=30.0) as client:
        _, expires_in, granted_scopes = fetch_token(client, scope=DEFAULT_ALL_SCOPES)
        if expires_in is not None:
            expiry_time = datetime.now(timezone.utc) + timedelta(seconds=expires_in)
            print(f"Token Expiry: {expires_in} seconds (~{round(expires_in / 3600, 2)} hours)")
            print(f"Expires At:   {expiry_time.strftime('%Y-%m-%d %H:%M:%S UTC')}")


def cmd_invoice(cli_buyer_email: Optional[str] = None) -> None:
    """
    Command: invoice ->
    1. POST /v2/invoicing/generate-next-invoice-number
    2. POST /v2/invoicing/invoices (create draft invoice)
    3. POST /v2/invoicing/invoices/{id}/send
    Print invoice ID and recipient view URL. Save full responses to scripts/spike_out/.
    """
    buyer_email = get_buyer_email(cli_buyer_email)

    with httpx.Client(timeout=30.0) as client:
        token, _, _ = fetch_token(client, scope=INVOICING_SCOPE)
        if not token:
            return

        headers = {
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
            "Prefer": "return=representation",
        }

        # Step 1: Generate next invoice number
        print("Generating next invoice number...")
        num_url = f"{BASE_URL}/v2/invoicing/generate-next-invoice-number"
        num_resp = client.post(num_url, headers=headers, json={})
        if num_resp.status_code not in (200, 201):
            handle_http_error(num_resp, "Generate Next Invoice Number")
            save_response("invoice_generate_num_error.json", num_resp.text)
            return

        num_data = num_resp.json()
        save_response("invoice_generate_num.json", num_data)
        invoice_number = num_data.get("invoice_number", f"INV-{uuid.uuid4().hex[:8]}")
        print(f"Generated invoice number: {invoice_number}")

        # Step 2: Create draft invoice
        today_str = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        draft_payload = {
            "detail": {
                "invoice_number": invoice_number,
                "reference": "CONTRACT-001",
                "invoice_date": today_str,
                "currency_code": "USD",
                "note": "PurposeCode: TEST; GSTIN: TESTGSTIN; LUT: TESTLUT",
                "memo": "Spike draft invoice test memo",
                "terms_and_conditions": "Payment due within 30 days of issuance.",
            },
            "primary_recipients": [
                {
                    "billing_info": {
                        "email_address": buyer_email
                    }
                }
            ],
            "items": [
                {
                    "name": "Consulting Services",
                    "description": "Standard spike consulting unit",
                    "quantity": "1",
                    "unit_amount": {
                        "currency_code": "USD",
                        "value": "100.00"
                    },
                    "unit_of_measure": "QUANTITY"
                }
            ],
            "amount": {
                "currency_code": "USD",
                "value": "100.00",
                "breakdown": {
                    "item_total": {
                        "currency_code": "USD",
                        "value": "100.00"
                    }
                }
            }
        }

        print("Creating draft invoice...")
        create_url = f"{BASE_URL}/v2/invoicing/invoices"
        create_resp = client.post(create_url, headers=headers, json=draft_payload)
        if create_resp.status_code not in (200, 201):
            handle_http_error(create_resp, "Create Draft Invoice")
            save_response("invoice_create_error.json", create_resp.text)
            return

        create_data = create_resp.json()
        invoice_id = create_data.get("id")

        if not invoice_id:
            loc = create_resp.headers.get("location", "")
            if loc:
                invoice_id = loc.rstrip("/").split("/")[-1]

        save_response(f"invoice_create_{invoice_id or 'draft'}.json", create_data)
        print(f"Created invoice ID: {invoice_id}")

        # Step 3: Send the invoice
        print(f"Sending invoice {invoice_id}...")
        send_url = f"{BASE_URL}/v2/invoicing/invoices/{invoice_id}/send"
        send_resp = client.post(
            send_url,
            headers=headers,
            json={"send_to_recipient": True, "send_to_invoicer": True},
        )
        if send_resp.status_code not in (200, 201, 202):
            handle_http_error(send_resp, "Send Invoice")
            save_response(f"invoice_send_error_{invoice_id}.json", send_resp.text)
            return

        try:
            send_data = send_resp.json()
        except Exception:
            send_data = {"status": "SENT", "status_code": send_resp.status_code}

        save_response(f"invoice_send_{invoice_id}.json", send_data)

        # Retrieve recipient view URL
        recipient_view_url = None
        if isinstance(send_data, dict):
            if send_data.get("rel") in ("payer-view", "recipient-view") and send_data.get("href"):
                recipient_view_url = send_data.get("href")
            for link in send_data.get("links", []):
                if link.get("rel") in ("payer-view", "recipient-view"):
                    recipient_view_url = link.get("href")
                    break

        if not recipient_view_url and isinstance(create_data, dict):
            for link in create_data.get("links", []):
                if link.get("rel") in ("payer-view", "recipient-view"):
                    recipient_view_url = link.get("href")
                    break

        if not recipient_view_url:
            get_resp = client.get(f"{BASE_URL}/v2/invoicing/invoices/{invoice_id}", headers=headers)
            if get_resp.status_code == 200:
                inv_details = get_resp.json()
                save_response(f"invoice_get_{invoice_id}.json", inv_details)
                for link in inv_details.get("links", []):
                    if link.get("rel") in ("payer-view", "recipient-view"):
                        recipient_view_url = link.get("href")
                        break

        print("\n--- INVOICE RESULT ---")
        print(f"Invoice ID:         {invoice_id}")
        print(f"Recipient View URL: {recipient_view_url or 'N/A (check saved JSON links)'}")


def cmd_order() -> None:
    """
    Command: order -> POST /v2/checkout/orders
    intent: CAPTURE, one unit USD 50.00, reference_id & custom_id "INV-TEST".
    Uses PayPal-Request-Id header.
    Prints approve link and saves full response to scripts/spike_out/.
    """
    with httpx.Client(timeout=30.0) as client:
        token, _, _ = fetch_token(client)
        if not token:
            return

        request_id = str(uuid.uuid4())
        headers = {
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
            "PayPal-Request-Id": request_id,
        }

        payload = {
            "intent": "CAPTURE",
            "purchase_units": [
                {
                    "reference_id": "INV-TEST",
                    "custom_id": "INV-TEST",
                    "amount": {
                        "currency_code": "USD",
                        "value": "50.00"
                    }
                }
            ],
            "application_context": {
                "return_url": "https://example.com/return",
                "cancel_url": "https://example.com/cancel",
                "user_action": "PAY_NOW"
            }
        }

        print(f"Creating order with PayPal-Request-Id: {request_id}...")
        url = f"{BASE_URL}/v2/checkout/orders"
        resp = client.post(url, headers=headers, json=payload)

        if resp.status_code not in (200, 201):
            handle_http_error(resp, "Create Order")
            save_response("order_error.json", resp.text)
            return

        data = resp.json()
        order_id = data.get("id")
        save_response(f"order_{order_id or 'created'}.json", data)

        approve_link = None
        for link in data.get("links", []):
            if link.get("rel") == "approve":
                approve_link = link.get("href")
                break

        print("\n--- ORDER RESULT ---")
        print(f"Order ID:     {order_id}")
        print(f"Status:       {data.get('status')}")
        print(f"Approve Link: {approve_link or 'None found in response links'}")


def cmd_capture(order_id: str) -> None:
    """
    Command: capture ORDER_ID -> POST /v2/checkout/orders/{id}/capture.
    Saves JSON and prints seller_receivable_breakdown if present.
    """
    with httpx.Client(timeout=30.0) as client:
        token, _, _ = fetch_token(client)
        if not token:
            return

        headers = {
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
            "PayPal-Request-Id": str(uuid.uuid4()),
        }

        print(f"Capturing payment for Order ID: {order_id}...")
        url = f"{BASE_URL}/v2/checkout/orders/{order_id}/capture"
        resp = client.post(url, headers=headers, json={})

        if resp.status_code not in (200, 201):
            handle_http_error(resp, f"Capture Order {order_id}")
            save_response(f"capture_order_error_{order_id}.json", resp.text)
            return

        data = resp.json()
        save_response(f"capture_order_{order_id}.json", data)

        print("\n--- CAPTURE RESULT ---")
        print(f"Order ID: {data.get('id')}")
        print(f"Status:   {data.get('status')}")

        # Search for seller_receivable_breakdown
        breakdowns = []
        for pu in data.get("purchase_units", []):
            payments = pu.get("payments", {})
            for cap in payments.get("captures", []):
                srb = cap.get("seller_receivable_breakdown")
                if srb:
                    breakdowns.append((cap.get("id"), srb))

        if breakdowns:
            for cap_id, srb in breakdowns:
                print(f"\nCapture ID: {cap_id}")
                print("seller_receivable_breakdown:")
                print(f"  paypal_fee:        {srb.get('paypal_fee')}")
                print(f"  net_amount:        {srb.get('net_amount')}")
                print(f"  receivable_amount: {srb.get('receivable_amount')}")
                print(f"  exchange_rate:     {srb.get('exchange_rate')}")
        else:
            print("\nNo seller_receivable_breakdown found in response.")


def cmd_invoice_get(invoice_id: str) -> None:
    """
    Command: invoice-get INVOICE_ID -> GET /v2/invoicing/invoices/{id}.
    Saves JSON and prints payments.transactions.
    """
    with httpx.Client(timeout=30.0) as client:
        token, _, _ = fetch_token(client, scope=INVOICING_SCOPE)
        if not token:
            return

        headers = {
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
        }

        print(f"Fetching invoice {invoice_id}...")
        url = f"{BASE_URL}/v2/invoicing/invoices/{invoice_id}"
        resp = client.get(url, headers=headers)

        if resp.status_code != 200:
            handle_http_error(resp, f"Get Invoice {invoice_id}")
            save_response(f"invoice_get_error_{invoice_id}.json", resp.text)
            return

        data = resp.json()
        save_response(f"invoice_get_{invoice_id}.json", data)

        print("\n--- INVOICE DETAILS ---")
        print(f"Invoice ID: {data.get('id')}")
        print(f"Status:     {data.get('status')}")

        payments = data.get("payments", {})
        transactions = payments.get("transactions", []) if isinstance(payments, dict) else []
        print("\npayments.transactions:")
        if transactions:
            print(json.dumps(transactions, indent=2))
        else:
            print("  None (no transactions recorded for this invoice yet)")


def cmd_capture_get(capture_id: str) -> None:
    """
    Command: capture-get CAPTURE_ID -> GET /v2/payments/captures/{id}.
    Saves JSON and displays details.
    """
    with httpx.Client(timeout=30.0) as client:
        token, _, _ = fetch_token(client)
        if not token:
            return

        headers = {
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
        }

        print(f"Fetching capture {capture_id}...")
        url = f"{BASE_URL}/v2/payments/captures/{capture_id}"
        resp = client.get(url, headers=headers)

        if resp.status_code != 200:
            handle_http_error(resp, f"Get Capture {capture_id}")
            save_response(f"capture_get_error_{capture_id}.json", resp.text)
            return

        data = resp.json()
        save_response(f"capture_get_{capture_id}.json", data)

        print("\n--- CAPTURE DETAILS ---")
        print(f"Capture ID: {data.get('id')}")
        print(f"Status:     {data.get('status')}")
        print(f"Amount:     {data.get('amount')}")
        srb = data.get("seller_receivable_breakdown")
        if srb:
            print("seller_receivable_breakdown:")
            print(f"  paypal_fee:        {srb.get('paypal_fee')}")
            print(f"  net_amount:        {srb.get('net_amount')}")
            print(f"  receivable_amount: {srb.get('receivable_amount')}")
            print(f"  exchange_rate:     {srb.get('exchange_rate')}")


def cmd_search(days: int = 2) -> None:
    """
    Command: search -> GET /v1/reporting/transactions for the last 2 days (fields=all).
    Saves JSON and warns that transaction data can be delayed.
    """
    with httpx.Client(timeout=30.0) as client:
        token, _, _ = fetch_token(client)
        if not token:
            return

        end_date = datetime.now(timezone.utc)
        start_date = end_date - timedelta(days=days)

        start_str = start_date.strftime("%Y-%m-%dT%H:%M:%SZ")
        end_str = end_date.strftime("%Y-%m-%dT%H:%M:%SZ")

        headers = {
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
        }
        params = {
            "start_date": start_str,
            "end_date": end_str,
            "fields": "all",
            "page_size": 100,
        }

        print(f"Searching transactions from {start_str} to {end_str} (last {days} days)...")
        print("NOTE: PayPal transaction reporting data can be delayed (often by several hours or longer in Sandbox).")

        url = f"{BASE_URL}/v1/reporting/transactions"
        resp = client.get(url, headers=headers, params=params)

        if resp.status_code != 200:
            handle_http_error(resp, "Search Transactions")
            save_response("transactions_search_error.json", resp.text)
            return

        data = resp.json()
        ts_slug = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
        save_response(f"transactions_search_{ts_slug}.json", data)

        print("\n--- SEARCH SUMMARY ---")
        print(f"Total items: {data.get('total_items', 0)}")
        print(f"Total pages: {data.get('total_pages', 0)}")

        tx_details = data.get("transaction_details", [])
        if tx_details:
            print(f"Found {len(tx_details)} transaction(s):")
            for idx, tx in enumerate(tx_details, 1):
                ti = tx.get("transaction_info", {})
                print(
                    f"  [{idx}] ID: {ti.get('transaction_id')} | "
                    f"Status: {ti.get('transaction_status')} | "
                    f"Amount: {ti.get('transaction_amount', {}).get('value')} "
                    f"{ti.get('transaction_amount', {}).get('currency_code')} | "
                    f"Date: {ti.get('transaction_initiation_date')}"
                )
        else:
            print("No transactions found in this window (or reporting sync is still pending).")


def cmd_inspect(target: Optional[str] = None) -> None:
    """
    Command: inspect -> View formatted JSON payloads stored in scripts/spike_out/.
    If target is omitted, lists files and prints the latest successful capture or order.
    """
    files = sorted(SPIKE_OUT_DIR.glob("*.json"), key=os.path.getmtime, reverse=True)
    if not files:
        print(f"No response files found in {SPIKE_OUT_DIR}")
        return

    print(f"\nAvailable JSON files in {SPIKE_OUT_DIR.relative_to(REPO_ROOT)}:")
    for idx, f in enumerate(files[:15], 1):
        size_kb = round(f.stat().st_size / 1024, 2)
        print(f"  [{idx:2d}] {f.name:<45} ({size_kb} KB)")

    # Choose file to display
    selected = None
    if target:
        matched = [f for f in files if target.lower() in f.name.lower()]
        if matched:
            selected = matched[0]
        else:
            print(f"\nNo file matching '{target}' found.")
            return
    else:
        # Default to latest non-error file
        non_errors = [f for f in files if "error" not in f.name.lower()]
        selected = non_errors[0] if non_errors else files[0]

    print(f"\nDisplaying contents of: {selected.name}")
    try:
        with open(selected, "r", encoding="utf-8") as fp:
            data = json.load(fp)
            print_inspect(selected.name, data)
    except Exception as exc:
        print(f"Error reading {selected.name}: {exc}")


# ---------------------------------------------------------------------------
# CLI Argument Parser
# ---------------------------------------------------------------------------
def main():
    global INSPECT_MODE

    parser = argparse.ArgumentParser(
        description="PayPal Sandbox Spike Tool to inspect API JSON responses.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  python scripts/spike_paypal.py --inspect token
  python scripts/spike_paypal.py --inspect order
  python scripts/spike_paypal.py --inspect capture <ORDER_ID>
  python scripts/spike_paypal.py --inspect invoice-get <INVOICE_ID>
  python scripts/spike_paypal.py --inspect capture-get <CAPTURE_ID>
  python scripts/spike_paypal.py inspect
  python scripts/spike_paypal.py inspect capture
        """,
    )

    parser.add_argument(
        "--inspect",
        action="store_true",
        help="Inspect mode: pretty-print the full JSON response directly to the console",
    )

    subparsers = parser.add_subparsers(dest="command", required=True, help="Command to run")

    # token
    subparsers.add_parser("token", help="Get OAuth token and print expiry only")

    # invoice
    parser_invoice = subparsers.add_parser(
        "invoice",
        help="Generate number, create $100 draft invoice with GSTIN/LUT notes, and send it",
    )
    parser_invoice.add_argument(
        "--buyer-email",
        type=str,
        default=None,
        help="Buyer email (defaults to BUYER_EMAIL from .env)",
    )

    # order
    subparsers.add_parser(
        "order",
        help="Create order (intent CAPTURE, $50 USD, reference 'INV-TEST') & print approve link",
    )

    # capture
    parser_capture = subparsers.add_parser(
        "capture",
        help="Capture an approved order and print seller_receivable_breakdown",
    )
    parser_capture.add_argument("order_id", help="The approved PayPal Order ID to capture")

    # invoice-get
    parser_inv_get = subparsers.add_parser(
        "invoice-get",
        help="Fetch invoice details by ID and print payments.transactions",
    )
    parser_inv_get.add_argument("invoice_id", help="PayPal Invoice ID (e.g. INV2-XXXX-XXXX)")

    # capture-get
    parser_cap_get = subparsers.add_parser(
        "capture-get",
        help="Fetch payment capture details by Capture ID",
    )
    parser_cap_get.add_argument("capture_id", help="PayPal Capture ID")

    # search
    parser_search = subparsers.add_parser(
        "search",
        help="Search transactions for the last 2 days via transaction reporting API",
    )
    parser_search.add_argument(
        "--days",
        type=int,
        default=2,
        help="Number of past days to query (default: 2)",
    )

    # inspect
    parser_view = subparsers.add_parser(
        "inspect",
        help="Inspect saved JSON responses in scripts/spike_out/",
    )
    parser_view.add_argument(
        "target",
        nargs="?",
        default=None,
        help="Optional keyword or filename to inspect (e.g. 'capture', 'order', 'invoice')",
    )

    args = parser.parse_args()

    if args.inspect:
        INSPECT_MODE = True

    if args.command == "token":
        cmd_token()
    elif args.command == "invoice":
        cmd_invoice(cli_buyer_email=args.buyer_email)
    elif args.command == "order":
        cmd_order()
    elif args.command == "capture":
        cmd_capture(order_id=args.order_id)
    elif args.command == "invoice-get":
        cmd_invoice_get(invoice_id=args.invoice_id)
    elif args.command == "capture-get":
        cmd_capture_get(capture_id=args.capture_id)
    elif args.command == "search":
        cmd_search(days=args.days)
    elif args.command == "inspect":
        cmd_inspect(target=args.target)


if __name__ == "__main__":
    main()
