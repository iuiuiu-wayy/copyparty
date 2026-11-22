"use strict";

// fork-only: drag rows of the file list onto a folder to move them; see FORK.md.
// Loaded by fork-browser.js, so upstream's browser.js and up2k.js stay as they are.
// Targets: a folder row in the list, a folder link in the sidebar tree, a breadcrumb.
// A drop sends paste's request (POST <src>?move=<dst>&akey=<key>) once per item, with no
// confirmation; the server decides everything the page can't know.
// List view, normal folder listing, mouse only: grid view, search results and touch are
// left as upstream has them.
// A move-drag carries a private data type; while one is over the page, window-level
// capture listeners keep the drag events away from up2k's body handlers (its upload
// overlay and "drop a link" toast). Drags without that type (desktop files) reach up2k.

(function () {
    if (!window.msel || !window.fileman || !window.treectl || !ebi('files'))
        return;

    var MIME = 'application/x-copyparty-fork-move',
        drag = null,  // this tab's move-drag: { items, cur, dirs }
        ptr = 'mouse',
        hl = null,
        busy = false;

    var css = mknod('style');
    css.textContent = [
        '#files tbody tr.fmv-hl, #treeul a.fmv-hl, #path a.fmv-hl { outline: 2px dashed var(--a); outline-offset: -2px; }',
        '#files tbody tr.fmv-hl td { background: var(--bg-u3); }',
        '.fmv-img { position: fixed; top: -100px; left: 0; padding: .3em .6em; border-radius: .3em; background: var(--a); color: #000; font-weight: bold; white-space: nowrap; }'
    ].join('\n');
    document.head.appendChild(css);

    // decoded path, ending in '/'
    function dirpath(p) {
        p = uricom_dec(p.split('?')[0].split('#')[0]);
        return p.endsWith('/') ? p : p + '/';
    }

    function can_start() {
        return ptr == 'mouse' &&
            !(window.thegrid && thegrid.en) &&
            !ebi('unsearch') &&
            typeof have_mv != 'undefined' && have_mv &&
            typeof perms != 'undefined' && has(perms, 'move');
    }

    // msel's item for a row: { id, vp, fn, isd, q }
    function row_item(tr) {
        var id = tr2id(tr);
        if (!id)
            return null;

        var all = msel.getall();
        for (var a = 0; a < all.length; a++)
            if (all[a].id == id)
                return all[a];

        return null;
    }

    // msel.getsel() lists each selected item twice right after a sort
    function selected() {
        var sel = msel.getsel(),
            seen = {},
            ret = [];

        for (var a = 0; a < sel.length; a++) {
            if (seen[sel[a].vp])
                continue;
            seen[sel[a].vp] = 1;
            ret.push(sel[a]);
        }
        return ret;
    }

    function elem(n) {
        return n && n.nodeType != 1 ? n.parentNode : n;
    }

    // the file-list row under node n, or null
    function row_of(n) {
        n = elem(n);
        return (n && n.closest && n.closest('#files tbody tr')) || null;
    }

    function setptr(e) {
        ptr = e.pointerType || 'mouse';
    }

    // the drop target under el: { el, dst (encoded url path), dir (decoded), ok }
    function target(el) {
        el = elem(el);
        if (!el || !el.closest)
            return null;

        var t = null,
            tr = row_of(el),
            a = el.closest('#treeul li>a+a') || el.closest('#path a[href]:not([data-fk-view])');

        if (tr) {
            var it = row_item(tr);
            if (it && it.isd)
                t = { "el": tr, "dst": it.vp + '/' };
        }
        else if (a && a.pathname && a.getAttribute('href').split('?')[0].endsWith('/'))
            t = { "el": a, "dst": a.pathname };

        if (!t)
            return null;

        t.dir = dirpath(t.dst);
        t.ok = !!drag && t.dir != drag.cur;
        for (var b = 0; t.ok && b < drag.dirs.length; b++)
            if (t.dir.startsWith(drag.dirs[b]))
                t.ok = false;

        return t;
    }

    function sethl(el) {
        if (hl == el)
            return;
        if (hl)
            clmod(hl, 'fmv-hl');
        hl = el;
        if (hl)
            clmod(hl, 'fmv-hl', 1);
    }

    // rows become draggable under a mouse, where a move-drag may start
    document.addEventListener('pointerover', function (e) {
        setptr(e);
        var tr = row_of(e.target);
        if (!tr)
            return;

        if (can_start() && tr2id(tr))
            tr.setAttribute('draggable', 'true');
        else
            tr.removeAttribute('draggable');
    }, true);

    document.addEventListener('pointerdown', setptr, true);

    document.addEventListener('dragstart', function (e) {
        drag = null;
        var tr = row_of(e.target);

        if (!tr || !can_start())
            return;

        var it = row_item(tr);
        if (!it)
            return;

        var items = clgot(tr, 'sel') ? selected() : [];
        if (!items.length)
            items = [it];

        var urls = [],
            dirs = [];

        for (var a = 0; a < items.length; a++) {
            var x = items[a];
            urls.push(location.origin + x.vp + (x.isd ? '/' : '') + (x.q || ''));
            if (x.isd)
                dirs.push(dirpath(x.vp));
        }

        var dt = e.dataTransfer;
        try {
            dt.setData(MIME, '' + items.length);
            dt.setData('text/uri-list', urls.join('\r\n'));
            dt.setData('text/plain', urls.join('\n'));
            dt.effectAllowed = 'all';
        }
        catch (ex) {
            return;
        }

        var img = mknod('div');
        img.className = 'fmv-img';
        img.textContent = items.length == 1 ? '1 item: ' + items[0].fn : items.length + ' items';
        document.body.appendChild(img);
        try {
            dt.setDragImage(img, -12, -12);
        }
        catch (ex) { }
        setTimeout(function () {
            img.parentNode.removeChild(img);
        }, 1);

        drag = {
            "items": items,
            "cur": dirpath(get_evpath()),
            "dirs": dirs
        };
    }, true);

    // a move-drag: from this tab (drag), or another tab's (only the type is visible)
    function mine(e) {
        if (drag)
            return true;
        try {
            var types = e.dataTransfer.types;
            for (var a = 0; a < types.length; a++)
                if (types[a] == MIME)
                    return true;
        }
        catch (ex) { }
        return false;
    }

    function onover(e) {
        if (!mine(e))
            return;

        e.stopPropagation();
        var t = target(e.target),
            ok = t && t.ok && !busy;

        sethl(ok ? t.el : null);
        if (ok)
            e.preventDefault();
        try {
            e.dataTransfer.dropEffect = ok ? 'move' : 'none';
        }
        catch (ex) { }
    }

    window.addEventListener('dragenter', onover, true);
    window.addEventListener('dragover', onover, true);

    window.addEventListener('dragleave', function (e) {
        if (!mine(e))
            return;

        e.stopPropagation();
        if (!e.relatedTarget)
            sethl(null);
    }, true);

    window.addEventListener('drop', function (e) {
        if (!mine(e))
            return;

        e.stopPropagation();
        e.preventDefault();
        var t = target(e.target),
            d = drag;

        sethl(null);
        drag = null;
        if (t && t.ok && !busy)
            move(d.items, t.dst);
    }, true);

    document.addEventListener('dragend', function () {
        sethl(null);
        drag = null;
    }, true);

    // the server's reason, minus the URL line every error ends with
    function reason(xhr) {
        if (!xhr.status)
            return 'no reply from the server';
        var txt = (xhr.responseText || '').replace(/\s*URL:[^\n]*\s*$/, '');
        return unpre(txt) || 'error ' + xhr.status;
    }

    // one item after another, as paste does; a refused item doesn't stop the rest
    function move(items, dst) {
        var src = get_evpath(),
            n = items.length,
            i = 0,
            nok = 0,
            bad = [],
            stop = false,
            key = '';

        busy = true;

        function abort(e) {
            ev(e);
            stop = true;
            toast.inf(30, 'aborting the move...');
            var xhr = new XHR();
            xhr.open('POST', SR + '/?fs_abrt=' + key, true);
            xhr.send();
        }

        function next() {
            if (stop || i >= n)
                return done();

            var it = items[i++];
            toast.show('inf r', 0, esc('moving ' + i + ' of ' + n + ': ' + it.fn) +
                '\n<a id="fmv_abrt" class="btn" href="#">abort</a>');
            ebi('fmv_abrt').onclick = abort;

            key = randstr(9);
            var xhr = new XHR();
            xhr.open('POST', it.vp + '?move=' + dst + uricom_enc(it.fn) + '&akey=' + key, true);
            xhr.onload = xhr.onerror = function () {
                if (this.status == 201)
                    nok++;
                else
                    bad.push('<b>' + esc(it.fn) + '</b>: ' + reason(this));
                next();
            };
            xhr.send();
        }

        function done() {
            busy = false;
            var msg = esc(nok + ' of ' + n + ' moved to ' + uricom_dec(dst));
            if (i < n)
                msg += esc(', aborted before the other ' + (n - i));
            if (bad.length)
                msg += '\n\nnot moved:\n' + bad.join('\n');

            if (!bad.length && i == n)
                toast.ok(5, msg);
            else if (nok)
                toast.warn(0, msg);
            else
                toast.err(0, msg);

            treectl.goto();
            fileman.tx(src);
            fileman.tx(dst);
        }

        next();
    }
})();
