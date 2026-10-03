"""
tunnel.py - Starts a localhost.run SSH tunnel and keeps it alive.
Run this script to create a persistent public HTTPS URL for your Flask app.
"""
import subprocess
import sys
import time
import threading
import re

def start_tunnel():
    """Start SSH tunnel to localhost.run."""
    print("Connecting to localhost.run tunnel service...")

    proc = subprocess.Popen(
        [
            "ssh",
            "-o", "StrictHostKeyChecking=no",
            "-o", "ServerAliveInterval=30",
            "-o", "ServerAliveCountMax=10",
            "-o", "ExitOnForwardFailure=yes",
            "-R", "80:127.0.0.1:5000",
            "nokey@localhost.run"
        ],
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        bufsize=1
    )

    public_url = None

    for line in iter(proc.stdout.readline, ''):
        line_stripped = line.strip()
        print(line_stripped)

        # Extract the public URL
        match = re.search(r'https://[\w\-]+\.lhr\.life', line_stripped)
        if match and not public_url:
            public_url = match.group(0)
            print("\n" + "=" * 60)
            print("LIVE WEBSITE URL:")
            print(public_url)
            print("=" * 60)
            print("\nShare this link with ANYONE on any device:")
            print(public_url)
            print("\nIMPORTANT: Keep this window open to keep the website live.")
            print("Press Ctrl+C to stop the tunnel.\n")

    proc.wait()
    print("\nTunnel closed. Exit code:", proc.returncode)
    return proc.returncode

if __name__ == '__main__':
    try:
        rc = start_tunnel()
        sys.exit(rc)
    except KeyboardInterrupt:
        print("\nTunnel stopped by user.")
        sys.exit(0)
