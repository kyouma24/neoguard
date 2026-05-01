#!/usr/bin/env python3
"""Minimal mock ingest server that prints received metric summaries."""

import gzip
import json
from http.server import HTTPServer, BaseHTTPRequestHandler
from collections import Counter

batch_count = 0
total_points = 0

class IngestHandler(BaseHTTPRequestHandler):
    def do_POST(self):
        global batch_count, total_points

        content_encoding = self.headers.get("Content-Encoding", "")
        auth = self.headers.get("Authorization", "")
        agent_ver = self.headers.get("X-NeoGuard-Agent-Version", "unknown")
        content_length = int(self.headers.get("Content-Length", 0))

        body = self.rfile.read(content_length)
        if content_encoding == "gzip":
            body = gzip.decompress(body)

        data = json.loads(body)
        metrics = data.get("metrics", [])

        batch_count += 1
        total_points += len(metrics)

        prefixes = Counter()
        for m in metrics:
            parts = m["name"].split(".")
            prefix = ".".join(parts[:2]) if len(parts) >= 2 else m["name"]
            prefixes[prefix] += 1

        print(f"\n{'='*60}")
        print(f"BATCH #{batch_count} | {len(metrics)} points | Total: {total_points}")
        print(f"Agent: {agent_ver} | Auth: {auth[:30]}...")
        print(f"{'='*60}")

        for prefix, count in sorted(prefixes.items()):
            print(f"  {prefix:<40} {count:>4} points")

        sample_names = set()
        for m in metrics:
            if m["name"] not in sample_names and len(sample_names) < 10:
                sample_names.add(m["name"])
                tags_str = ", ".join(f"{k}={v}" for k, v in m.get("tags", {}).items() if k in ("hostname", "health_status", "process_name", "mount", "interface"))
                print(f"    > {m['name']} = {m['value']:.2f}  [{tags_str}]")

        self.send_response(202)
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(json.dumps({"accepted": len(metrics)}).encode())

    def log_message(self, format, *args):
        pass

if __name__ == "__main__":
    server = HTTPServer(("0.0.0.0", 9999), IngestHandler)
    print("Mock ingest server listening on :9999")
    server.serve_forever()
