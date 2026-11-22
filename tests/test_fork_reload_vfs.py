#!/usr/bin/env python3
# coding: utf-8
from __future__ import division, print_function, unicode_literals

# fork-only: a reload must publish asrv.vfs only once its volumes are final.
# up2k (reinitialising after an earlier reload) reads asrv.vfs.all_vols at any
# moment; it used to see the share link volumes there, which have no "dbd"
# volflag yet, and its rescan thread died with KeyError: 'dbd', leaving every
# upload refused ("server busy with fs-reload") until a restart

import json
import os
import shutil
import sqlite3
import tempfile
import unittest

from copyparty.authsrv import AuthSrv
from copyparty.httpcli import HttpCli
from tests import util as tu
from tests.util import Cfg


class _Watched(AuthSrv):
    """records what anyone reading self.vfs would see the moment it is set"""

    seen = None

    @property
    def vfs(self):
        return self.__dict__["vfs"]

    @vfs.setter
    def vfs(self, v):
        self.__dict__["vfs"] = v
        if self.seen is not None:
            self.seen.append(dict(v.all_vols))


class TestForkReloadVfs(unittest.TestCase):
    def log(self, src, msg, c=0):
        pass

    def setUp(self):
        self.td = tu.get_ramdisk()
        td = os.path.join(self.td, "vfs")
        os.mkdir(td)
        os.chdir(td)
        os.mkdir("d1")
        db = sqlite3.connect("a.db")
        with db:
            zs = r"create table sh (k text, pw text, vp text, pr text, st int, un text, t0 int, t1 int)"
            db.execute(zs)
            db.execute(r"create table sf (k text, vp text)")
        db.close()
        self.conn = None

    def tearDown(self):
        if self.conn:
            self.conn.shutdown()
        os.chdir(tempfile.gettempdir())
        shutil.rmtree(self.td)

    def test_published_vfs_has_no_share_volumes(self):
        args = Cfg(a=["alice:pa"], v=[".::rw,alice"], shr="/shr/", shr1="shr/", shr_db="a.db", shr_v=False)
        asrv = _Watched(args, self.log)
        self.conn = tu.VHttpConn(args, asrv, self.log, b"", True)
        body = json.dumps({"k": "k1", "vp": ["/d1/"], "pw": "", "exp": "", "perms": ["read"]})
        body = body.encode("utf-8")
        hdr = "POST /?share&pw=pa HTTP/1.1\r\nConnection: close\r\n"
        hdr += "Content-Type: text/plain\r\nContent-Length: %d\r\n\r\n"
        HttpCli(self.conn.setbuf((hdr % (len(body),)).encode("utf-8") + body)).run()
        self.assertIn(b" 201 ", self.conn.s._reply.split(b"\r\n")[0])

        asrv.seen = []
        asrv.reload()
        self.assertTrue(asrv.seen, "the reload no longer sets asrv.vfs")
        self.assertIn("k1", asrv.vfs.nodes["shr"].nodes)
        for vols in asrv.seen:
            self.assertEqual(sorted(vols), [""])
            for vp, vol in vols.items():
                self.assertIn("dbd", vol.flags, "/%s has no dbd" % (vp,))


if __name__ == "__main__":
    unittest.main()
