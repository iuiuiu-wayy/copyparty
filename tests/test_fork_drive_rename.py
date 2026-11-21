#!/usr/bin/env python3
# coding: utf-8
from __future__ import division, print_function, unicode_literals

# fork-only, drive-ux: the upstream names the rename dialog relies on
# (web/forkrename.js); an upstream rename there breaks it silently, with no
# classic view to fall back on (docs/adr/0003)

import os
import unittest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def rd(*p):
    with open(os.path.join(ROOT, *p), "rb") as f:
        return f.read()


class TestForkDriveRename(unittest.TestCase):
    def assert_all(self, buf, names, where):
        for zb in names:
            self.assertTrue(zb in buf, "%s: %r" % (where, zb))

    def test_browser_names_rename_relies_on(self):
        # fileman.rename is wrapped (one item = the dialog, else upstream's
        # batch panel #rui with #rn_new_<n> and #rn_apply); its callers reach
        # it through the fileman object (F2 and the right-click menu), and
        # bren's onclick is re-set to the wrap. Permission: #fren hidden by
        # fileman.render (hren). The request is upstream's own: POST
        # <src>?move=<dir + uricom_enc(name)>, 201 on success. msel: getsel /
        # getall items (id, vp, fn, isd), render after every listing
        # (wrapped to focus the renamed row); treectl.goto reloads; r.tx tells
        # other tabs
        js = rd("copyparty", "web", "browser.js")
        self.assert_all(
            js,
            (
                b"var fileman = (function () {",
                b"var bren = ebi('fren'),",
                b"clmod(bren, 'hide', hren);",
                b"if (clgot(bren, 'hide'))\n\t\t\treturn toast.err(3, L.fr_eperm);",
                b"r.rename = function (e) {",
                b"bren.onclick = r.rename;",
                b"if (k == 'F2')\n\t\treturn fileman.rename();",
                b"case 'rnm': fileman.rename(); break;",
                b"rui = mknod('div', 'rui');",
                b'<input type="text" id="rn_new_\' + a + \'" />',
                b'<button id="rn_apply">',
                b"var dst = base + uricom_enc(f[0].inew.value, false);",
                b"if (this.status !== 201) {",
                b"xhr.open('POST', f[0].src + '?move=' + dst + '&akey=' + abrt_key, true);",
                b"r.tx = function (msg) {",
                b"var msel = (function () {",
                b"r.getsel = function () {",
                b"r.getall = function () {",
                b"item.isd = true;",
                b"item.id = links[a].getAttribute('id');",
                b"item.vp = href.indexOf('/') !== -1 ? href : vbase + href;",
                b"item.fn = uricom_dec(href.split('/').pop());",
                b"\tmsel.render();\n}",
                b"var treectl = (function () {",
                b"r.goto = function (url, push, back) {",
            ),
            "browser.js",
        )

    def test_util_names_rename_relies_on(self):
        js = rd("copyparty", "web", "util.js")
        self.assert_all(
            js,
            (
                b"function vsplit(vp) {",
                b"function uricom_enc(txt, do_fb_enc) {",
                b"function unpre(txt) {",
                b"function get_evpath() {",
                b"function clgot(el, cls) {",
            ),
            "util.js",
        )

    def test_server_move_reply(self):
        # a rename is a move; success is a 201, a refusal's text is shown
        py = rd("copyparty", "httpcli.py")
        self.assertIn(b'dst = self.uparam.get("move")', py)
        self.assertIn(b"self.loud_reply(x.get(), status=201)", py)


if __name__ == "__main__":
    unittest.main()
