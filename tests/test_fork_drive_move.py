#!/usr/bin/env python3
# coding: utf-8
from __future__ import division, print_function, unicode_literals

# fork-only, drive-ux: the upstream names the Move to… dialog relies on
# (web/forkmove.js); an upstream rename there would break moving without
# dragging, with no classic view to fall back on (docs/adr/0003)

import os
import unittest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def rd(*p):
    with open(os.path.join(ROOT, *p), "rb") as f:
        return f.read()


class TestForkDriveMove(unittest.TestCase):
    def assert_all(self, buf, names, where):
        for zb in names:
            self.assertTrue(zb in buf, "%s: %r" % (where, zb))

    def test_browser_names_move_to_relies_on(self):
        # forkmove.js maps the rows it is given to msel's items ({id, vp,
        # fn, isd}) through tr2id and msel.getall after msel.load, sends
        # paste's request (POST <vp>?move=<dst>&akey=) per item, refreshes
        # with treectl.goto and tells other tabs with fileman.tx; New folder
        # posts act=mkdir like upstream's and reads X-New-Dir
        self.assert_all(
            rd("copyparty", "web", "browser.js"),
            (
                b"var msel = (function",
                b"r.load = function (reset) {",
                b"r.getall = function",
                b"item.vp = href.indexOf('/') !== -1 ? href : vbase + href;",
                b"item.fn = uricom_dec(href.split('/').pop());",
                b"item.isd = true;",
                b"function tr2id(tr)",
                b"var fileman = (function",
                b"r.tx = function (msg)",
                b"act = r.ccp ? '?copy=' : '?move=',",
                b"'&akey=' + abrt_key",
                b"var treectl = (function",
                b"r.goto = function",
                b"var dn = this.getResponseHeader('X-New-Dir');",
            ),
            "browser.js",
        )
        self.assert_all(
            rd("copyparty", "web", "util.js"),
            (
                b"function randstr(len) {",
                b"function uricom_enc(txt, do_fb_enc) {",
                b"function uricom_dec(txt) {",
                b"function get_evpath() {",
                b"function has(haystack, needle) {",
                b"function unpre(txt) {",
            ),
            "util.js",
        )
        self.assert_all(
            rd("copyparty", "httpcli.py"),
            (
                b'if "move" in self.uparam:',
                b'if act == "mkdir":',
                b'self.out_headers["X-New-Dir"] = quotep(self.args.RS + vpath)',
            ),
            "httpcli.py",
        )

    def test_move_to_loads_after_what_it_uses(self):
        # forkui.actions / forkui.list (forklist.js), forkui.views.shared
        # (forkviews.js) and forkui.shell.home (forkshell.js); it restyles
        # dragmove.js's drop target (fmv-hl) and drag image (fmv-img)
        js = rd("copyparty", "web", "fork-browser.js").decode("utf-8")
        for dep in ("forkshell.js", "dragmove.js", "forklist.js", "forkviews.js"):
            self.assertLess(js.index("'%s'" % (dep,)), js.index("'forkmove.js'"), dep)
        self.assert_all(rd("copyparty", "web", "forklist.js"), (b"var A = ui.actions = ui.actions || {};",), "forklist.js")
        self.assert_all(rd("copyparty", "web", "forkviews.js"), (b"ui.views = { shared: shared",), "forkviews.js")
        self.assert_all(rd("copyparty", "web", "forkshell.js"), (b"ui.shell.home = guest ? null : home;",), "forkshell.js")
        self.assert_all(
            rd("copyparty", "web", "dragmove.js"),
            (b"clmod(hl, 'fmv-hl', 1);", b"img.className = 'fmv-img';", b"ptr == 'mouse' &&"),
            "dragmove.js",
        )


if __name__ == "__main__":
    unittest.main()
