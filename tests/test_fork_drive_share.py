#!/usr/bin/env python3
# coding: utf-8
from __future__ import division, print_function, unicode_literals

# fork-only, drive-ux: the upstream names the Share dialog relies on
# (web/forkshare.js); an upstream rename there breaks sharing silently, with
# no classic view to fall back on (docs/adr/0003)

import os
import re
import unittest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def rd(*p):
    with open(os.path.join(ROOT, *p), "rb") as f:
        return f.read()


class TestForkDriveShare(unittest.TestCase):
    def assert_all(self, buf, names, where):
        for zb in names:
            self.assertTrue(zb in buf, "%s: %r" % (where, zb))

    def test_browser_names_the_share_dialog_relies_on(self):
        # forkshare.js replaces fileman.share (upstream's hotkey calls it
        # through the object) and #fshr's onclick (which holds the unwrapped
        # function); it shows Share only where fileman.render leaves #fshr
        # without its hide class (can_shr: logged in, shr_who); it offers the
        # link roles the folder's perms (from apply_perms) allow
        js = rd("copyparty", "web", "browser.js")
        self.assert_all(
            js,
            (
                b"var fileman = (function () {",
                b"r.share = function (e) {",
                b"bshr = ebi('fshr'),",
                b"bshr.onclick = r.share;",
                b"case 'shr': fileman.share(); break;",
                b"hshr = !can_shr || !get_evpath().indexOf(have_shr);",
                b"clmod(bshr, 'hide', hshr);",
                b"perms = res.perms || [];",
                b"var msel = (function () {",
            ),
            "browser.js",
        )
        # the key rule the link-name field copies from upstream's share form
        self.assertIn(b"v2 = v.replace(/[^0-9a-zA-Z-]/g, '_');", js)

        # helpers from util.js; acct and SR are globals because util.js
        # copies the page's CGV onto window
        js = rd("copyparty", "web", "util.js")
        self.assert_all(
            js,
            (
                b"function noq_href(el) {",
                b"function uricom_dec(txt) {",
                b"function get_evpath() {",
                b"function hunpre(txt) {",
                b"function randstr(len) {",
                b"function has(haystack, needle) {",
                b"Object.assign(window, window.CGV);",
                b"var toast = (function () {",
            ),
            "util.js",
        )

    def test_server_names_the_share_dialog_relies_on(self):
        # the create request (POST /?share, text/plain json: k vp pw exp
        # perms; 201 on success, a 400 text otherwise), the revoke request
        # (POST /?eshare=rm&skey=), and the json list hooked into the
        # account-wide dispatch next to ?shares
        py = rd("copyparty", "httpcli.py").decode("utf-8")
        self.assert_all(
            py,
            (
                'if "share" in self.uparam:',
                'if "eshare" in self.uparam:',
                'skey = req["k"]',
                'vps = req["vp"]',
                'pw = req.get("pw") or ""',
                'sexp = req["exp"]',
                's_rd = "read" in req["perms"]',
                's_wr = "write" in req["perms"]',
                'self.loud_reply(surl, status=201)',
                'skey = self.uparam.get("skey") or self.vpath.split("/")[-1]',
                'if act == "rm":',
                'if "shares" in self.uparam and "j" in self.uparam:',
                "return tx_shares_json(self)  # fork",
            ),
            "httpcli.py",
        )
        self.assertTrue(
            re.search(r'cgv = \{[^}]*"acct": self\.uname,', py),
            'httpcli.py no longer puts "acct" in cgv',
        )


if __name__ == "__main__":
    unittest.main()
