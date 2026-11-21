#!/usr/bin/env python3
# coding: utf-8
from __future__ import division, print_function, unicode_literals

# fork-only, drive-ux: the upstream names the row menu relies on
# (web/forkrowmenu.js), and that it still offers every entry of upstream's
# right-click menu; an upstream rename or a new entry there would otherwise
# go unnoticed, with no classic view to fall back on (docs/adr/0003)

import os
import re
import unittest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# upstream's right-click menu entries (#rcm, by id) -> the row menu's label
# for it; a separator has None. A new upstream entry fails the test below
# until it is offered in forkrowmenu.js and named here
RCM = {
    "ropn": "Open",
    "rply": "Play",
    "rpla": "Play as audio",
    "rtxt": "Open as text",
    "rmd": "Open in markdown viewer",
    "rwopi": "Open in office editor",
    "rs1": None,
    "rcpl": "Copy link",
    "rdl": "Download",
    "rzip": "Download as zip",
    "rs2": None,
    "rdel": "Delete",
    "rcut": "Cut",
    "rcpy": "Copy",
    "rpst": "Paste",
    "rrnm": "Rename",
    "rs3": None,
    "rnfo": "New folder",
    "rnfi": "New text file",
    "rs4": None,
    "rsal": "Select all",
    "rsin": "Invert selection",
    "rshr": "Share this folder",
}


def rd(*p):
    with open(os.path.join(ROOT, *p), "rb") as f:
        return f.read()


class TestForkDriveRowMenu(unittest.TestCase):
    def assert_all(self, buf, names, where):
        for zb in names:
            self.assertTrue(zb in buf, "%s: %r" % (where, zb))

    def test_every_upstream_right_click_entry_is_offered(self):
        js = rd("copyparty", "web", "browser.js").decode("utf-8")
        i0 = js.index("ebi('rcm').innerHTML = (")
        i1 = js.index(");", i0)
        ids = re.findall(r'id="(r[a-z0-9]+)"', js[i0:i1])
        self.assertEqual(sorted(ids), sorted(RCM.keys()))
        mine = rd("copyparty", "web", "forkrowmenu.js").decode("utf-8")
        for k, label in RCM.items():
            if label:
                self.assertIn("'%s'" % (label,), mine, k)

    def test_browser_names_the_row_menu_relies_on(self):
        # forkrowmenu.js works a row out as rcm's show() does (the lead
        # cell's first node: no id = text file, id prefix = kind, "(" first =
        # video), opens with play() / thegrid.imshow / showfile.show / ?v /
        # ?wopi=, copies the link with cliptxt, clicks #seldl / #selzip /
        # #fgrant, calls fileman cut / cpy / paste / share and reads the hide
        # classes fileman.render sets on #fren #fdel #fcut #fpst #fshr; new
        # folder / file click rcm's own #rnfo / #rnfi (its mktemp name box)
        # where they exist, else goto('mkdir' / 'new_md'). Its contextmenu
        # listener runs in the capture phase on #wrap, ahead of upstream's
        # #wrap.oncontextmenu, and follows rcm's settings: rcm_en (bcfg, off
        # = the browser's menu), rcm_db, Shift, ?doc=; on MOBILE rcm is a
        # bare {enabled: false} (no settings). Rows come from msel.render
        # (wrapped, as are msel.selui and filecols.set_style); a grid tile's
        # `ref` names its row's link. perms says whether the folder is
        # writable; wopi_set the office-editor extensions
        js = rd("copyparty", "web", "browser.js")
        self.assert_all(
            js,
            (
                b"var rcm = (function () {",
                b"if (MOBILE)\n\t\treturn {enabled: false}",
                b"bcfg_bind(r, 'enabled', 'rcm_en', drcm.charAt(0)=='y');",
                b"bcfg_bind(r, 'double', 'rcm_db', drcm.charAt(1)=='y');",
                b"ebi('wrap').oncontextmenu = function(e) {",
                b"if (!r.enabled || e.shiftKey || (r.double && menu.style.display) || /doc=/.exec(location.search)) {",
                b"var lead = file.firstChild.firstChild;",
                b"if (lead.id === undefined)",
                b"selFile.type = lead.innerHTML[0] == '(' ? 'gf' : lead.id.split('-')[0];",
                b"selFile.path = basenames(selFile.url).replace(/(&|\\?)v/, '');",
                b"case 'ply': selFile.type == 'gf' ? thegrid.imshow(selFile.name) : play('f-' + selFile.id); break;",
                b"case 'pla': play('f-' + selFile.id); break;",
                b"case 'txt': showfile.show(selFile.name); break;",
                b"case 'md': location = selFile.path + (has(selFile.path, '?') ? '&v' : '?v'); break;",
                b"case 'wopi': window.open('?wopi=' + selFile.name, '_blank').focus(); break;",
                b"case 'nfo': mktemp(true); break;",
                b"case 'nfi': mktemp(); break;",
                b"var opts = QSA('#rcm a');",
                b"opts[i].onclick = function(e) {",
                b"(has(perms, \"write\") ?",
                b"data.set(\"act\", is_dir ? \"mkdir\" : \"new_md\");",
                b"var row = mknod('tr', 'rcm_tmp',",
                b"var wopi_set = !window.have_wopi ? null :",
                b"function play(tid, is_ev, seek) {",
                b"r.imshow = function (url) {",
                b"var showfile = (function () {",
                b"r.show = function (url, no_push) {",
                b"var ref = ebi(target.getAttribute('ref'));",
                b"r.render = function () {",
                b"hren = !(have_mv && has(perms, 'write') && has(perms, 'move')),",
                b"hdel = !(have_del && has(perms, 'delete')),",
                b"hcut = !(have_mv && has(perms, 'move')),",
                b"hpst = !(have_mv && has(perms, 'write')),",
                b"hshr = !can_shr || !get_evpath().indexOf(have_shr);",
                b"if (!(enren || endel || encut || enpst))",
                b"r.share = function (e) {",
                b"r.cut = function (e) {",
                b"r.cpy = function (e) {",
                b"function apply_perms(res) {",
                b"perms = res.perms || [];",
                b"function goto(dest) {",
                b'data-dest="mkdir"',
                b'data-dest="new_md"',
            ),
            "browser.js",
        )
        self.assert_all(
            rd("copyparty", "web", "util.js"),
            (
                b"function basenames(txt) {",
                b"function vsplit(vp) {",
                b"function cliptxt(txt, ok) {",
                b"function has(haystack, needle) {",
                b"function ctrl(e) {",
            ),
            "util.js",
        )
        self.assert_all(rd("copyparty", "web", "grantbtn.js"), (b"btn = mknod('a', 'fgrant');",), "grantbtn.js")

    def test_the_row_menu_loads_after_the_list(self):
        # it uses forkui.list and forkui.actions, which forklist.js sets
        js = rd("copyparty", "web", "fork-browser.js").decode("utf-8")
        self.assertLess(js.index("'forklist.js'"), js.index("'forkrowmenu.js'"))
        lst = rd("copyparty", "web", "forklist.js")
        self.assert_all(
            lst,
            (
                b"var A = ui.actions = ui.actions || {};",
                b"closest('.rsel,.fk-own')",
                b"window.forkui.list = {",
            ),
            "forklist.js",
        )


if __name__ == "__main__":
    unittest.main()
