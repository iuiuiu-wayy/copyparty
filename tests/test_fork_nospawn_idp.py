#!/usr/bin/env python3
# coding: utf-8
from __future__ import division, print_function, unicode_literals

# fork-only: nospawn on a ${u} volume whose folders are missing must not crash _reload

import os
import shutil
import tempfile
import unittest

from copyparty.authsrv import AuthSrv
from copyparty.util import Pebkac
from tests import util as tu
from tests.util import Cfg

CONF = """
[accounts]
  admin: pw-admin-1
  wayy: pw-wayy-12

[/home/${u}]
  %(td)s/home/${u}
  accs:
    A: ${u}
%(hflags)s
%(extra)s
[/common]
  %(td)s/common
  accs:
    r: @acct
"""


class TestForkNospawnIdp(unittest.TestCase):
    def log(self, src, msg, c=0):
        pass

    def setUp(self):
        self.td = tu.get_ramdisk()
        os.mkdir(os.path.join(self.td, "common"))

    def tearDown(self):
        os.chdir(tempfile.gettempdir())
        shutil.rmtree(self.td)

    def build(self, volflag=False, extra="", **ka):
        hflags = "  flags:\n    nospawn\n" if volflag else ""
        fn = os.path.join(self.td, "t.conf")
        with open(fn, "w") as f:
            f.write(CONF % {"td": self.td, "hflags": hflags, "extra": extra})
        return AuthSrv(Cfg(c=[fn], usernames=True, **ka), self.log)

    def home(self, usr):
        return os.path.join(self.td, "home", usr)

    def check_dropped(self, au, users):
        vols = au.vfs.all_vols
        self.assertIn("common", vols)
        for usr in users:
            self.assertNotIn("home/" + usr, vols)
            self.assertFalse(os.path.exists(self.home(usr)))

    def test_global_nospawn_drops_missing_homes(self):
        au = self.build(vol_nospawn=True)
        self.check_dropped(au, ["admin", "wayy"])
        au.reload()
        self.check_dropped(au, ["admin", "wayy"])

    def test_volflag_nospawn_drops_missing_homes(self):
        au = self.build(volflag=True)
        self.check_dropped(au, ["admin", "wayy"])
        au.reload()
        self.check_dropped(au, ["admin", "wayy"])

    def test_existing_home_kept_missing_one_dropped(self):
        os.makedirs(self.home("admin"))
        au = self.build(vol_nospawn=True)
        self.check_dropped(au, ["wayy"])
        vn = au.vfs.all_vols["home/admin"]
        self.assertEqual(vn.realpath, self.home("admin"))
        self.assertIn("admin", vn.axs.uadmin)
        self.assertNotIn("wayy", vn.axs.uread)
        au.reload()
        self.check_dropped(au, ["wayy"])
        self.assertIn("home/admin", au.vfs.all_vols)

    def test_volume_nested_under_dropped_home(self):
        # [/home/${u}/pub] exists on disk but its parent [/home/${u}] was dropped;
        # it stays listed in all_vols yet no lookup can reach it
        sub = "[/home/${u}/pub]\n  %s/pub/${u}\n  accs:\n    r: *\n    A: ${u}\n"
        sub = sub % (self.td,)
        for usr in ["admin", "wayy"]:
            os.makedirs(os.path.join(self.td, "pub", usr))
        au = self.build(volflag=True, extra=sub)
        for _ in range(2):
            self.check_dropped(au, ["admin", "wayy"])
            self.assertIn("home/wayy/pub", au.vfs.all_vols)
            for usr in ["wayy", "*"]:
                with self.assertRaises(Pebkac):
                    au.vfs.get("home/wayy/pub", usr, True, False)
            vn, _ = au.vfs.get("common", "wayy", True, False)
            self.assertEqual(vn.realpath, os.path.join(self.td, "common"))
            au.reload()

    def test_without_nospawn_homes_are_volumes(self):
        au = self.build()
        for usr in ["admin", "wayy"]:
            self.assertIn("home/" + usr, au.vfs.all_vols)


if __name__ == "__main__":
    unittest.main()
