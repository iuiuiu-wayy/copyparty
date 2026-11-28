#!/usr/bin/env python3
# coding: utf-8
from __future__ import division, print_function, unicode_literals

# fork-only: GET /?disks (page) and /?disks&j (json), how full each disk is
# (disk-space ticket 02)

import json
import os
import shutil
import tempfile
import unittest

from copyparty import fork_disks
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
  %(td)s/ssd/home/${u}
  accs:
    A: ${u}
    ra: admin

[/home/${u}/hdd1]
  %(td)s/hdd1/copyparty/home/${u}
  accs:
    A: ${u}
    ra: admin

[/family]
  %(td)s/ssd/family
  accs:
    rw: @acct
    A: admin
%(fam_flags)s

[/common]
  %(td)s/ssd/common
  accs:
    r: @acct
    A: admin
"""

PW = {"admin": "pw-admin-1", "wayy": "pw-wayy-12", "acid": "pw-acid-12"}
GB = 1024 * 1024 * 1024


class TestForkDisks(unittest.TestCase):
    def log(self, src, msg, c=0):
        pass

    def setUp(self):
        self.conn = None
        self.td = tu.get_ramdisk()
        for d in ("ssd/family", "ssd/common", "hdd1/copyparty"):
            os.makedirs(os.path.join(self.td, d))
        os.chdir(self.td)
        self.real = (fork_disks._dev, fork_disks.get_df)

    def tearDown(self):
        fork_disks._dev, fork_disks.get_df = self.real
        if self.conn:
            self.conn.shutdown()
        os.chdir(tempfile.gettempdir())
        shutil.rmtree(self.td)

    def fake_disks(self):
        """ssd/ is one disk (100 GB, 40 free), hdd1/ another (1000 GB, 900 free)"""
        td = self.td

        def dev(ap):
            os.stat(ap)  # still OSError when the folder is gone
            return 2 if ap.startswith(os.path.join(td, "hdd1")) else 1

        def df(ap, prune):
            if ap.startswith(os.path.join(td, "hdd1")):
                return 900 * GB, 1000 * GB, ""
            return 40 * GB, 100 * GB, ""

        fork_disks._dev, fork_disks.get_df = dev, df

    def cinit(self, fam_flags="", du_who="all"):
        fn = os.path.join(self.td, "t.conf")
        with open(fn, "w") as f:
            f.write(CONF % {"td": self.td, "fam_flags": fam_flags})
        self.args = Cfg(c=[fn], usernames=True)
        self.args.du_who = du_who  # Cfg sets it, so it can't be a keyword
        self.asrv = AuthSrv(self.args, self.log)
        self.conn = tu.VHttpConn(self.args, self.asrv, self.log, b"", True)

    def req(self, url, uname=None):
        pw = "PW: %s:%s\r\n" % (uname, PW[uname]) if uname else ""
        h = "GET /%s HTTP/1.1\r\n%sConnection: close\r\n\r\n"
        buf = (h % (url, pw)).encode("utf-8")
        HttpCli(self.conn.setbuf(buf)).run()
        h, b = self.conn.s._reply.split(b"\r\n\r\n", 1)
        return int(h.split(b" ", 2)[1]), b.decode("utf-8")

    def disks(self, uname):
        st, b = self.req("?disks&j", uname)
        self.assertEqual(st, 200, b)
        return json.loads(b)["disks"]

    def test_json_is_the_disks_you_can_write_to(self):
        self.fake_disks()
        self.cinit()
        want = [
            {"vols": ["/family/", "/home/wayy/"], "free": 40 * GB, "total": 100 * GB},
            {"vols": ["/home/wayy/hdd1/"], "free": 900 * GB, "total": 1000 * GB},
        ]
        self.assertEqual(self.disks("wayy"), want)
        # admin also writes to /common, and only reads the other homes (ra)
        got = self.disks("admin")
        self.assertEqual([d["vols"] for d in got], [
            ["/common/", "/family/", "/home/admin/"],
            ["/home/admin/hdd1/"],
        ])

    def test_page_is_the_disks_you_administer(self):
        self.fake_disks()
        self.cinit()
        st, b = self.req("?disks", "admin")
        self.assertEqual(st, 200, b)
        for vp in ("/common/", "/family/", "/home/acid/", "/home/wayy/hdd1/", "/home/admin/hdd1/"):
            self.assertIn(">%s</a>" % (vp,), b)
        self.assertIn('value="60"', b)  # ssd: 60 of 100 GB used
        self.assertIn('value="10"', b)  # hdd1
        self.assertIn("900 GiB", b)
        self.assertNotIn("not found", b)

        st, b = self.req("?disks", "acid")
        self.assertEqual(st, 200, b)
        self.assertIn(">/home/acid/</a>", b)
        self.assertIn(">/home/acid/hdd1/</a>", b)
        for vp in ("/common/", "/family/", "/home/wayy/"):
            self.assertNotIn(">%s</a>" % (vp,), b)

    def test_guests(self):
        self.cinit()
        self.assertEqual(self.req("?disks&j")[0], 401)
        self.assertEqual(self.req("?disks")[0], 401)

    def test_du_who(self):
        self.fake_disks()
        self.cinit(fam_flags="  flags:\n    du_who: a")
        self.assertEqual([d["vols"] for d in self.disks("wayy")], [["/home/wayy/"], ["/home/wayy/hdd1/"]])
        self.assertIn("/family/", self.disks("admin")[0]["vols"])
        self.conn.shutdown()
        self.cinit(du_who="no")
        self.assertEqual(self.disks("wayy"), [])
        st, b = self.req("?disks", "admin")
        self.assertIn("no disks to show", b)

    def test_missing_folder(self):
        self.fake_disks()
        self.cinit()
        shutil.rmtree(os.path.join(self.td, "hdd1", "copyparty", "home", "wayy"))
        self.assertEqual([d["vols"] for d in self.disks("wayy")], [["/family/", "/home/wayy/"]])
        st, b = self.req("?disks", "admin")
        self.assertIn("not found", b)
        self.assertIn("<li>/home/wayy/hdd1/</li>", b)
        self.assertIn(">/home/acid/hdd1/</a>", b)

    def test_dead_disk(self):
        # a disk pulled out while running: its folder is still in the tree, but
        # every look at it fails (ENOTCONN from a dead FUSE ntfs-3g, EIO from a
        # kernel file system); ticket 06, and scripts/fork-unplug-check.sh for real
        import errno

        self.fake_disks()
        dev = fork_disks._dev

        def dead(ap):
            if os.path.join(self.td, "hdd1") in ap:
                raise OSError(errno.ENOTCONN, "Transport endpoint is not connected")
            return dev(ap)

        self.cinit()
        fork_disks._dev = dead
        self.assertEqual([d["vols"] for d in self.disks("wayy")], [["/family/", "/home/wayy/"]])
        st, b = self.req("?disks", "admin")
        self.assertEqual(st, 200, b)
        for un in ("acid", "admin", "wayy"):
            self.assertIn("<li>/home/%s/hdd1/</li>" % (un,), b)

    def test_no_server_paths_and_real_numbers(self):
        # the real statvfs: everything is on the one ramdisk
        self.cinit()
        got = self.disks("wayy")
        self.assertEqual(len(got), 1)
        self.assertEqual(got[0]["vols"], ["/family/", "/home/wayy/", "/home/wayy/hdd1/"])
        self.assertGreater(got[0]["total"], 0)
        self.assertGreaterEqual(got[0]["total"], got[0]["free"])
        for url in ("?disks&j", "?disks"):
            st, b = self.req(url, "admin")
            self.assertEqual(st, 200)
            self.assertNotIn(self.td, b)
            self.assertNotIn("ssd/", b)


WEB = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "copyparty", "web")


class TestForkDisksScripts(unittest.TestCase):
    def read(self, fn):
        with open(os.path.join(WEB, fn), "rb") as f:
            return f.read()

    def test_names_the_storage_bar_relies_on(self):
        # forkdisks.js (ticket 03) refreshes after upstream's list reload and
        # notes uploads through up2k's card; an upstream rename there leaves
        # the bar stale or never drawn
        for fn, zbs in (
            ("browser.js", [b"function reload_browser() {"]),
            ("up2k.js", [b"up2k_hooks = [],", b"r.ui = pvis;", b"r.addfile = function (entry, sz, draw) {"]),
            ("util.js", [b"function humansize(b, tersity) {"]),
            ("forkshell.js", [b"el('nav', { class: 'fk-nav', 'aria-label': 'Main' }", b"ui.shell.home = guest ? null : home;"]),
        ):
            js = self.read(fn)
            for zb in zbs:
                self.assertIn(zb, js, "%s no longer has %s" % (fn, zb))
        js = self.read("forkdisks.js")
        self.assertIn(b"'/?disks&j'", js)

    def test_control_panel_links_the_page(self):
        js = self.read("ctlpanel.js")
        self.assertIn(b"'/?disks'", js)
        self.assertIn(b"'disk space'", js)
        # it shows the link where the logout button is (logged in)
        self.assertIn(b'id="lo"', self.read("splash.html"))


if __name__ == "__main__":
    unittest.main()
