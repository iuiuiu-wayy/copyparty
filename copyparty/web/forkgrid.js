"use strict";

// fork-only, drive-ux: the grid view; see FORK.md.
// A Layout toggle (List / Grid) beside the breadcrumb switches upstream's grid on and off
// (thegrid.en, its `griden` setting, so the choice stays with this browser). The grid is
// drawn as Drive's: a Folders section of compact tiles, then a Files section of cards with
// the thumbnail upstream would show (lazy) and a ⋮ each. Upstream's own tiles (#ggrid) are
// still built and stay the lightbox's gallery, hidden; our cards are built from them after
// each grid load and carry the id of their row's link (data-fk-ref), so forklist.js selects
// and opens them as rows, and forkrowmenu.js takes right-clicks on them as on rows. Each
// card mirrors its row's state (sel, play, fcut) whenever upstream re-syncs its tiles.
// Keys on a card: Enter opens, Space selects, arrows move, Shift+F10 / the context-menu
// key open the row menu. Upstream's grid bar keeps only its sort links.
// Built on forkui.js, forklist.js (forkui.list) and forkrowmenu.js (forkui.rowmenu).

(function () {
    var ui = window.forkui;
    if (!ui || !ui.ok || !ui.list || !ui.rowmenu || !window.thegrid || !window.msel ||
        !ebi('gfiles') || !ebi('ggrid') || !ebi('files') || !ebi('path') || !ebi('griden'))
        return;

    var el = ui.el,
        LS = ui.list,
        RM = ui.rowmenu,
        de = document.documentElement,
        gfiles = ebi('gfiles'),
        built = null,       // the first of upstream's tiles our cards were built from
        kbopen = 0;         // when the keyboard last opened the menu (its contextmenu follows)

    // the list's file and folder icons (forklist.js), as masks
    var FOLDER = 'M3 7.5a1.5 1.5 0 0 1 1.5-1.5h4.6l2 2h8.4a1.5 1.5 0 0 1 1.5 1.5v8.5a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 18z',
        FILE = 'M6.5 3h7.5l5 5v11.5a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 5 19.5v-15A1.5 1.5 0 0 1 6.5 3zM14 3v5h5';

    de.classList.add('fk-grid');

    // our cards would make a selecting click of upstream's grid open things in a hidden
    // grid; its multiselect setting has no button here any more
    if (thegrid.sel)
        ebi('gridsel').click();

    function icon(d) {
        var s = ui.icon('more');
        s.firstChild.setAttribute('d', d);
        return s;
    }

    // ---- the Layout toggle

    var LIST = 'M4 6h.01M8 6h12M4 12h.01M8 12h12M4 18h.01M8 18h12',
        GRID = 'M4 4h6.5v6.5H4zM13.5 4H20v6.5h-6.5zM4 13.5h6.5V20H4zM13.5 13.5H20V20h-6.5z';

    function lbtn(label, d, grid) {
        return el('button', {
            type: 'button', class: 'fk-ibtn', 'aria-label': label, title: label, 'aria-pressed': 'false',
            on: {
                click: function () {
                    if (!!thegrid.en != grid)
                        ebi('griden').click();
                    syncbtns();
                }
            }
        }, icon(d));
    }
    var bList = lbtn('List layout', LIST, false),
        bGrid = lbtn('Grid layout', GRID, true),
        toggle = el('div', { class: 'fk-layout', role: 'group', 'aria-label': 'Layout' }, [bList, bGrid]);
    ebi('path').parentNode.insertBefore(toggle, ebi('path'));

    function syncbtns() {
        bList.setAttribute('aria-pressed', thegrid.en ? 'false' : 'true');
        bGrid.setAttribute('aria-pressed', thegrid.en ? 'true' : 'false');
    }

    // ---- the cards

    var root = el('div', { id: 'fk-grid' });
    gfiles.appendChild(root);

    function rowfor(node) {
        var c = node && node.closest && node.closest('[data-fk-ref]'),
            a = c && ebi(c.getAttribute('data-fk-ref'));
        return a ? a.closest('tr') : null;
    }

    function stop(e) {
        e.stopPropagation();
    }

    function onmore(e) {
        e.preventDefault();
        e.stopPropagation();
        var b = this,
            M = RM.menu;
        // a press on the ⋮ of the open menu light-dismissed it already: stay closed
        if (M.from() == b && (M.isOpen() || Date.now() - M.shut() < 300))
            return M.close();
        var tr = rowfor(b);
        if (tr)
            RM.open(tr, { from: b }, e.detail === 0);
    }

    function toggleRow(tr) {
        clmod(tr, 'sel', 't');
        msel.origin_tr(tr);
        msel.selui();
    }

    function onbox(e) {
        e.stopPropagation();
        var tr = rowfor(this);
        if (tr)
            toggleRow(tr);
    }

    function mkcard(ref, href, name, isdir, src) {
        var kids = [
            el('span', { class: 'fk-glead' }, [
                el('input', {
                    type: 'checkbox', class: 'fk-gbox fk-own', tabindex: '-1', 'aria-label': 'Select ' + name,
                    on: {
                        click: onbox, dblclick: stop,
                        // keep focus on the card, as the list's boxes do (Esc, Delete work)
                        mousedown: function (e) { e.preventDefault(); }
                    }
                })
            ]),
            el('a', { href: href, class: 'fk-gname', draggable: 'false', text: name }),
            el('button', {
                type: 'button', class: 'fk-ibtn fk-gmore fk-own', tabindex: '-1', 'aria-haspopup': 'menu',
                'aria-expanded': 'false', 'aria-label': 'Actions for ' + name, title: 'More actions',
                on: { click: onmore, dblclick: stop }
            }, ui.icon('more'))
        ];
        if (!isdir)
            kids.push(el('img', { src: src, alt: '', loading: 'lazy', decoding: 'async', draggable: 'false' }));
        return el('li', { class: 'fk-gcard' + (isdir ? ' fk-gdir' : ''), 'data-fk-ref': ref }, kids);
    }

    function section(id, title, cards) {
        if (!cards.length)
            return [];
        return [
            el('h2', { id: id, class: 'fk-gh', text: title }),
            el('ul', { class: 'fk-gl ' + id, 'aria-labelledby': id }, cards)
        ];
    }

    // from upstream's tiles: its thumbnail url (thumbs, crop, 3x, webp / jxl settings),
    // in its order (sort, folders first), folders and files apart
    function build() {
        var tiles = QSA('#ggrid>a[ref]'),
            first = tiles[0] || null;
        if (first === built && (first || !root.firstChild))
            return sync();
        built = first;

        var dirs = [], fls = [];
        for (var i = 0; i < tiles.length; i++) {
            var t = tiles[i],
                ref = t.getAttribute('ref'),
                a = ebi(ref),
                tr = a && a.closest('#files tbody tr');
            if (!tr || tr.classList.contains('srch_hdr'))
                continue;
            var href = a.getAttribute('href'),
                isdir = /\/$/.test(href.split('?')[0]),
                name = a.textContent.replace(/\/$/, ''),
                img = t.querySelector('img');
            (isdir ? dirs : fls).push(mkcard(ref, href, name, isdir, img ? img.getAttribute('src') : ''));
        }
        root.textContent = '';
        var kids = section('fk-gdirs', 'Folders', dirs).concat(section('fk-gfiles', 'Files', fls));
        for (var i = 0; i < kids.length; i++)
            root.appendChild(kids[i]);
        sync();
    }

    function sync() {
        var cs = root.querySelectorAll('.fk-gcard');
        for (var i = 0; i < cs.length; i++) {
            var c = cs[i],
                tr = rowfor(c);
            if (!tr)
                continue;
            var sel = clgot(tr, 'sel');
            clmod(c, 'sel', sel);
            clmod(c, 'play', clgot(tr, 'play'));
            clmod(c, 'fcut', clgot(tr, 'fcut'));
            c.querySelector('.fk-gbox').checked = sel;
        }
    }

    function after(obj, name, fn) {
        var orig = obj[name];
        obj[name] = function () {
            var ret = orig.apply(this, arguments);
            fn();
            return ret;
        };
    }
    // loadsel ends every grid load and runs on each selection / player change
    after(thegrid, 'loadsel', build);
    after(thegrid, 'setvis', syncbtns);
    after(thegrid, 'setvis', function () {
        if (thegrid.en && !thegrid.dirty)
            build();
    });

    // the lightbox gives focus back to upstream's (hidden) tile; ours gets it instead
    after(thegrid, 'onhide', function () {
        var m = /^#g([^,&]+)/.exec(location.hash),
            c = m && thegrid.en && root.querySelector('[data-fk-ref="' + m[1] + '"] .fk-gname');
        if (c)
            setTimeout(function () { c.focus({ preventScroll: true }); }, 210);
    });

    // ---- the keyboard on a card

    function cards() {
        return Array.prototype.slice.call(root.querySelectorAll('.fk-gname'));
    }

    // the card above / below: the nearest one on the closest row in that direction
    function vert(cur, down) {
        var r0 = cur.closest('.fk-gcard').getBoundingClientRect(),
            x0 = r0.left + r0.width / 2,
            best = null, bt = 0, bx = 0,
            cs = cards();
        for (var i = 0; i < cs.length; i++) {
            var r = cs[i].closest('.fk-gcard').getBoundingClientRect(),
                dt = down ? r.top - r0.top : r0.top - r.top;
            if (dt < 2)
                continue;
            var dx = Math.abs(r.left + r.width / 2 - x0);
            if (!best || dt < bt - 2 || (Math.abs(dt - bt) <= 2 && dx < bx)) {
                best = cs[i];
                bt = dt;
                bx = dx;
            }
        }
        return best;
    }

    root.addEventListener('keydown', function (e) {
        var a = e.target.closest && e.target.closest('.fk-gname'),
            tr = a && rowfor(a);
        if (!tr || e.altKey || e.isComposing)
            return;
        var k = e.key, to = null, cs;
        if (k == 'Enter' && !ctrl(e) && !e.shiftKey)
            LS.open(tr);
        else if (k == ' ' && !ctrl(e))
            toggleRow(tr);
        else if (k == 'ContextMenu' || (k == 'F10' && e.shiftKey)) {
            var r = a.closest('.fk-gcard').getBoundingClientRect();
            kbopen = Date.now();
            RM.open(tr, { from: a, x: r.left, y: r.bottom }, true);
        }
        else if (k == 'ArrowRight' || k == 'ArrowLeft') {
            cs = cards();
            var d = (k == 'ArrowRight') == (getComputedStyle(root).direction != 'rtl') ? 1 : -1;
            to = cs[cs.indexOf(a) + d];
            if (!to)
                return;
        }
        else if (k == 'ArrowDown' || k == 'ArrowUp') {
            to = vert(a, k == 'ArrowDown');
            if (!to)
                return;
        }
        else if (k == 'Home' || k == 'End') {
            cs = cards();
            to = k == 'Home' ? cs[0] : cs[cs.length - 1];
        }
        else
            return;
        e.preventDefault();
        e.stopPropagation();
        if (to)
            to.focus();
    });

    // the contextmenu event a context-menu key sends after its keydown: the menu is open
    window.addEventListener('contextmenu', function (e) {
        if (Date.now() - kbopen < 600 && RM.menu.isOpen() && root.contains(e.target)) {
            e.preventDefault();
            e.stopPropagation();
        }
    }, true);

    ui.style(css());
    syncbtns();
    if (thegrid.en)
        build();

    function mask(d) {
        return 'url("data:image/svg+xml,' + encodeURIComponent(
            '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#000" ' +
            'stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="' + d + '"/></svg>') + '")';
    }

    function css() {
        var G = 'html.fk-grid #fk-grid',
            C = G + ' .fk-gcard';
        return [
            // upstream's tiles stay as the lightbox's gallery; its bar keeps only sorting
            'html.fk-grid #ggrid{display:none!important}',
            'html.fk-grid #ghead{display:flex;align-items:center;gap:4px;margin:0 0 4px;padding:0;background:none;border:0;',
            'box-shadow:none;font:14px var(--fk-font);color:var(--fk-muted)}',
            'html.fk-grid #ghead>a,html.fk-grid #ghead>span:not(:last-child){display:none!important}',
            'html.fk-grid #ghead>span:last-child a{display:inline-flex;align-items:center;min-height:32px;padding:0 10px;',
            'border-radius:16px;color:var(--fk-text);text-decoration:none}',
            'html.fk-grid #ghead>span:last-child a:hover{background:var(--fk-hover)}',

            // the Layout toggle, at the right of the breadcrumb
            '.fk-layout{float:right;display:flex;margin:4px 16px 0 8px;border:1px solid #747775;border-radius:20px;overflow:hidden;position:relative;z-index:1}',
            '.fk-layout .fk-ibtn{width:52px;height:36px;border-radius:0;color:var(--fk-text)}',
            '.fk-layout .fk-ibtn+.fk-ibtn{border-left:1px solid #747775}',
            '.fk-layout .fk-ibtn[aria-pressed=true]{background:var(--fk-active)}',
            '.fk-layout .fk-ibtn:focus-visible{outline:2px solid var(--fk-focus);outline-offset:-3px}',
            '.fk-layout .fk-ico{width:20px;height:20px}',
            'html.fk-hassel .fk-layout,html.fk-inph .fk-layout{display:none}',

            G + '{padding:0 0 24px;font:14px/1.4 var(--fk-font);color:var(--fk-text)}',
            G + ' .fk-gh{margin:16px 0 12px;font:500 14px/1.4 var(--fk-font);color:var(--fk-text)}',
            G + ' .fk-gl{display:grid;gap:16px;margin:0;padding:0;list-style:none;',
            'grid-template-columns:repeat(auto-fill,minmax(200px,1fr))}',

            // a card: [checkbox or icon] name ⋮, and below a file's thumbnail; the name is
            // the one link, stretched over the card
            C + '{position:relative;display:grid;grid-template-columns:40px minmax(0,1fr) 40px;grid-template-rows:48px;',
            'align-items:center;margin:0;padding:0 4px;border-radius:12px;background:#f0f4f9;',
            'user-select:none;-webkit-user-select:none;-webkit-touch-callout:none;cursor:default}',
            C + ':not(.fk-gdir){grid-template-rows:48px auto;padding-bottom:8px}',
            C + ':hover{background:#e1e5ea}',
            C + '.sel,' + C + '.sel:hover{background:var(--fk-active)}',
            C + '.fcut{opacity:.5}',
            C + '.play{box-shadow:inset 0 0 0 2px var(--fk-accent)}',
            C + ':has(.fk-gname:focus-visible){outline:2px solid var(--fk-focus);outline-offset:2px}',
            C + ':has(.fk-gmore[aria-expanded=true]):not(.sel){background:#e1e5ea}',
            G + ' .fk-gname{grid-column:2;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;',
            'color:var(--fk-text);font-weight:500;text-decoration:none;outline:0}',
            G + ' .fk-gname:focus,' + G + ' .fk-gbox:focus,' + G + ' .fk-gmore:focus{outline:0;box-shadow:none}',
            G + ' .fk-gmore:focus-visible{outline:2px solid var(--fk-focus);outline-offset:-2px}',
            G + ' .fk-gname::after{content:"";position:absolute;inset:0;border-radius:inherit}',
            G + ' .fk-glead,' + G + ' .fk-gmore{position:relative;z-index:1}',
            G + ' .fk-glead{grid-column:1;display:flex;align-items:center;justify-content:center;width:40px;height:40px}',
            G + ' .fk-glead::before{content:"";width:22px;height:22px;background:#5f6368;',
            '-webkit-mask:' + mask(FILE) + ' center/contain no-repeat;mask:' + mask(FILE) + ' center/contain no-repeat}',
            G + ' .fk-gdir .fk-glead::before{-webkit-mask-image:' + mask(FOLDER) + ';mask-image:' + mask(FOLDER) + '}',
            G + ' .fk-gbox{position:absolute;inset:0;margin:auto;width:18px;height:18px;accent-color:var(--fk-accent);opacity:0;cursor:pointer}',
            // the checkbox takes the icon's place: on hover / focus and once anything is
            // selected on a mouse; on a touch screen once anything is selected
            'html.fk-anysel.fk-grid #fk-grid .fk-gbox{opacity:1}',
            'html.fk-anysel.fk-grid #fk-grid .fk-glead::before{visibility:hidden}',
            '@media (hover:hover) and (pointer:fine){',
            C + ':hover .fk-gbox,' + C + ':focus-within .fk-gbox{opacity:1}',
            C + ':hover .fk-glead::before,' + C + ':focus-within .fk-glead::before{visibility:hidden}',
            C + ':not(:hover):not(:focus-within):not(.sel) .fk-gmore[aria-expanded=false]{opacity:0}}',
            G + ' .fk-gmore{grid-column:3;width:40px;height:40px;color:var(--fk-muted)}',
            G + ' .fk-gmore .fk-ico{width:20px;height:20px}',
            G + ' .fk-gcard img{grid-column:1/-1;display:block;width:100%;height:auto;aspect-ratio:4/3;object-fit:cover;',
            'border-radius:8px;background:#fff}',
            // far below the screen, a card is laid out only once it comes near
            G + ' .fk-gfiles>li:nth-child(n+13){content-visibility:auto;contain-intrinsic-size:auto none auto 220px}',

            '@media (max-width:799px){',
            G + ' .fk-gl{gap:8px;grid-template-columns:repeat(2,minmax(0,1fr))}',
            C + '{grid-template-columns:44px minmax(0,1fr) 44px;grid-template-rows:52px;padding:0 2px}',
            C + ':not(.fk-gdir){grid-template-rows:52px auto;padding-bottom:4px}',
            G + ' .fk-gmore{width:44px;height:44px}',
            G + ' .fk-glead{width:44px;height:44px}',
            G + ' .fk-gname{font-size:13px}',
            G + ' .fk-gfiles>li:nth-child(n+9){content-visibility:auto;contain-intrinsic-size:auto none auto 180px}',
            '.fk-layout{margin:0 4px 0 8px}',
            '.fk-layout .fk-ibtn{width:48px;height:44px}}',
            '@media (pointer:coarse){' + G + ' .fk-gbox{width:22px;height:22px}}'
        ].join('');
    }
})();

