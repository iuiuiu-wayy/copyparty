#!/usr/bin/env python3
# coding: utf-8
from __future__ import division, print_function, unicode_literals

# fork-only, drive-ux: the upstream names the Drive-style frame relies on
# (web/forkui.js, web/forkshell.js, and the landing in web/ctlpanel.js);
# an upstream rename there breaks the look silently, with no classic view
# to fall back on (docs/adr/0003)

import os
import unittest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
WEB = os.path.join(ROOT, "copyparty", "web")


def rd(*p):
    with open(os.path.join(ROOT, *p), "rb") as f:
        return f.read()


class TestForkDriveShell(unittest.TestCase):
    def assert_all(self, buf, names, where):
        for zb in names:
            self.assertTrue(zb in buf, "%s: %r" % (where, zb))

    def test_browser_names_the_shell_relies_on(self):
        # forkshell.js hides #ops and opens its tabs by clicking them (opclick,
        # which goto()s and stores opmode), reads which are shown from their
        # inline display (apply_perms) and closes through #opa_x; wraps the
        # global goto, apply_perms and reload_browser and treectl's gentab and
        # rendertree; entree/detree once to load the tree, which it shows in
        # the nav; trims the tree by its li>a+a markup; must not put the tree
        # in an <li> (reload_tree walks up with closest('li')); guards
        # window.onpopstate (treectl.onpopfun) in forkui.js; fills the name
        # search (#srch_namev); switches a dark theme to flat light (3)
        js = rd("copyparty", "web", "browser.js")
        self.assert_all(
            js,
            (
                b'<a href="#" id="opa_x" data-dest=""',
                b'data-dest="search"',
                b'data-dest="unpost"',
                b'data-dest="up2k"',
                b'data-dest="bup"',
                b'data-dest="mkdir"',
                b'data-dest="new_md"',
                b'data-dest="msg"',
                b'data-dest="player"',
                b'data-dest="cfg"',
                b"function opclick(e) {",
                b"function goto(dest) {",
                b"clmod(document.documentElement, 'op_open', dest);",
                b"o[a].style.display = display;",
                b"ebi('opa_srch').style.display = 'none';",
                b"function apply_perms(res) {",
                b"function reload_browser() {",
                b"var treectl = (function () {",
                b"r.entree = function (e, nostore) {",
                b"r.detree = function (e, nw) {",
                b"r.gentab = function (top, res) {",
                b"r.rendertree = function (res, ts, top0, dst, rst) {",
                b"r.goto = function (url, push, back) {",
                b"QSA('#treeul li>a+a')",
                b"act = act.parentNode.parentNode.closest('li')",
                b"window.onpopstate = treectl.onpopfun;",
                b"in_shr = have_shr && top.startsWith(SR + have_shr)",
                b'["name", "name", L.s_f1,',
                b'var hn = "srch_" + sconf[a][b][0],',
                b"o[a].oninput = ev_search_input;",
                b"var settheme = (function () {",
                b"r.go = function (i) {",
                b"'flat light'",
                b"light = !!(theme.indexOf('y') + 1);",
                b'<div><select id="themes"></select></div>',
                b"fullui = /[?&]fullui\\b/.exec(sloc0)",
                b"window.ui_nombar || /[?&]nombar\\b/.exec(sloc0)",
                b"window.ui_noacci || /[?&]noacci\\b/.exec(sloc0)",
                b"window.ui_nocpla || /[?&]nocpla\\b/.exec(sloc0)",
            ),
            "browser.js",
        )
        # names it reads from util.js and the page's config (CGV1)
        self.assert_all(rd("copyparty", "web", "util.js"), (b"function get_evpath()", b"TOUCH = "), "util.js")
        self.assert_all(
            rd("copyparty", "authsrv.py"),
            (b'"s_name": self.args.bname', b'"have_shr": self.args.shr'),
            "authsrv.py",
        )

    def test_browser_page_names_the_shell_relies_on(self):
        # the meta viewport it sets to scale 1, and the tab panels it closes
        # with its own button
        html = rd("copyparty", "web", "browser.html")
        self.assert_all(
            html,
            (b'<meta name="viewport"', b'<div id="op_mkdir" class="opview', b'<h1 id="path">', b'<div id="tree">'),
            "browser.html",
        )

    def test_control_panel_names_the_landing_relies_on(self):
        # ctlpanel.js sends a bare / to /home/<name>/ when the splash page
        # (html#ht_spl, #un = the account) lists it under "you can browse"
        # (#f) or "you can upload to" (#g); SR is the --rp-loc prefix
        html = rd("copyparty", "web", "splash.html")
        self.assert_all(
            html,
            (
                b'id="ht_spl"',
                b'<strong id="un">{{ this.uname|e }}</strong>',
                b'<h1 id="f">you can browse:</h1>',
                b'<h1 id="g">you can upload to:</h1>',
                b'<li><a href="{{ r }}{{ mp }}{{ url_suf }}">{{ mp }}</a></li>',
                b'var SR="{{ r }}",',
            ),
            "splash.html",
        )

    def test_the_helper_loads_before_the_shell(self):
        # every drive-ux script uses window.forkui, so it is loaded first
        js = rd("copyparty", "web", "fork-browser.js").decode("utf-8")
        self.assertLess(js.index("'forkui.js'"), js.index("'forkshell.js'"))


if __name__ == "__main__":
    unittest.main()
