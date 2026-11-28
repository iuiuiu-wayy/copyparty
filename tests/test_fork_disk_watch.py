#!/usr/bin/env python3
# coding: utf-8
from __future__ import division, print_function, unicode_literals

# fork-only: contrib/fork-disk-watch, copyparty following an extra disk that
# comes and goes (disk-space ticket 06). The unit's own ExecStart / ExecStop
# lines are run here against a fake systemctl, so what they do on a mount, a
# safe removal and a pulled-out disk is checked without systemd

import errno
import os
import re
import shutil
import subprocess
import sys
import tempfile
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
DIR = os.path.join(os.path.dirname(HERE), "contrib", "fork-disk-watch")
UNIT = os.path.join(DIR, "fork-disk-watch@.service")
RULES = os.path.join(DIR, "90-fork-disks.rules.example")


def which(name):
    for d in os.environ.get("PATH", "").split(os.pathsep):
        p = os.path.join(d, name)
        if os.access(p, os.X_OK):
            return p
    return None


def unit_keys(path):
    """section -> key -> [values], as systemd reads a unit file"""
    ret = {}
    sec = None
    with open(path, "rb") as f:
        for ln in f.read().decode("utf-8").splitlines():
            ln = ln.strip()
            if not ln or ln.startswith("#"):
                continue
            m = re.match(r"^\[(.+)\]$", ln)
            if m:
                sec = ret.setdefault(m.group(1), {})
                continue
            k, v = ln.split("=", 1)
            sec.setdefault(k.strip(), []).append(v.strip())
    return ret


@unittest.skipIf(os.name != "posix", "systemd units")
class TestForkDiskWatch(unittest.TestCase):
    def setUp(self):
        self.u = unit_keys(UNIT)
        self.td = tempfile.mkdtemp()

    def tearDown(self):
        shutil.rmtree(self.td)

    def test_bound_to_its_mount(self):
        un = self.u["Unit"]
        self.assertEqual(un["BindsTo"], ["mnt-%i.mount"])
        self.assertEqual(un["After"], ["mnt-%i.mount"])
        self.assertEqual(un["Before"], ["copyparty.service"])
        self.assertEqual(self.u["Install"]["WantedBy"], ["mnt-%i.mount"])
        sv = self.u["Service"]
        self.assertEqual(sv["Type"], ["oneshot"])
        self.assertEqual(sv["RemainAfterExit"], ["yes"])

    def run_line(self, key, what):
        """run the unit's ExecStart or ExecStop for instance hdd1 as systemd
        would (%i filled in, $$ to $), with a fake systemctl that says the
        mount is backed by `what` and logs every other call"""
        log = os.path.join(self.td, "calls")
        fake = os.path.join(self.td, "systemctl")
        with open(fake, "w") as f:
            f.write("#!/bin/sh\n")
            f.write('if [ "$1" = show ]; then echo "%s"; exit 0; fi\n' % (what,))
            f.write('echo "$*" >> "%s"\n' % (log,))
        os.chmod(fake, 0o755)
        if os.path.exists(log):
            os.unlink(log)

        (line,) = self.u["Service"][key]
        line = line.replace("%i", "hdd1").replace("$$", "$").replace("/bin/systemctl", fake)
        if line.startswith("/bin/sh -c '"):
            argv = ["/bin/sh", "-c", line[len("/bin/sh -c '") : -1]]
        else:
            argv = line.split()
        self.assertEqual(subprocess.call(argv), 0)
        if not os.path.exists(log):
            return []
        with open(log) as f:
            return f.read().splitlines()

    def test_dollars_reach_the_shell(self):
        # systemd expands $VAR in Exec lines itself (to nothing, here); a $ meant
        # for the shell must be written $$, which run_line can't tell apart
        for key in ("ExecStart", "ExecStop"):
            for line in self.u["Service"][key]:
                self.assertIsNone(re.search(r"(?<!\$)\$(?!\$)", line.replace("$$", "")), line)

    def test_mounted_restarts_copyparty(self):
        self.assertEqual(
            self.run_line("ExecStart", "/dev/disk/by-uuid/X"),
            ["--no-block try-restart copyparty.service"],
        )

    def test_safe_removal_restarts_copyparty(self):
        # the disk is still there when its mount stops
        dev = os.path.join(self.td, "by-uuid-X")
        open(dev, "w").close()
        self.assertEqual(self.run_line("ExecStop", dev), ["--no-block try-restart copyparty.service"])

    def test_pulled_out_leaves_copyparty_running(self):
        # the disk is gone already when its mount stops: no restart
        self.assertEqual(self.run_line("ExecStop", os.path.join(self.td, "gone")), [])
        self.assertEqual(self.run_line("ExecStop", ""), [])

    def test_systemd_verifies_the_unit(self):
        sa = which("systemd-analyze")
        if not sa:
            raise unittest.SkipTest("no systemd-analyze")
        fn = os.path.join(self.td, "fork-disk-watch@hdd1.service")
        shutil.copy(UNIT, fn)
        p = subprocess.Popen([sa, "verify", fn], stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
        out = p.communicate()[0].decode("utf-8", "replace")
        # this machine has no /mnt/hdd1 mount; anything else about our file is a finding
        bad = [x for x in out.splitlines() if "fork-disk-watch" in x and "mnt-hdd1.mount not found" not in x]
        self.assertEqual(bad, [], out)

    def test_udev_rule(self):
        with open(RULES, "rb") as f:
            rules = f.read().decode("utf-8")
        lines = [x for x in rules.splitlines() if x and not x.startswith("#")]
        self.assertEqual(len(lines), 3)
        for ln, name in zip(lines, ("ssd2", "hdd1", "hdd2")):
            self.assertIn('ENV{SYSTEMD_WANTS}+="mnt-%s.mount"' % (name,), ln)
            self.assertIn('ENV{ID_FS_UUID}=="<UUID-of-%s>"' % (name,), ln)
            self.assertIn('ACTION!="remove"', ln)
        ua = which("udevadm")
        if not ua:
            return
        fn = os.path.join(self.td, "90-t.rules")
        with open(fn, "w") as f:
            f.write(re.sub(r"<UUID-of-[a-z0-9]+>", "ABCDEF0123456789", rules))
        p = subprocess.Popen([ua, "verify", fn], stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
        out = p.communicate()[0].decode("utf-8", "replace")
        if p.returncode and ("Unknown command" in out or "invalid option" in out):
            raise unittest.SkipTest("udevadm has no verify (systemd < 254)")
        self.assertEqual(p.returncode, 0, out)


if __name__ == "__main__":
    unittest.main()
