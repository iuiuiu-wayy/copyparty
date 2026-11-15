#!/usr/bin/env python3
# coding: utf-8
from __future__ import division, print_function, unicode_literals

# fork-only: every fork file ships in the single-file build (copyparty-sfx.py),
# which only packs what scripts/sfx.ls lists; checked here so a ticket doesn't
# need a full ./scripts/make-sfx.sh run to show it

import glob
import os
import unittest

import copyparty.fork_grants  # adds the fork's web files to RES

# copyparty.__init__, not copyparty: the server imports it as .__init__, which
# python loads as a separate module with its own RES
from copyparty.__init__ import RES


def _sfx_ls():
    # tests/../scripts in a checkout; run-tests.sh copies only copyparty and
    # tests into ./unt, so there it is one level further up
    here = os.path.dirname(os.path.abspath(__file__))
    for up in ("..", "../.."):
        ap = os.path.join(here, up, "scripts", "sfx.ls")
        if os.path.exists(ap):
            with open(ap, "rb") as f:
                return ap, {x.strip().rstrip(b",").decode("utf-8") for x in f}
    raise Exception("scripts/sfx.ls not found from " + here)


class TestForkSfx(unittest.TestCase):
    def test_web_files_are_in_sfx_ls(self):
        # RES is what /.cpr/w/ serves; a fork web file has to be in it to be
        # served at all, so this covers fork-browser.js, grantbtn.js and friends
        ap, ls = _sfx_ls()
        missing = sorted(x for x in RES if "copyparty/" + x not in ls)
        self.assertEqual(missing, [], "add these to %s" % (ap,))

    def test_fork_modules_are_in_sfx_ls(self):
        ap, ls = _sfx_ls()
        pkg = os.path.dirname(os.path.abspath(copyparty.fork_grants.__file__))
        mods = ["copyparty/" + os.path.basename(x) for x in glob.glob(os.path.join(pkg, "fork_*.py"))]
        self.assertIn("copyparty/fork_grants.py", mods)
        missing = sorted(x for x in mods if x not in ls)
        self.assertEqual(missing, [], "add these to %s" % (ap,))
