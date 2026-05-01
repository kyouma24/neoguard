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

    args = parser.parse_args()
    if args.command is None:
        parser.print_help()
        sys.exit(1)

    if args.command == "bootstrap-admin":
        from neoguard.cli.bootstrap_admin import run_bootstrap
        run_bootstrap(args.email, args.password, args.name)


main()
