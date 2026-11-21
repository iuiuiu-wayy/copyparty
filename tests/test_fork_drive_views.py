#!/usr/bin/env python3
# coding: utf-8
from __future__ import division, print_function, unicode_literals

# fork-only, drive-ux: the upstream names the views that aren't folders rely on
# (web/forkviews.js: Shared with me, Recent uploads); an upstream rename there
# leaves a view empty or its nav entry hidden for everyone

import os
import re
import unittest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def rd(*p):
    with open(os.path.join(ROOT, *p), "rb") as f:
        return f.read()


class TestForkDriveViews(unittest.TestCase):
    def assert_all(self, buf, names, where):
        for zb in names:
            self.assertTrue(zb in buf, "%s: %r" % (where, zb))

    def test_server_answers_recent_uploads_relies_on(self):
        # ?ru at the root, as JSON with &j: {ups: [{vp, sz, at, un}]}; at is 0
        # and un "(?)" where the server hides them (shown blank); a filter
        # starting with ^ is a prefix match (the probe's "^//" matches nothing)
        py = rd("copyparty", "httpcli.py").decode("utf-8")
        self.assertIn('if "ru" in self.uparam:\n                return self.tx_rups()', py)
        self.assertIn('ret2 = {"now": int(now), "filter": sfilt, "ups": ret}', py)
        self.assertIn('if "j" in self.ouparam:', py)
        self.assertIn('raise Pebkac(500, "listing of recent uploads is disabled in server config")', py)
        for k in ("vp", "sz", "at", "un"):
            self.assertIn('"%s": %s,' % (k, k), py)
        self.assertIn('rv["at"] = 0', py)
        self.assertIn('rv["un"] = "(?)"', py)
        self.assertIn('vp = "/" + "/".join(x for x in [vol.vpath, rd, fn] if x)', py)
        self.assertIn('sfilt = self.uparam.get("filter") or ""', py)
        u = rd("copyparty", "util.py").decode("utf-8")
        self.assertTrue(re.search(r'a = txt\.startswith\("\^"\)[\s\S]*return 2, txt\[1:\]  # \^', u), "util.py: str_anchor ^")

    def test_server_answers_shared_with_me_relies_on(self):
        # the root of a server with no volume at / lists its top folders
        # (relative hrefs ending in /), so does /home/; the grants folder's
        # name comes from ?grants=rcpts
        py = rd("copyparty", "httpcli.py").decode("utf-8")
        self.assertIn("def tx_ls_vols(self) -> bool:", py)
        self.assertIn('"href": "%s/" % (x,),', py)
        self.assertIn(b'"top": grants_top(cli.args)', rd("copyparty", "fork_grants.py"))

    def test_browser_names_the_views_rely_on(self):
        js = rd("copyparty", "web", "util.js")
        self.assert_all(
            js,
            (b"function vsplit(vp) {", b"function uricom_dec(txt) {", b"function humansize(b, tersity) {", b"window.unix2ui = "),
            "util.js",
        )
        self.assertIn(b"r.goto = function (url, push, back) {", rd("copyparty", "web", "browser.js"))

    def test_the_views_load_after_the_shell(self):
        # forkviews.js fills the views forkshell.js makes (forkui.shell)
        js = rd("copyparty", "web", "fork-browser.js").decode("utf-8")
        self.assertLess(js.index("'forkshell.js'"), js.index("'forkviews.js'"))
        self.assertIn(b"ui.shell = {", rd("copyparty", "web", "forkshell.js"))


if __name__ == "__main__":
    unittest.main()
