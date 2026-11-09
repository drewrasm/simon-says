#!/usr/bin/env python3
"""Fail closed unless two git trees differ only by the app's expected image tag."""
import re
import subprocess
import sys

base, head, tag = sys.argv[1:]
path = "infra/k8s/kustomization.yaml"


def git(*args):
    return subprocess.check_output(["git", *args])


# Raw records also detect mode changes, renames, deletions, and extra files.
records = git("diff", "--raw", "--no-abbrev", "--no-renames", base, head).splitlines()
if len(records) != 1:
    sys.exit("Expected exactly one changed file")
metadata, changed_path = records[0].split(b"\t", 1)
old_mode, new_mode, _, _, status = metadata.split()
if (changed_path != path.encode() or status != b"M"
        or old_mode != b":100644" or new_mode != b"100644"):
    sys.exit("Expected only a regular-file modification to the kustomization")
before = git("show", f"{base}:{path}")
after = git("show", f"{head}:{path}")
pattern = rb"(  - name: app\n    newName: ghcr.io/drewrasm/simon-says\n    newTag: )[^\n]+(\n)"
expected, count = re.subn(pattern, lambda m: m[1] + tag.encode() + m[2], before)
if not re.fullmatch(r"[0-9a-f]{40}", tag) or count != 1 or after != expected:
    sys.exit("Expected only the app newTag to change to the published SHA")
print("PASS: only app newTag changed to the published SHA")
