#!/usr/bin/env python3
# coding: utf-8
from __future__ import division, print_function, unicode_literals

# fork-only, drive-ux: the upstream names + New and the upload card rely on
# (web/forknew.js); an upstream rename there breaks them silently, with no
# classic view to fall back on (docs/adr/0003)

import os
import unittest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def rd(*p):
    with open(os.path.join(ROOT, *p), "rb") as f:
        return f.read()


class TestForkDriveNew(unittest.TestCase):
    def assert_all(self, buf, names, where):
        for zb in names:
            self.assertTrue(zb in buf, "%s: %r" % (where, zb))

    def test_up2k_names_the_card_relies_on(self):
        # the global up2k (null until init) and its ready hook; uploads go
        # through up2k's own hidden inputs in #u2form (the newest of each kind;
        # their change runs gotfile / gotdir), and a drop through
        # body.ondrop = gotfile; gotfile opens the panel with goto('up2k'),
        # which the card replaces with init_deps (what goto_up2k does); no
        # folder pick on MOBILE. The card reads up2k.ui (U2pvis: tab[n].in
        # q/bz/ok/ng, bd, bt, nh, hp = the reason of a failure) and
        # up2k.st.files[n] (name, purl, srch, t_hashing, t_uploading), wraps
        # ui.addfile, and skips files of a search (entry.srch, uc.fsearch)
        js = rd("copyparty", "web", "up2k.js")
        self.assert_all(
            js,
            (
                b"var up2k = null,",
                b"up2k_hooks = [],",
                b"up2k_hooks[a]();",
                b"function goto_up2k() {",
                b"up2k.init_deps();",
                b'"init_deps": init_deps,',
                b"r.ui = pvis;",
                b"r.st = st;",
                b"r.uc = uc;",
                b"r.addfile = function (entry, sz, draw) {",
                b'"in": \'q\',',
                b'"bt": sz,',
                b'"bd": 0,',
                b'"nh": 0,',
                b"fo.in = newcat;",
                b"fo.bd += delta;",
                b"fo[field] = html;",
                b"field = ['hn', 'ht', 'hp'][field];",
                b"pvis.seth(t.n, 2, err);",
                b"pvis.move(t.n, 'ng');",
                b"if (!QS('#op_up2k.act'))\n            goto('up2k');",
                b"document.body.ondrop = gotfile;",
                b'<input id="file{0}" type="file" name="file{0}[]" multiple="multiple" tabindex="-1" />',
                b'<input id="dir{0}" type="file" name="dir{0}[]" multiple="multiple" tabindex="-1" webkitdirectory />',
                b"ebi('u2form').appendChild(elm);",
                b"ebi('file' + fdom_ctr).onchange = gotfile;",
                b"ebi('dir' + fdom_ctr).onchange = gotdir;",
                b"// phones dont support folder upload\n        if (MOBILE)",
                b"entry.srch = 1;",
                b'"name": name,',
                b'"purl": fdir,',
                b"st.files.push(entry);",
                b"t.t_hashing = Date.now();",
                b"t.t_uploading = Date.now();",
                b"if (uc.ask_up && !uc.fsearch)",
            ),
            "up2k.js",
        )

    def test_browser_names_new_relies_on(self):
        # #u2form is made by browser.js; the global goto (wrapped) is called by
        # bare name from up2k.js; apply_perms sets html.write, which shows
        # + New; perms, rw_edit and re_rw_edit decide what New text file may be
        # called; the toolbar tab of up2k opened by Details
        js = rd("copyparty", "web", "browser.js")
        self.assert_all(
            js,
            (
                b'<form id="u2form" method="post" enctype="multipart/form-data"></form>',
                b"function goto(dest) {",
                b'clmod(de, "write", have_write);',
                b"perms = res.perms || [];",
                b"window.re_rw_edit = new RegExp(",
                b'data-dest="up2k"',
            ),
            "browser.js",
        )
        # upstream's audio bar (the card and + sit above #widget.open) and its
        # toasts (moved up above the card)
        self.assert_all(rd("copyparty", "web", "browser.html"), (b'<div id="widget"></div>',), "browser.html")
        self.assert_all(rd("copyparty", "web", "browser.css"), (b"#widget.open {",), "browser.css")
        self.assert_all(rd("copyparty", "web", "ui.css"), (b"#toast {", b"#toast.top {"), "ui.css")
        self.assert_all(
            rd("copyparty", "web", "util.js"),
            (
                b"function humansize(b, tersity) {",
                b"function unpre(txt) {",
                b"function uricom_dec(txt) {",
                b"function has(haystack, needle) {",
                b"MOBILE = TOUCH,",
            ),
            "util.js",
        )

    def test_server_answers_new_relies_on(self):
        # New folder: POST act=mkdir, 405 when it exists; New text file: POST
        # act=new_md, 500 "that file exists already", and only rw_edit
        # endings without delete
        py = rd("copyparty", "httpcli.py")
        self.assert_all(
            py,
            (
                b"raise Pebkac(405, 'folder \"/%s\" already exists' % (vpath,))",
                b'raise Pebkac(500, "that file exists already")',
                b'if act == "mkdir":',
                b'if act == "new_md":',
                b'vfs.flags["rw_edit"]',
            ),
            "httpcli.py",
        )

    def test_new_loads_after_the_shell(self):
        # forknew.js uses forkshell.js's New button (forkui.newbtn) and opentool
        js = rd("copyparty", "web", "fork-browser.js").decode("utf-8")
        self.assertLess(js.index("'forkshell.js'"), js.index("'forknew.js'"))
        sh = rd("copyparty", "web", "forkshell.js")
        self.assert_all(sh, (b"ui.newbtn = newbtn;", b"ui.opentool = opentool;"), "forkshell.js")


if __name__ == "__main__":
    unittest.main()
