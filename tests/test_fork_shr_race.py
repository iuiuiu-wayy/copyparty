#!/usr/bin/env python3
# coding: utf-8
from __future__ import division, print_function, unicode_literals

# fork-only: a share link revoked while a reload runs must not break the
# reload. AuthSrv._reload reads the share table twice; a link deleted in
# between (?eshare=rm runs outside the reload mutex) left a node with no
# source, and the reload died with "cannot unpack non-iterable NoneType"

import json
import os
import shutil
import sqlite3
import tempfile
import unittest

from copyparty import authsrv as authsrv_mod
from copyparty.authsrv import AuthSrv
from copyparty.httpcli import HttpCli
from tests import util as tu
from tests.util import Cfg


class _Cur(object):
    """a cursor that deletes share `k` right before the second full read of
    the share table, as a revoke from another thread would"""

    def __init__(self, cur, state):
        self._cur = cur
        self._st = state

    def execute(self, q, *a):
        if q == "select * from sh":
            self._st["n"] += 1
            if self._st["n"] == 2:
                db = self._st["connect"](self._st["path"])
                with db:
                    db.execute("delete from sh where k = ?", (self._st["k"],))
                db.close()
        self._cur.execute(q, *a)
        return self

    def __iter__(self):
        return iter(self._cur)

    def __getattr__(self, k):
        return getattr(self._cur, k)


class _Db(object):
    def __init__(self, db, state):
        self._db = db
        self._st = state

    def cursor(self):
        return _Cur(self._db.cursor(), self._st)

    def __enter__(self):
        self._db.__enter__()
        return self

    def __exit__(self, *a):
        return self._db.__exit__(*a)

    def __getattr__(self, k):
        return getattr(self._db, k)


class TestForkShrRace(unittest.TestCase):
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
        self.connect = authsrv_mod.sqlite3.connect

    def tearDown(self):
        authsrv_mod.sqlite3.connect = self.connect
        if self.conn:
            self.conn.shutdown()
        os.chdir(tempfile.gettempdir())
        shutil.rmtree(self.td)

    def test_link_revoked_during_reload(self):
        args = Cfg(a=["alice:pa"], v=[".::rw,alice"], shr="/shr/", shr1="shr/", shr_db="a.db", shr_v=False)
        asrv = AuthSrv(args, self.log)
        self.conn = tu.VHttpConn(args, asrv, self.log, b"", True)
        for k in ("kstay", "kgone"):
            body = json.dumps({"k": k, "vp": ["/d1/"], "pw": "", "exp": "", "perms": ["read"]})
            body = body.encode("utf-8")
            hdr = "POST /?share&pw=pa HTTP/1.1\r\nConnection: close\r\n"
            hdr += "Content-Type: text/plain\r\nContent-Length: %d\r\n\r\n"
            HttpCli(self.conn.setbuf((hdr % (len(body),)).encode("utf-8") + body)).run()
            self.assertIn(b" 201 ", self.conn.s._reply.split(b"\r\n")[0])

        connect = self.connect
        st = {"n": 0, "k": "kgone", "path": os.path.abspath("a.db"), "connect": connect}

        def racy(*a, **ka):
            db = connect(*a, **ka)
            return _Db(db, st) if a and a[0].endswith("a.db") else db

        authsrv_mod.sqlite3.connect = racy
        asrv.reload()
        authsrv_mod.sqlite3.connect = self.connect

        self.assertEqual(st["n"], 2, "the reload no longer reads the share table twice")
        shv = asrv.vfs.nodes["shr"]
        self.assertEqual(sorted(shv.nodes), ["kstay"])


if __name__ == "__main__":
    unittest.main()
