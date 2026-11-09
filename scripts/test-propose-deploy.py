#!/usr/bin/env python3
"""Run the release script with real git history and mocked GitHub responses."""
import json
import os
import pathlib
import subprocess
import tempfile

SCRIPT = pathlib.Path(__file__).with_name("propose-deploy.sh").resolve()
with tempfile.TemporaryDirectory() as directory:
    root = pathlib.Path(directory)

    def git(*args):
        return subprocess.check_output(["git", *args], cwd=root, stderr=subprocess.STDOUT).decode().strip()

    git("init", "-q", "-b", "main")
    git("config", "user.name", "Fixture")
    git("config", "user.email", "fixture@example.invalid")
    manifest = root / "infra/k8s/kustomization.yaml"
    manifest.parent.mkdir(parents=True)
    manifest.write_text("images:\n  - name: app\n    newName: ghcr.io/drewrasm/simon-says\n    newTag: " + "a" * 40 + "\n")
    git("add", ".")
    git("commit", "-qm", "old release")
    old = git("rev-parse", "HEAD")
    (root / "source.txt").write_text("new source\n")
    git("add", ".")
    git("commit", "-qm", "current source")
    source = git("rev-parse", "HEAD")
    git("update-ref", "refs/remotes/origin/main", source)
    manifest.write_text(manifest.read_text().replace("a" * 40, source))
    git("add", ".")
    git("commit", "-qm", "deploy tag")
    head = git("rev-parse", "HEAD")
    bin_path = root / "bin"
    bin_path.mkdir()
    real_git = subprocess.check_output(["which", "git"], text=True).strip()
    (bin_path / "git").write_text(f'#!/bin/sh\nif [ "$1" = fetch ]; then exit 0; fi\nexec "{real_git}" "$@"\n')
    (bin_path / "gh").write_text('''#!/usr/bin/env python3
import json, os, sys
args = sys.argv[1:]
with open(os.environ["CALLS"], "a") as log:
    log.write(json.dumps(args) + "\\n")
if args[:2] == ["pr", "list"]:
    if "--head" in args:
        print("25")
    else:
        print("21\\tdeploy/" + os.environ["OLD_SHA"])
        print("25\\tdeploy/" + os.environ["GITHUB_SHA"])
        print("26\\tdeploy/" + os.environ["PR_HEAD"])
        print("99\\tfeature/unrelated")
elif args[:2] == ["pr", "view"]:
    if "headRefOid" in args:
        print(os.environ["PR_HEAD"])
    else:
        print("OPEN")
elif args[:2] == ["pr", "merge"]:
    sys.exit(1)
elif args[:2] != ["pr", "close"]:
    raise SystemExit("unexpected gh invocation")
''')
    for path in bin_path.iterdir():
        path.chmod(0o755)
    env = dict(os.environ, PATH=str(bin_path) + os.pathsep + os.environ["PATH"],
               GITHUB_SHA=source, GITHUB_REPOSITORY="fixture/repo", GH_TOKEN="mock",
               GITHUB_STEP_SUMMARY=str(root / "summary"), CALLS=str(root / "calls"),
               OLD_SHA=old, PR_HEAD=head, AUTO_DEPLOY="true")
    result = subprocess.run(["bash", str(SCRIPT)], cwd=root, env=env, capture_output=True, text=True)
    assert result.returncode == 1, (result.stdout, result.stderr)
    assert "PASS: only app newTag changed" in result.stdout
    assert "::error::" in result.stdout and "Bypass list" in result.stdout and "DEPLOY_TOKEN" in result.stdout
    calls = [json.loads(line) for line in (root / "calls").read_text().splitlines()]
    merges = [call for call in calls if call[:2] == ["pr", "merge"]]
    assert len(merges) == 1 and "--admin" in merges[0] and head in merges[0]
    closes = [call for call in calls if call[:2] == ["pr", "close"]]
    assert len(closes) == 1 and closes[0][2] == "21" and "--comment" not in closes[0]
    assert "Failed" in (root / "summary").read_text()
    print("PASS: merge refused emits ::error:: and exits 1; closes only the superseded PR")
    (root / "calls").write_text("")
    result = subprocess.run(["bash", str(SCRIPT)], cwd=root, env=dict(env, AUTO_DEPLOY="false"), capture_output=True, text=True)
    assert result.returncode == 0, (result.stdout, result.stderr)
    assert "AUTO_DEPLOY=false" in result.stdout
    assert not any(json.loads(line)[:2] == ["pr", "merge"] for line in (root / "calls").read_text().splitlines())
    print("PASS: AUTO_DEPLOY=false leaves current PR open without merging")
