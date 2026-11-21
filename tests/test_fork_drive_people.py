#!/usr/bin/env python3
# coding: utf-8
from __future__ import division, print_function, unicode_literals

# fork-only, drive-ux: the upstream names the Share dialog's Add people part
# (web/forkshare.js) and the grant folders' "no share links" listing config
# (fork_grants.py, _no_links_cfg) rely on; an upstream rename there breaks
# them silently, with no classic view to fall back on (docs/adr/0003)

import os
import unittest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def rd(*p):
    with open(os.path.join(ROOT, *p), "rb") as f:
        return f.read()


class TestForkDrivePeople(unittest.TestCase):
    def assert_all(self, buf, names, where):
        for zb in names:
            self.assertTrue(zb in buf, "%s: %r" % (where, zb))

    def test_browser_names_add_people_relies_on(self):
        # Add people offers the rights the folder's perms (apply_perms) allow,
        # and is only reachable where Share is: can_shr, worked out from the
        # listing's shr_who (?ls copies cfg onto res; the page's CGV1 onto
        # window), which a grant folder sets to "no"
        js = rd("copyparty", "web", "browser.js")
        self.assert_all(
            js,
            (
                b"Object.assign(res, res.cfg);",
                b"shr_who = res.shr_who || shr_who;",
                b"can_shr = acct != '*' && (have_read || have_write) && (",
                b"(shr_who == 'auth'));",
                b"perms = res.perms || [];",
            ),
            "browser.js",
        )
        self.assert_all(
            rd("copyparty", "web", "util.js"),
            (b"Object.assign(window, window.CGV1);", b"function has(haystack, needle) {"),
            "util.js",
        )
        self.assertIn(b"CGV1 = {{ cgv1 }},", rd("copyparty", "web", "browser.html"))

    def test_server_names_the_grant_folders_listing_relies_on(self):
        # _no_links_cfg copies a volume's js_ls (a dict with shr_who) and its
        # js_htm (json, html-escaped by json_hesc); httpcli sends them as the
        # listing's cfg and the page's cgv1, and reads sb_lg from js_ls
        py = rd("copyparty", "authsrv.py").decode("utf-8")
        self.assert_all(
            py,
            (
                "            vn.js_ls = {",
                '                "shr_who": vf["shr_who"],',
                "            vn.js_htm = json_hesc(json.dumps(js_htm))",
                "mount_grants(self, vfs, acct)  # fork: last, once all volumes are final",
            ),
            "authsrv.py",
        )
        self.assertEqual(py.count('"shr_who": vf["shr_who"],'), 2, "authsrv.py: js_ls and js_htm")

        py = rd("copyparty", "httpcli.py").decode("utf-8")
        self.assert_all(
            py,
            (
                '"cfg": vn.js_ls,',
                '"cgv1": vn.js_htm,',
                # the json list rides on the grants page's own dispatch
                'if "grants" in self.uparam:\n                return tx_grants(self)  # fork',
            ),
            "httpcli.py",
        )
        self.assertIn(
            'return s.replace("<", "\\\\u003c")', rd("copyparty", "util.py").decode("utf-8")
        )


if __name__ == "__main__":
    unittest.main()
