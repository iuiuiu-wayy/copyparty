"use strict";

// fork-only, drive-ux: the Move to… dialog of the Drive-style file browser; see FORK.md.
// Move to… (the selection bar and the row menu, through forkui.actions.move) opens a folder
// picker at the current folder, with My files and Shared with me as roots, a breadcrumb and
// "New folder" here. Only a folder the account can write to can be picked, never one of the
// folders being moved or anything inside them, nor the folder they are already in. The move
// is paste's request (POST <src>?move=<dst>&akey=<key>), one item after another; a refusal
// is listed in the dialog by item with the server's reason, and the dialog stays open on
// what is left so another folder can be picked.
// Also restyles dragmove.js's drop targets and drag image (Drive's blue), whose own logic is
// unchanged: a mouse drag only, never on touch.
// A guest (share link) keeps the selection bar's default (cut): the picker asks the server
// for folders outside the share link, which the proxy refuses Outside.

(function () {
    var ui = window.forkui;
    if (!ui || !ui.ok || !ui.actions || !ui.list || !window.msel || !window.treectl || !window.fileman)
        return;

    var el = ui.el;

    ui.style(css());

    if (document.documentElement.classList.contains('fk-guest'))
        return;

    var home = ui.shell && ui.shell.home,   // My files, SR-prefixed, URL-quoted, ends in /
        items = [],     // what is being moved: msel's { vp, fn, isd }
        dirs = [],      // the moved folders, decoded, ending in /
        srcs = {},      // the folders they are in, decoded
        loc = null,     // the folder shown: encoded path ending in /, or null for Shared with me
        perm = [],      // the account's perms in it
        shared = null,  // forkui.views.shared's answer, once per open
        seq = 0,        // listing serial: a late reply for a folder left already is dropped
        loading = false,
        busy = false;

    function dec(p) {
        return uricom_dec(p.split('?')[0]);
    }

    function nameof(p) {
        var s = dec(p).replace(/\/$/, '');
        return s.slice(s.lastIndexOf('/') + 1);
    }

    function under(p, base) {
        return dec(p).indexOf(dec(base)) === 0;
    }

    // ---- the dialog

    var title = el('h2', { id: 'fk-mv-t', class: 'fk-mv-h' }),
        close = el('button', {
            type: 'button', class: 'fk-ibtn', 'aria-label': 'Close', title: 'Close',
            on: { click: function () { dlg.close(); } }
        }, ui.icon('close')),
        rootMine = el('button', {
            type: 'button', class: 'fk-mv-root', 'aria-pressed': 'false',
            on: { click: function () { go(home); } }
        }, [ui.icon('home'), el('span', { text: 'My files' })]),
        rootShared = el('button', {
            type: 'button', class: 'fk-mv-root', 'aria-pressed': 'false',
            on: { click: function () { go(null); } }
        }, [ui.icon('people'), el('span', { text: 'Shared with me' })]),
        roots = el('div', { class: 'fk-mv-roots', role: 'group', 'aria-label': 'Places' }, [rootMine, rootShared]),
        crumbs = el('ol'),
        trail = el('nav', { class: 'fk-mv-trail', 'aria-label': 'Folder path' }, crumbs),
        list = el('ul', { class: 'fk-mv-list', 'aria-label': 'Folders' }),
        note = el('p', { class: 'fk-mv-note', role: 'status' }),
        err = el('div', { class: 'fk-mv-err', role: 'alert' }),
        nfIn = el('input', {
            type: 'text', id: 'fk-mv-nf', class: 'fk-mv-in', autocomplete: 'off', autocapitalize: 'off',
            spellcheck: 'false', enterkeyhint: 'done'
        }),
        nfOk = el('button', { type: 'submit', class: 'fk-mv-btn', text: 'Create' }),
        nfNo = el('button', {
            type: 'button', class: 'fk-mv-btn', text: 'Cancel',
            on: { click: function () { nfshow(false); } }
        }),
        nfForm = el('form', { class: 'fk-mv-nf', hidden: true }, [
            el('label', { for: 'fk-mv-nf', text: 'New folder name' }), nfIn, nfNo, nfOk
        ]),
        nfBtn = el('button', {
            type: 'button', class: 'fk-mv-btn', on: { click: function () { nfshow(true); } }
        }, [ui.icon('newfolder'), el('span', { text: 'New folder' })]),
        cancel = el('button', {
            type: 'button', class: 'fk-mv-btn', text: 'Cancel',
            on: { click: function () { dlg.close(); } }
        }),
        ok = el('button', {
            type: 'button', class: 'fk-mv-btn fk-mv-p', text: 'Move here',
            on: { click: function () { run(); } }
        }),
        dlg = ui.dialog({
            label: 'Move', 'class': 'fk-mvdlg', back: true,
            kids: [
                el('div', { class: 'fk-mv-top' }, [title, close]),
                roots, trail, nfForm, note, list, err,
                el('div', { class: 'fk-mv-foot' }, [nfBtn, el('span', { class: 'fk-mv-gap' }), cancel, ok])
            ],
            onclose: function () {
                seq++;
            }
        });

    dlg.el.removeAttribute('aria-label');
    dlg.el.setAttribute('aria-labelledby', 'fk-mv-t');

    function settitle() {
        title.textContent = items.length == 1 ? 'Move "' + items[0].fn + '"' : 'Move ' + items.length + ' items';
    }

    // ---- where the picker is: My files, Shared with me, or the server's folders

    // [{ label, to }] from a root down to loc; to: a path, or null (Shared with me)
    function trailOf(p) {
        var ret = [], base = null, label = null;
        if (p === null)
            return [{ label: 'Shared with me', to: null }];
        if (home && under(p, home)) {
            base = home;
            ret.push({ label: 'My files', to: home });
        }
        else {
            var best = null;
            if (shared)
                shared.people.forEach(function (o) {
                    o.dirs.forEach(function (d) {
                        if (under(p, d.href) && (!best || d.href.length > best.href.length))
                            best = { href: d.href, name: d.name };
                    });
                });
            if (shared)
                shared.server.forEach(function (d) {
                    if (under(p, d.href) && (!best || d.href.length > best.href.length))
                        best = { href: d.href, name: d.name };
                });
            if (best) {
                ret.push({ label: 'Shared with me', to: null });
                ret.push({ label: best.name, to: best.href });
                base = best.href;
            }
            else {
                base = SR + '/';
                ret.push({ label: 'All folders', to: base });
            }
        }
        var rest = p.slice(base.length).split('/'),
            at = base;
        for (var a = 0; a < rest.length; a++) {
            if (!rest[a])
                continue;
            at += rest[a] + '/';
            label = uricom_dec(rest[a]);
            ret.push({ label: label, to: at });
        }
        return ret;
    }

    function drawTrail() {
        var t = trailOf(loc);
        crumbs.textContent = '';
        t.forEach(function (c, i) {
            var last = i == t.length - 1;
            crumbs.appendChild(el('li', null, el('button', {
                type: 'button', 'aria-current': last ? 'location' : null,
                on: { click: function () { if (!last) go(c.to); } }
            }, c.label)));
        });
        rootMine.hidden = !home;
        rootShared.hidden = !ui.views;
        rootMine.setAttribute('aria-pressed', loc !== null && home && under(loc, home) ? 'true' : 'false');
        rootShared.setAttribute('aria-pressed', loc === null ? 'true' : 'false');
    }

    // why loc can't be picked, or '' when it can
    function whynot() {
        if (loc === null)
            return 'Pick a folder.';
        if (!has(perm, 'write'))
            return "You can't add to this folder.";
        var p = dec(loc);
        for (var a = 0; a < dirs.length; a++)
            if (p.indexOf(dirs[a]) === 0)
                return "A folder can't be moved into itself.";
        var all = true;
        for (var a = 0; a < items.length; a++)
            if (!srcs[a] || srcs[a] != p)
                all = false;
        if (all)
            return items.length == 1 ? 'It is already in this folder.' : 'They are already in this folder.';
        return '';
    }

    function sync() {
        var why = loading ? '' : whynot();
        ok.disabled = busy || loading || !!why;
        nfBtn.disabled = busy || loading || loc === null || !has(perm, 'write');
        if (nfBtn.disabled && !loading)
            nfshow(false, true);
        if (!busy && !loading)
            note.textContent = why && loc !== null ? why : '';
    }

    function entry(label, sub, to, off, why) {
        var b = el('button', {
            type: 'button', class: 'fk-mv-dir', 'aria-disabled': off ? 'true' : null,
            title: why || null,
            on: {
                click: function () {
                    if (!off)
                        go(to, true);
                }
            }
        }, [ui.icon('folder'), el('span', { class: 'fk-mv-name' }, [
            el('span', { text: label }), sub ? ' ' : null, sub ? el('span', { class: 'fk-mv-sub', text: sub }) : null
        ])]);
        return el('li', null, b);
    }

    function focusFirst() {
        var b = list.querySelector('button:not([aria-disabled])') || ok;
        if (b.disabled)
            b = crumbs.querySelector('[aria-current]') || close;
        b.focus({ preventScroll: true });
    }

    // show a folder (a path) or Shared with me (null)
    function go(to, focus) {
        var me = ++seq;
        loc = to;
        perm = [];
        list.textContent = '';
        drawTrail();
        loading = true;
        note.textContent = 'Loading…';
        sync();
        if (to === null)
            return withShared(function () {
                if (me != seq)
                    return;
                loading = false;
                note.textContent = '';
                var n = 0;
                shared.people.forEach(function (o) {
                    o.dirs.forEach(function (d) {
                        n++;
                        list.appendChild(entry(d.name, 'from ' + o.owner, d.href));
                    });
                });
                shared.server.forEach(function (d) {
                    n++;
                    list.appendChild(entry(d.name, null, d.href));
                });
                drawTrail();
                sync();
                if (!n)
                    note.textContent = 'Nothing is shared with you yet.';
                if (focus)
                    focusFirst();
            });

        var xhr = new XMLHttpRequest();
        xhr.open('GET', to + '?ls', true);
        xhr.onload = xhr.onerror = function () {
            if (me != seq)
                return;
            loading = false;
            var j = null;
            try {
                j = xhr.status == 200 ? JSON.parse(xhr.responseText) : null;
            }
            catch (ex) { }
            if (!j) {
                list.textContent = '';
                note.textContent = 'Could not open this folder.';
                perm = [];
                ok.disabled = nfBtn.disabled = true;
                if (focus)
                    focusFirst();
                return;
            }
            perm = j.perms || [];
            var ds = (j.dirs || []).slice().sort(function (a, b) {
                return dec(a.href).localeCompare(dec(b.href));
            });
            ds.forEach(function (d) {
                var p = to + d.href.split('?')[0],
                    off = false;
                for (var a = 0; a < dirs.length; a++)
                    if (dec(p) === dirs[a])
                        off = true;
                list.appendChild(entry(nameof(d.href), null, p, off, off ? 'Being moved' : null));
            });
            sync();
            if (!ds.length && !note.textContent)
                note.textContent = 'No folders here.';
            if (focus)
                focusFirst();
        };
        xhr.send();
    }

    function withShared(fn) {
        if (shared || !ui.views)
            return fn(shared = shared || { people: [], server: [] });
        ui.views.shared(function (r) {
            shared = r || { people: [], server: [] };
            fn();
        });
    }

    // ---- New folder, here in the picker; the picker then opens it, as Drive's does

    function nfshow(on, quiet) {
        if (nfForm.hidden == !on)
            return;
        nfForm.hidden = !on;
        nfBtn.hidden = on;
        if (on) {
            nfIn.value = 'Untitled folder';
            nfIn.focus();
            nfIn.select();
        }
        else if (!quiet)
            nfBtn.focus();
    }

    nfForm.addEventListener('submit', function (e) {
        e.preventDefault();
        var name = nfIn.value.trim(),
            at = loc;
        if (!name)
            return nfIn.focus();
        nfOk.disabled = true;
        err.textContent = '';
        var fd = new FormData();
        fd.append('act', 'mkdir');
        fd.append('name', name);
        var xhr = new XMLHttpRequest();
        xhr.open('POST', at, true);
        xhr.onload = xhr.onerror = function () {
            nfOk.disabled = false;
            if (xhr.status >= 200 && xhr.status < 400) {
                var dn = xhr.getResponseHeader('X-New-Dir');
                nfshow(false, true);
                go(dn ? '/' + dn.replace(/^\/+/, '').replace(/\/?$/, '/') : at + uricom_enc(name) + '/', true);
                if (at == get_evpath())
                    treectl.goto();
                return;
            }
            err.textContent = xhr.status == 405 ? 'A folder with that name already exists here.' :
                'Could not create it: ' + reason(xhr);
            nfIn.focus();
        };
        xhr.send(fd);
    });

    // ---- moving: paste's request, one item after another

    // the server's reason, minus the URL line every error ends with
    function reason(xhr) {
        if (!xhr.status)
            return 'no reply from the server';
        var txt = (xhr.responseText || '').replace(/\s*URL:[^\n]*\s*$/, '');
        return (unpre(txt) || '').trim() || 'error ' + xhr.status;
    }

    function run() {
        if (busy || whynot())
            return;
        var dst = loc,
            src = get_evpath(),
            todo = items.slice(),
            left = [],
            bad = [],
            n = todo.length,
            i = 0;

        busy = true;
        err.textContent = '';
        sync();

        function next() {
            if (i >= n)
                return done();
            var it = todo[i++];
            note.textContent = 'Moving ' + i + ' of ' + n + '…';
            var xhr = new XMLHttpRequest();
            xhr.open('POST', it.vp + '?move=' + dst + uricom_enc(it.fn) + '&akey=' + randstr(9), true);
            xhr.onload = xhr.onerror = function () {
                if (xhr.status != 201) {
                    left.push(it);
                    bad.push({ fn: it.fn, why: reason(xhr) });
                }
                next();
            };
            xhr.send();
        }

        function done() {
            busy = false;
            var moved = n - bad.length,
                where = trailOf(dst).pop().label;
            treectl.goto();
            fileman.tx(src);
            fileman.tx(dst);
            if (!bad.length) {
                dlg.close();
                toast.ok(5, esc(n == 1 ? '"' + items[0].fn + '" moved to ' + where :
                    n + ' items moved to ' + where));
                return;
            }
            setitems(left);
            note.textContent = '';
            err.textContent = '';
            err.appendChild(el('p', {
                text: (moved ? moved + ' of ' + n + ' moved to ' + where + '. ' : '') +
                    (bad.length == 1 ? 'Not moved:' : bad.length + ' not moved:')
            }));
            err.appendChild(el('ul', null, bad.map(function (b) {
                return el('li', null, [el('b', { text: b.fn }), ': ' + b.why]);
            })));
            sync();
        }

        next();
    }

    // ---- opening

    function setitems(its) {
        items = its;
        dirs = [];
        srcs = {};
        for (var a = 0; a < its.length; a++) {
            var vp = dec(its[a].vp);
            if (its[a].isd)
                dirs.push(vp.replace(/\/?$/, '/'));
            srcs[a] = vp.replace(/\/?$/, '').replace(/[^\/]*$/, '');
        }
        settitle();
    }

    // msel's items for these rows, each once (getsel lists them twice after a sort)
    function itemsOf(rows) {
        var all = msel.getall(),
            ids = {},
            seen = {},
            ret = [];
        rows.forEach(function (tr) {
            var id = tr2id(tr);
            if (id)
                ids[id] = 1;
        });
        for (var a = 0; a < all.length; a++)
            if (ids[all[a].id] && !seen[all[a].vp]) {
                seen[all[a].vp] = 1;
                ret.push(all[a]);
            }
        return ret;
    }

    function open(rows) {
        msel.load();
        var its = itemsOf(rows || ui.list.rows(true));
        if (!its.length)
            return;
        setitems(its);
        busy = false;
        shared = null;
        err.textContent = '';
        nfshow(false, true);
        var opener = document.activeElement;
        dlg.open(opener && opener != document.body && opener.offsetParent ? opener : null);
        // null once the server lists no home folder (forkshell.js), known only after load
        home = ui.shell && ui.shell.home;
        // the current folder; in search results (items from anywhere) My files
        var start = ui.list.insrch() ? (home || get_evpath()) : get_evpath();
        // the trail names a shared folder once Shared with me is known
        if (ui.views && !(home && under(start, home)))
            withShared(function () {
                if (dlg.el.open)
                    go(start, true);
            });
        else
            go(start, true);
    }

    ui.actions.move = open;
    ui.move = { open: open };

    function css() {
        return [
            // dragmove.js's drop target and drag image, in this look
            'html.fk-list #files tbody tr.fmv-hl{outline:2px solid var(--fk-accent);outline-offset:-2px;background:#d3e3fd!important}',
            'html.fk-list #files tbody tr.fmv-hl td{background:transparent!important}',
            '#treeul a.fmv-hl,#path a.fmv-hl{outline:2px solid var(--fk-accent);outline-offset:-2px;background:#d3e3fd;border-radius:4px}',
            '.fmv-img{padding:8px 16px!important;border-radius:8px!important;background:var(--fk-accent,#0b57d0)!important;',
            'color:#fff!important;font:500 14px/1.4 var(--fk-font,sans-serif)!important;box-shadow:var(--fk-shadow)}',

            '.fk-mvdlg[open]{display:flex;flex-direction:column;width:min(560px,calc(100vw - 32px));',
            'height:min(640px,calc(100dvh - 32px));border-radius:var(--fk-r);box-shadow:var(--fk-shadow);',
            'overscroll-behavior:contain}',
            '.fk-mvdlg::backdrop{overflow:hidden;overscroll-behavior:contain}',
            '.fk-mv-top{display:flex;align-items:center;gap:8px;padding:16px 8px 4px 24px}',
            '.fk-mv-h{flex:1 1 auto;min-width:0;margin:0;font:400 22px/1.3 var(--fk-font);overflow:hidden;',
            'text-overflow:ellipsis;white-space:nowrap}',
            '.fk-mv-roots{display:flex;gap:8px;padding:8px 24px;flex-wrap:wrap}',
            '.fk-mv-root{display:inline-flex;align-items:center;gap:8px;min-height:var(--fk-tap);padding:0 16px 0 12px;',
            'border:1px solid var(--fk-line);border-radius:8px;background:transparent;color:var(--fk-text);',
            'font:500 14px var(--fk-font);cursor:pointer}',
            '.fk-mv-root[aria-pressed=true]{background:var(--fk-active);border-color:var(--fk-active)}',
            '.fk-mv-root .fk-ico{width:20px;height:20px}',
            '.fk-mv-root[hidden]{display:none}',
            '.fk-mv-trail{padding:4px 16px}',
            '.fk-mv-trail ol{display:flex;flex-wrap:wrap;align-items:center;margin:0;padding:0;list-style:none}',
            '.fk-mv-trail li{display:flex;align-items:center;min-width:0}',
            '.fk-mv-trail li+li::before{content:"\\203a" / "";padding:0 2px;color:var(--fk-muted)}',
            '.fk-mv-trail button{min-height:var(--fk-tap);max-width:40vw;padding:0 8px;border:0;border-radius:8px;',
            'background:transparent;color:var(--fk-muted);font:14px var(--fk-font);cursor:pointer;',
            'overflow:hidden;text-overflow:ellipsis;white-space:nowrap;text-decoration:underline}',
            '.fk-mv-trail button[aria-current]{color:var(--fk-text);font-weight:600;text-decoration:none;cursor:default}',
            '.fk-mv-trail button:hover:not([aria-current]){background:var(--fk-hover)}',
            '.fk-mv-list{flex:1 1 auto;min-height:0;overflow:auto;overscroll-behavior:contain;margin:0;padding:0 0 8px;',
            'list-style:none;border-top:1px solid #e1e3e1}',
            '.fk-mv-dir{display:flex;align-items:center;gap:16px;width:100%;min-height:48px;padding:4px 24px;margin:0;',
            'border:0;background:transparent;color:var(--fk-text);font:14px/1.4 var(--fk-font);text-align:start;cursor:pointer}',
            '.fk-mv-dir:hover{background:var(--fk-hover)}',
            '.fk-mv-dir[aria-disabled]{opacity:.45;cursor:not-allowed}',
            '.fk-mv-dir .fk-ico{color:var(--fk-muted)}',
            '.fk-mv-name{display:flex;flex-direction:column;min-width:0}',
            '.fk-mv-name>span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
            '.fk-mv-sub{font-size:12px;color:var(--fk-muted)}',
            '.fk-mv-note{margin:0;padding:4px 24px;min-height:1.4em;color:var(--fk-muted)}',
            '.fk-mv-note:empty{display:none}',
            '.fk-mv-err{padding:0 24px;color:#b3261e;max-height:30dvh;overflow:auto}',
            '.fk-mv-err:empty{display:none}',
            '.fk-mv-err p{margin:8px 0 4px}',
            '.fk-mv-err ul{margin:0 0 8px;padding-left:20px}',
            '.fk-mv-nf{display:flex;flex-wrap:wrap;align-items:center;gap:8px;padding:4px 24px 8px}',
            '.fk-mv-nf[hidden]{display:none}',
            '.fk-mv-nf label{flex:1 1 100%;font-size:12px;color:var(--fk-muted)}',
            '.fk-mv-in{flex:1 1 160px;min-height:var(--fk-tap);padding:0 12px;border:1px solid var(--fk-line);',
            'border-radius:4px;font:16px var(--fk-font);box-sizing:border-box}',
            '.fk-mv-foot{display:flex;align-items:center;gap:8px;padding:12px 16px calc(12px + env(safe-area-inset-bottom));',
            'border-top:1px solid #e1e3e1;flex-wrap:wrap}',
            '.fk-mv-gap{flex:1 1 auto}',
            '.fk-mv-btn{display:inline-flex;align-items:center;gap:8px;min-height:var(--fk-tap);padding:0 16px;border:0;',
            'border-radius:22px;background:transparent;color:var(--fk-accent);font:500 14px var(--fk-font);cursor:pointer}',
            '.fk-mv-btn[hidden]{display:none}',
            '.fk-mv-btn:hover:not(:disabled){background:var(--fk-hover)}',
            '.fk-mv-btn:disabled{opacity:.5;cursor:default}',
            '.fk-mv-p{background:var(--fk-accent);color:#fff}',
            '.fk-mv-p:hover:not(:disabled){background:#0842a0}',
            '.fk-mv-p:disabled{background:#e3e3e3;color:#6b6b6b;opacity:1}',
            '.fk-mvdlg button:focus-visible,.fk-mv-in:focus-visible{outline:2px solid var(--fk-focus);outline-offset:-2px}',
            '.fk-mvdlg :focus:not(:focus-visible){outline:0;box-shadow:none}',
            // a phone: the whole screen, the buttons at the bottom within thumb reach
            '@media (max-width:799px){.fk-mvdlg[open]{width:100vw;max-width:100vw;height:100dvh;max-height:100dvh;',
            'margin:0;border-radius:0}.fk-mv-top{padding:8px 4px 0 16px}.fk-mv-roots,.fk-mv-nf{padding-inline:16px}',
            '.fk-mv-dir{padding:4px 16px;min-height:56px}.fk-mv-err,.fk-mv-note{padding-inline:16px}}'
        ].join('');
    }
})();
