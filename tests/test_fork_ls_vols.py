#!/usr/bin/env python3
# coding: utf-8
from __future__ import division, print_function, unicode_literals

# fork-only: text listings (?ls=v / ?ls=t / ?ls=txt) of a folder with no path
# on disk, listed by HttpCli.tx_ls_vols (upstream bug, ticket upstream-bugs/01)

import json
import os
import shutil
import tempfile
import unittest

from copyparty.authsrv import AuthSrv
from copyparty.httpcli import HttpCli
from tests import util as tu
from tests.util import Cfg


class TestForkLsVols(unittest.TestCase):
    def log(self, src, msg, c=0):
        pass

    def setUp(self):
        self.conn = None
        self.td = tu.get_ramdisk()
        td = os.path.join(self.td, "vfs")
        os.mkdir(td)
        os.chdir(td)
        os.makedirs("a/proj")
        with open("a/f.txt", "wb") as f:
            f.write(b"hello")

    def tearDown(self):
        if self.conn:
            self.conn.shutdown()
        os.chdir(tempfile.gettempdir())
        shutil.rmtree(self.td)

    def cinit(self, **ka):
        self.args = Cfg(a=["alice:alice", "bob:bob"], v=["a:home/alice:A,alice"], **ka)
        self.reload()

    def reload(self):
        if self.conn:
            self.conn.shutdown()
        self.asrv = AuthSrv(self.args, self.log)
        self.conn = tu.VHttpConn(self.args, self.asrv, self.log, b"", True)

    def req(self, method, url, uname, extra="", body=b""):
        h = "%s /%s HTTP/1.1\r\nPW: %s\r\nConnection: close\r\n%s\r\n"
        buf = (h % (method, url, uname, extra)).encode("utf-8") + body
        HttpCli(self.conn.setbuf(buf)).run()
        h, b = self.conn.s._reply.split(b"\r\n\r\n", 1)
        return int(h.split(b" ", 2)[1]), h.decode("utf-8"), b.decode("utf-8")

    def assert_text_listing(self, url, uname, child):
        st, h, b = self.req("GET", url, uname)
        self.assertEqual(st, 200, "%s: %s" % (url, b))
        self.assertIn("Content-Type: text/plain", h)
        self.assertIn("# acct: %s" % (uname,), b)
        self.assertIn("%s/" % (child,), b)
        return b

    def test_text_listing_of_root_and_home(self):
        self.cinit()
        for url, child in (
            ("?ls=v", "home"),
            ("?ls=t", "home"),
            ("?ls=txt", "home"),
            ("home/?ls=v", "alice"),
            ("home/?ls=t", "alice"),
        ):
            self.assert_text_listing(url, "alice", child)

    def test_plain_text_line_has_epoch_date_and_zero_size(self):
        self.cinit()
        b = self.assert_text_listing("?ls=t", "alice", "home")
        self.assertEqual(b.rstrip("\n").split("\n")[-1], "1970-01-01 00:00:00  0  home/")

    def test_json_listing_unchanged(self):
        self.cinit()
        st, _, b = self.req("GET", "?ls", "alice")
        self.assertEqual(st, 200)
        jo = json.loads(b)
        self.assertEqual(
            sorted(jo.keys()),
            ["acct", "dirs", "files", "logues", "perms", "readmes", "srvinf", "taglist"],
        )
        self.assertEqual([x["href"] for x in jo["dirs"]], ["home/"])
        for x in jo["dirs"]:
            self.assertNotIn("name", x)
            self.assertNotIn("dt", x)

    def test_real_volume_listing_unchanged(self):
        self.cinit()
        b = self.assert_text_listing("home/alice/?ls=v", "alice", "proj")
        self.assertIn("f.txt", b)
        self.assertNotIn("1970-01-01", b)

    def test_grants_shared_text_listing(self):
        self.cinit(grants="/shared", grants_db="g.db")
        jt = {"vp": "/home/alice/proj/", "rcpt": "bob", "name": "proj", "perms": ["read"]}
        buf = json.dumps(jt).encode("utf-8")
        hdr = "Content-Type: application/json\r\nContent-Length: %d\r\n" % (len(buf),)
        self.assertEqual(self.req("POST", "?grant", "alice", hdr, buf)[0], 201)
        self.reload()
        self.assert_text_listing("shared/?ls=t", "bob", "alice")
        self.assert_text_listing("shared/alice/?ls=v", "bob", "proj")


if __name__ == "__main__":
    unittest.main()
