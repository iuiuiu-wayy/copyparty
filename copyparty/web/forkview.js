"use strict";

// fork-only, drive-ux: upstream's viewers and audio player, restyled; see FORK.md.
// - The lightbox (baguetteBox: images and videos) gets a top bar: Close (upstream's own button,
//   moved), the file's name, ‹ › (Previous file / Next file), Download, Share (the Share
//   dialog, forkshare.js) and More options with the rest of upstream's lightbox buttons
//   (rotate, zoom, full screen, select, video mode, page, animation, reading direction,
//   keyboard shortcuts). Arrows, Esc, swipe and every other key stay upstream's.
// - The text viewer (showfile: text, code and markdown) gets the same bar over upstream's;
//   its More options holds Edit, Select, Beautify JSON, Follow changes and Word wrap.
// - The audio player (mpl, widget) is a light bottom bar over the whole width: previous,
//   play / pause, next, the track's name, upstream's seek bar and volume (its canvases),
//   More player options (download, upstream's copy / playlist buttons, Player settings) and
//   Close player (stops and hides it; playing a track brings it back). forknew.js keeps
//   the + button and the upload card above it. Player settings stay in More tools too.
// Upstream does the work; this script only moves, hides and clicks upstream's controls.
// Built with forkui.js, which fork-browser.js loads first.

(function () {
    var ui = window.forkui;
    if (!ui || !ui.ok || !window.baguetteBox || !window.showfile || !window.widget || !window.msel ||
        !ebi('bdoc') || !ebi('widget') || !ebi('widgeti'))
        return;

    var el = ui.el,
        de = document.documentElement;

    de.classList.add('fk-view');

    function after(obj, name, fn) {
        var orig = obj[name];
        if (typeof orig != 'function')
            return;
        obj[name] = function () {
            var ret = orig.apply(this, arguments);
            fn.apply(this, arguments);
            return ret;
        };
    }

    function basename(href) {
        var p = (href || '').split('?')[0].split('#')[0].replace(/\/+$/, '');
        try {
            return uricom_dec(p.split('/').pop());
        }
        catch (ex) {
            return p.split('/').pop();
        }
    }

    function canshare() {
        var b = ebi('fshr');
        return !!(ui.share && b && !clgot(b, 'hide'));
    }

    function share(tr, opener) {
        if (!tr || !ui.share)
            return;
        var it = ui.share.item([tr]);
        if (it)
            ui.share.open(it, opener);
    }

    function ibtn(label, icon, onclick, cls) {
        return el('button', {
            type: 'button', class: 'fk-ibtn' + (cls ? ' ' + cls : ''), 'aria-label': label, title: label,
            on: { click: onclick }
        }, ui.icon(icon));
    }

    // a ‹ or › that stays focusable at the ends (aria-disabled) and then does nothing
    function navbtn(label, icon, cls, go) {
        return ibtn(label, icon, function () {
            if (this.getAttribute('aria-disabled') != 'true')
                go();
        }, cls);
    }

    // ---- the lightbox

    var bb = {
        cur: null,      // the gallery item shown: { imageElement, ... }
        idx: 0,
        len: 0,
        bar: null,
        name: null,
        dl: null,
        shr: null,
        prev: null,
        next: null
    };

    // the row of the item shown: the list link's row, or (grid view) the tile's ref
    function bbrow() {
        var a = bb.cur && bb.cur.imageElement;
        if (!a)
            return null;
        if (a.closest && a.closest('#files'))
            return a.closest('tr');
        var ref = a.getAttribute('ref'),
            l = ref && ebi(ref);
        return l ? l.closest('tr') : null;
    }

    function bbclick(id) {
        var b = ebi(id);
        if (b)
            b.click();
    }

    function shown(id) {
        var b = ebi(id);
        return !!b && b.style.display != 'none';
    }

    function bbitems() {
        var lst = [
            { label: 'Rotate left', select: function () { bbclick('bbox-rotl'); } },
            { label: 'Rotate right', select: function () { bbclick('bbox-rotr'); } },
            { label: 'Zoom to fill', select: function () { bbclick('bbzoom'); } },
            { label: 'Full screen', select: function () { bbclick('bbox-full'); } },
            { label: 'Select', select: function () { bbclick('bbox-tsel'); } }
        ];
        if (shown('bbox-vmode'))
            lst.push({ label: 'Video: loop or play next', select: function () { bbclick('bbox-vmode'); } });
        if (shown('bbox-gopage'))
            lst.push({ label: 'Go to page', select: function () { bbclick('bbox-gopage'); } });
        lst.push({ sep: true });
        lst.push({ label: 'Slide animation', select: function () { bbclick('bbox-anim'); } });
        lst.push({ label: 'Reading direction', select: function () { bbclick('bbox-readdir'); } });
        lst.push({ label: 'Keyboard shortcuts', select: function () { bbclick('bbox-help'); } });
        return lst;
    }

    // put the bar into the overlay (rebuilt by upstream on every run after a destroy)
    function bbdecorate() {
        var ov = ebi('bbox-overlay'),
            close = ebi('bbox-close');
        if (!ov || !close || (bb.bar && ov.contains(bb.bar)))
            return;

        bb.name = el('h2', { class: 'fk-vname', id: 'fk-bbname' });
        bb.prev = navbtn('Previous file', 'left', 'fk-vprev', function () { bbclick('bbox-prev'); });
        bb.next = navbtn('Next file', 'right', 'fk-vnext', function () { bbclick('bbox-next'); });
        bb.dl = el('a', { class: 'fk-ibtn', download: '', href: '#', 'aria-label': 'Download', title: 'Download' },
            ui.icon('download'));
        bb.shr = ibtn('Share', 'share', function () { share(bbrow(), this); });
        var more = ibtn('More options', 'more');

        // upstream's Close keeps its listener (bound to the element) and stays where upstream's
        // focus handling sends focus
        close.className = 'fk-ibtn';
        close.textContent = '';
        close.setAttribute('title', 'Close');
        close.appendChild(ui.icon('close'));

        bb.bar = el('header', { class: 'fk-vbar fk-vbar-dark' }, [
            close, bb.name, bb.prev, bb.next, el('span', { class: 'fk-vgap' }), bb.dl, bb.shr, more
        ]);
        ov.insertBefore(bb.bar, ov.firstChild);

        var m = ui.menu({ trigger: more, label: 'More options', title: 'More options', items: bbitems });
        // the menu's keys and the bar's touches are ours, not the lightbox's (letters are its
        // hotkeys, a touch drag its swipe)
        m.el.addEventListener('keydown', function (e) {
            e.stopPropagation();
        });
        ['touchstart', 'touchmove', 'touchend'].forEach(function (t) {
            bb.bar.addEventListener(t, function (e) {
                e.stopPropagation();
            }, { passive: true });
        });
        bbsync();
    }

    function bbsync() {
        var ov = ebi('bbox-overlay');
        if (!bb.bar || !ov)
            return;
        var a = bb.cur && bb.cur.imageElement,
            href = a ? (bb.cur.href || a.href || '') : '';
        bb.name.textContent = basename(href);
        bb.dl.setAttribute('href', href || '#');
        bb.shr.hidden = !canshare() || !bbrow();
        bb.prev.setAttribute('aria-disabled', bb.idx <= 0 ? 'true' : 'false');
        bb.next.setAttribute('aria-disabled', bb.idx >= bb.len - 1 ? 'true' : 'false');
        bb.prev.hidden = bb.next.hidden = bb.len < 2;
        // the lightbox is named by the file shown
        ov.setAttribute('aria-labelledby', 'fk-bbname');
        ov.setAttribute('aria-modal', 'true');
    }

    // thegrid.bagit runs baguetteBox.run for every opening; follow its onChange for the item
    var run0 = baguetteBox.run;
    baguetteBox.run = function (sel, opts) {
        opts = opts || {};
        var oc = opts.onChange;
        opts.onChange = function (i, n) {
            bb.cur = this[i];
            bb.idx = i;
            bb.len = n;
            var ret = oc ? oc.apply(this, arguments) : undefined;
            bbsync();
            return ret;
        };
        // closed with focus nowhere (upstream gives it back to what had it when opening, which
        // may be gone or the page): onto the row of the item last shown
        var ah = opts.afterHide;
        opts.afterHide = function () {
            var ret = ah ? ah.apply(this, arguments) : undefined;
            setTimeout(function () {
                var f = document.activeElement, tr = bbrow();
                if ((!f || f == document.body || f.closest('#bbox-overlay')) && tr && tr.hasAttribute('tabindex'))
                    tr.focus({ preventScroll: true });
            }, 0);
            return ret;
        };
        var ret = run0.apply(this, arguments);
        bbdecorate();
        return ret;
    };
    if (ebi('bbox-overlay'))
        bbdecorate();

    // while a dialog or menu of ours is open over the lightbox (Share), the lightbox must not
    // pull focus back to itself (its focus trap) nor take the dialog's keys (arrows, letters)
    function overbb(t) {
        return document.body.classList.contains('bbox-open') && t && t.closest &&
            !t.closest('#bbox-overlay') && t.closest('.fk-dlg,.fk-menu');
    }
    window.addEventListener('focus', function (e) {
        if (overbb(e.target))
            e.stopPropagation();
    }, true);
    de.addEventListener('keydown', function (e) {
        if (overbb(e.target))
            e.stopPropagation();
    });

    // ---- the text viewer

    var bdoc = ebi('bdoc'),
        tv = {};

    function tvrow() {
        var n = ebi('docname'),
            fs = showfile.files || [];
        n = n ? n.textContent : '';
        for (var a = 0; a < fs.length; a++)
            if (fs[a].name == n && ebi(fs[a].id))
                return ebi(fs[a].id).closest('tr');
        return null;
    }

    function tvitems() {
        var lst = [],
            ed = ebi('editdoc'),
            n = tv.name.textContent;
        if (ed && ed.style.display != 'none')
            lst.push({ label: 'Edit', select: function () { ed.click(); } });
        lst.push({ label: 'Select', select: function () { bbclick('seldoc'); } });
        if (/\.json$/i.test(n))
            lst.push({ label: 'Beautify JSON', select: function () { bbclick('ppjdoc'); } });
        lst.push({ sep: true });
        lst.push({
            label: showfile.taildoc ? 'Stop following changes' : 'Follow changes',
            select: function () { bbclick('taildoc'); }
        });
        lst.push({
            label: showfile.wrap ? 'Turn word wrap off' : 'Turn word wrap on',
            select: function () { bbclick('wrapdoc'); }
        });
        return lst;
    }

    tv.name = el('h2', { class: 'fk-vname', id: 'fk-tvname' });
    tv.shr = ibtn('Share', 'share', function () { share(tvrow(), this); });
    var tvmore = ibtn('More options', 'more');
    tv.bar = el('header', { class: 'fk-vbar fk-vbar-doc' }, [
        ibtn('Close', 'close', function () { bbclick('xdoc'); }),
        tv.name,
        ibtn('Previous file', 'left', function () { bbclick('prevdoc'); }),
        ibtn('Next file', 'right', function () { bbclick('nextdoc'); }),
        el('span', { class: 'fk-vgap' }),
        ibtn('Download', 'download', function () { bbclick('dldoc'); }),
        tv.shr,
        tvmore
    ]);
    bdoc.insertBefore(tv.bar, bdoc.firstChild);
    bdoc.setAttribute('role', 'region');
    bdoc.setAttribute('aria-labelledby', 'fk-tvname');
    ui.menu({ trigger: tvmore, label: 'More options', title: 'More options', items: tvitems });

    function tvsync() {
        var n = ebi('docname');
        tv.name.textContent = n ? n.textContent : basename(showfile.url);
        tv.shr.hidden = !canshare() || !tvrow();
    }
    // render() ends with updtree, called through the showfile object
    after(showfile, 'updtree', tvsync);
    tvsync();

    // ---- the audio player

    var wg = ebi('widget'),
        au = {};

    function playing() {
        return !!(window.mp && mp.au && !mp.au.paused);
    }

    function track() {
        return window.mp && mp.au ? basename(mp.au.osrc || mp.au.src) : '';
    }

    function ausync() {
        var on = playing();
        // upstream's progress ticks call this many times a second; swapping the icon under
        // a press makes Safari drop the click, so only on a change
        if (au.on !== on) {
            au.on = on;
            au.play.setAttribute('aria-label', on ? 'Pause' : 'Play');
            au.play.setAttribute('title', on ? 'Pause' : 'Play');
            au.play.replaceChild(ui.icon(on ? 'pause' : 'play'), au.play.firstChild);
        }
        var nm = track();
        if (au.name.textContent != nm)
            au.name.textContent = nm;
        // a new Audio element (upstream swaps two for gapless play) reports its own play / pause
        if (window.mp)
            [mp.au, mp.au2].forEach(function (a) {
                if (a && !a.fk_view) {
                    a.fk_view = 1;
                    ['play', 'pause', 'loadstart', 'ended'].forEach(function (t) {
                        a.addEventListener(t, ausync);
                    });
                }
            });
    }

    function auitems() {
        var lst = [],
            wt = ebi('wtoggle');
        if (window.mp && mp.au && window.dl_song)
            lst.push({ label: 'Download track', select: function () { dl_song(); } });
        if (wt && clgot(wt, 'np')) {
            lst.push({ label: 'Copy what is playing', select: function () { bbclick('nptxt'); } });
            lst.push({ label: 'Copy what is playing, IRC style', select: function () { bbclick('npirc'); } });
        }
        if (wt && clgot(wt, 'm3u')) {
            lst.push({ label: 'Add to playlist', select: function () { bbclick('m3ua'); } });
            lst.push({ label: 'Copy playlist', select: function () { bbclick('m3uc'); } });
        }
        var open = ui.opentool || (ui.shell && ui.shell.opentool);
        if (open)
            lst.push({ label: 'Player settings', select: function () { open('player'); } });
        return lst;
    }

    au.play = ibtn('Play', 'play', function () { bbclick('bplay'); }, 'fk-pplay');
    au.name = el('span', { class: 'fk-pname' });
    var aumore = ibtn('More player options', 'more', null, 'fk-pmore');
    au.bar = el('div', { class: 'fk-pbar', role: 'region', 'aria-label': 'Audio player' }, [
        ibtn('Previous track', 'prev', function () { bbclick('bprev'); }, 'fk-pprev'),
        au.play,
        ibtn('Next track', 'next', function () { bbclick('bnext'); }, 'fk-pnext'),
        au.name,
        aumore,
        ibtn('Close player', 'close', function () {
            if (playing() && window.playpause)
                playpause();
            widget.close();
            var tr = QS('#files tr.play');
            if (tr && tr.hasAttribute('tabindex'))
                tr.focus({ preventScroll: true });
        }, 'fk-pclose')
    ]);
    ebi('widgeti').appendChild(au.bar);
    ui.menu({ trigger: aumore, label: 'More player options', title: 'Player', items: auitems });

    // upstream opens the bar only for the first track; after Close player, the next one
    // brings it back
    if (typeof window.play == 'function')
        after(window, 'play', function () {
            if (window.mp && mp.au)
                widget.open();
            ausync();
        });
    after(widget, 'paused', ausync);
    ausync();

    // upstream's canvases measure themselves; again once our layout applies
    function aresize() {
        try {
            if (window.pbar)
                pbar.onresize();
            if (window.vbar)
                vbar.onresize();
        }
        catch (ex) { }
    }
    if (ui.narrow.addEventListener)
        ui.narrow.addEventListener('change', function () {
            setTimeout(aresize, 0);
        });

    ui.style([
        '.fk-vbar,.fk-pbar{font:14px/1.4 var(--fk-font)}',
        '.fk-vbar{display:flex;align-items:center;gap:4px;padding:8px;box-sizing:border-box}',
        '.fk-vname{flex:0 1 auto;min-width:0;margin:0 8px;font:400 18px/1.3 var(--fk-font);',
        'overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
        '.fk-vgap{flex:1 1 0;min-width:0}',
        '.fk-vbar [hidden]{display:none}',
        '.fk-vbar .fk-ibtn[aria-disabled=true]{opacity:.38;cursor:default}',

        // the lightbox: over the whole frame, dark, the bar along its top
        'html.fk #bbox-overlay{z-index:40;background:rgba(0,0,0,.88)}',
        'html.fk #bbox-btns,html.fk #bbox-prev,html.fk #bbox-next,html.fk #bbox-overlay figcaption{display:none}',
        '.fk-vbar-dark{position:absolute;z-index:12;left:0;right:0;top:0;color:#fff;',
        'padding:8px max(8px,env(safe-area-inset-right)) 24px max(8px,env(safe-area-inset-left));',
        'background:linear-gradient(rgba(0,0,0,.65),rgba(0,0,0,0))}',
        // upstream's button styles (a grey box, small caps) don't belong on ours
        'html.fk #bbox-overlay .fk-vbar .fk-ibtn{margin:0;padding:0;border-radius:50%;background:transparent;',
        'color:#e3e3e3;font-size:inherit;line-height:1;font-variant:normal}',
        'html.fk #bbox-overlay .fk-vbar .fk-ibtn:hover{background:rgba(255,255,255,.12);color:#fff}',
        'html.fk #bbox-overlay .fk-vbar .fk-ibtn:focus-visible{outline:2px solid #a8c7fa;outline-offset:-2px;color:#fff}',
        '.fk-vbar-dark .fk-vname{color:#fff}',
        // ‹ › at the sides, Drive's place for them
        'html.fk #bbox-overlay .fk-vbar .fk-vprev,html.fk #bbox-overlay .fk-vbar .fk-vnext{position:fixed;',
        'top:calc(50% - 24px);width:48px;height:48px;background:rgba(32,33,36,.6)}',
        'html.fk #bbox-overlay .fk-vbar .fk-vprev{left:max(12px,env(safe-area-inset-left))}',
        'html.fk #bbox-overlay .fk-vbar .fk-vnext{right:max(12px,env(safe-area-inset-right))}',
        'html.fk #bbox-overlay .fk-vbar .fk-vprev[hidden],html.fk #bbox-overlay .fk-vbar .fk-vnext[hidden]{display:none}',
        // room above and below the picture for the bar
        'html.fk .full-image img,html.fk .full-image video{max-height:calc(100% - 136px);margin:64px 0 0}',

        // the text viewer: the bar over the text, upstream's button row hidden (its follow
        // settings stay, shown while following)
        'html.fk #hdoc{background:none;box-shadow:none;padding:0;margin:0}',
        'html.fk #hdoc>a.btn{display:none}',
        '.fk-vbar-doc{position:sticky;top:var(--fk-top);z-index:4;margin:0 0 8px;background:var(--fk-bg);',
        'color:var(--fk-text);border-bottom:1px solid var(--fk-line)}',
        '.fk-vbar-doc .fk-ibtn:focus-visible{outline:2px solid var(--fk-focus);outline-offset:-2px}',

        // the audio player: a light bar along the bottom, over the nav, upstream's tab of
        // buttons above it and its own play buttons hidden (ours click them)
        'html.fk #wtoggle,html.fk #pctl{display:none}',
        'html.fk #widget{z-index:30;height:72px;bottom:-72px;font-size:14px;visibility:hidden;',
        'transition:bottom .15s,visibility 0s .15s}',
        'html.fk #widget.open{bottom:0;visibility:visible;transition:bottom .15s;',
        'box-shadow:0 -1px 3px rgba(0,0,0,.15),0 -4px 8px rgba(0,0,0,.08);border:0}',
        'html.fk #widgeti{background:var(--fk-surface);padding-bottom:env(safe-area-inset-bottom)}',
        '.fk-pbar{position:absolute;inset:0;color:var(--fk-text)}',
        '.fk-pbar .fk-ibtn{position:absolute;top:14px}',
        '.fk-pbar .fk-ibtn:focus-visible{outline:2px solid var(--fk-focus);outline-offset:-2px}',
        '.fk-pprev{left:8px}.fk-pplay{left:52px}.fk-pnext{left:96px}',
        '.fk-pbar .fk-pplay{background:var(--fk-active);color:#001d35}',
        '.fk-pmore{right:52px}.fk-pclose{right:8px}',
        '.fk-pname{position:absolute;left:156px;right:252px;top:8px;overflow:hidden;text-overflow:ellipsis;',
        'white-space:nowrap;font-weight:500}',
        'html.fk #barpos,html.fk #barbuf{left:156px;top:32px;bottom:auto;height:28px;width:calc(100% - 408px)}',
        'html.fk #pvol{top:22px;right:104px;width:136px;max-width:none;height:28px}',

        '@media (max-width:799px){',
        'html.fk #widget{height:116px;bottom:-116px}',
        '.fk-pbar .fk-ibtn{top:4px}',
        '.fk-pprev{left:4px}.fk-pplay{left:48px}.fk-pnext{left:92px}',
        '.fk-pmore{right:48px}.fk-pclose{right:4px}',
        '.fk-pname{left:144px;right:96px;top:16px}',
        'html.fk #barpos,html.fk #barbuf{left:12px;top:64px;height:32px;width:calc(100% - 144px)}',
        'html.fk #pvol{top:66px;right:12px;width:108px}}'
    ].join(''));
    setTimeout(aresize, 0);
})();
