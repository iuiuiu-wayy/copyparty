"use strict";

// fork-only, drive-ux: the Drive-style file list and selection bar; see FORK.md.
// The list shows an icon and name, Modified and Size, folders first (upstream's dir1st).
// On a desktop a click selects (Ctrl / Shift extend), a double-click or Enter opens; on a
// touch screen a tap opens and a long-press starts selecting, then taps toggle. Names stay
// real links (middle-click, "open in new tab"). While anything is selected, a selection bar
// replaces the breadcrumb: count, clear, share, download, move to, delete and a More actions
// menu with the rest of upstream's file actions; it also offers Paste while upstream's
// clipboard holds something. Drive's keys: Enter, Delete, Ctrl+A, Esc; upstream's stay.
// Upstream stays the source of truth: the `sel` class on #files rows (msel), and fileman
// for every action, so its permission checks and requests are the ones used.
// Built with forkui.js, which fork-browser.js loads first. API for later scripts:
//   forkui.list.open(tr)     open a row as a double-click would
//   forkui.list.rows(sel)    the list's rows (without search's header row); sel: only selected
//   forkui.list.selbar       the selection bar element (role=toolbar)

(function () {
    var ui = window.forkui;
    if (!ui || !ui.ok || !window.msel || !window.fileman || !window.treectl || !window.L ||
        !ebi('files') || !ebi('path') || !ebi('seldl'))
        return;

    var el = ui.el,
        de = document.documentElement,
        files = ebi('files'),
        opening = false,    // our own click on a row's link: let upstream have it
        ptype = 'mouse',    // the pointer of the last pointerdown
        eatUntil = 0;       // swallow the click that ends a long-press (wherever it lands:
                            // the bar showing up can move the rows under the finger)

    de.classList.add('fk-list');

    function insrch() {
        return !!ebi('unsearch');
    }

    function rows(onlysel) {
        return Array.prototype.slice.call(QSA('#files tbody tr' + (onlysel ? '.sel' : '') +
            (insrch() ? ':not(.srch_hdr)' : '')));
    }

    function nsel() {
        return rows(true).length;
    }

    function rowof(t) {
        var tr = t && t.closest && t.closest('#files tbody tr');
        return tr && !tr.classList.contains('srch_hdr') && tr.cells[1] &&
            tr.cells[1].querySelector('a[id]') ? tr : null;
    }

    // right after a sort upstream's msel.load(true) lists each selected item twice, so
    // fileman would act on them twice (docs/fork-browser-scripts.md); keep it exact
    var oload = msel.load;
    msel.load = function (reset) {
        var ret = oload.apply(this, arguments);
        if (reset && msel.all && msel.sel) {
            var s = [];
            for (var a = 0; a < msel.all.length; a++)
                if (msel.all[a].sel)
                    s.push(msel.all[a]);
            msel.sel = s;
        }
        return ret;
    };

    // ---- selecting

    function only(list) {
        var trs = rows();
        for (var a = 0; a < trs.length; a++)
            clmod(trs[a], 'sel', list.indexOf(trs[a]) >= 0);
        msel.selui();
    }

    function toggle(tr) {
        clmod(tr, 'sel', 't');
        msel.origin_tr(tr);
        msel.selui();
    }

    // Shift: from the last plain or Ctrl click to this row; with Ctrl, added to the rest
    function range(tr, add) {
        var trs = rows(),
            org = msel.so && ebi(msel.so),
            i0 = org ? trs.indexOf(org.closest('tr')) : -1,
            i1 = trs.indexOf(tr);
        if (i0 < 0)
            i0 = i1;
        var lo = Math.min(i0, i1), hi = Math.max(i0, i1),
            list = add ? rows(true) : [];
        for (var a = lo; a <= hi; a++)
            list.push(trs[a]);
        only(list);
        msel.pr = null;
    }

    function clear() {
        msel.evsel({}, false);
    }

    function focusrow(tr) {
        if (tr.hasAttribute('tabindex'))
            tr.focus({ preventScroll: true });
    }

    // ---- opening, as upstream would on a click of the right link: a folder through its
    // tree / listing, an image or video in the lightbox, audio in the player, a text file in
    // the text viewer, anything else by following the link
    function open(tr) {
        var a = tr.cells[1].querySelector('a[id]');
        if (!a)
            return;
        var lead = tr.cells[0],
            href = a.getAttribute('href').split('?')[0],
            play = lead.querySelector('a.play'),
            // every file has a "-txt-" link (open as text); `bri` marks a known text type
            doc = lead.querySelector('a.doc.bri[hl]');

        opening = true;
        try {
            if (/\/$/.test(href))
                a.click();
            else if (window.img_re && img_re.test(href) && window.thegrid && thegrid.imshow)
                thegrid.imshow(href.split('/').pop());
            else if (play)
                play.click();
            else if (doc)
                doc.click();
            else
                a.click();
        }
        finally {
            opening = false;
        }
    }

    document.addEventListener('pointerdown', function (e) {
        ptype = e.pointerType || 'mouse';
    }, true);

    files.addEventListener('click', function (e) {
        if (opening || e.button)
            return;
        var tr = rowof(e.target);
        // the row's checkbox (rowsel.js) and the parent-folder links of a search hit stay theirs
        if (!tr || e.target.closest('.rsel'))
            return;
        var a = e.target.closest('a');
        if (a && insrch() && !a.id)
            return;

        e.preventDefault();
        e.stopPropagation();
        if (Date.now() < eatUntil) {
            eatUntil = 0;
            return;
        }

        if (ptype == 'touch') {
            if (nsel())
                return toggle(tr);
            return open(tr);
        }
        if (e.shiftKey)
            range(tr, ctrl(e));
        else if (ctrl(e))
            toggle(tr);
        else {
            only([tr]);
            msel.origin_tr(tr);
        }
        focusrow(tr);
    }, true);

    files.addEventListener('dblclick', function (e) {
        var tr = rowof(e.target);
        if (!tr || ptype == 'touch' || e.target.closest('.rsel') || e.shiftKey || ctrl(e))
            return;
        e.preventDefault();
        e.stopPropagation();
        open(tr);
    }, true);

    // a long-press on a touch screen selects the row; the browser's link callout and text
    // selection are kept away (CSS, and the contextmenu a long-press brings)
    var hold = null;

    function unhold() {
        if (hold)
            clearTimeout(hold.t);
        hold = null;
    }

    files.addEventListener('pointerdown', function (e) {
        unhold();
        var tr = rowof(e.target);
        if (e.pointerType != 'touch' || !tr || e.target.closest('.rsel'))
            return;
        hold = { x: e.clientX, y: e.clientY, tr: tr, done: false, t0: Date.now() };
        hold.t = setTimeout(held, 500);
    }, true);

    function held() {
        if (!hold || hold.done)
            return;
        clearTimeout(hold.t);
        hold.done = true;
        clmod(hold.tr, 'sel', true);
        msel.origin_tr(hold.tr);
        msel.selui();
        if (navigator.vibrate)
            try { navigator.vibrate(20); } catch (ex) { }
    }

    files.addEventListener('pointermove', function (e) {
        if (hold && !hold.done && Math.abs(e.clientX - hold.x) + Math.abs(e.clientY - hold.y) > 10)
            unhold();
    }, true);

    // pointerup, or pointercancel when the browser took the touch for a scroll or its own
    // long-press; a click may still follow
    function endhold(e) {
        // Chromium cancels the pointer when it starts its own long-press (the contextmenu
        // that follows is ours); a cancel before that is a scroll
        if (e.type == 'pointercancel' && hold && !hold.done && Date.now() - hold.t0 > 400)
            return;
        if (hold && hold.done) {
            eatUntil = Date.now() + 400;
        }
        unhold();
    }
    files.addEventListener('pointerup', endhold, true);
    files.addEventListener('pointercancel', endhold, true);

    files.addEventListener('contextmenu', function (e) {
        var tr = rowof(e.target);
        if (ptype == 'touch' && tr) {
            // Android's long-press: it may come before our timer, and cancel the pointer
            if (!hold || hold.tr != tr)
                hold = { tr: tr, done: false, t0: Date.now() };
            held();
            e.preventDefault();
            e.stopPropagation();
        }
    }, true);

    // ---- the delete confirm says what it does: there is no trash
    var odel = fileman.delete;
    fileman.delete = function () {
        var n = nsel();
        L.fd_warn1 = n == 1 ? 'Delete 1 item forever?' : 'Delete {0} items forever?';
        return odel.apply(this, arguments);
    };

    // ---- the selection bar

    function hid(id) {
        var b = ebi(id);
        return !b || clgot(b, 'hide');
    }

    function btn(label, ico, fn) {
        return el('button', {
            type: 'button', class: 'fk-ibtn', 'aria-label': label, title: label,
            on: { click: function () { fn(); } }
        }, ui.icon(ico));
    }

    function isdir(tr) {
        var a = tr.cells[1].querySelector('a[id]');
        return /\/$/.test(a.getAttribute('href').split('?')[0]);
    }

    function download() {
        var sel = rows(true);
        if (sel.length == 1 && !isdir(sel[0]))
            return ebi('seldl').click();
        if (window.have_zip && !insrch())
            return ebi('selzip').click();
        ebi('seldl').click();
    }

    // the paste upstream would do; its clipboard is emptied once it has been pasted
    function paste() {
        fileman.paste();
    }

    // cut or copy, then end the selection (as Drive does after picking an action), so taps
    // open folders again on the way to where it goes
    function clipit(how) {
        fileman[how]({});
        if (fileman.clip && fileman.clip.length)
            clear();
    }

    function dropclip() {
        fileman.clip = [];
        swrite('fman_clip', JSON.stringify([Date.now()]));
        fileman.render();
    }

    var B = {
        clear: btn('Clear selection', 'close', function () {
            if (nsel()) {
                var org = msel.so && ebi(msel.so);
                clear();
                if (org && org.closest('tr'))
                    focusrow(org.closest('tr'));
            }
            else
                dropclip();
        }),
        share: btn('Share', 'share', function () { ebi('fshr').click(); }),
        dl: btn('Download', 'download', download),
        move: btn('Move to…', 'move', function () { clipit('cut'); }),
        del: btn('Delete', 'delete', function () { fileman.delete({}); }),
        paste: el('button', {
            type: 'button', class: 'fk-tbtn', on: { click: paste }
        }, [ui.icon('paste'), el('span', { text: 'Paste here' })]),
        more: btn('More actions', 'more', function () { })
    };
    var count = el('span', { class: 'fk-selcount' }),
        bar = el('div', {
            class: 'fk-selbar', role: 'toolbar', 'aria-label': 'Selection', focusgroup: 'toolbar wrap',
            hidden: true
        }, [B.clear, count, B.paste, B.share, B.dl, B.move, B.del, B.more]);

    // in a strip of its own that sticks under the top bar, so it stays in view (and covers
    // the list's sticky header) while rows further down are picked
    var strip = el('div', { class: 'fk-selstrip' }, bar);
    ebi('path').parentNode.insertBefore(strip, ebi('path'));

    function selfile() {
        var s = rows(true);
        return s.length == 1 ? s[0].cells[1].querySelector('a[id]') : null;
    }

    ui.menu({
        trigger: B.more, label: 'More actions', title: 'More actions', items: function () {
            var n = nsel(),
                one = selfile(),
                clip = fileman.clip && fileman.clip.length,
                ret = [];

            function add(ok, label, fn) {
                if (ok)
                    ret.push({ label: label, select: fn });
            }
            add(n == 1, 'Open', function () { open(rows(true)[0]); });
            add(n && !hid('fren'), 'Rename', function () { fileman.rename({}); });
            add(n, 'Copy', function () { clipit('cpy'); });
            add(n && !hid('fcut'), 'Cut', function () { clipit('cut'); });
            add(clip && !hid('fpst'), 'Paste', paste);
            add(n && window.have_zip && !insrch(), 'Download as zip', function () { ebi('selzip').click(); });
            add(one, 'Copy link', function () {
                cliptxt(one.href, function () { toast.ok(2, L.clipped); });
            });
            add(n && !hid('fgrant'), 'Share with people', function () { ebi('fgrant').click(); });
            add(true, 'Select all', function () { msel.evsel({}, 'add'); });
            add(n, 'Invert selection', function () { msel.evsel({}, 't'); });
            return ret;
        }
    });

    // one tab stop in the bar, arrows between its buttons (where focusgroup is missing)
    var roving = !('focusGroup' in HTMLElement.prototype);

    function shown() {
        return Array.prototype.slice.call(bar.querySelectorAll('button')).filter(function (b) {
            return !b.hidden && b.parentNode == bar;
        });
    }

    function rove(to) {
        var bs = shown();
        if (!bs.length)
            return;
        if (bs.indexOf(to) < 0)
            to = bs[0];
        for (var a = 0; a < bs.length; a++)
            bs[a].tabIndex = bs[a] == to ? 0 : -1;
    }

    if (roving) {
        bar.addEventListener('focusin', function (e) {
            if (e.target.parentNode == bar)
                rove(e.target);
        });
        bar.addEventListener('keydown', function (e) {
            var bs = shown(),
                i = bs.indexOf(document.activeElement),
                rtl = getComputedStyle(bar).direction == 'rtl',
                k = e.key,
                d = k == 'ArrowRight' ? 1 : k == 'ArrowLeft' ? -1 : 0;
            if (i < 0)
                return;
            if (rtl)
                d = -d;
            var to = k == 'Home' ? 0 : k == 'End' ? bs.length - 1 : d ? (i + d + bs.length) % bs.length : -1;
            if (to < 0)
                return;
            e.preventDefault();
            bs[to].focus();
        });
    }

    var lastmode = '';

    function sync() {
        var n = nsel(),
            clip = fileman.clip ? fileman.clip.length : 0,
            mode = n ? 'sel' : clip && !hid('fpst') ? 'paste' : '';

        bar.hidden = !mode;
        de.classList.toggle('fk-hassel', !!mode);
        de.classList.toggle('fk-anysel', !!n);
        count.textContent = n ? n + ' selected' : clip + ' to paste';
        B.paste.hidden = mode != 'paste';
        B.share.hidden = mode != 'sel' || hid('fshr');
        B.dl.hidden = mode != 'sel';
        B.move.hidden = mode != 'sel' || hid('fcut');
        B.del.hidden = mode != 'sel' || hid('fdel');
        B.more.hidden = mode != 'sel';
        B.clear.setAttribute('aria-label', n ? 'Clear selection' : 'Cancel paste');
        B.clear.title = B.clear.getAttribute('aria-label');

        // focus on a button that went away goes back to the list
        var ae = document.activeElement;
        if (ae && bar.contains(ae) && (ae.hidden || bar.hidden)) {
            var org = msel.so && ebi(msel.so);
            if (org && org.closest('tr'))
                focusrow(org.closest('tr'));
        }
        if (roving && mode != lastmode)
            rove(null);
        else if (roving)
            rove(bar.querySelector('button[tabindex="0"]'));
        lastmode = mode;
    }

    // fileman.render runs after every selection change (msel.selui) and clipboard change
    var orender = fileman.render;
    fileman.render = function () {
        var ret = orender.apply(this, arguments);
        sync();
        return ret;
    };

    // ---- keyboard: Drive's basics, ahead of upstream's hotkeys (document.onkeydown)

    function busy() {
        return (window.modal && modal.busy) || QS('dialog[open]') || QS('.fk-menu:popover-open') ||
            QS('#bbox-overlay.visible') || ebi('rui') || ebi('shui') ||
            (window.showfile && showfile.active());
    }

    window.addEventListener('keydown', function (e) {
        if (e.isComposing || e.altKey || e.defaultPrevented)
            return;
        var ae = document.activeElement,
            tag = ae ? ae.tagName : '';
        if (/^(INPUT|TEXTAREA|SELECT)$/.test(tag) || (ae && ae.isContentEditable) || busy())
            return;

        var k = e.key, hit = false;
        if (k == 'Escape' && nsel()) {
            clear();
            hit = true;
        }
        else if ((k == 'a' || k == 'A') && ctrl(e) && !e.shiftKey && tag != 'PRE') {
            msel.evsel({}, 'add');
            hit = true;
        }
        else if ((k == 'Delete' || (k == 'Backspace' && window.MACOS)) && nsel() && !hid('fdel')) {
            fileman.delete({});
            hit = true;
        }
        else if (k == 'Enter' && !ctrl(e) && !e.shiftKey) {
            var tr = ae && rowof(ae);
            if (tr && tr == ae) {
                open(tr);
                hit = true;
            }
            else if ((!ae || ae == document.body) && nsel() == 1) {
                open(rows(true)[0]);
                hit = true;
            }
        }
        if (hit) {
            e.preventDefault();
            e.stopImmediatePropagation();
        }
    }, true);

    // ---- columns: Drive's Name, Modified, Size. Every other column (extension, tags) starts
    // hidden the first time this browser sees it, through upstream's own column hiding, so it
    // comes back from Settings' hidden-columns list (More tools) and then stays
    var CORE = { 'c': 1, 'File Name': 1, 'Size': 1, 'Date': 1 },
        hiding = false;

    function newcols() {
        if (hiding || !window.filecols || !filecols.hide)
            return;
        var seen = jread('fk_cols', []),
            ths = QSA('#files>thead th>span'),
            add = [];
        for (var a = 0; a < ths.length; a++) {
            var n = ths[a].textContent;
            if (!CORE[n] && seen.indexOf(n) < 0 && add.indexOf(n) < 0)
                add.push(n);
        }
        if (!add.length)
            return;
        jwrite('fk_cols', seen.concat(add));
        // upstream asks once before hiding a column; this isn't the person hiding it
        var cok = sread('chide_ok');
        hiding = true;
        try {
            swrite('chide_ok', 1);
            for (var a = 0; a < add.length; a++) {
                var th = thname(add[a]);
                if (th && !clgot(th, 'min'))
                    filecols.hide(add[a]);
            }
        }
        catch (ex) { }
        hiding = false;
        if (!cok)
            swrite('chide_ok', null);
    }

    function thname(n) {
        var ths = QSA('#files>thead th>span');
        for (var a = 0; a < ths.length; a++)
            if (ths[a].textContent == n)
                return ths[a].parentNode;
        return null;
    }

    if (window.filecols && filecols.set_style) {
        var ostyle = filecols.set_style;
        filecols.set_style = function () {
            var ret = ostyle.apply(this, arguments);
            newcols();
            return ret;
        };
    }
    newcols();

    ui.style(css());
    sync();

    window.forkui.list = { open: open, rows: rows, selbar: bar };

    function svg(d) {
        return 'url("data:image/svg+xml,' + encodeURIComponent(
            '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#000" ' +
            'stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="' + d + '"/></svg>') + '")';
    }

    function css() {
        var FOLDER = 'M3 7.5a1.5 1.5 0 0 1 1.5-1.5h4.6l2 2h8.4a1.5 1.5 0 0 1 1.5 1.5v8.5a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 18z',
            FILE = 'M6.5 3h7.5l5 5v11.5a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 5 19.5v-15A1.5 1.5 0 0 1 6.5 3zM14 3v5h5',
            F = 'html.fk-list #files';
        return [
            ':root{--fk-row:48px}',
            'html.fk-list #wrap{overflow-x:hidden!important;overflow-x:clip!important}',
            F + '{display:block;width:100%;top:0;margin:0 0 24px;border-spacing:0;color:var(--fk-text);font:14px/1.4 var(--fk-font)}',
            F + '>thead,' + F + '>tbody{display:block}',
            F + '>thead{position:sticky;top:var(--fk-top);z-index:3;background:var(--fk-bg)}',
            F + ' tr{display:flex;align-items:center;min-height:var(--fk-row);border-bottom:1px solid #e1e3e1;background:transparent}',
            F + ' th,' + F + ' td{display:block;flex:none;box-sizing:border-box;margin:0;padding:0 8px;position:static;',
            'background:transparent!important;box-shadow:none!important;border:0!important;border-radius:0!important;',
            'max-width:none;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--fk-muted);font:inherit;text-align:start}',
            F + ' th.min,' + F + ' td.min{display:none!important}',
            F + ' th{font-weight:500;color:var(--fk-text);height:var(--fk-row);line-height:var(--fk-row);cursor:pointer}',
            F + ' thead a{color:inherit}',
            F + ' th .cfg{display:none;float:right}',
            F + ' th:hover .cfg{display:block}',
            F + ' th[name=lead] .cfg{display:none!important}',
            F + ' th[name=lead]>span{font-size:0}',
            // lead (checkbox), name, modified, size, then upstream's other columns
            F + ' tr>:first-child{order:0;width:48px;padding:0;position:relative;text-align:center;align-self:stretch}',
            F + ' tr>:nth-child(2){order:1;flex:1 1 auto;min-width:0}',
            F + ' tr>:last-child{order:2;width:190px}',
            F + ' tr>:nth-child(3){order:3;width:110px;font-family:inherit!important;text-align:start;padding-right:8px}',
            F + ' tr>:nth-child(n+4):not(:last-child){order:4;width:7em}',
            // the lead cell shows only the checkbox; upstream's play / text links stay in it
            // (the right-click menu reads them) but opening goes through the row
            F + ' tbody td:first-child{font-size:0;color:transparent}',
            F + ' tbody td:first-child>a{display:none}',
            F + ' .rsel{position:absolute!important;inset:0!important;width:auto!important;display:flex;align-items:center;justify-content:center;font-size:14px}',
            F + ' tbody td:first-child{padding-left:0!important}',
            F + ' .rsel input{width:18px;height:18px;accent-color:var(--fk-accent)}',
            '@media (hover:hover) and (pointer:fine){html.fk-list:not(.fk-anysel) #files tbody tr:not(:hover):not(:focus-within) .rsel input{opacity:0}}',
            // rows
            F + ' tbody tr{cursor:default;user-select:none;-webkit-user-select:none;-webkit-touch-callout:none}',
            F + ' tbody tr:hover{background:var(--fk-hover)}',
            F + ' tbody tr.sel,' + F + ' tbody tr.sel:hover{background:var(--fk-active)}',
            F + ' tbody tr:focus{outline:0}',
            F + ' tbody tr:focus-visible{outline:2px solid var(--fk-focus);outline-offset:-2px}',
            F + ' tbody tr.sel td,' + F + ' tbody tr.sel span{color:var(--fk-muted)!important;background:transparent!important;text-shadow:none!important}',
            F + ' tbody tr.fcut{opacity:.5}',
            F + ' tbody td:nth-child(2){color:var(--fk-text)}',
            F + ' tbody td:nth-child(2) a{display:inline;margin:0;padding:0;color:var(--fk-text)!important;background:none!important;',
            'text-decoration:none!important;font-weight:500}',
            F + ' tbody td:nth-child(2) a{text-shadow:none!important}',
            F + ' tbody td:nth-child(2) a[id]{display:flex;align-items:center;gap:16px;min-height:var(--fk-row);overflow:hidden}',
            F + ' tbody td:nth-child(2) div a:not([id]){color:var(--fk-muted)!important;font-weight:400}',
            F + ' tbody td:nth-child(2) div{display:flex;align-items:center;overflow:hidden}',
            F + ' tbody td:nth-child(2) a[id]::before{content:"";flex:none;width:24px;height:24px;background:#5f6368;',
            '-webkit-mask:' + svg(FILE) + ' center/contain no-repeat;mask:' + svg(FILE) + ' center/contain no-repeat}',
            F + ' tbody td:nth-child(2) a[id][href$="/"]::before,' + F + ' tbody td:nth-child(2) a[id][href*="/?"]::before{',
            '-webkit-mask-image:' + svg(FOLDER) + ';mask-image:' + svg(FOLDER) + '}',
            F + ' span[class^=fsz_]{color:inherit!important;font-weight:inherit!important}',
            F + ' .srch_hdr{display:flex}',
            F + ' .srch_hdr td{width:auto!important;flex:1 1 auto!important}',
            F + ' .srch_hdr a{color:var(--fk-accent)!important;display:inline-block;padding:12px 8px;font-size:14px}',

            // upstream's bottom file-op bar: our selection bar has its buttons
            'html.fk-list #wfm,html.fk-list #wzip,html.fk-list #wfs{display:none!important}',

            // the selection bar, in the breadcrumb's place
            '.fk-selstrip{position:sticky;top:var(--fk-top);z-index:5;padding:12px 1.5em 4px;background:var(--fk-bg)}',
            'html:not(.fk-hassel) .fk-selstrip{display:none}',
            '.fk-selbar{display:flex;align-items:center;gap:0;min-height:48px;margin:0;padding:0 4px;',
            'border-radius:24px;background:#e9eef6;color:var(--fk-text);font:14px/1.4 var(--fk-font);box-sizing:border-box}',
            '.fk-selbar[hidden]{display:none}',
            'html.fk-hassel #path{display:none!important}',
            '.fk-selcount{flex:1 1 auto;min-width:0;padding:0 8px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:500}',
            '.fk-selbar .fk-ibtn{color:var(--fk-text)}',
            '.fk-selbar .fk-ibtn:focus-visible,.fk-tbtn:focus-visible{outline:2px solid var(--fk-focus);outline-offset:-2px}',
            '.fk-tbtn{display:inline-flex;align-items:center;gap:8px;min-height:var(--fk-tap);padding:0 16px 0 12px;margin:0;',
            'border:0;border-radius:22px;background:transparent;color:var(--fk-text);font:500 14px var(--fk-font);cursor:pointer}',
            '.fk-tbtn:hover{background:var(--fk-hover)}',
            '.fk-selbar [hidden]{display:none}',

            '@media (max-width:799px){',
            'html.fk-list #files>thead{top:56px}',
            F + ' tr>:last-child{width:auto}',
            F + ' tr>:nth-child(3){width:auto}',
            F + ' tr>:nth-child(n+4):not(:last-child){display:none}',
            F + ' tbody tr{display:grid;grid-template-columns:48px minmax(0,1fr) auto;',
            'grid-template-areas:"lead name name" "lead ts sz";min-height:60px;align-items:center}',
            F + ' tbody tr>td:first-child{grid-area:lead}',
            F + ' tbody tr>td:nth-child(2){grid-area:name;padding-top:6px}',
            F + ' tbody tr>td:last-child{grid-area:ts;font-size:12px;padding-bottom:6px}',
            F + ' tbody tr>td:nth-child(3){grid-area:sz;font-size:12px;padding-bottom:6px}',
            F + ' tbody td:nth-child(2) a[id]{min-height:32px}',
            F + ' thead th:last-child{width:auto;flex:none}',
            F + ' .srch_hdr{display:flex!important}',
            '.fk-selstrip{top:56px;padding:8px .5em 4px}',
            '.fk-selbar{padding:0}',
            '.fk-selcount{padding:0 4px}}',

            '@media (pointer:coarse){html.fk-list #files .rsel input{width:22px;height:22px}html.fk-list #files tbody td:first-child{height:auto!important}}'
        ].join('');
    }
})();
