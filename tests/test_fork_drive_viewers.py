#!/usr/bin/env python3
# coding: utf-8
from __future__ import division, print_function, unicode_literals

# fork-only, drive-ux: the upstream names the restyled viewers and audio
# player rely on (web/forkview.js); an upstream rename there breaks them
# silently, with no classic view to fall back on (docs/adr/0003)

import os
import unittest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def rd(*p):
    with open(os.path.join(ROOT, *p), "rb") as f:
        return f.read()


class TestForkDriveViewers(unittest.TestCase):
    def assert_all(self, buf, names, where):
        for zb in names:
            self.assertTrue(zb in buf, "%s: %r" % (where, zb))

    def test_baguettebox_names_the_lightbox_bar_relies_on(self):
        # baguetteBox.run is wrapped (called through the object by
        # thegrid.bagit) to follow onChange (this = the gallery, items have
        # imageElement) and afterHide; the overlay is rebuilt after destroy,
        # with these button ids; Close is moved into the bar and keeps its
        # listener (bound to the element) and upstream's focus on show; the
        # rest are clicked from our bar and menu; prev / next hidden by
        # options.buttons on touch. Its focus trap is a capture focus
        # listener on document and its keys a keydown listener on document,
        # which ours run before
        js = rd("copyparty", "web", "baguettebox.js")
        self.assert_all(
            js,
            (
                b"window.baguetteBox = (function () {",
                b"run: run,",
                b"function run(selector, userOptions) {",
                b"buildOverlay();",
                b"overlay = ebi('bbox-overlay');",
                b'<div id="bbox-overlay" role="dialog">',
                b'<button id="bbox-prev" class="bbox-btn"',
                b'<button id="bbox-next" class="bbox-btn"',
                b'<div id="bbox-btns">',
                b'<button id="bbox-help" type="button">',
                b'<button id="bbox-anim" type="button"',
                b'<button id="bbox-readdir" type="button"',
                b'<button id="bbox-rotl" type="button">',
                b'<button id="bbox-rotr" type="button">',
                b'<button id="bbox-tsel" type="button">',
                b'<button id="bbox-full" type="button"',
                b'<button id="bbzoom" type="button"',
                b'<button id="bbox-vmode" type="button"',
                b'<button id="bbox-gopage" type="button"',
                b'<button id="bbox-close" type="button" aria-label="Close">',
                b"bind(btnClose, 'click', hideOverlay);",
                b"bind(btnPrev, 'click', showLeftImage);",
                b"bind(btnNext, 'click', showRightImage);",
                b"bind(document, 'keydown', keyDownHandler);",
                b"bind(document, 'focus', trapFocusInsideOverlay, true);",
                b"btnClose.focus();",
                b"options.onChange.call(currentGallery, currentIndex, imagesElements.length);",
                b"options.afterHide();",
                b"afterHide: null,",
                b"onChange: null,",
                b"bodyClass: 'bbox-open',",
                b"galleryItem.href || imageElement.href",
                b"btnGoPage.style.display = isCbz ? '' : 'none';",
                b"ebi('bbox-vmode').style.display = v ? '' : 'none';",
                b"el.setAttribute('rot', frot);",
                b"document.getElementsByTagName('body')[0].removeChild(ebi('bbox-overlay'));",
            ),
            "baguettebox.js",
        )

    def test_browser_names_the_viewers_rely_on(self):
        # lightbox: thegrid.bagit runs baguetteBox.run with an onChange; in
        # grid view a tile's ref is its row link's id. Text viewer: showfile
        # (files, url, taildoc, wrap, updtree called through the object at
        # the end of render), #bdoc filled once with #hdoc's buttons, the
        # file name in #docname. Share: #fshr hidden where sharing isn't
        # allowed
        js = rd("copyparty", "web", "browser.js")
        self.assert_all(
            js,
            (
                b"r.bagit = function (isrc) {",
                b"var br = baguetteBox.run(isrc, {",
                b"onChange: function (i, maxIdx) {",
                b"this[i].imageElement.getAttribute('ref')",
                b"var showfile = (function () {",
                b"r.files.push({ 'id': link.id, 'name': link.fn });",
                b"var url = r.url = doc[0],",
                b"r.updtree();",
                b"r.updtree = function () {",
                b"el = mknod('span', 'docname');",
                b"var bdoc = ebi('bdoc');",
                b'<div id="hdoc" class="ghead">',
                b'id="xdoc" tt="',
                b'id="dldoc" tt="',
                b'id="prevdoc" tt="',
                b'id="nextdoc" tt="',
                b'id="seldoc" tt="',
                b'id="ppjdoc" tt="',
                b'id="editdoc" tt="',
                b'id="taildoc" tt="',
                b'id="wrapdoc" tt="',
                b'<div id="tailbtns">',
                b"bcfg_bind(r, 'wrap', 'wrapdoc', true, r.tglwrap);",
                b"bcfg_bind(r, 'taildoc', 'taildoc', false, r.tgltail);",
                b"ebi('editdoc').style.display = ",
                b"ebi('dldoc').setAttribute('download', '');",
                b'id="fshr" tt="',
            ),
            "browser.js",
        )

    def test_browser_names_the_player_relies_on(self):
        # widget: open / close / paused (called through the object), the
        # np_open html class; #widgeti holds the canvases (pbar / vbar
        # .onresize) and #pctl's buttons, which ours click; #wtoggle (hidden)
        # carries the np / m3u classes of its copy and playlist buttons.
        # play() is a global, called by bare name, and opens the bar only
        # for the first track; mp.au (osrc) and mp.au2 are Audio elements
        js = rd("copyparty", "web", "browser.js")
        self.assert_all(
            js,
            (
                b"var widget = (function () {",
                b"r.open = function () {",
                b"r.close = function () {",
                b"r.paused = function (paused) {",
                b"clmod(document.documentElement, 'np_open', is_open);",
                b"clmod(widget, 'open', is_open);",
                b"'<div id=\"wtoggle\">' +",
                b"'<div id=\"widgeti\">' +",
                b'<div id="pctl"><a href="#" id="bprev"',
                b'<a href="#" id="bplay"',
                b'<a href="#" id="bnext"',
                b"<canvas id=\"pvol\"",
                b"<canvas id=\"barpos\"></canvas>",
                b"<canvas id=\"barbuf\"></canvas>",
                b'id="npirc" tt="',
                b'id="nptxt" tt="',
                b'id="m3ua" tt="',
                b'id="m3uc" tt="',
                b"clmod(ebi('wtoggle'), 'np', mpl.clip);",
                b"clmod(ebi('wtoggle'), 'm3u', mpl.m3uen);",
                b"var pbar = (function () {",
                b"var vbar = (function () {",
                b"r.onresize = function () {",
                b"function play(tid, is_ev, seek) {",
                b"mp.au = new Audio();\n\t\tmp.au2 = new Audio();\n\t\tmp.set_ev();\n\t\twidget.open();",
                b"function playpause(e) {",
                b"function dl_song() {",
                b"var url = addq(mp.au.osrc, ",
            ),
            "browser.js",
        )

    def test_css_names_the_restyle_overrides(self):
        css = rd("copyparty", "web", "browser.css")
        self.assert_all(
            css,
            (
                b"#bbox-overlay {",
                b"#widget {",
                b"#widget.open {",
                b"#widgeti {",
                b"#barpos,\n#barbuf {",
                b"#pvol {",
                b"#tailbtns {",
                b".full-image img,\n.full-image video {",
            ),
            "browser.css",
        )


if __name__ == "__main__":
    unittest.main()
