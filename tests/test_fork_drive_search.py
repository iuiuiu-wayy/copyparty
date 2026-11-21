#!/usr/bin/env python3
# coding: utf-8
from __future__ import division, print_function, unicode_literals

# fork-only, drive-ux: the upstream names the top bar's search box and its
# chips rely on (web/forksearch.js); an upstream rename there breaks search
# silently, with no classic view to fall back on (docs/adr/0003)

import os
import unittest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def rd(*p):
    with open(os.path.join(ROOT, *p), "rb") as f:
        return f.read()


class TestForkDriveSearch(unittest.TestCase):
    def assert_all(self, buf, names, where):
        for zb in names:
            self.assertTrue(zb in buf, "%s: %r" % (where, zb))

    def test_browser_names_the_search_box_relies_on(self):
        # forksearch.js writes the whole query into upstream's raw field
        # #q_raw and runs it with that field's Enter handler (do_search, as
        # the #q= hash link does), after filling the name and date fields
        # (#srch_<k>v / #srch_<k>c) for the Advanced form; it wraps
        # search_ui.render (count, which query) and reload_browser (results
        # gone), ends a search with the #unsearch link (which restores the
        # folder and calls treectl.show), reads errors from #srch_q's err
        # class. The box shows where the search tab (#opa_srch: read +
        # have_up2k_idx, not on a share link) shows
        js = rd("copyparty", "web", "browser.js")
        self.assert_all(
            js,
            (
                b"var search_ui = (function () {",
                b"o[a].onkeydown = ev_search_keydown;",
                b"if ((e.key + '').endsWith('Enter'))",
                b'<input id="q_raw" type="text" name="q" ',
                b"var hn = \"srch_\" + sconf[a][b][0],",
                b"'<td colspan=\"' + csp + '\"><input id=\"' + hn + 'c\" type=\"checkbox\">\\n' +",
                b"'<br /><input id=\"' + hn + 'v\" type=\"text\" style=\"width:' + sconf[a][b][3] +",
                b'["dtl", "dt_min", L.s_d1, "14", "1997-08-15, 01:00"],',
                b'["dtu", "dt_max", L.s_d2, "14", "2020"]',
                b'["name", "name", L.s_f1, "30", ".exe$"]',
                b"xhr.q_raw = unsmart(ebi('q_raw').value);",
                b'xhr.send(JSON.stringify({ "q": xhr.q_raw, "n": cap }));',
                b"r.render = function (res, xhr, sort) {",
                b"res.hits.length",
                b"res.trunc",
                b'<a href="#" id="unsearch">',
                b"ebi('unsearch').onclick = unsearch;",
                b"treectl.show();\n\t\tset_files_html(orig_html);",
                b"var o = ebi('srch_q');",
                b"clmod(o, 'err', err);",
                b'id="opa_srch" data-perm="read" data-dep="idx" data-dest="search"',
                b"ebi('opa_srch').style.display = 'none';",
                b"r.hidden = true;",
                b"function reload_browser() {",
            ),
            "browser.js",
        )
        self.assert_all(
            rd("copyparty", "web", "browser.html"),
            (b'<div id="srch_q"></div>', b'<div id="srch_form"'),
            "browser.html",
        )
        self.assert_all(
            rd("copyparty", "web", "util.js"),
            (b"function uricom_dec(txt) {", b"function get_evpath() {"),
            "util.js",
        )

    def test_server_query_syntax_the_search_box_writes(self):
        # the query uses ( ) and `or` (the path term: this folder or below,
        # the type term: any of the extensions), `path` as volume + folder,
        # `name like`, `date >=` / `<=` as text dates; the server searches
        # every readable volume, hence the path term
        py = rd("copyparty", "u2idx.py")
        self.assert_all(
            py,
            (
                b'kw_key = ["(", ")", "and ", "or ", "not "]',
                b'v = "trim(?||up.rd,\'/\')"',
                b'v = "up.fn"',
                b'v = "up.mt"',
                b'"%Y-%m-%d %H:%M:%S",',
                b'v = vtop + "/"',
            ),
            "u2idx.py",
        )
        self.assert_all(
            rd("copyparty", "httpcli.py"),
            (b"for vtop in self.rvol:", b"hits, taglist, trunc = idx.search("),
            "httpcli.py",
        )

    def test_search_loads_after_the_frame(self):
        # it uses forkui.shell (the box) from forkshell.js, and puts its
        # chips above forklist.js's selection strip
        js = rd("copyparty", "web", "fork-browser.js").decode("utf-8")
        self.assertLess(js.index("'forkshell.js'"), js.index("'forksearch.js'"))
        self.assertLess(js.index("'forklist.js'"), js.index("'forksearch.js'"))
        sh = rd("copyparty", "web", "forkshell.js")
        self.assertIn(b"ui.shell = { search: search, q: q, opentool: opentool };", sh)
        self.assertIn(b"(ui.shell.onsearch || runsearch)(q.value);", sh)


if __name__ == "__main__":
    unittest.main()
