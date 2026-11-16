#!/usr/bin/env python3
# coding: utf-8
from __future__ import division, print_function, unicode_literals

# fork-only: ?tree on a folder with no path on disk (/home/ with only
# /home/<user> volumes) was refused with 403 (upstream bug, deploy-pi/01)

import json
import os
import shutil
import tempfile
import unittest

from copyparty.authsrv import AuthSrv
from copyparty.httpcli import HttpCli
from tests import util as tu
from tests.util import Cfg

CONF = """
[accounts]
  admin: pw-admin-1
  wayy: pw-wayy-12
  acid: pw-acid-12

[/home/${u}]
  %(td)s/home/${u}
  accs:
    A: ${u}

[/family]
  %(td)s/family
  accs:
    rw: @acct

[/common]
  %(td)s/common
  accs:
    r: @acct
%(extra)s
"""

PW = {"admin": "pw-admin-1", "wayy": "pw-wayy-12", "acid": "pw-acid-12"}


class TestForkTreeVols(unittest.TestCase):
    def log(self, src, msg, c=0):
        pass

    def setUp(self):
        self.conn = None
        self.td = tu.get_ramdisk()
        for d in ("family", "common", "secret", "home/wayy/docs"):
            os.makedirs(os.path.join(self.td, d))
        os.chdir(self.td)

    def tearDown(self):
        if self.conn:
            self.conn.shutdown()
        os.chdir(tempfile.gettempdir())
        shutil.rmtree(self.td)

    def cinit(self, extra=""):
        fn = os.path.join(self.td, "t.conf")
        with open(fn, "w") as f:
            f.write(CONF % {"td": self.td, "extra": extra})
        self.args = Cfg(c=[fn], usernames=True)
        self.asrv = AuthSrv(self.args, self.log)
        self.conn = tu.VHttpConn(self.args, self.asrv, self.log, b"", True)

    def req(self, url, uname=None):
        pw = "PW: %s:%s\r\n" % (uname, PW[uname]) if uname else ""
        h = "GET /%s HTTP/1.1\r\n%sConnection: close\r\n\r\n"
        buf = (h % (url, pw)).encode("utf-8")
        HttpCli(self.conn.setbuf(buf)).run()
        h, b = self.conn.s._reply.split(b"\r\n\r\n", 1)
        return int(h.split(b" ", 2)[1]), b.decode("utf-8")

    def tree(self, url, uname="wayy"):
        st, b = self.req(url, uname)
        self.assertEqual(st, 200, "%s: %s" % (url, b))
        return json.loads(b)

    def test_tree_on_home_lists_own_home_only(self):
        self.cinit()
        for url in ("home/?tree=", "home/?tree=home"):
            jo = self.tree(url)
            home = jo["khome"] if "khome" in jo else jo
            self.assertEqual(home["a"], ["wayy"], url)

    def test_tree_from_root_on_home(self):
        self.cinit()
        jo = self.tree("home/?tree=")
        self.assertEqual(sorted(jo["a"]), ["common", "family"])
        self.assertEqual(jo["khome"]["a"], ["wayy"])

    def test_guest_still_refused(self):
        self.cinit()
        for url in ("home/?tree=", "home/?tree=home"):
            self.assertIn(self.req(url)[0], (401, 403), url)

    def test_folder_without_reachable_volume_refused(self):
        self.cinit("\n[/nothing/deep]\n  %s/secret\n  accs:\n    r: admin\n" % (self.td,))
        self.assertEqual(self.req("nothing/?ls", "wayy")[0], 403)
        for url in ("nothing/?tree=", "nothing/?tree=nothing", "nope/?tree="):
            self.assertEqual(self.req(url, "wayy")[0], 403, url)
        self.assertEqual(self.tree("nothing/?tree=nothing", "admin")["a"], ["deep"])

    def test_unlistcr_hidden_like_ls(self):
        extra = "\n[/home/secret]\n  %s/secret\n  accs:\n    r: wayy\n  flags:\n    unlistcr\n"
        self.cinit(extra % (self.td,))
        st, b = self.req("home/?ls", "wayy")
        self.assertEqual(st, 200)
        self.assertEqual([x["href"] for x in json.loads(b)["dirs"]], ["wayy/"])
        for url in ("home/?tree=", "home/?tree=home"):
            jo = self.tree(url)
            home = jo["khome"] if "khome" in jo else jo
            self.assertEqual(home["a"], ["wayy"], url)

    def test_root_and_real_volume_unchanged(self):
        self.cinit()
        self.assertEqual(self.tree("?tree="), {"a": ["common", "family"]})
        jo = self.tree("home/wayy/?tree=")
        self.assertEqual(jo["a"], ["common", "family"])
        self.assertEqual(jo["khome"], {"a": [], "kwayy": {"a": ["docs"]}})
        self.assertEqual(self.tree("home/wayy/?tree=home/wayy"), {"a": ["docs"]})

    def test_other_requests_on_home_still_refused(self):
        self.cinit()
        for url in ("home/", "home/?zip", "home/?tar", "home/?h"):
            self.assertEqual(self.req(url, "wayy")[0], 403, url)
        self.assertEqual(self.req("home/?ls", "wayy")[0], 200)


if __name__ == "__main__":
    unittest.main()
