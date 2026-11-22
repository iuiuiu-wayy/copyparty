#!/usr/bin/env python3
# coding: utf-8
from __future__ import division, print_function, unicode_literals

# fork-only: the end-to-end harness (tests/e2e/, ./scripts/fork-e2e.sh) is not in
# the pre-commit hook, so the upstream names it leans on are checked here, and so
# is that it stays a dev-only tool outside the server and the sfx build

import json
import os
import re
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
E2E = os.path.join(HERE, "e2e")
TOP = os.path.join(HERE, "..")
CPP = os.path.join(TOP, "copyparty")


def _read(*parts):
    with open(os.path.join(*parts), "rb") as f:
        return f.read()


@unittest.skipUnless(os.path.isdir(E2E), "no tests/e2e (run-tests.sh copy)")
class TestE2eHarness(unittest.TestCase):
    def test_server_names_the_harness_relies_on(self):
        # server.js and fixtures.js log in with the login form's multipart
        # fields and read the cookie it sets, create the grant and the share
        # link through the JSON POSTs (?grant, ?share, 201), upload with PUT,
        # and read ?ls's dirs / files and their href
        py = _read(CPP, "httpcli.py")
        for zb in (
            b'act = self.parser.require("act", 64)',
            b'if act == "login":',
            b'self.parser.require("uname", 64)',
            b'pwd = self.parser.require("cppwd", 64)',
            b'k = "cppws" if self.is_https else "cppwd"',
            b'if "share" in self.uparam:',
            b'if "grant" in self.uparam:',
            b'skey = req["k"]',
            b'vps = req["vp"]',
            b'sexp = req["exp"]',
            b's_get = "get" in req["perms"]',
            b'surl = "created share: ',
            b"self.loud_reply(surl, status=201)",
            b'"href": "%s/" % (x,),',
            b'"dirs": dirs,',
            b"def handle_put(self)",
            b"def handle_delete(self)",
        ):
            self.assertTrue(zb in py, zb)

        # server.js waits after each reload until an upload handshake is no longer
        # refused with 503 while up2k reinitialises (serialReload, settled); scratch
        # folders go with DELETE (above)
        up = _read(CPP, "up2k.py")
        self.assertTrue(b'raise Pebkac(503, SBUSY % ("fs-reload",))' in up)

    def test_harness_has_one_exactly_pinned_dependency(self):
        pkg = json.loads(_read(E2E, "package.json").decode("utf-8"))
        deps = pkg.get("devDependencies", {})
        self.assertEqual(list(deps), ["playwright"])
        self.assertTrue(re.match(r"^\d+\.\d+\.\d+$", deps["playwright"]), deps)
        self.assertNotIn("dependencies", pkg)
        lock = json.loads(_read(E2E, "package-lock.json").decode("utf-8"))
        self.assertEqual(
            lock["packages"]["node_modules/playwright"]["version"], deps["playwright"]
        )

    def test_harness_is_not_in_the_sfx_build(self):
        ls = _read(TOP, "scripts", "sfx.ls").decode("utf-8")
        self.assertNotIn("e2e", ls)
        self.assertNotIn("tests/", ls)

    def test_harness_server_binds_loopback_only(self):
        js = _read(E2E, "server.js")
        self.assertTrue(b"  i: 127.0.0.1\n" in js)
        self.assertTrue(b"s.listen(0, '127.0.0.1'" in js)
