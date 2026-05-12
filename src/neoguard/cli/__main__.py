"""NeoGuard management CLI.

Usage:
    python -m neoguard.cli bootstrap-admin --email admin@example.com --password changeme
    python -m neoguard.cli bootstrap-admin --help
"""

from __future__ import annotations

import argparse
import sys


def main() -> None:
    parser = argparse.ArgumentParser(
        prog="python -m neoguard.cli",
        description="NeoGuard management commands",
    )
    subparsers = parser.add_subparsers(dest="command", help="Available commands")

    ba = subparsers.add_parser(
        "bootstrap-admin",
        help="Create or promote a super admin user",
        description="Bootstrap a super admin user. Creates the user if they don't exist, promotes them if they do.",
    )
    ba.add_argument("--email", required=True, help="Admin email address")
    ba.add_argument("--password", required=True, help="Admin password (min 8 characters)")
    ba.add_argument("--name", default="Admin", help="Display name (default: Admin)")

    sl = subparsers.add_parser(
        "seed-logs",
        help="Generate realistic demo logs in ClickHouse",
        description="Seed ClickHouse with random demo logs for demo calls.",
    )
    sl.add_argument("--tenant-id", default="default", help="Tenant ID to assign logs to (default: 'default')")
    sl.add_argument("--count", type=int, default=5000, help="Number of logs to generate (default: 5000)")
    sl.add_argument("--hours", type=int, default=24, help="Spread logs over this many hours back (default: 24)")

    sa = subparsers.add_parser(
        "seed-alerts",
        help="Generate demo alert rules, events, and silences",
        description="Seed TimescaleDB with realistic alert rules, historical events, and maintenance silences.",
    )
    sa.add_argument("--tenant-id", required=True, help="Tenant ID to assign alerts to")

    args = parser.parse_args()
    if args.command is None:
        parser.print_help()
        sys.exit(1)

    if args.command == "bootstrap-admin":
        from neoguard.cli.bootstrap_admin import run_bootstrap
        run_bootstrap(args.email, args.password, args.name)

    elif args.command == "seed-logs":
        from neoguard.cli.seed_logs import run_seed_logs
        run_seed_logs(args.tenant_id, args.count, args.hours)

    elif args.command == "seed-alerts":
        from neoguard.cli.seed_alerts import run_seed
        run_seed(args.tenant_id)


main()
