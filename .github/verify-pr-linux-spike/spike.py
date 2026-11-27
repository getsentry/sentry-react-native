#!/usr/bin/env python3
"""Throwaway spike for #7123: the verify-pr Android steps on a Linux runner.

Builds the sample without #7087 (its SDK change reverse-applied) and with it,
runs the skill's example flow on each build with run tags, and records the
timings, disk usage and stale-bundle checks for the design document.

Each subcommand is one workflow step. Results go to
$RUNNER_TEMP/verify-pr-linux-spike, which the workflow uploads.
"""

import argparse
import datetime
import hashlib
import json
import os
import shutil
import subprocess
import sys
import time
import zipfile
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
SAMPLE = REPO / "samples" / "react-native"
FLOW = REPO / ".agents/skills/verify-pr/flows/examples/turbo-module-calls-then-native-crash.yml"
APP_ID = "io.sentry.reactnative.sample"
OUT = Path(os.environ["RUNNER_TEMP"]) / "verify-pr-linux-spike"
RESULTS = OUT / "results.json"
PATCH = OUT / f"pr{os.environ['VERIFY_PR']}.patch"
SIDES = ("without", "with")
# A string literal from samples/react-native/src/verifyRun.ts. #7087 changes
# no JS, so it is in both bundles; the check is whether the skill's command
# reads the Hermes bundle on Linux at all.
BUNDLE_STRING = "verify.run_id"
# Time for queued envelopes to be sent after the flow, before the next install.
SEND_WAIT_SECONDS = 30


def load():
    if RESULTS.exists():
        return json.loads(RESULTS.read_text())
    return {"timings": {}, "marks": {}, "disk": {}, "bundle": {}, "runs": {}}


def save(results):
    OUT.mkdir(parents=True, exist_ok=True)
    RESULTS.write_text(json.dumps(results, indent=2) + "\n")


def run(cmd, **kwargs):
    print("+", " ".join(str(c) for c in cmd), flush=True)
    return subprocess.run(cmd, check=True, **kwargs)


def git(*args, **kwargs):
    return run(["git", "-C", str(REPO), *args], **kwargs)


def short_head():
    out = git("rev-parse", "--short", "HEAD", capture_output=True, text=True)
    return out.stdout.strip()


def sha256(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def cmd_mark(args):
    results = load()
    results["marks"][args.name] = time.time()
    save(results)


def cmd_disk(args):
    # The skill checks `df -h /System/Volumes/Data` (macOS). On the runner the
    # workspace and the Android SDK are both on /.
    run(["df", "-h", "/"])
    usage = shutil.disk_usage("/")
    results = load()
    results["disk"][args.label] = round(usage.free / 1e9, 1)
    save(results)


def cmd_kvm(_args):
    # Same as the "Setup KVM" step of sample-application.yml's test-android job.
    run(["sudo", "apt-get", "install", "-y", "--no-install-recommends", "cpu-checker"])
    run(["kvm-ok"])
    rule = 'KERNEL=="kvm", GROUP="kvm", MODE="0666", OPTIONS+="static_node=kvm"\n'
    run(["sudo", "tee", "/etc/udev/rules.d/99-kvm4all.rules"], input=rule, text=True)
    run(["sudo", "udevadm", "control", "--reload-rules"])
    run(["sudo", "udevadm", "trigger", "--name-match=kvm"])


def cmd_revert(_args):
    merge_sha = os.environ["MERGE_SHA"]
    # The checkout is shallow; `git show` needs the merge commit and its parent.
    git("fetch", "--no-tags", "--depth=2", "origin", merge_sha)
    OUT.mkdir(parents=True, exist_ok=True)
    with PATCH.open("w") as patch:
        git(
            "show", "--format=", merge_sha, "--", "packages/core",
            ":!packages/core/test",
            ":!packages/core/RNSentryAndroidTester",
            ":!packages/core/RNSentryCocoaTester",
            stdout=patch,
        )
    git("apply", "-R", "--check", str(PATCH))
    git("apply", "-R", str(PATCH))


def cmd_restore(_args):
    git("apply", str(PATCH))


def cmd_build(args):
    side = args.side
    env = dict(os.environ, RN_ARCHITECTURE="new", CONFIG="release")
    start = time.time()
    # `yarn build-android-release` drops extra arguments, so call the script it
    # wraps. x86_64 only: the emulator's ABI, instead of all four.
    run(
        [str(SAMPLE / "scripts/build-android.sh"), "-PreactNativeArchitectures=x86_64"],
        env=env,
    )
    elapsed = round(time.time() - start)
    apk = OUT / f"{side}.apk"
    shutil.copyfile(SAMPLE / "app.apk", apk)

    # The skill's stale-bundle check, as written in SKILL.md step 2.
    bundle = OUT / f"{side}.bundle"
    with bundle.open("wb") as out:
        run(["unzip", "-p", str(apk), "assets/index.android.bundle"], stdout=out)
    grep = subprocess.run(
        ["grep", "-a", "-c", BUNDLE_STRING, str(bundle)],
        env=dict(os.environ, LC_ALL="C"),
        capture_output=True,
        text=True,
        check=False,
    )
    if grep.returncode > 1:
        sys.exit(f"grep failed: {grep.stderr}")

    with zipfile.ZipFile(apk) as zf:
        dex = hashlib.sha256()
        for name in sorted(n for n in zf.namelist() if n.startswith("classes") and n.endswith(".dex")):
            dex.update(zf.read(name))

    results = load()
    results["timings"][f"build_{side}"] = elapsed
    results["bundle"][side] = {
        "grep_count": int(grep.stdout.strip() or 0),
        "bundle_sha256": sha256(bundle),
        "dex_sha256": dex.hexdigest(),
    }
    save(results)


def adb(*args, **kwargs):
    return run(["adb", *args], **kwargs)


def run_side(side, results):
    pr = os.environ["VERIFY_PR"]
    stamp = datetime.datetime.now(datetime.timezone.utc).strftime("%Y%m%d-%H%M")
    run_id = f"pr{pr}-{side}-{stamp}"
    commit = short_head()
    if side == "without":
        commit = f"{commit}-{os.environ['MERGE_SHA'][:7]}"
    run_dir = OUT / run_id
    run_dir.mkdir(parents=True, exist_ok=True)
    record = {"run_id": run_id, "commit": commit}
    results["runs"][side] = record
    start = time.time()

    subprocess.run(["adb", "uninstall", APP_ID], check=False)
    install = adb("install", str(OUT / f"{side}.apk"), capture_output=True, text=True)
    print(install.stdout, install.stderr, flush=True)
    if "Success" not in install.stdout:
        sys.exit(f"adb install did not print Success for {side}")
    adb("logcat", "-c")

    maestro = subprocess.run(
        [
            "maestro", "test",
            "-e", f"VERIFY_PR={pr}",
            "-e", f"VERIFY_COMMIT={commit}",
            "-e", f"VERIFY_RUN_ID={run_id}",
            "--test-output-dir", str(run_dir),
            str(FLOW),
        ],
        # Screenshots from `takeScreenshot` may land in the working directory.
        cwd=run_dir,
        check=False,
    )
    record["maestro_exit"] = maestro.returncode
    time.sleep(SEND_WAIT_SECONDS)

    logcat = adb("logcat", "-d", capture_output=True, text=True).stdout
    (run_dir / f"{run_id}.logcat").write_text(logcat)
    record["logcat_run_id_lines"] = logcat.count(run_id)
    record["logcat_envelopes_sent"] = logcat.count("Envelope sent successfully")
    with (run_dir / "screencap.png").open("wb") as png:
        adb("exec-out", "screencap", "-p", stdout=png)
    # An all-black screenshot compresses to a few KB; a real one is much larger.
    record["screenshot_bytes"] = {
        p.name: p.stat().st_size for p in sorted(run_dir.rglob("*.png"))
    }
    results["timings"][f"run_{side}"] = round(time.time() - start)
    return maestro.returncode == 0


def cmd_run(_args):
    results = load()
    results["timings"]["emulator_boot"] = round(time.time() - results["marks"]["emulator_start"])
    ok = True
    for side in SIDES:
        ok = run_side(side, results) and ok
        save(results)
    if not ok:
        sys.exit("a Maestro flow failed; see the run directories")


def cmd_summary(_args):
    results = load()
    marks = results["marks"]
    if "job_start" in marks:
        results["timings"]["job_total"] = round(time.time() - marks["job_start"])
        save(results)
    lines = ["## verify-pr on Linux (#7123)", "", "```json", json.dumps(results, indent=2), "```"]
    summary = os.environ.get("GITHUB_STEP_SUMMARY")
    if summary:
        with open(summary, "a") as fh:
            fh.write("\n".join(lines) + "\n")
    print("\n".join(lines))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(required=True)
    sub.add_parser("mark").add_argument("name")
    sub.add_parser("disk").add_argument("label")
    sub.add_parser("build").add_argument("side", choices=SIDES)
    commands = {
        "mark": cmd_mark, "disk": cmd_disk, "kvm": cmd_kvm, "revert": cmd_revert,
        "restore": cmd_restore, "build": cmd_build, "run": cmd_run, "summary": cmd_summary,
    }
    for name, handler in commands.items():
        (sub.choices.get(name) or sub.add_parser(name)).set_defaults(handler=handler)
    args = parser.parse_args()
    args.handler(args)


if __name__ == "__main__":
    main()
