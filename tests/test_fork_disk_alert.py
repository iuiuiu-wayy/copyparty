#!/usr/bin/env python3
# coding: utf-8
from __future__ import division, print_function, unicode_literals

# fork-only: contrib/fork-disk-alert, the email when a disk is nearly full or
# missing (disk-space ticket 04). A Python 3 script outside copyparty

import os
import shutil
import sys
import tempfile
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
SCRIPT = os.path.join(os.path.dirname(HERE), "contrib", "fork-disk-alert", "fork-disk-alert.py")
EXAMPLE = os.path.join(os.path.dirname(SCRIPT), "fork-disk-alert.example.conf")

GiB = 1024 * 1024 * 1024


def load():
    import importlib.util

    spec = importlib.util.spec_from_file_location("fork_disk_alert", SCRIPT)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


class SV(object):
    """a statvfs result: frsize 4096"""

    def __init__(self, total, avail):
        self.f_frsize = 4096
        self.f_blocks = total // 4096
        self.f_bavail = avail // 4096


@unittest.skipIf(sys.version_info < (3, 6), "the script is Python 3")
class TestForkDiskAlert(unittest.TestCase):
    def setUp(self):
        self.m = load()
        self.td = tempfile.mkdtemp()
        self.disks = [("ssd", "/mnt/ssd"), ("hdd1", "/mnt/hdd1"), ("hdd2", "/mnt/hdd2")]
        self.sizes = {
            "/mnt/ssd": SV(100 * GiB, 40 * GiB),
            "/mnt/hdd1": SV(1000 * GiB, 900 * GiB),
            "/mnt/hdd2": SV(1000 * GiB, 500 * GiB),
        }
        self.mounts = set(self.sizes)

    def tearDown(self):
        shutil.rmtree(self.td)

    def statvfs(self, p):
        return self.sizes[p]

    def check(self):
        return self.m.check(self.disks, self.mounts, self.statvfs, 90)

    def states(self):
        return dict((r["name"], r["state"]) for r in self.check())

    def test_full_and_missing(self):
        self.assertEqual(self.states(), {"ssd": "ok", "hdd1": "ok", "hdd2": "ok"})
        self.sizes["/mnt/hdd1"] = SV(1000 * GiB, 100 * GiB)  # exactly 90 % used
        self.mounts.discard("/mnt/hdd2")
        self.assertEqual(self.states(), {"ssd": "ok", "hdd1": "full", "hdd2": "missing"})
        r = self.check()[0]
        self.assertEqual((int(r["pct"]), r["free"], r["total"]), (60, 40 * GiB, 100 * GiB))

    def test_mount_table(self):
        fn = os.path.join(self.td, "mounts")
        with open(fn, "wb") as f:
            f.write(b"/dev/sda1 /mnt/ssd ext4 rw,noatime 0 0\n")
            f.write(b"/dev/sdc1 /mnt/my\\040disk fuseblk rw 0 0\n")
            f.write(b"tmpfs /run tmpfs rw 0 0\n")
        self.assertEqual(self.m.read_mounts(fn), set(["/mnt/ssd", "/mnt/my disk", "/run"]))

    def test_when_it_mails(self):
        d = self.m.decide
        H = 3600.0
        day = 24 * H
        ok = self.check()
        self.assertEqual(d(ok, {}, 1000.0, day), (None, {}))

        self.sizes["/mnt/hdd1"] = SV(1000 * GiB, 50 * GiB)
        full = self.check()
        kind, st = d(full, {}, 1000.0, day)
        self.assertEqual((kind, st), ("alert", {"bad": {"hdd1": "full"}, "sent": 1000.0}))
        # still full: quiet until a day has passed
        self.assertEqual(d(full, st, 1000.0 + H, day)[0], None)
        kind, st2 = d(full, st, 1000.0 + day, day)
        self.assertEqual((kind, st2["sent"]), ("alert", 1000.0 + day))

        # another disk goes missing: mail now
        self.mounts.discard("/mnt/hdd2")
        both = self.check()
        kind, st3 = d(both, st, 1000.0 + H, day)
        self.assertEqual((kind, st3["bad"]), ("alert", {"hdd1": "full", "hdd2": "missing"}))
        # hdd2 comes back while hdd1 stays full: no mail, but remembered
        self.mounts.add("/mnt/hdd2")
        kind, st4 = d(full, st3, 1000.0 + 2 * H, day)
        self.assertEqual((kind, st4), (None, {"bad": {"hdd1": "full"}, "sent": 1000.0 + H}))
        # all fine again: one mail, then nothing
        kind, st5 = d(ok, st4, 1000.0 + 3 * H, day)
        self.assertEqual((kind, st5["bad"]), ("ok", {}))
        self.assertEqual(d(ok, st5, 1000.0 + 4 * H, day)[0], None)

    def test_full_then_missing_mails_again(self):
        self.sizes["/mnt/hdd1"] = SV(1000 * GiB, 50 * GiB)
        _, st = self.m.decide(self.check(), {}, 1000.0, 86400.0)
        self.mounts.discard("/mnt/hdd1")
        kind, st = self.m.decide(self.check(), st, 1001.0, 86400.0)
        self.assertEqual((kind, st["bad"]), ("alert", {"hdd1": "missing"}))

    def test_the_mail(self):
        self.sizes["/mnt/hdd1"] = SV(1000 * GiB, 50 * GiB)
        self.mounts.discard("/mnt/hdd2")
        subj, body = self.m.compose("alert", self.check(), 90, "localpi")
        self.assertEqual(subj, "[localpi] nearly full: hdd1; missing: hdd2")
        self.assertIn("hdd1  95% used, 50.0 GiB free of 1000.0 GiB   <- nearly full", body)
        self.assertIn("hdd2  not mounted (/mnt/hdd2)   <- missing", body)
        self.assertIn("ssd   60% used, 40.0 GiB free of 100.0 GiB\n", body)
        self.assertIn("at 90% used", body)
        subj, body = self.m.compose("ok", self.check(), 90, "localpi")
        self.assertEqual(subj, "[localpi] disks back to normal")

    def test_example_config_needs_filling_in(self):
        with self.assertRaises(self.m.ConfigError) as cm:
            self.m.load_config(EXAMPLE)
        self.assertIn("[smtp] user is not set", str(cm.exception))

        with open(EXAMPLE, "rb") as f:
            conf = f.read().decode("utf-8")
        conf = conf.replace("<your-gmail-address>", "me@example.com")
        conf = conf.replace("<where-to-send-alerts>", "you@example.com")
        fn = os.path.join(self.td, "c.conf")
        with open(fn, "wb") as f:
            f.write(conf.encode("utf-8"))
        cfg = self.m.load_config(fn)
        self.assertEqual(cfg["threshold"], 90)
        self.assertEqual(cfg["repeat_s"], 86400)
        self.assertEqual(
            cfg["disks"],
            [("ssd", "/mnt/ssd"), ("ssd2", "/mnt/ssd2"), ("hdd1", "/mnt/hdd1"), ("hdd2", "/mnt/hdd2"), ("sd-card", "/")],
        )
        sm = cfg["smtp"]
        self.assertEqual(
            (sm["host"], sm["port"], sm["security"], sm["user"], sm["from"], sm["to"]),
            ("smtp.gmail.com", 465, "ssl", "me@example.com", "me@example.com", "you@example.com"),
        )

    def test_dry_run_sends_nothing(self):
        # the real mount table and statvfs: / is always mounted
        fn = os.path.join(self.td, "c.conf")
        with open(fn, "w") as f:
            f.write("[disks]\nroot = /\nnowhere = /no/such/mount\n")
            f.write("[smtp]\nhost = h\nuser = u\nto = t\n")
        sent = []
        self.m.send = lambda *a: sent.append(a)
        try:
            from io import StringIO
        except ImportError:
            from StringIO import StringIO  # type: ignore
        out, so = StringIO(), sys.stdout
        sys.stdout = out
        try:
            rc = self.m.main(["--config", fn, "--dry-run"])
        finally:
            sys.stdout = so
        self.assertEqual(rc, 0)
        self.assertEqual(sent, [])
        self.assertIn("would send: Subject: [", out.getvalue())
        self.assertIn("missing: nowhere", out.getvalue())
        self.assertEqual(os.listdir(self.td), ["c.conf"])

    def test_failed_send_keeps_no_state(self):
        fn = os.path.join(self.td, "c.conf")
        with open(fn, "w") as f:
            f.write("[disks]\nnowhere = /no/such/mount\n[smtp]\nhost = h\nuser = u\nto = t\n")
        pw = os.path.join(self.td, "pw")
        with open(pw, "w") as f:
            f.write("app-password\n")
        state = os.path.join(self.td, "state.json")

        def fail(*a):
            raise OSError("no network")

        got = []
        self.m.send = fail
        args = ["--config", fn, "--state", state, "--password-file", pw]
        so, se = sys.stdout, sys.stderr
        try:
            from io import StringIO

            sys.stdout = sys.stderr = StringIO()
            self.assertEqual(self.m.main(args), 1)
            self.assertFalse(os.path.exists(state))
            self.m.send = lambda smtp, pw, subj, body: got.append((pw, subj))
            self.assertEqual(self.m.main(args), 0)
            self.assertEqual(self.m.main(args), 0)  # remembered: no second mail
        finally:
            sys.stdout, sys.stderr = so, se
        self.assertEqual(len(got), 1)
        self.assertEqual(got[0][0], "app-password")
        self.assertIn("missing: nowhere", got[0][1])
        self.assertTrue(os.path.exists(state))


if __name__ == "__main__":
    unittest.main()
