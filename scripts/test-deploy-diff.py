#!/usr/bin/env python3
"""Exercise the production guard against real fixture diffs in a scratch repo."""
import pathlib
import subprocess
import tempfile

GUARD = pathlib.Path(__file__).with_name("check-deploy-diff.py").resolve()
TAG = "b" * 40
MANIFEST = "images:\n  - name: app\n    newName: ghcr.io/drewrasm/simon-says\n    newTag: " + "a" * 40 + "\n"

with tempfile.TemporaryDirectory() as directory:
    def git(*args):
        return subprocess.check_output(["git", "-C", directory, *args], stderr=subprocess.STDOUT).decode().strip()

    git("init", "-q")
    git("config", "user.name", "Fixture")
    git("config", "user.email", "fixture@example.invalid")
    path = pathlib.Path(directory, "infra/k8s/kustomization.yaml")
    path.parent.mkdir(parents=True)
    path.write_text(MANIFEST)
    git("add", ".")
    git("commit", "-qm", "fixture base")
    base = git("rev-parse", "HEAD")
    for case, extra_key, extra_file, tag, mode, accepted in [
        ("tag-only", False, False, TAG, False, True),
        ("another key", True, False, TAG, False, False),
        ("another file", False, True, TAG, False, False),
        ("wrong SHA", False, False, "c" * 40, False, False),
        ("file mode", False, False, TAG, True, False),
    ]:
        git("reset", "--hard", base)
        git("clean", "-fdq")
        text = MANIFEST.replace("a" * 40, tag)
        if extra_key:
            text = text.replace("name: app", "name: other")
        path.write_text(text)
        if extra_file:
            pathlib.Path(directory, "other.txt").write_text("unexpected\n")
        git("add", ".")
        if mode:
            git("update-index", "--chmod=+x", "infra/k8s/kustomization.yaml")
        git("commit", "-qm", case)
        result = subprocess.run(["python3", str(GUARD), base, "HEAD", TAG], cwd=directory, capture_output=True, text=True)
        assert (result.returncode == 0) == accepted, (case, result.stdout, result.stderr)
        print(f"PASS: {case}: {'accepted' if accepted else 'rejected'}")
