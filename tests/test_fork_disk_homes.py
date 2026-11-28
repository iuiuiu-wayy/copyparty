#!/usr/bin/env python3
# coding: utf-8
from __future__ import division, print_function, unicode_literals

# fork-only: every account's home folder holds one folder per extra disk,
# nested per-account volumes ([/home/${u}/hdd1] on another disk), private
# and shareable like the home folder itself (disk-space ticket 01). Config
# only; these tests hold the config's promises

import json
import os
import shutil
import sqlite3
import stat
import tempfile
import unittest

from copyparty.authsrv import AuthSrv
from copyparty.httpcli import HttpCli
from tests import util as tu
from tests.util import Cfg

# the Pi's shape: homes on the first disk, one nested volume per other disk
CONF = """
[groups]
  family: wayy, acid

[accounts]
  admin: pw-admin-1
  wayy: pw-wayy-12
  acid: pw-acid-12

[/home/${u}]
  %(td)s/ssd/home/${u}
  accs:
    A: ${u}
    ra: admin

[/home/${u}/ssd2]
  %(td)s/ssd2/copyparty/home/${u}
  accs:
    A: ${u}
    ra: admin

[/home/${u}/hdd1]
  %(td)s/hdd1/copyparty/home/${u}
  accs:
    A: ${u}
    ra: admin

[/home/${u}/hdd2]
  %(td)s/hdd2/copyparty/home/${u}
  accs:
    A: ${u}
    ra: admin

[/family]
  %(td)s/ssd/family
  accs:
    rwmd: @family
    A: admin
"""

PW = {"admin": "pw-admin-1", "wayy": "pw-wayy-12", "acid": "pw-acid-12"}
DISKS = ("ssd2", "hdd1", "hdd2")


class TestForkDiskHomes(unittest.TestCase):
    def log(self, src, msg, c=0):
        self.logs.append(msg)

    def setUp(self):
        self.conn = None
        self.logs = []
        self.td = tu.get_ramdisk()
        for d in ("ssd/family",) + tuple(d + "/copyparty" for d in DISKS):
            os.makedirs(os.path.join(self.td, d))
        os.chdir(self.td)
        db = sqlite3.connect("shr.db")
        with db:
            zs = r"create table sh (k text, pw text, vp text, pr text, st int, un text, t0 int, t1 int)"
            db.execute(zs)
            db.execute(r"create table sf (k text, vp text)")
        db.close()

    def tearDown(self):
        if self.conn:
            self.conn.shutdown()
        os.chdir(tempfile.gettempdir())
        for d in DISKS:
            os.chmod(os.path.join(self.td, d), 0o755)
        shutil.rmtree(self.td)

    def cinit(self):
        fn = os.path.join(self.td, "t.conf")
        with open(fn, "w") as f:
            f.write(CONF % {"td": self.td})
        self.args = Cfg(
            c=[fn],
            usernames=True,
            harden=True,
            grants="/shared",
            grants_db="g.db",
            shr="/share/",
            shr1="share/",
            shr_db="shr.db",
            shr_v=False,
        )
        self.reload()

    def reload(self):
        if self.conn:
            self.conn.shutdown()
        self.asrv = AuthSrv(self.args, self.log)
        self.conn = tu.VHttpConn(self.args, self.asrv, self.log, b"", True)

    def req(self, method, url, uname=None, body=b"", hdrs=()):
        msg = ["%s /%s HTTP/1.1" % (method, url), "Connection: close", "Host: a.b"]
        if uname:
            msg.append("PW: %s:%s" % (uname, PW[uname]))
        msg += list(hdrs)
        msg += ["Content-Length: %d" % (len(body),), "\r\n"]
        buf = "\r\n".join(msg).encode("utf-8") + body
        HttpCli(self.conn.setbuf(buf)).run()
        h, b = self.conn.s._reply.split(b"\r\n\r\n", 1)
        return int(h.split(b" ", 2)[1]), b

    def ls(self, url, uname):
        """names in a folder listing, folders with a trailing slash"""
        st, b = self.req("GET", url + "?ls", uname)
        if st != 200:
            return st
        jo = json.loads(b)
        return sorted([x["href"] for x in jo["dirs"]] + [x["href"] for x in jo["files"]])

    def put(self, url, uname, data=b"hello"):
        return self.req("PUT", url, uname, data)[0]

    def ap(self, *parts):
        return os.path.join(self.td, *parts)

    def test_every_account_gets_a_folder_on_every_disk(self):
        self.cinit()
        for un in PW:
            for d in DISKS:
                self.assertTrue(os.path.isdir(self.ap(d, "copyparty", "home", un)), (un, d))
            self.assertEqual(self.ls("home/%s/" % (un,), un), ["hdd1/", "hdd2/", "ssd2/"], un)

    def test_files_land_on_their_own_disk(self):
        self.cinit()
        self.assertEqual(self.put("home/wayy/hdd1/a.txt", "wayy"), 201)
        self.assertEqual(self.put("home/wayy/b.txt", "wayy"), 201)
        self.assertTrue(os.path.isfile(self.ap("hdd1", "copyparty", "home", "wayy", "a.txt")))
        self.assertTrue(os.path.isfile(self.ap("ssd", "home", "wayy", "b.txt")))
        self.assertEqual(self.req("GET", "home/wayy/hdd1/a.txt", "wayy"), (200, b"hello"))
        self.assertEqual(self.ls("home/wayy/", "wayy"), ["b.txt", "hdd1/", "hdd2/", "ssd2/"])

    def test_private_but_admin_reads(self):
        self.cinit()
        self.assertEqual(self.put("home/wayy/hdd1/a.txt", "wayy"), 201)
        st, b = self.req("GET", "home/wayy/hdd1/a.txt", "acid")
        self.assertIn(st, (403, 404))
        self.assertNotIn(b"hello", b)
        self.assertIn(self.ls("home/wayy/hdd1/", "acid"), (403, 404))
        self.assertIn(self.put("home/wayy/hdd1/x.txt", "acid"), (403, 404))
        self.assertIn(self.req("GET", "home/wayy/hdd1/a.txt")[0], (401, 403, 404))
        # ra: admin, as on the home folders
        self.assertEqual(self.req("GET", "home/wayy/hdd1/a.txt", "admin"), (200, b"hello"))
        self.assertIn(self.put("home/wayy/hdd1/x.txt", "admin"), (401, 403))

    def grant(self, vp, rcpt, name, perms=("read",)):
        jt = {"vp": vp, "rcpt": rcpt, "name": name, "perms": list(perms)}
        buf = json.dumps(jt).encode("utf-8")
        hdr = ["Content-Type: application/json"]
        st, b = self.req("POST", "?grant", "wayy", buf, hdr)
        if st == 201:
            self.reload()  # what the broker's reload does in a real server
        return st, b

    def test_grants_from_another_disk(self):
        self.cinit()
        self.assertEqual(self.put("home/wayy/hdd1/proj/f.txt", "wayy"), 201)
        self.assertEqual(self.put("home/wayy/hdd2/pics/p.txt", "wayy"), 201)
        self.assertEqual(self.grant("/home/wayy/hdd1/proj/", "acid", "proj")[0], 201)
        st, b = self.grant("/home/wayy/hdd2/pics/", "@family", "pics", ("read", "write"))
        self.assertEqual(st, 201, b)

        self.assertEqual(self.ls("shared/wayy/", "acid"), ["pics/", "proj/"])
        self.assertEqual(self.req("GET", "shared/wayy/proj/f.txt", "acid"), (200, b"hello"))
        self.assertIn(self.put("shared/wayy/proj/up.txt", "acid"), (401, 403))
        self.assertEqual(self.put("shared/wayy/pics/up.txt", "acid"), 201)
        self.assertTrue(os.path.isfile(self.ap("hdd2", "copyparty", "home", "wayy", "pics", "up.txt")))
        self.assertIn(self.ls("shared/wayy/", "admin"), (403, 404))

    def test_share_link_from_another_disk(self):
        self.cinit()
        self.assertEqual(self.put("home/wayy/ssd2/trip/t.txt", "wayy"), 201)
        jt = {"k": "trip-ssd2-key1", "vp": ["/home/wayy/ssd2/trip/"], "pw": "", "exp": "99", "perms": ["read"]}
        body = json.dumps(jt).encode("utf-8")
        st, b = self.req("POST", "?share", "wayy", body, ["Content-Type: text/plain"])
        self.assertEqual(st, 201, b)
        self.reload()
        self.assertEqual(self.req("GET", "share/trip-ssd2-key1/t.txt"), (200, b"hello"))

    def test_absent_disk(self):
        # an unplugged disk in the service's private view: an empty read-only
        # folder (TemporaryFileSystem=/mnt/hdd1:ro), nothing to bind into it
        if hasattr(os, "geteuid") and os.geteuid() == 0:
            raise unittest.SkipTest("root ignores folder permissions")
        shutil.rmtree(self.ap("hdd1"))
        os.mkdir(self.ap("hdd1"))
        os.chmod(self.ap("hdd1"), stat.S_IRUSR | stat.S_IXUSR)
        self.cinit()
        self.assertEqual(os.listdir(self.ap("hdd1")), [])
        self.assertEqual(self.ls("home/wayy/", "wayy"), ["hdd2/", "ssd2/"])
        # refused: 500 "permission denied" here, 403 on a real server (up2k
        # drops the volume's write access)
        self.assertIn(self.put("home/wayy/hdd1/a.txt", "wayy"), (403, 404, 500))
        self.assertEqual(os.listdir(self.ap("hdd1")), [])
        # the rest still works
        self.assertEqual(self.put("home/wayy/hdd2/a.txt", "wayy"), 201)
        self.assertEqual(self.put("home/wayy/a.txt", "wayy"), 201)


if __name__ == "__main__":
    unittest.main()
