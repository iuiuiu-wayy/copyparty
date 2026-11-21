#!/usr/bin/env python3
# coding: utf-8
from __future__ import division, print_function, unicode_literals

# fork-only: GET /?shares&j, the owner's share links as json (drive-ux ticket 08);
# the same rows and permission checks as the ?shares page

import json
import os
import shutil
import sqlite3
import tempfile
import time
import unittest

from copyparty.authsrv import AuthSrv
from copyparty.httpcli import HttpCli
from copyparty.fork_util import split_names
from tests import util as tu
from tests.util import Cfg

ACCS = ["alice:pa", "bob:pb", "admin:pe"]
PWS = dict(x.split(":") for x in ACCS)


class TestForkSharesJson(unittest.TestCase):
    def log(self, src, msg, c=0):
        pass

    def setUp(self):
        self.td = tu.get_ramdisk()
        td = os.path.join(self.td, "vfs")
        os.mkdir(td)
        os.chdir(td)
        os.mkdir("d1")
        for fn in ("f1", "f 2", "f3"):
            with open("d1/" + fn, "wb") as f:
                f.write(b"x")

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

    def cinit(self, **kw):
        ka = dict(
            a=ACCS,
            v=[".::rw,alice,bob,admin"],
            shr="/shr/",
            shr1="shr/",
            shr_db="a.db",
            shr_v=False,
            shr_adm=split_names("admin"),
        )
        ka.update(kw)
        self.args = Cfg(**ka)
        self.asrv = AuthSrv(self.args, self.log)
        self.conn = tu.VHttpConn(self.args, self.asrv, self.log, b"", True)
        # the stub template lists the share keys the ?shares page would show
        zs = "{% for r in rows %}{{ r[0] }}\n{% endfor %}"
        self.conn.hsrv.j2["shares"] = tu.J2_ENV.from_string(zs)

    def req(self, method, url, un=None, body=b"", hdrs=()):
        if un:
            url += ("&" if "?" in url else "?") + "pw=" + PWS[un]
        msg = ["%s /%s HTTP/1.1" % (method, url), "Connection: close", "Host: a.b"]
        msg += list(hdrs)
        msg += ["Content-Length: %d" % (len(body),), "\r\n"]
        buf = "\r\n".join(msg).encode("utf-8") + body
        HttpCli(self.conn.setbuf(buf)).run()
        h, b = self.conn.s._reply.decode("utf-8").split("\r\n\r\n", 1)
        return int(h.split(" ")[1]), h, b

    def mkshare(self, un, k, vps, exp="99", pw="", perms=("read",)):
        jt = {"k": k, "vp": vps, "pw": pw, "exp": exp, "perms": list(perms)}
        body = json.dumps(jt).encode("utf-8")
        st, _, b = self.req("POST", "?share", un, body, ["Content-Type: text/plain"])
        self.assertEqual(st, 201, b)
        return b.strip()[15:].strip()

    def lst(self, un):
        st, h, b = self.req("GET", "?shares&j", un)
        self.assertEqual(st, 200, b)
        self.assertIn("application/json", h)
        return json.loads(b)

    def test_rows_of_a_folder_and_a_file_link(self):
        self.cinit()
        u1 = self.mkshare("alice", "kfolder", ["/d1/"], pw="secret", perms=("read", "write"))
        u2 = self.mkshare("alice", "kfile", ["/d1/f 2"], exp="")
        t = time.time()

        ret = self.lst("alice")
        self.assertLessEqual(abs(ret["now"] - t), 5)
        rows = dict((r["k"], r) for r in ret["rows"])
        self.assertEqual(sorted(rows), ["kfile", "kfolder"])

        r = rows["kfolder"]
        self.assertEqual(r["vp"], "/d1")
        self.assertEqual(r["files"], [])
        self.assertEqual(r["pw"], True)
        self.assertEqual(r["pr"], "rw")
        self.assertEqual(r["un"], "alice")
        self.assertLessEqual(abs(r["t0"] - t), 5)
        self.assertLessEqual(abs(r["t1"] - (r["t0"] + 99 * 60)), 1)
        # the link the create request answered with
        self.assertEqual(r["url"], u1)
        self.assertEqual(r["url"], "http://a.b/shr/kfolder/")

        r = rows["kfile"]
        self.assertEqual(r["vp"], "/d1")
        self.assertEqual(r["files"], ["f 2"])
        self.assertEqual(r["pw"], False)
        self.assertEqual(r["pr"], "r")
        self.assertEqual(r["t1"], 0)
        self.assertEqual(r["url"], u2)

        # no password hash goes out
        self.assertNotIn("pw=", json.dumps(ret))

    def test_several_files(self):
        self.cinit()
        self.mkshare("alice", "kmany", ["/d1/f1", "/d1/f3"])
        (r,) = self.lst("alice")["rows"]
        self.assertEqual(sorted(r["files"]), ["f1", "f3"])
        self.assertEqual(r["url"], "http://a.b/shr/kmany/")

    def test_same_rows_as_the_page(self):
        self.cinit()
        self.mkshare("alice", "ka1", ["/d1/"])
        self.mkshare("alice", "ka2", ["/d1/f1"])
        self.mkshare("bob", "kb1", ["/d1/"])

        for un in ("alice", "bob", "admin"):
            page = self.req("GET", "?shares", un)[2].split()
            ks = [r["k"] for r in self.lst(un)["rows"]]
            self.assertEqual(sorted(ks), sorted(page), un)

        # an owner sees only their own; the share admin sees everyone's
        self.assertEqual(sorted(r["k"] for r in self.lst("bob")["rows"]), ["kb1"])
        self.assertEqual(len(self.lst("admin")["rows"]), 3)

    def test_revoked_and_expired(self):
        self.cinit()
        self.mkshare("alice", "kgone", ["/d1/"])
        self.mkshare("alice", "kdead", ["/d1/"], exp="1")
        st, _, b = self.req("POST", "?eshare=rm&skey=kgone", "alice")
        self.assertEqual(st, 200, b)

        db = sqlite3.connect("a.db")
        with db:
            db.execute("update sh set t1 = 5 where k = 'kdead'")
        db.close()

        ret = self.lst("alice")
        self.assertEqual([(r["k"], r["t1"]) for r in ret["rows"]], [("kdead", 5)])

    def test_guest_is_refused(self):
        self.cinit()
        self.mkshare("alice", "ka1", ["/d1/"])
        st, _, b = self.req("GET", "?shares&j")
        self.assertEqual(st, 403)
        self.assertNotIn("ka1", b)

    def test_shr_site(self):
        self.cinit(shr_site="https://x.example/")
        u = self.mkshare("alice", "ksite", ["/d1/f1"])
        (r,) = self.lst("alice")["rows"]
        self.assertEqual(r["url"], u)
        self.assertEqual(r["url"], "https://x.example/shr/ksite/f1")

    def test_page_without_j_is_unchanged(self):
        self.cinit()
        self.mkshare("alice", "ka1", ["/d1/"])
        st, h, b = self.req("GET", "?shares", "alice")
        self.assertEqual(st, 200)
        self.assertNotIn("application/json", h)
        self.assertEqual(b.split(), ["ka1"])


if __name__ == "__main__":
    unittest.main()
