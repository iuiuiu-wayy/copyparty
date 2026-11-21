#!/usr/bin/env python3
# coding: utf-8
from __future__ import division, print_function, unicode_literals

# fork-only, drive-ux: the upstream names the account menu relies on
# (web/forkacct.js, and the #chpw focus in web/ctlpanel.js); an upstream
# rename there leaves an entry going nowhere, or the menu showing where
# upstream would hide its own account box or control-panel link

import os
import re
import unittest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
WEB = os.path.join(ROOT, "copyparty", "web")


def rd(*p):
    with open(os.path.join(ROOT, *p), "rb") as f:
        return f.read()


class TestForkDriveAccount(unittest.TestCase):
    def assert_all(self, buf, names, where):
        for zb in names:
            self.assertTrue(zb in buf, "%s: %r" % (where, zb))

    def test_browser_names_the_account_menu_relies_on(self):
        # hidden with ui_noacci (the shell leaves the avatar out) and its
        # Control panel entry with ui_nocpla, both unless ?fullui, copying
        # upstream's own hide tests; Log out posts what #flogout posts
        js = rd("copyparty", "web", "browser.js")
        self.assert_all(
            js,
            (
                b"fullui = /[?&]fullui\\b/.exec(sloc0)",
                b"if (window.ui_noacci || /[?&]noacci\\b/.exec(sloc0)) x += '#acc_info,';",
                b"if (window.ui_nocpla || /[?&]nocpla\\b/.exec(sloc0)) x += '#goh,';",
                b'<form id="flogout" method="post" enctype="multipart/form-data">'
                b'<input type="hidden" name="act" value="logout" />',
            ),
            "browser.js",
        )
        # acct (a guest is "*") and the page's config (have_shr, SR) are globals
        self.assert_all(rd("copyparty", "web", "util.js"), (b"Object.assign(window, window.CGV);",), "util.js")
        self.assert_all(rd("copyparty", "authsrv.py"), (b'"have_shr": self.args.shr',), "authsrv.py")
        py = rd("copyparty", "httpcli.py").decode("utf-8")
        self.assertTrue(re.search(r'cgv = \{[^}]*"acct": self\.uname,', py), 'httpcli.py: "acct" in cgv')

    def test_server_answers_the_menu_entries_rely_on(self):
        # Log out: act=logout to any page; Change password and Control panel:
        # ?h; My share links: ?shares; My grants: ?grants, and the
        # recipients list (?grants=rcpts) tells whether grants are on
        py = rd("copyparty", "httpcli.py")
        self.assert_all(
            py,
            (
                b'if act == "logout":',
                b"return self.handle_logout()",
                b'if act == "chpw":',
                b'"shares" in self.uparam',
                b'if "grants" in self.uparam:',
            ),
            "httpcli.py",
        )
        self.assertIn(b'"rcpts"', rd("copyparty", "fork_grants.py"))

    def test_control_panel_names_the_chpw_focus_relies_on(self):
        # ctlpanel.js builds its change-password form only when the splash
        # page has upstream's #x link (chpw on), under "welcome back" (#un)
        html = rd("copyparty", "web", "splash.html")
        self.assert_all(
            html,
            (
                b'<a id="x" href="#">change password</a>',
                b'<strong id="un">{{ this.uname|e }}</strong>',
                b'<h1 id="cc">other stuff:</h1>',
            ),
            "splash.html",
        )

    def test_the_menu_loads_after_the_shell(self):
        # forkacct.js wires the avatar forkshell.js puts in the top bar
        js = rd("copyparty", "web", "fork-browser.js").decode("utf-8")
        self.assertLess(js.index("'forkshell.js'"), js.index("'forkacct.js'"))
        self.assertNotIn("acclink.js", js)


if __name__ == "__main__":
    unittest.main()
