#!/usr/bin/env python3
# coding: utf-8

# fork-only (disk-space ticket 04; see FORK.md and README.md next to this file):
# sends an email when a disk is nearly full or missing, and one when all is
# well again. Run by fork-disk-alert.timer every 15 minutes; Python 3 stdlib only.
#
# A disk is "missing" when its mount point isn't in the mount table, "full" when
# statvfs says at least `threshold` percent is used (counting the space only
# root may use as used, as df's "Avail" does). Only the mount table and statvfs
# of the mount point itself are read, so a sleeping HDD stays asleep.
#
# One mail lists every disk. It goes out when a disk becomes full or missing (or
# changes from one to the other), again every `repeat-hours` while any stays so,
# and once when every disk reported is fine again. What was last reported is kept
# in state.json under $STATE_DIRECTORY (systemd's StateDirectory=), so a failed
# send is retried at the next run. The SMTP password is read from
# $CREDENTIALS_DIRECTORY/smtp-password (systemd's LoadCredential=), never from
# the config file.

import argparse
import configparser
import json
import os
import re
import smtplib
import socket
import ssl
import sys
import time
from email.message import EmailMessage
from email.utils import formatdate, make_msgid

DEFAULT_CONFIG = "/etc/fork-disk-alert/fork-disk-alert.conf"


class ConfigError(Exception):
    pass


def load_config(path):
    cp = configparser.ConfigParser(inline_comment_prefixes=("#",))
    cp.optionxform = str  # keep the disks' names as written
    if not cp.read(path, encoding="utf-8"):
        raise ConfigError("cannot read the config file %s" % (path,))

    try:
        al = cp["alert"] if cp.has_section("alert") else {}
        threshold = float(al.get("threshold", "90"))
        repeat_h = float(al.get("repeat-hours", "24"))
    except ValueError as ex:
        raise ConfigError("[alert]: %s" % (ex,))
    if not 0 < threshold <= 100:
        raise ConfigError("[alert] threshold must be a percentage from 1 to 100")
    if repeat_h <= 0:
        raise ConfigError("[alert] repeat-hours must be more than 0")

    if not cp.has_section("disks") or not cp["disks"]:
        raise ConfigError("the config has no [disks]")
    disks = []
    for name, mnt in cp["disks"].items():
        mnt = mnt.strip()
        if not mnt.startswith("/"):
            raise ConfigError("[disks] %s: the mount point must be an absolute path" % (name,))
        disks.append((name, os.path.normpath(mnt)))

    if not cp.has_section("smtp"):
        raise ConfigError("the config has no [smtp]")
    sm = cp["smtp"]
    smtp = {}
    for k in ("host", "user", "to"):
        v = sm.get(k, "").strip()
        if not v or v.startswith("<"):
            raise ConfigError("[smtp] %s is not set" % (k,))
        smtp[k] = v
    smtp["from"] = sm.get("from", "").strip() or smtp["user"]
    smtp["security"] = sm.get("security", "ssl").strip().lower()
    if smtp["security"] not in ("ssl", "starttls"):
        raise ConfigError("[smtp] security must be ssl or starttls")
    try:
        smtp["port"] = int(sm.get("port", "465" if smtp["security"] == "ssl" else "587"))
    except ValueError:
        raise ConfigError("[smtp] port must be a number")

    return {"threshold": threshold, "repeat_s": repeat_h * 3600, "disks": disks, "smtp": smtp}


def read_mounts(path="/proc/self/mounts"):
    """the mount points in the mount table; octal escapes (\\040 for a
    space) decoded"""
    ret = set()
    with open(path, "rb") as f:
        for ln in f.read().decode("utf-8", "replace").splitlines():
            zs = ln.split()
            if len(zs) > 1:
                ret.add(re.sub(r"\\([0-7]{3})", lambda m: chr(int(m.group(1), 8)), zs[1]))
    return ret


def check(disks, mounts, statvfs, threshold):
    """each disk as {name, mnt, state, pct, free, total}; state is ok,
    full or missing"""
    ret = []
    for name, mnt in disks:
        r = {"name": name, "mnt": mnt, "state": "missing", "pct": 0, "free": 0, "total": 0}
        ret.append(r)
        if mnt not in mounts:
            continue
        try:
            sv = statvfs(mnt)
        except OSError:
            continue
        total = sv.f_blocks * sv.f_frsize
        if not total:
            continue
        free = sv.f_bavail * sv.f_frsize
        r.update(free=free, total=total, pct=100.0 * (total - free) / total)
        r["state"] = "full" if r["pct"] >= threshold else "ok"
    return ret


def decide(results, state, now, repeat_s):
    """what to send now ("alert", "ok" or None) and the state to keep once
    it is sent"""
    was = state.get("bad") or {}
    bad = dict((r["name"], r["state"]) for r in results if r["state"] != "ok")
    if not bad:
        if was:
            return "ok", {"bad": {}, "sent": now}
        return None, state

    changed = any(was.get(k) != v for k, v in bad.items())
    if changed or now - (state.get("sent") or 0) >= repeat_s:
        return "alert", {"bad": bad, "sent": now}
    # a disk that came back while another stays bad: remember it, no mail
    return None, {"bad": bad, "sent": state.get("sent") or 0}


def humansize(n):
    for unit in ("B", "KiB", "MiB", "GiB", "TiB"):
        if n < 1024 or unit == "TiB":
            break
        n /= 1024.0
    return ("%.1f %s" % (n, unit)) if unit != "B" else ("%d B" % (n,))


def compose(kind, results, threshold, host):
    full = [r["name"] for r in results if r["state"] == "full"]
    gone = [r["name"] for r in results if r["state"] == "missing"]
    if kind == "test":
        subj = "test from fork-disk-alert"
    elif kind == "ok":
        subj = "disks back to normal"
    else:
        parts = []
        if full:
            parts.append("nearly full: " + ", ".join(full))
        if gone:
            parts.append("missing: " + ", ".join(gone))
        subj = "; ".join(parts)

    w = max(len(r["name"]) for r in results)
    lines = []
    for r in results:
        if r["state"] == "missing":
            txt = "not mounted (%s)" % (r["mnt"],)
        else:
            txt = "%d%% used, %s free of %s" % (int(r["pct"]), humansize(r["free"]), humansize(r["total"]))
        mark = {"full": "   <- nearly full", "missing": "   <- missing"}.get(r["state"], "")
        lines.append("%s  %s%s" % (r["name"].ljust(w), txt, mark))

    body = [
        "Disks on %s, %s:" % (host, time.strftime("%Y-%m-%d %H:%M")),
        "",
    ] + lines + [
        "",
        "A disk counts as nearly full at %d%% used." % (threshold,),
    ]
    if kind == "alert" and gone:
        body.append("A missing disk is unplugged, or failed to mount at boot (see: journalctl -b -u '*.mount').")
    if kind == "test":
        body.append("This is a test mail (--test); the SMTP settings work.")
    return "[%s] %s" % (host, subj), "\n".join(body) + "\n"


def send(smtp, password, subject, body):
    msg = EmailMessage()
    msg["Subject"] = subject
    msg["From"] = smtp["from"]
    msg["To"] = smtp["to"]
    msg["Date"] = formatdate(localtime=True)
    msg["Message-ID"] = make_msgid("fork-disk-alert")
    msg.set_content(body)

    ctx = ssl.create_default_context()
    if smtp["security"] == "ssl":
        conn = smtplib.SMTP_SSL(smtp["host"], smtp["port"], timeout=30, context=ctx)
    else:
        conn = smtplib.SMTP(smtp["host"], smtp["port"], timeout=30)
        conn.starttls(context=ctx)
    try:
        conn.login(smtp["user"], password)
        conn.send_message(msg)
    finally:
        try:
            conn.quit()
        except Exception:
            pass


def read_password(path):
    with open(path, "rb") as f:
        pw = f.read().decode("utf-8").strip()
    if not pw or pw.startswith("<"):
        raise ConfigError("the SMTP password in %s is not set" % (path,))
    return pw


def load_state(path):
    try:
        with open(path, "rb") as f:
            st = json.loads(f.read().decode("utf-8"))
        return st if isinstance(st, dict) else {}
    except (OSError, ValueError):
        return {}


def save_state(path, st):
    tmp = path + ".tmp"
    with open(tmp, "wb") as f:
        f.write(json.dumps(st, sort_keys=True).encode("utf-8"))
    os.replace(tmp, path)


def main(argv=None):
    ap = argparse.ArgumentParser(description="email when a disk is nearly full or missing")
    ap.add_argument("--config", default=DEFAULT_CONFIG, help="config file (default: %(default)s)")
    ap.add_argument("--state", help="state file (default: $STATE_DIRECTORY/state.json)")
    ap.add_argument("--password-file", help="SMTP password (default: $CREDENTIALS_DIRECTORY/smtp-password)")
    ap.add_argument("--dry-run", action="store_true", help="print the disks and the mail it would send now; send nothing, keep no state")
    ap.add_argument("--test", action="store_true", help="send a test mail with the current numbers now, whatever the state")
    a = ap.parse_args(argv)

    try:
        cfg = load_config(a.config)
    except ConfigError as ex:
        print("fork-disk-alert: %s" % (ex,), file=sys.stderr)
        return 2

    results = check(cfg["disks"], read_mounts(), os.statvfs, cfg["threshold"])
    host = socket.gethostname()

    state_path = a.state
    if not state_path and not a.dry_run and not a.test:
        sd = os.environ.get("STATE_DIRECTORY", "").split(":")[0]
        if not sd:
            print("fork-disk-alert: no --state and no $STATE_DIRECTORY", file=sys.stderr)
            return 2
        state_path = os.path.join(sd, "state.json")

    now = time.time()
    if a.test:
        kind, new_state = "test", None
    else:
        kind, new_state = decide(results, load_state(state_path) if state_path else {}, now, cfg["repeat_s"])

    if a.dry_run:
        subj, body = compose(kind or "alert", results, cfg["threshold"], host)
        print("would send: %s" % ("nothing" if not kind else "Subject: " + subj,))
        print("")
        print(body, end="")
        return 0

    if kind:
        pwf = a.password_file
        if not pwf:
            cd = os.environ.get("CREDENTIALS_DIRECTORY", "")
            if not cd:
                print("fork-disk-alert: no --password-file and no $CREDENTIALS_DIRECTORY", file=sys.stderr)
                return 2
            pwf = os.path.join(cd, "smtp-password")
        try:
            pw = read_password(pwf)
        except (OSError, ConfigError) as ex:
            print("fork-disk-alert: %s" % (ex,), file=sys.stderr)
            return 2
        subj, body = compose(kind, results, cfg["threshold"], host)
        try:
            send(cfg["smtp"], pw, subj, body)
        except (OSError, smtplib.SMTPException) as ex:
            # no state change: the next run tries again
            print("fork-disk-alert: sending failed: %r" % (ex,), file=sys.stderr)
            return 1
        print("sent: %s" % (subj,))

    for r in results:
        print("%s: %s %d%%" % (r["name"], r["state"], int(r["pct"])))

    if new_state is not None and new_state != load_state(state_path):
        save_state(state_path, new_state)
    return 0


if __name__ == "__main__":
    sys.exit(main())
