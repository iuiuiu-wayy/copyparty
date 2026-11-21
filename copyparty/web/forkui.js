"use strict";

// fork-only, drive-ux: the shared helper of the Drive-style file browser; see FORK.md.
// Loaded first by fork-browser.js; the other drive-ux scripts use window.forkui:
//   forkui.ok             false on a browser without popover / <dialog>: run nothing, the
//                         page stays upstream's plain one
//   forkui.el(tag, props, kids)  element builder; props: class, text, on: {click: fn}, and
//                         any attribute (false / null leave it out); kids: node, string or array
//   forkui.icon(name)     an inline SVG icon (aria-hidden), names in ICONS
//   forkui.style(css)     appends a <style>
//   forkui.narrow         matchMedia of the phone layout (.matches, 'change' events)
//   forkui.menu(opts)     a popup menu on a trigger button, a bottom sheet at phone width
//                         (swipe it down, tap outside or Esc to close); an item is a command
//                         (select: fn) or a link (href). Without opts.trigger it is a shared
//                         menu opened by script: open(fromKeyboard, {from, x, y})
//   forkui.dialog(opts)   a modal <dialog>: Esc, tap outside, back gesture, focus returns
// Light theme only (design tokens on :root, --fk-*). English strings, no tl/.

(function () {
    var ok = !!(window.HTMLDialogElement && HTMLElement.prototype.hasOwnProperty('popover') &&
        window.matchMedia && document.documentElement.classList);

    var SVGNS = 'http://www.w3.org/2000/svg';

    // 24x24 outline paths, drawn for this fork (no third-party icon set)
    var ICONS = {
        // the list and selection bar (forklist.js)
        'share': 'M9 11a3.5 3.5 0 1 0 0-7a3.5 3.5 0 1 0 0 7zM2.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6M19 8v6M16 11h6',
        'download': 'M12 4v11M7 10l5 5l5-5M5 20h14',
        'move': 'M3 7.5a1.5 1.5 0 0 1 1.5-1.5h4.6l2 2h8.4a1.5 1.5 0 0 1 1.5 1.5v8.5a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 18zM8.5 13.5h7M13 11l2.5 2.5L13 16',
        'delete': 'M4 7h16M10 11v6M14 11v6M6 7l1 12.1a1.5 1.5 0 0 0 1.5 1.4h7a1.5 1.5 0 0 0 1.5-1.4L18 7M9 7V4h6v3',
        'paste': 'M9 3.5h6v3H9zM9 5H6.5A1.5 1.5 0 0 0 5 6.5v13A1.5 1.5 0 0 0 6.5 21h11a1.5 1.5 0 0 0 1.5-1.5v-13A1.5 1.5 0 0 0 17.5 5H15',
        'menu': 'M3 6h18M3 12h18M3 18h18',
        'more': 'M12 5.5v.01M12 12v.01M12 18.5v.01',
        'search': 'M10.5 4a6.5 6.5 0 1 0 0 13a6.5 6.5 0 1 0 0-13zM15.5 15.5L21 21',
        'close': 'M6 6l12 12M18 6L6 18',
        'plus': 'M12 5v14M5 12h14',
        'home': 'M3 7.5a1.5 1.5 0 0 1 1.5-1.5h4.6l2 2h8.4a1.5 1.5 0 0 1 1.5 1.5v8.5a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 18z',
        'people': 'M9 11a3.5 3.5 0 1 0 0-7a3.5 3.5 0 1 0 0 7zM2.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6M16 4.3a3.5 3.5 0 0 1 0 6.4M18 14.4c2.1.8 3.5 2.8 3.5 5.6',
        'clock': 'M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18zM12 7v5l3.5 2',
        'cloud': 'M7 18.5a4.5 4.5 0 0 1-.6-9A6 6 0 0 1 18 9.6a4.5 4.5 0 0 1-.5 8.9z',
        'key': 'M15 3.5a5.5 5.5 0 1 0 0 11a5.5 5.5 0 1 0 0-11zM11 13L3.5 20.5M6 18l2.5 2.5M8.5 15.5L11 18',
        'link': 'M10 14a4.5 4.5 0 0 0 6.4 0l3-3a4.5 4.5 0 0 0-6.4-6.4l-1 1M14 10a4.5 4.5 0 0 0-6.4 0l-3 3a4.5 4.5 0 0 0 6.4 6.4l1-1',
        'tune': 'M4 7h10M18 7h2M16 5v4M4 17h2M10 17h10M8 15v4',
        'logout': 'M14 4h4.5A1.5 1.5 0 0 1 20 5.5v13a1.5 1.5 0 0 1-1.5 1.5H14M10 8l-4 4l4 4M6 12h10'
    };

    function icon(name) {
        var svg = document.createElementNS(SVGNS, 'svg'),
            p = document.createElementNS(SVGNS, 'path');
        svg.setAttribute('viewBox', '0 0 24 24');
        svg.setAttribute('aria-hidden', 'true');
        svg.setAttribute('focusable', 'false');
        svg.setAttribute('class', 'fk-ico');
        p.setAttribute('d', ICONS[name] || '');
        svg.appendChild(p);
        return svg;
    }

    function el(tag, props, kids) {
        var e = document.createElement(tag);
        props = props || {};
        for (var k in props) {
            if (!props.hasOwnProperty(k))
                continue;
            var v = props[k];
            if (v === false || v === null || v === undefined)
                continue;
            if (k == 'class')
                e.className = v;
            else if (k == 'text')
                e.textContent = v;
            else if (k == 'on')
                for (var n in v)
                    e.addEventListener(n, v[n]);
            else
                e.setAttribute(k, v === true ? '' : v);
        }
        kids = kids === undefined || kids === null ? [] : [].concat(kids);
        for (var a = 0; a < kids.length; a++)
            if (kids[a] !== null && kids[a] !== undefined && kids[a] !== false)
                e.appendChild(typeof kids[a] == 'string' ? document.createTextNode(kids[a]) : kids[a]);
        return e;
    }

    function style(css) {
        var s = el('style', { text: css });
        document.head.appendChild(s);
        return s;
    }

    // a phone is narrower than this; the nav becomes a drawer, menus bottom sheets
    var narrow = window.matchMedia ? window.matchMedia('(max-width: 799px)') : { matches: false };

    window.forkui = { ok: ok, el: el, icon: icon, style: style, narrow: narrow };
    if (!ok)
        return;

    // CSS anchor positioning with the implicit anchor of showPopover({source}); without either
    // (Firefox, Safari before 26, Chrome before 137) menus are placed by script
    var anchored = !!(window.CSS && CSS.supports && CSS.supports('position-area: block-end') &&
        window.ToggleEvent && 'source' in ToggleEvent.prototype);
    var closedby = 'closedBy' in HTMLDialogElement.prototype;

    style([
        ':root{',
        '--fk-bg:#f8fafd;--fk-surface:#fff;--fk-text:#1f1f1f;--fk-muted:#444746;',
        '--fk-line:#c4c7c5;--fk-hover:rgba(68,71,70,.08);--fk-press:rgba(68,71,70,.14);',
        '--fk-active:#c2e7ff;--fk-accent:#0b57d0;--fk-focus:#0b57d0;--fk-new:#fff;',
        '--fk-shadow:0 1px 3px rgba(0,0,0,.3),0 4px 8px 3px rgba(0,0,0,.15);',
        '--fk-font:system-ui,-apple-system,"Segoe UI",Roboto,Ubuntu,sans-serif;',
        '--fk-top:64px;--fk-nav:256px;--fk-tap:44px;--fk-r:16px}',
        '.fk-ico{width:24px;height:24px;flex:none;fill:none;stroke:currentColor;stroke-width:1.8;',
        'stroke-linecap:round;stroke-linejoin:round}',
        '.fk-ibtn{display:inline-flex;align-items:center;justify-content:center;flex:none;',
        'width:var(--fk-tap);height:var(--fk-tap);padding:0;margin:0;border:0;border-radius:50%;',
        'background:transparent;color:var(--fk-muted);cursor:pointer;font:inherit}',
        '.fk-ibtn:hover{background:var(--fk-hover)}',
        '.fk-ibtn:active{background:var(--fk-press)}',
        '.fk-ibtn:focus-visible,.fk-menu [role=menuitem]:focus-visible{outline:2px solid var(--fk-focus);outline-offset:-2px}',

        // menus: a card under the trigger; a bottom sheet at phone width
        '.fk-menu{margin:0;padding:8px 0;border:0;border-radius:4px;min-width:200px;max-width:calc(100vw - 16px);',
        'max-height:calc(100dvh - 16px);overflow:auto;box-sizing:border-box;background:var(--fk-surface);',
        'color:var(--fk-text);box-shadow:var(--fk-shadow);font:14px/1.4 var(--fk-font)}',
        '.fk-menu [role=menuitem]{display:flex;align-items:center;gap:12px;width:100%;min-height:var(--fk-tap);',
        'padding:0 16px;margin:0;border:0;background:transparent;color:inherit;font:inherit;',
        'text-align:start;text-decoration:none;cursor:pointer;border-radius:0;box-sizing:border-box}',
        '.fk-menu [role=menuitem]:hover,.fk-menu [role=menuitem]:focus{background:var(--fk-hover)}',
        '.fk-menu .fk-ico{color:var(--fk-muted)}',
        '.fk-menu .fk-sep{margin:8px 0;border:0;border-top:1px solid var(--fk-line)}',
        '.fk-menu.fk-pos{position:fixed;inset:auto}',
        '@supports (position-area: block-end){.fk-menu.fk-anc{position-area:block-end span-inline-start;',
        'position-try-fallbacks:flip-block,flip-inline,flip-block flip-inline;inset:auto;margin:4px 0}}',
        '.fk-menu.fk-sheet{position:fixed;inset:auto 0 0 0;width:auto;max-width:none;min-width:0;',
        'max-height:80dvh;border-radius:var(--fk-r) var(--fk-r) 0 0;padding:8px 0 calc(8px + env(safe-area-inset-bottom))}',
        '.fk-menu.fk-sheet [role=menuitem]{min-height:48px;font-size:16px}',
        '.fk-menu.fk-sheet::backdrop{background:rgba(0,0,0,.4)}',
        '.fk-sheet-h{margin:4px 16px 8px;font:500 14px/1.4 var(--fk-font);color:var(--fk-muted);',
        'overflow:hidden;text-overflow:ellipsis;white-space:nowrap;touch-action:none}',
        // the sheet's grab handle: a swipe down on it (or on a sheet that doesn't scroll) closes it
        '.fk-grab{height:20px;margin-top:-8px;touch-action:none;cursor:grab}',
        '.fk-grab::before{content:"";display:block;width:32px;height:4px;margin:8px auto;border-radius:2px;background:var(--fk-line)}',
        '@media (pointer:fine){.fk-menu.fk-dense:not(.fk-sheet) [role=menuitem]{min-height:32px}}',

        // dialogs
        '.fk-dlg{border:0;padding:0;color:var(--fk-text);background:var(--fk-surface);font:14px/1.4 var(--fk-font)}',
        '.fk-dlg::backdrop{background:rgba(0,0,0,.4)}'
    ].join(''));

    // under the trigger (right-aligned), or with its corner at a point (a right-click), flipped
    // to the other side when it doesn't fit, then kept inside the viewport
    function place(menu, trigger, at) {
        var r = trigger.getBoundingClientRect(),
            w = menu.offsetWidth,
            h = menu.offsetHeight,
            vw = document.documentElement.clientWidth,
            vh = window.innerHeight,
            x = r.right - w,
            y = r.bottom + 4;

        if (at) {
            x = at.x + w > vw - 8 ? at.x - w : at.x;
            y = at.y + h > vh - 8 ? at.y - h : at.y;
        }
        else {
            if (x < 8)
                x = Math.min(r.left, vw - w - 8);
            if (y + h > vh - 8 && r.top - h - 4 >= 8)
                y = r.top - h - 4;
        }
        x = Math.max(8, Math.min(x, vw - w - 8));
        y = Math.max(8, Math.min(y, vh - h - 8));
        menu.style.left = x + 'px';
        menu.style.top = y + 'px';
    }

    // a tap outside an open menu or the drawer only closes it, as on a backdrop, and doesn't also
    // open or select whatever was under the finger: its click is swallowed. Armed at pointerdown,
    // since the click can come before the close event
    function eatclick() {
        // its mousedown too, which would move focus to a focusable row under the finger
        function md(e) {
            document.removeEventListener('mousedown', md, true);
            if (e.isTrusted)
                e.preventDefault();
        }
        function h(e) {
            document.removeEventListener('click', h, true);
            if (e.isTrusted) {
                e.preventDefault();
                e.stopPropagation();
            }
        }
        document.addEventListener('mousedown', md, true);
        document.addEventListener('click', h, true);
        setTimeout(function () {
            document.removeEventListener('mousedown', md, true);
            document.removeEventListener('click', h, true);
        }, 800);
    }

    document.addEventListener('pointerdown', function (e) {
        var ms = document.querySelectorAll('.fk-menu');
        for (var a = 0; a < ms.length; a++)
            if (ms[a].matches(':popover-open') && !ms[a].contains(e.target) &&
                !ms[a].fk_trigger.contains(e.target))
                return eatclick();
    }, true);

    // put focus back on `to` after something closed: now, and again once a tap outside it has
    // finished (its mouse events land after the close and drop focus on the page)
    function refocus(to, inside) {
        function go() {
            var ae = document.activeElement;
            if (to && (!ae || ae == document.body || inside.contains(ae)))
                to.focus({ preventScroll: true });
        }
        function onclick() {
            document.removeEventListener('click', onclick, true);
            setTimeout(go, 0);
        }
        go();
        document.addEventListener('click', onclick, true);
        setTimeout(function () {
            document.removeEventListener('click', onclick, true);
            go();
        }, 800);
    }

    var nmenu = 0;

    // opts: trigger (a <button>), label (the menu's name), items: a function returning
    // [{ label, icon, select: fn }] (called on every open, so it can follow upstream's state);
    // an item with href instead of select is a link (opens in a new tab, copies as a url),
    // and { sep: true } a separator line between groups of items;
    // optional title (a string, or a function called on open), shown as the sheet's heading on
    // a phone; dense: shorter items for a mouse; onclose: called each time it has closed.
    // Without a trigger the menu is shared (one for every row, say) and opened by script:
    // open(fromKeyboard, { from, x, y }) opens it for `from` (where focus goes back to, and
    // what it sits under), or with its corner at the point x, y (a right-click). It is placed
    // by script then, so a tall menu is kept inside the viewport in every browser.
    // Returns { el, open(fromKeyboard, src), close(), isOpen(), from(), shut() }.
    function menu(opts) {
        var trigger = opts.trigger || null,
            cur = trigger,
            at = null,
            id = 'fk-menu-' + (++nmenu),
            m = el('div', {
                id: id, class: 'fk-menu' + (opts.dense ? ' fk-dense' : ''), popover: 'auto', role: 'menu',
                'aria-label': opts.label
            }),
            enter = false,
            shut = 0;

        if (trigger) {
            trigger.setAttribute('aria-haspopup', 'menu');
            trigger.setAttribute('aria-expanded', 'false');
            trigger.setAttribute('aria-controls', id);
            trigger.parentNode.insertBefore(m, trigger.nextSibling);
        }
        else
            document.body.appendChild(m);
        m.fk_trigger = trigger || m;

        function items() {
            return Array.prototype.slice.call(m.querySelectorAll('[role=menuitem]'));
        }

        function fill() {
            m.textContent = '';
            var title = typeof opts.title == 'function' ? opts.title() : opts.title;
            if (narrow.matches) {
                m.appendChild(el('div', { class: 'fk-grab', 'aria-hidden': 'true' }));
                if (title)
                    m.appendChild(el('h2', { class: 'fk-sheet-h', 'aria-hidden': 'true', text: title }));
            }
            var lst = opts.items();
            for (var a = 0; a < lst.length; a++)
                m.appendChild(item(lst[a]));
        }

        function item(it) {
            if (it.sep)
                return el('hr', { class: 'fk-sep' });
            return el(it.href ? 'a' : 'button', {
                type: it.href ? null : 'button', href: it.href || null, role: 'menuitem', tabindex: '-1',
                on: {
                    click: function (e) {
                        // a link: the browser follows it (or opens a new tab) as for any link
                        if (it.href) {
                            if (!(e.button || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey))
                                close(true);
                            return;
                        }
                        close(true);
                        it.select();
                    }
                }
            }, [it.icon ? icon(it.icon) : null, el('span', { text: it.label })]);
        }

        function open(fromKeyboard, src) {
            if (isOpen())
                m.hidePopover();
            cur = (src && src.from) || trigger;
            at = src && typeof src.x == 'number' ? { x: src.x, y: src.y } : null;
            m.fk_trigger = cur || m;
            fill();
            enter = !!fromKeyboard;
            var sheet = narrow.matches,
                script = !sheet && (!anchored || !trigger);
            m.classList.toggle('fk-sheet', sheet);
            m.classList.toggle('fk-anc', !sheet && !script);
            m.classList.toggle('fk-pos', !sheet && script);
            m.style.left = m.style.top = m.style.translate = m.style.touchAction = '';
            try {
                m.showPopover({ source: cur });
            }
            catch (e) {
                m.showPopover();
            }
        }

        function close(keepFocus) {
            if (isOpen()) {
                if (cur && (!keepFocus || m.contains(document.activeElement)))
                    cur.focus({ preventScroll: true });
                m.hidePopover();
            }
        }

        function isOpen() {
            return m.matches(':popover-open');
        }

        m.addEventListener('toggle', function (e) {
            var on = e.newState == 'open';
            if (cur && cur.hasAttribute('aria-haspopup'))
                cur.setAttribute('aria-expanded', on ? 'true' : 'false');
            if (on) {
                if (m.classList.contains('fk-pos') && cur)
                    place(m, cur, at);
                // a sheet that doesn't scroll can be swiped down from anywhere on it
                if (m.classList.contains('fk-sheet') && m.scrollHeight <= m.clientHeight)
                    m.style.touchAction = 'none';
                if (enter && items()[0])
                    items()[0].focus();
                return;
            }
            shut = Date.now();
            m.style.translate = '';
            // light dismiss or Esc: focus goes back to the trigger unless it went elsewhere
            refocus(cur, m);
            // (unless it was opened again before this event came)
            if (opts.onclose && !isOpen())
                opts.onclose();
        });

        // a bottom sheet follows a finger swiping it down and closes past a short distance (or
        // on a quick flick); from its grab handle, or anywhere while it isn't scrolled
        var drag = null;
        m.addEventListener('pointerdown', function (e) {
            drag = null;
            if (!m.classList.contains('fk-sheet') || e.button ||
                (m.scrollTop > 0 && !e.target.closest('.fk-grab,.fk-sheet-h')))
                return;
            drag = { id: e.pointerId, y: e.clientY, t: Date.now(), dy: 0 };
        });
        m.addEventListener('pointermove', function (e) {
            if (!drag || e.pointerId != drag.id)
                return;
            drag.dy = Math.max(0, e.clientY - drag.y);
            if (drag.dy > 6)
                m.style.translate = '0 ' + drag.dy + 'px';
        });
        function undrag(e) {
            if (!drag || e.pointerId != drag.id)
                return;
            var d = drag,
                v = d.dy / Math.max(1, Date.now() - d.t);
            drag = null;
            if (e.type == 'pointerup' && (d.dy > Math.min(80, m.offsetHeight / 4) || (d.dy > 24 && v > 0.5))) {
                // the click this swipe ends with picks nothing
                eatclick();
                return close();
            }
            m.style.translate = '';
        }
        m.addEventListener('pointerup', undrag);
        m.addEventListener('pointercancel', undrag);

        m.addEventListener('keydown', function (e) {
            var lst = items(),
                i = lst.indexOf(document.activeElement),
                n = lst.length,
                k = e.key;

            if (k == 'Tab')
                return close(true);
            if (k == 'Escape') {
                e.preventDefault();
                e.stopPropagation();
                return close();
            }
            if (k != 'ArrowDown' && k != 'ArrowUp' && k != 'Home' && k != 'End')
                return;
            e.preventDefault();
            e.stopPropagation();
            var to = k == 'Home' ? 0 : k == 'End' ? n - 1 :
                i < 0 ? (k == 'ArrowUp' ? n - 1 : 0) :
                    (i + (k == 'ArrowUp' ? -1 : 1) + n) % n;
            if (lst[to])
                lst[to].focus();
        });

        // Esc while it is open (focus may still be on what opened it, after a pointer open)
        // closes only the menu: upstream's hotkeys (blur, close panels) and the list's (clear
        // the selection) must not see that one
        window.addEventListener('keydown', function (e) {
            if (e.key != 'Escape' || !isOpen())
                return;
            e.preventDefault();
            e.stopImmediatePropagation();
            close();
        }, true);

        // hover follows focus, so the keyboard picks up where the pointer is
        m.addEventListener('pointermove', function (e) {
            var b = e.target.closest && e.target.closest('[role=menuitem]');
            if (b && b != document.activeElement)
                b.focus({ preventScroll: true });
        });

        if (trigger) {
            trigger.addEventListener('click', function (e) {
                e.preventDefault();
                // the pointerdown that light-dismissed it lands here as a click: stay closed
                if (isOpen() || Date.now() - shut < 300)
                    return close();
                open(e.detail === 0);
            });

            trigger.addEventListener('keydown', function (e) {
                if (e.key != 'ArrowDown')
                    return;
                e.preventDefault();
                if (!isOpen())
                    open(true);
                else if (items()[0])
                    items()[0].focus();
            });
        }

        return {
            el: m, open: open, close: close, isOpen: isOpen,
            from: function () { return cur; },
            shut: function () { return shut; }
        };
    }

    // a back gesture or back button closes the open dialog instead of leaving the folder: opening
    // pushes a history entry that closing takes away again. Upstream's own popstate handler
    // (window.onpopstate = treectl.onpopfun, which reloads the folder) must not see those two
    // steps, and a capture listener on window doesn't run before it in Chromium; so whatever
    // window.onpopstate holds is wrapped, each time a dialog opens
    var backDlg = null,
        skipPop = 0,
        afterPop = null;

    function ourpop() {
        if (skipPop) {
            skipPop--;
            var fn = afterPop;
            afterPop = null;
            if (fn)
                fn();
            return true;
        }
        if (backDlg) {
            var d = backDlg;
            backDlg = null;
            d.close();
            return true;
        }
        return false;
    }

    function guardpop() {
        var cur = window.onpopstate;
        if (cur && cur.fk_guard)
            return;
        var w = function () {
            if (!ourpop() && cur)
                return cur.apply(this, arguments);
        };
        w.fk_guard = 1;
        window.onpopstate = w;
    }

    // opts: label (the dialog's name), class, back (true: the back gesture closes it, and
    // following a link inside closes it first), kids. Returns { el, open(opener), close(then) }.
    // Esc, a tap outside (closedby="any", with our own check where it's missing) and close()
    // all close it; focus goes back to the opener.
    function dialog(opts) {
        var d = el('dialog', {
            class: 'fk-dlg' + (opts['class'] ? ' ' + opts['class'] : ''),
            'aria-label': opts.label,
            closedby: 'any'
        }, opts.kids),
            opener = null;

        document.body.appendChild(d);

        // a tap on the backdrop: its click is swallowed (see eatclick), and where closedby="any"
        // is missing (Safari) that tap closes the dialog here, as closedby would
        d.addEventListener('pointerdown', function (e) {
            var r = d.getBoundingClientRect();
            if (e.target !== d || (e.clientX >= r.left && e.clientX <= r.right &&
                e.clientY >= r.top && e.clientY <= r.bottom))
                return;
            eatclick();
            if (!closedby)
                d.close();
        });

        // backDlg == d: our history entry is still there (a back gesture has taken it already)
        d.addEventListener('close', function () {
            if (backDlg == d) {
                backDlg = null;
                skipPop++;
                guardpop();
                history.back();
                // in case no popstate comes, don't swallow a later one
                setTimeout(function () {
                    if (!skipPop)
                        return;
                    skipPop = 0;
                    var fn = afterPop;
                    afterPop = null;
                    if (fn)
                        fn();
                }, 800);
            }
            refocus(opener, d);
            if (opts.onclose)
                opts.onclose();
        });

        // a link picked inside: close first (taking the history entry away), then follow it,
        // so upstream's own history entry for the new folder lands where ours was
        if (opts.back)
            d.addEventListener('click', function (e) {
                var a = e.target.closest && e.target.closest('a[href]');
                if (!a || backDlg != d || e.button || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey)
                    return;
                e.preventDefault();
                e.stopImmediatePropagation();
                afterPop = function () {
                    a.click();
                };
                d.close();
            }, true);

        function open(from) {
            opener = from || document.activeElement;
            d.showModal();
            if (opts.back && backDlg != d) {
                guardpop();
                backDlg = d;
                history.pushState({ fk_dialog: 1 }, '', location.href);
            }
            if (opts.onopen)
                opts.onopen();
        }

        function close() {
            if (d.open)
                d.close();
        }

        return { el: d, open: open, close: close };
    }

    window.forkui.menu = menu;
    window.forkui.dialog = dialog;
})();
