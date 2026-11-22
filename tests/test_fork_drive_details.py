#!/usr/bin/env python3
# coding: utf-8
from __future__ import division, print_function, unicode_literals

# fork-only, drive-ux: the upstream names the Details panel (web/forkdetails.js)
# relies on; an upstream rename there leaves the panel blank or frozen, with no
# classic view to fall back on (docs/adr/0003)

import os
import unittest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def rd(*p):
    with open(os.path.join(ROOT, *p), "rb") as f:
        return f.read()


class TestForkDriveDetails(unittest.TestCase):
    def assert_all(self, buf, names, where):
        for zb in names:
            self.assertTrue(zb in buf, "%s: %r" % (where, zb))

    def test_browser_names_the_details_panel_relies_on(self):
        # it follows the selection by wrapping fileman.render, which msel.selui
        # calls after every selection change, listing and search result; it
        # reads the size from the third cell's sortv (folders and search hits),
        # the date from the th named ts, and offers Share where upstream doesn't
        # hide #fshr; Location opens the folder through treectl.goto
        js = rd("copyparty", "web", "browser.js")
        self.assert_all(
            js,
            (
                b"var fileman = (function () {",
                b"\tr.render = function () {",
                b"\tr.selui = function (reset) {",
                b"\t\tfileman.render();",
                b"bshr = ebi('fshr'),",
                b"clmod(bshr, 'hide', hshr);",
                b"'</a></td><td sortv=\"' + tn.sz + '\">' + filesizefun(tn.sz)];",
                b"'</div></td><td sortv=\"' + sz + '\">' + hsz];",
                b"'<th name=\"ts\"><span>Date</span></th>',",
                b"ln = ln.concat([tn.ext, unix2ui(tn.ts)]).join('</td><td>');",
                b"r.goto = function (url, push, back) {",
            ),
            "browser.js",
        )
        self.assert_all(
            rd("copyparty", "web", "util.js"),
            (
                b"function clgot(el, cls) {",
                b"function uricom_dec(txt) {",
                b"function get_evpath() {",
                b"function noq_href(el) {",
            ),
            "util.js",
        )
        self.assertIn(b'var SR = "{{ r }}",', rd("copyparty", "web", "browser.html"))

    def test_details_loads_after_what_it_builds_on(self):
        # forkui.list / actions (forklist.js), forkui.share.links (forkshare.js)
        # and .people (forkpeople.js) must exist when it runs
        js = rd("copyparty", "web", "fork-browser.js").decode("utf-8")
        for dep in ("forkui.js", "forkshell.js", "forklist.js", "forkshare.js", "forkpeople.js"):
            self.assertLess(js.index("'%s'" % (dep,)), js.index("'forkdetails.js'"), dep)


if __name__ == "__main__":
    unittest.main()
