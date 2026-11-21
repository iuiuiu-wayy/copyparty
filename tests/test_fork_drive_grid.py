#!/usr/bin/env python3
# coding: utf-8
from __future__ import division, print_function, unicode_literals

# fork-only, drive-ux: the upstream names the grid view relies on
# (web/forkgrid.js); an upstream rename there would leave the grid empty or
# stale, with no classic view to fall back on (docs/adr/0003)

import os
import unittest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def rd(*p):
    with open(os.path.join(ROOT, *p), "rb") as f:
        return f.read()


class TestForkDriveGrid(unittest.TestCase):
    def assert_all(self, buf, names, where):
        for zb in names:
            self.assertTrue(zb in buf, "%s: %r" % (where, zb))

    def test_browser_names_the_grid_relies_on(self):
        # forkgrid.js switches thegrid.en through its #griden setting (and
        # turns #gridsel off), builds its cards from upstream's tiles
        # (#ggrid > a[ref=<row link id>] > img) after each thegrid.loadsel,
        # which ends every grid load and runs on each msel.selui; it re-syncs
        # its toggle after setvis, gives focus back after the lightbox's
        # onhide (read when bagit runs; hash #g<ref>), keeps #ghead's last
        # span (sort) and selects with msel.origin_tr + selui like a row
        self.assert_all(
            rd("copyparty", "web", "browser.js"),
            (
                b"var thegrid = (function",
                b"gfiles = mknod('div', 'gfiles');",
                b'<div id="ghead" class="ghead">',
                b"</span> <span>' + L.gt_sort + ': ' +",
                b"'<div id=\"ggrid\"></div>'",
                b"r.setvis = function (force) {",
                b"r.loadsel = function () {",
                b"html.push('<a href=\"' + ohref + '\" ref=\"' + ref +",
                b"ihref + '\" /><span' + ac + '>' + ao.innerHTML + '</span></a>');",
                b"r.dirty = false;",
                b"r.bagit('#ggrid');",
                b"r.loadsel();\n\t\taligngriditems();",
                b"duringHide: r.onhide,",
                b"var h = 'g' + this[i].imageElement.getAttribute('ref');",
                b"r.onhide = function () {",
                b"r.imshow = function (url) {",
                b"bcfg_bind(r, 'sel', 'gridsel', false, r.loadsel);",
                b"bcfg_bind(r, 'en', 'griden', dgrid, function (v) {",
                b"var msel = (function",
                b"r.selui = function (reset) {",
                b"\t\tthegrid.loadsel();\n\t\tfileman.render();",
                b"r.origin_tr = function (tr) {",
            ),
            "browser.js",
        )
        self.assert_all(
            rd("copyparty", "web", "util.js"),
            (b"function ctrl(e) {", b"function clmod(el, cls, add) {", b"function clgot(el, cls) {"),
            "util.js",
        )

    def test_grid_loads_after_what_it_uses(self):
        # forkui.list (forklist.js) selects and opens a card as its row, and
        # forkui.rowmenu (forkrowmenu.js) takes right-clicks on it; both map a
        # card to its row through data-fk-ref
        js = rd("copyparty", "web", "fork-browser.js").decode("utf-8")
        for dep in ("forkui.js", "forklist.js", "forkrowmenu.js"):
            self.assertLess(js.index("'%s'" % (dep,)), js.index("'forkgrid.js'"), dep)
        for fn in ("forklist.js", "forkrowmenu.js"):
            self.assert_all(rd("copyparty", "web", fn), (b"data-fk-ref",), fn)
        self.assert_all(rd("copyparty", "web", "forklist.js"), (b"ebi('gfiles').addEventListener(type, fn, true);",), "forklist.js")
        self.assert_all(rd("copyparty", "web", "forkrowmenu.js"), (b"window.forkui.rowmenu = { open: open, menu: M };",), "forkrowmenu.js")


if __name__ == "__main__":
    unittest.main()
