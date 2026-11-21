#!/usr/bin/env python3
# coding: utf-8
from __future__ import division, print_function, unicode_literals

# fork-only, drive-ux: the upstream names the Drive-style list and selection
# bar rely on (web/forklist.js, and the checkbox names in web/rowsel.js);
# an upstream rename there breaks the look silently, with no classic view
# to fall back on (docs/adr/0003)

import os
import unittest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def rd(*p):
    with open(os.path.join(ROOT, *p), "rb") as f:
        return f.read()


class TestForkDriveList(unittest.TestCase):
    def assert_all(self, buf, names, where):
        for zb in names:
            self.assertTrue(zb in buf, "%s: %r" % (where, zb))

    def test_browser_names_the_list_relies_on(self):
        # selection: the `sel` class on #files rows is the truth; forklist.js
        # sets it and calls msel.selui, reads msel.so (shift origin, set by
        # origin_tr), clears / selects all through msel.evsel, and wraps
        # msel.load to drop the duplicates load(true) leaves after a sort.
        # Its capture-phase click / dblclick listeners on #files run before
        # upstream's #files.onclick (folder links, a[hl] text links) and the
        # td onclick = seltgl that msel.render binds; rows are focusable
        # (tabindex 0 from msel.load). Opening a row clicks the folder link,
        # the lead cell's a.play / a.doc.bri[hl] (every file has an a.doc
        # "-txt-" link; bri marks a known text type), or thegrid.imshow for
        # img_re.
        # Actions go through fileman (render wrapped; delete / cut / cpy /
        # paste / rename called; its .hide classes on #fren #fdel #fcut #fpst
        # #fshr read; fd_warn1 rewritten; fman_clip emptied as paste does),
        # #seldl / #selzip clicked; #wfm #wzip #wfs hidden. Its keys run in a
        # window capture listener ahead of document.onkeydown = ahotkeys.
        # Columns: hidden through filecols.hide (wrapping set_style), which
        # asks once unless chide_ok, and sets td/th class "min"
        js = rd("copyparty", "web", "browser.js")
        self.assert_all(
            js,
            (
                b"var msel = (function () {",
                b"r.load = function (reset) {",
                b"r.selui = function (reset) {",
                b"r.origin_tr = function (tr) {",
                b"r.so = tr2id(tr);",
                b"r.evsel = function (e, fun) {",
                b"clmod(trs[a], 'sel', fun);",
                b"links[a].closest('tr').setAttribute('tabindex', '0');",
                b"tds[a].onclick = r.seltgl;",
                b"ebi('files').onclick = ebi('docul').onclick = function (e) {",
                b"tgt = e.target.closest('a[hl]');",
                b"'\" rel=\"nofollow\" class=\"doc' + (lang ? ' bri' : '') +",
                b'class="play">',
                b"var img_re = ",
                b"r.imshow = function (url) {",
                b"var fileman = (function () {",
                b"var bren = ebi('fren'),",
                b"bdel = ebi('fdel'),",
                b"bcut = ebi('fcut'),",
                b"bpst = ebi('fpst'),",
                b"bshr = ebi('fshr'),",
                b"clmod(bdel, 'hide', hdel);",
                b"r.clip = jread('fman_clip', []).slice(1);",
                b"jwrite('fman_clip', [Date.now()]);",
                b"r.delete = function (e) {",
                b"L.fd_warn1.format(vps.length)",
                b'"fd_warn1": ',
                b"r.cut = function (e) {",
                b"r.cpy = function (e) {",
                b"r.paste = function () {",
                b"r.rename = function (e) {",
                b"r.share = function (e) {",
                b"ebi('seldl').onclick = function (e) {",
                b"ebi('selzip').onclick = function (e) {",
                b'<span id="wfs"></span>',
                b'<span id="wfm"><a',
                b'</span><span id="wzip"><a',
                b"document.onkeydown = ahotkeys;",
                b"r.active = function () {",
                b"shui = mknod('div', 'shui');",
                b"rui = mknod('div', 'rui');",
                b"var filecols = (function () {",
                b"r.set_style = function (unhide) {",
                b"r.hide = function (name) { r.setvis(name, 0); };",
                b'if (!sread("chide_ok")) {',
                b"var cls = has(ohidden, a) ? 'min' : '',",
                b"var ths = QSA('#files>thead th>span');",
                b"'<th name=\"lead\"><span>c</span></th>',",
                b"'<th name=\"href\"><span>File Name</span></th>',",
                b"'<th name=\"sz\" sort=\"int\"><span>Size</span></th>'",
                b"'<th name=\"ts\"><span>Date</span></th>',",
                b"dir1st = sread('dir1st') !== '0';",
            ),
            "browser.js",
        )
        self.assert_all(
            rd("copyparty", "web", "baguettebox.js"),
            (b'<div id="bbox-overlay" role="dialog">', b"clmod(overlay, 'visible', 1);"),
            "baguettebox.js",
        )
        self.assert_all(
            rd("copyparty", "web", "util.js"),
            (
                b"function ctrl(e) {",
                b"MACOS = ",
                b"function cliptxt(txt, ok) {",
                b"r.busy = true;",
                b"function jread(key, fb) {",
                b"function jwrite(key, val) {",
                b"function swrite(key, val) {",
            ),
            "util.js",
        )

    def test_the_list_loads_after_the_helper_and_the_checkboxes(self):
        # it uses window.forkui, and styles rowsel.js's boxes
        js = rd("copyparty", "web", "fork-browser.js").decode("utf-8")
        self.assertLess(js.index("'forkui.js'"), js.index("'forklist.js'"))
        self.assertLess(js.index("'rowsel.js'"), js.index("'forklist.js'"))


if __name__ == "__main__":
    unittest.main()
