"use strict";

// fork-only, drive-ux: the row menu; see FORK.md.
// Every row of the list gets a ⋮ (on hover on a desktop, always on a touch screen) that opens
// the item's actions; a right-click (or Shift+F10 / the context-menu key on a focused row)
// opens the same menu at the pointer, in place of upstream's right-click menu (#rcm), with
// every entry that one had. On a phone the menu is a bottom sheet. On a row that is part of
// the selection it acts on the whole selection; on any other row, on that row alone: on a
// desktop that row becomes the selection (as in Drive), on a touch screen the selection is
// given back once the menu closes, so a ⋮ doesn't leave the list in selection mode.
// A right-click on the empty space of the list gives the folder's entries (paste, new
// folder, new file, select all, share this folder), as upstream's did.
// Upstream's settings for its menu still hold: off in Settings (rcm_en) leaves the browser's
// own menu, Shift+right-click gives the browser's, and rcm_db a second right-click.
// Built on forkui.js (menu) and forklist.js (forkui.list, forkui.actions), loaded before it.
// Share, Move to…, Rename, Details, Download and Delete call forkui.actions, as the selection
// bar does. API for later scripts:
//   forkui.rowmenu.open(tr, src, fromKeyboard)   open it for a row (null: the folder);
//                         src as forkui.menu's open: { from, x, y } (a grid tile's ⋮, say)
//   forkui.rowmenu.menu   the forkui.menu behind it

(function () {
    var ui = window.forkui;
    if (!ui || !ui.ok || !ui.list || !ui.actions || !window.msel || !window.fileman || !window.L ||
        !ebi('files') || !ebi('wrap'))
        return;

    var el = ui.el,
        LS = ui.list,
        A = ui.actions,
        de = document.documentElement,
        files = ebi('files'),
        tgt = null,         // the row the menu is open for; null: the folder
        restore = null,     // touch: the selection to give back once it closes
        kept = false,       // an entry that changes the selection on purpose was picked
        ptype = 'mouse',    // the pointer of the last pointerdown
        kbopen = 0;         // when the keyboard last opened it (its contextmenu event follows)

    de.classList.add('fk-rmenu');

    document.addEventListener('pointerdown', function (e) {
        ptype = e.pointerType || 'mouse';
    }, true);

    function rowof(t) {
        var tr = t && t.closest && t.closest('#files tbody tr');
        return tr && !tr.classList.contains('srch_hdr') && tr.cells[1] &&
            tr.cells[1].querySelector('a[id]') ? tr : null;
    }

    function link(tr) {
        return tr.cells[1].querySelector('a[id]');
    }

    function hid(id) {
        var b = ebi(id);
        return !b || clgot(b, 'hide');
    }

    // what the row is, worked out as upstream's right-click menu does (rcm's show): a folder,
    // or from the lead cell's first node: no id, a text file ("tf"); else its id says the
    // kind ("af" audio, "tf" text), and a "(" first marks a video ("gf")
    function info(tr) {
        var a = link(tr),
            url = a.href,
            u = url.split('?')[0],
            vsp = vsplit(u),
            o = {
                url: url, path: basenames(url).replace(/(&|\?)v/, ''), name: vsp[1],
                type: null, id: null, ext: null
            };
        if (/\/$/.test(u))
            o.type = 'dir';
        else {
            var lead = tr.cells[0].firstChild;
            if (!lead || lead.id === undefined)
                o.type = 'tf';
            else {
                o.id = lead.id.split('-')[1];
                o.type = lead.innerHTML[0] == '(' ? 'gf' : lead.id.split('-')[0];
            }
            var di = o.name.lastIndexOf('.');
            o.ext = di < 1 ? null : o.name.slice(di + 1).toLowerCase();
        }
        return o;
    }

    // without forknew.js: upstream's new folder / new file, its name box in the list where its
    // menu has one (a folder writable when the page loaded, and not a touch device), else its
    // own panel
    function mknew(dir) {
        var b = ebi(dir ? 'rnfo' : 'rnfi');
        if (b && window.rcm && 'double' in rcm)
            return b.click();
        goto(dir ? 'mkdir' : 'new_md');
    }

    function items() {
        var tr = tgt && document.contains(tgt) ? tgt : null,
            f = tr && info(tr),
            n = LS.rows(true).length,
            any = LS.rows().length,
            clip = fileman.clip && fileman.clip.length,
            srch = LS.insrch(),
            wr = has(perms, 'write'),
            ret = [],
            grp = [];

        function add(ok, label, ico, fn, keep) {
            if (ok)
                grp.push({
                    label: label, icon: ico, select: function () {
                        kept = !!keep;
                        fn();
                    }
                });
        }
        function group() {
            if (grp.length && ret.length)
                ret.push({ sep: true });
            ret = ret.concat(grp);
            grp = [];
        }

        if (f) {
            add(true, 'Open', null, function () { LS.open(tr); });
            add(f.type == 'gf' || f.type == 'af', 'Play', null, function () {
                if (f.type == 'gf')
                    thegrid.imshow(f.name);
                else
                    play('f-' + f.id);
            });
            add(f.type == 'gf', 'Play as audio', null, function () { play('f-' + f.id); });
            add(f.id, 'Open as text', null, function () { showfile.show(f.name); });
            add(f.ext == 'md', 'Open in markdown viewer', null, function () {
                location = f.path + (has(f.path, '?') ? '&v' : '?v');
            });
            add(window.wopi_set && f.ext && wopi_set.has(f.ext), 'Open in office editor', null, function () {
                window.open('?wopi=' + f.name, '_blank').focus();
            });
        }
        group();
        add(n, 'Download', 'download', function () { LS.act('download'); });
        add(n && window.have_zip && !srch, 'Download as zip', null, function () { ebi('selzip').click(); });
        add(n && !hid('fshr'), 'Share', 'share', function () { LS.act('share'); });
        add(n && !hid('fgrant'), 'Share with people', 'people', function () { ebi('fgrant').click(); });
        add(f, 'Copy link', 'link', function () {
            cliptxt(f.url, function () { toast.ok(2, L.clipped); });
        });
        group();
        add(n && !hid('fcut'), 'Move to…', 'move', function () { LS.act('move'); });
        add(n && !hid('fren'), 'Rename', null, function () { LS.act('rename'); });
        add(n, 'Copy', null, function () { LS.clip('cpy'); });
        add(n && !hid('fcut'), 'Cut', null, function () { LS.clip('cut'); });
        add(clip && !hid('fpst'), 'Paste', 'paste', function () { LS.paste(); });
        add(n && A.details, 'Details', null, function () { LS.act('details'); });
        group();
        // + New's entries (forknew.js: New folder, File upload, Folder upload, New text file)
        if (ui.create && !srch)
            grp = grp.concat(ui.create.items(M.from()));
        else {
            add(wr && !srch, 'New folder', 'plus', function () { mknew(true); });
            add(wr && !srch, 'New text file', null, function () { mknew(false); });
        }
        group();
        add(any, 'Select all', null, function () { msel.evsel({}, 'add'); }, true);
        add(any, 'Invert selection', null, function () { msel.evsel({}, 't'); }, true);
        add(!n && !hid('fshr'), 'Share this folder', 'share', function () { fileman.share({}); });
        group();
        add(n && !hid('fdel'), 'Delete', 'delete', function () { LS.act('delete'); });
        group();
        return ret;
    }

    var M = ui.menu({
        label: 'Actions', dense: true, items: items,
        title: function () {
            return tgt ? link(tgt).textContent : 'This folder';
        },
        onclose: finish
    });

    // the menu closed: the row loses its mark, and a touch screen gets its selection back
    function finish() {
        if (tgt)
            clmod(tgt, 'fk-mrow', false);
        if (restore && !kept)
            LS.only(restore.filter(function (r) { return document.contains(r); }));
        tgt = restore = null;
        kept = false;
    }

    function open(tr, src, fromKeyboard) {
        if (M.isOpen())
            M.close(true);
        finish();
        tgt = tr || null;
        if (tr) {
            if (!clgot(tr, 'sel')) {
                restore = ptype == 'touch' ? LS.rows(true) : null;
                LS.only([tr]);
                msel.origin_tr(tr);
            }
            clmod(tr, 'fk-mrow', true);
        }
        M.open(fromKeyboard, src);
    }

    // ---- the ⋮ on each row, in the lead cell after upstream's first node (which its own
    // code reads) and rowsel.js's checkbox; class fk-own keeps forklist.js's row clicks off it

    function onmore(e) {
        e.preventDefault();
        e.stopPropagation();
        var b = this;
        // a press on the ⋮ of the open menu light-dismissed it already: stay closed
        if (M.from() == b && (M.isOpen() || Date.now() - M.shut() < 300))
            return M.close();
        open(b.closest('tr'), { from: b }, e.detail === 0);
    }

    function sync() {
        var trs = LS.rows();
        for (var a = 0; a < trs.length; a++) {
            var tr = trs[a],
                lnk = tr.cells[1] && tr.cells[1].querySelector('a[id]');
            if (!lnk || !tr.cells[0])
                continue;
            var b = tr.cells[0].querySelector('.fk-rmore');
            if (!b) {
                b = el('button', {
                    type: 'button', class: 'fk-ibtn fk-rmore fk-own', tabindex: '-1',
                    'aria-haspopup': 'menu', 'aria-expanded': 'false',
                    on: { click: onmore, dblclick: function (e) { e.stopPropagation(); } }
                }, ui.icon('more'));
                tr.cells[0].appendChild(b);
            }
            var lbl = 'Actions for ' + lnk.textContent;
            if (b.getAttribute('aria-label') != lbl) {
                b.setAttribute('aria-label', lbl);
                b.title = 'More actions';
            }
        }
    }

    function after(obj, name) {
        var orig = obj && obj[name];
        if (!orig)
            return;
        obj[name] = function () {
            var ret = orig.apply(this, arguments);
            sync();
            return ret;
        };
    }
    after(msel, 'render');
    after(msel, 'selui');
    if (window.filecols)
        after(filecols, 'set_style');

    // ---- right-click, ahead of upstream's #wrap.oncontextmenu

    function upstreamOff() {
        return window.rcm && 'double' in rcm && !rcm.enabled;
    }

    ebi('wrap').addEventListener('contextmenu', function (e) {
        // a long-press on a touch screen selects (forklist.js)
        if (ptype == 'touch' && e.pointerType !== 'mouse')
            return;
        if (M.isOpen() && Date.now() - kbopen < 600) {
            e.preventDefault();
            e.stopPropagation();
            return;
        }
        var t = e.target;
        if (upstreamOff() || e.shiftKey || /doc=/.test(location.search) ||
            (t.closest && t.closest('input,textarea,select,[contenteditable]')) ||
            (window.rcm && rcm.double && M.isOpen())) {
            if (M.isOpen())
                M.close(true);
            e.stopPropagation();
            return;
        }
        e.preventDefault();
        e.stopPropagation();

        // a grid tile: upstream's (ref) or a card of forkgrid.js (data-fk-ref); focus goes
        // back to the card's link, since its row is hidden
        var tile = window.thegrid && thegrid.en && t.closest && t.closest('#ggrid > a, [data-fk-ref]'),
            ref = tile && ebi(tile.getAttribute('ref') || tile.getAttribute('data-fk-ref')),
            tr = ref ? rowof(ref) : rowof(t),
            ae = document.activeElement,
            back = tile && (tile.querySelector('.fk-gname') || tile),
            src = { from: (tr && back) || tr || (ae && ae != document.body ? ae : files), x: e.clientX, y: e.clientY };

        // where contextmenu comes on the press (Linux, macOS), the release that follows
        // outside the menu would light-dismiss it at once; open it after the release
        if (!e.buttons)
            return open(tr, src, false);
        var done = false;
        function go() {
            if (done)
                return;
            done = true;
            window.removeEventListener('pointerup', up, true);
            open(tr, src, false);
        }
        function up() {
            setTimeout(go, 0);
        }
        window.addEventListener('pointerup', up, true);
        setTimeout(go, 1500);
    }, true);

    // ---- the keyboard: Shift+F10 or the context-menu key on a focused row
    window.addEventListener('keydown', function (e) {
        if (!(e.key == 'ContextMenu' || (e.key == 'F10' && e.shiftKey)) || e.altKey || ctrl(e) ||
            e.defaultPrevented || upstreamOff())
            return;
        var ae = document.activeElement,
            tr = ae && rowof(ae);
        if (!tr || QS('dialog[open]') || (window.modal && modal.busy))
            return;
        e.preventDefault();
        e.stopImmediatePropagation();
        var b = tr.cells[0].querySelector('.fk-rmore'),
            r = (b || tr).getBoundingClientRect();
        kbopen = Date.now();
        open(tr, { from: tr, x: r.left, y: r.bottom }, true);
    }, true);

    ui.style(css());
    sync();

    window.forkui.rowmenu = { open: open, menu: M };

    function css() {
        var F = 'html.fk-list.fk-rmenu #files';
        return [
            // room for the ⋮ at the end of every row; it sits over the row's right edge
            F + ' tr{position:relative;padding-right:48px;box-sizing:border-box}',
            F + ' tbody tr>td:first-child{position:static}',
            F + ' tbody .rsel{inset:0 auto 0 0!important;width:48px!important}',
            F + ' .fk-rmore{position:absolute;right:2px;top:50%;translate:0 -50%;color:var(--fk-muted);font-size:14px}',
            F + ' .fk-rmore .fk-ico{width:20px;height:20px}',
            F + ' tbody tr.fk-mrow:not(.sel){background:var(--fk-hover)}',
            F + ' .srch_hdr{padding-right:0}',
            '@media (hover:hover) and (pointer:fine){' + F +
            ' tbody tr:not(:hover):not(:focus-within):not(.sel):not(.fk-mrow) .fk-rmore{opacity:0}}'
        ].join('');
    }
})();
