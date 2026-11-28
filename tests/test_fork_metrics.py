#!/usr/bin/env python3
# coding: utf-8
from __future__ import division, print_function, unicode_literals

# fork-only: with --harden, /.cpr/metrics (--stats) answers only accounts in
# --stats-u; upstream lets in any account with `a` on some volume, which is
# every account when each has A on its home folder (disk-space ticket 05)

import os
import shutil
import tempfile
import unittest

from copyparty.authsrv import AuthSrv
from copyparty.httpcli import HttpCli
from copyparty.metrics import Metrics
from tests import util as tu
from tests.util import Cfg


class TestForkMetrics(unittest.TestCase):
    def log(self, src, msg, c=0):
        pass

    def setUp(self):
        self.conn = None
        self.td = tu.get_ramdisk()
        os.chdir(self.td)
        os.mkdir("alice")

    def tearDown(self):
        if self.conn:
            self.conn.shutdown()
        os.chdir(tempfile.gettempdir())
        shutil.rmtree(self.td)

    def cinit(self, harden):
        self.args = Cfg(
            a=["alice:pw-alice-1", "metrics:pw-metrics-1", "bob:pw-bob-123"],
            v=["alice:home/alice:A,alice"],
            # stats off: past the gate, upstream refuses with its own message, so
            # the test server (no broker or counters) never builds the page
            stats=False,
            harden=harden,
        )
        self.args.stats_u = "metrics"
        self.args.stats_u_set = set(["metrics"])
        if self.conn:
            self.conn.shutdown()
        self.asrv = AuthSrv(self.args, self.log)
        self.conn = tu.VHttpConn(self.args, self.asrv, self.log, b"", True)
        self.conn.hsrv.metrics = Metrics(self.conn.hsrv)  # the test server has none

    def gate(self, un):
        """whether the account gets past the gate"""
        st, b = self.get(un)
        self.assertEqual(st, 403, b)
        if b"not allowed for user" in b:
            return False
        self.assertIn(b"the stats feature is not enabled in server config", b)
        return True

    def get(self, un):
        pw = "PW: pw-%s\r\n" % ("alice-1" if un == "alice" else "metrics-1" if un == "metrics" else "bob-123",)
        buf = ("GET /.cpr/metrics HTTP/1.1\r\n%sConnection: close\r\n\r\n" % (pw,)).encode("utf-8")
        HttpCli(self.conn.setbuf(buf)).run()
        h, b = self.conn.s._reply.split(b"\r\n\r\n", 1)
        return int(h.split(b" ", 2)[1]), b

    def test_upstream_rule_without_harden(self):
        # alice has A on her home folder, metrics is in --stats-u, bob neither
        self.cinit(False)
        self.assertTrue(self.gate("alice"))
        self.assertTrue(self.gate("metrics"))
        self.assertFalse(self.gate("bob"))

    def test_harden_needs_stats_u(self):
        self.cinit(True)
        self.assertFalse(self.gate("alice"))
        self.assertTrue(self.gate("metrics"))
        self.assertFalse(self.gate("bob"))


if __name__ == "__main__":
    unittest.main()
