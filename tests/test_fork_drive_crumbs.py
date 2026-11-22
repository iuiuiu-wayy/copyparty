#!/usr/bin/env python3
# coding: utf-8
from __future__ import division, print_function, unicode_literals

# fork-only, drive-ux: the upstream names the breadcrumb and folder menu rely on
# (web/forkcrumbs.js); an upstream rename there breaks it silently, with no
# classic view to fall back on (docs/adr/0003)

import os
import unittest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def rd(*p):
    with open(os.path.join(ROOT, *p), "rb") as f:
        return f.read()


class TestForkDriveCrumbs(unittest.TestCase):
    def assert_all(self, buf, names, where):
        for zb in names:
            self.assertTrue(zb in buf, "%s: %r" % (where, zb))

    def test_browser_names_crumbs_rely_on(self):
        # reload_browser (wrapped) rebuilds #path after #entree: an <i> and an
        # <a href> per level, from get_evpath(); #path's onclick navigates on
        # an a[href] ending in '/' (our moved links keep that); treectl sets
        # #path's inline display ('none' while hidden, which the CSS leaves
        # alone); the text viewer appends span#docname. The menu: #fshr hidden
        # by fileman.render (wrapped), #zip1's href is the folder's zip and
        # its display says whether zip is on; perms / have_mv / have_zip /
        # have_shr / in_shr are globals; treectl.goto navigates
        js = rd("copyparty", "web", "browser.js")
        self.assert_all(
            js,
            (
                b"function reload_browser() {",
                b"var parts = get_evpath().split('/'),\n\t\trm = ebi('entree'),",
                b"while (rm.nextSibling)\n\t\trm.parentNode.removeChild(rm.nextSibling);",
                b"o.setAttribute('href', link2);",
                b"ebi('path').appendChild(mknod('i'));\n\t\tebi('path').appendChild(o);",
                b"ebi('path').onclick = function (e) {",
                b"if (!a || !(a = a.getAttribute('href') + '') || !a.endsWith('/'))",
                b"treectl.reqls(a, true);",
                b"ebi('path').style.display = 'none';",
                b"el = mknod('span', 'docname');",
                b"var fileman = (function () {",
                b"r.render = function () {",
                b"bshr = ebi('fshr'),",
                b"clmod(bshr, 'hide', hshr);",
                b"hshr = !can_shr || !get_evpath().indexOf(have_shr);",
                b"ebi('zip1').setAttribute(\"href\",",
                b"ebi('zip1').style.display = zipvis;",
                b"perms = res.perms || [];",
                b"in_shr = have_shr && top.startsWith(SR + have_shr);",
                b"var treectl = (function () {",
                b"r.goto = function (url, push, back) {",
                b"function apply_perms(res) {",
            ),
            "browser.js",
        )

    def test_util_names_crumbs_rely_on(self):
        js = rd("copyparty", "web", "util.js")
        self.assert_all(
            js,
            (
                b"function get_evpath() {",
                b"function hist_replace(url) {",
                b"function has(haystack, needle) {",
                b"function clgot(el, cls) {",
            ),
            "util.js",
        )

    def test_server_globals(self):
        # have_mv / have_zip / have_shr reach the page through js_htm
        py = rd("copyparty", "authsrv.py")
        self.assertIn(b'"have_shr": self.args.shr,', py)
        self.assertIn(b'"have_zip": not self.args.no_zip,', py)
        self.assertIn(b'"have_mv": not self.args.no_mv,', py)

    def test_upstream_path_style(self):
        # upstream styles #path as an inline-block h1; we restyle it
        css = rd("copyparty", "web", "browser.css")
        self.assertIn(b"#path {", css)
        self.assertIn(b'<h1 id="path"', rd("copyparty", "web", "browser.html"))


if __name__ == "__main__":
    unittest.main()
