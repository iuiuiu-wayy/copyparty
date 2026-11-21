"use strict";

// fork-only, drive-ux: + New and the upload card of the Drive-style file browser; see FORK.md.
// + New (forkshell.js's nav button, and a floating + on a phone) offers New folder, File
// upload, Folder upload and New text file, hidden where the folder isn't writable. Uploads
// go through up2k's own file inputs, so up2k stays the only uploader (resume, dedup, its
// settings). The card at the bottom right reads up2k's state (up2k.ui.tab, up2k.st.files)
// and shows each file's progress, done and failed; Details opens up2k's full panel.
// Differences from upstream, in this look only: picking or dropping files doesn't open
// up2k's panel (the card shows the upload; a drop in search mode still opens it), and
// New folder / New text file stay in the folder instead of opening the new one.
// For the other drive-ux scripts (the folder menu, ticket 12): forkui.create =
// { items(), folder(opener), files(), dir(), textfile(opener) }; items() is the menu's list
// for forkui.menu, empty where the folder can't be written to.

(function () {
    var ui = window.forkui;
    if (!ui || !ui.ok || !window.L || !window.treectl || !window.goto || !ebi('op_up2k'))
        return;

    var el = ui.el,
        de = document.documentElement,
        guest = de.classList.contains('fk-guest'),
        MAXROWS = 100;

    function perm(p) {
        return has(window.perms || [], p);
    }

    // ---- uploading through up2k's own inputs

    // up2k's gotfile opens its panel (goto('up2k')) on every pick or drop; while one of ours
    // is handled, only load the hasher as opening the panel would (goto_up2k)
    var hushed = false;
    function hush() {
        hushed = true;
        setTimeout(function () {
            hushed = false;
        }, 0);
    }
    var ogoto = window.goto;
    window.goto = function (dest) {
        if (hushed && dest == 'up2k' && window.up2k && !up2k.uc.fsearch && !QS('#op_up2k.act')) {
            up2k.init_deps();
            return;
        }
        return ogoto.apply(this, arguments);
    };
    document.addEventListener('change', function (e) {
        if (e.target.closest && e.target.closest('#u2form'))
            hush();
    }, true);
    window.addEventListener('drop', function (e) {
        var t = e.dataTransfer && e.dataTransfer.types;
        if (t && Array.prototype.indexOf.call(t, 'Files') >= 0)
            hush();
    }, true);

    function closedrawer() {
        var d = QS('dialog.fk-drawer');
        if (d && d.open)
            d.close();
    }

    // up2k's newest file input; .click() keeps the user gesture of the menu pick
    function pick(dir) {
        closedrawer();
        if (!window.up2k) {
            if (ui.opentool)
                ui.opentool(window.up2k === false ? 'bup' : 'up2k');
            return;
        }
        var l = QSA('#u2form input[type=file]' + (dir ? '[webkitdirectory]' : ':not([webkitdirectory])'));
        if (l.length)
            l[l.length - 1].click();
    }

    // ---- New folder and New text file: a small dialog each

    function namedlg(o) {
        var input = el('input', {
            type: 'text', class: 'fk-nd-in', id: 'fk-nd-' + o.kind, autocomplete: 'off',
            autocapitalize: 'off', spellcheck: 'false', enterkeyhint: 'done'
        }),
            err = el('p', { class: 'fk-nd-err', role: 'alert' }),
            ok = el('button', { type: 'submit', class: 'fk-btn fk-btn-p', text: 'Create' }),
            cancel = el('button', { type: 'button', class: 'fk-btn', text: 'Cancel' }),
            form = el('form', { class: 'fk-nd', method: 'dialog' }, [
                el('h2', { text: o.title }),
                el('label', { for: input.id, text: o.field }),
                input, err,
                el('div', { class: 'fk-nd-btns' }, [cancel, ok])
            ]),
            d = ui.dialog({
                label: o.title, 'class': 'fk-ndlg', kids: form,
                onopen: function () {
                    err.textContent = '';
                    ok.disabled = false;
                    input.value = o.value();
                    input.focus();
                    var dot = input.value.lastIndexOf('.');
                    input.setSelectionRange(0, dot > 0 ? dot : input.value.length);
                }
            });

        cancel.addEventListener('click', function () {
            d.close();
        });
        form.addEventListener('submit', function (e) {
            e.preventDefault();
            var name = input.value.trim(),
                bad = name ? o.check(name) : 'Type a name.';
            if (bad) {
                err.textContent = bad;
                return input.focus();
            }
            ok.disabled = true;
            err.textContent = '';
            var fd = new FormData();
            fd.append('act', o.act);
            fd.append('name', name);
            var vp = get_evpath(),
                xhr = new XMLHttpRequest();
            xhr.open('POST', vp, true);
            xhr.onload = xhr.onerror = function () {
                ok.disabled = false;
                var s = xhr.status;
                if (s >= 200 && s < 400) {
                    d.close();
                    if (get_evpath() == vp)
                        treectl.goto();
                    return;
                }
                err.textContent = s == o.exists ? o.taken :
                    'Could not create it: ' + (unpre(xhr.responseText || '').trim() || 'no answer from the server');
                input.focus();
            };
            xhr.send(fd);
        });

        return function (opener) {
            closedrawer();
            d.open(opener && opener.offsetParent ? opener : null);
        };
    }

    var folder = namedlg({
        kind: 'dir', title: 'New folder', field: 'Folder name', act: 'mkdir', exists: 405,
        taken: 'A folder with that name already exists here.',
        value: function () { return 'Untitled folder'; },
        check: function () { return ''; }
    });

    // upstream lets read+write (without delete) only make files it may edit later: the
    // volume's rw_edit endings (".md" by default)
    var textfile = namedlg({
        kind: 'file', title: 'New text file', field: 'File name', act: 'new_md', exists: 500,
        taken: 'A file with that name already exists here.',
        value: function () {
            return perm('delete') || !window.re_rw_edit || re_rw_edit.test('x.txt') ? 'untitled.txt' : 'untitled.md';
        },
        check: function (name) {
            if (perm('delete') || !window.re_rw_edit || re_rw_edit.test(name))
                return '';
            return 'Here the name must end in .' + (window.rw_edit || 'md').split(',').join(' or .') + '.';
        }
    });

    function items(opener) {
        var ret = [];
        if (!perm('write'))
            return ret;
        ret.push({ label: 'New folder', icon: 'newfolder', select: function () { folder(opener); } });
        ret.push({ label: 'File upload', icon: 'upload', select: function () { pick(false); } });
        // upstream offers no folder pick on a phone either (up2k.js nav())
        if (!MOBILE && window.up2k !== false)
            ret.push({ label: 'Folder upload', icon: 'upfolder', select: function () { pick(true); } });
        if (perm('read'))
            ret.push({ label: 'New text file', icon: 'newfile', select: function () { textfile(opener); } });
        return ret;
    }

    ui.create = {
        items: items, folder: folder, textfile: textfile,
        files: function () { pick(false); },
        dir: function () { pick(true); }
    };

    // ---- the + New button, and the floating + on a phone

    var fab = guest ? null : el('button', { type: 'button', class: 'fk-fab', 'aria-label': 'New' }, ui.icon('plus'));

    // ---- the upload card

    var head = el('h2', { class: 'fk-card-h', id: 'fk-card-h' }),
        list = el('ul', { class: 'fk-card-list', id: 'fk-card-list' }),
        more = el('p', { class: 'fk-card-more' }),
        status = el('div', { class: 'fk-sr', role: 'status' }),
        colbtn = el('button', {
            type: 'button', class: 'fk-ibtn fk-card-col', 'aria-label': 'Collapse',
            'aria-expanded': 'true', 'aria-controls': 'fk-card-list'
        }, ui.icon('chevron')),
        xbtn = el('button', { type: 'button', class: 'fk-ibtn', 'aria-label': 'Close' }, ui.icon('close')),
        detbtn = el('button', { type: 'button', class: 'fk-btn', text: 'Details' }),
        card = el('section', { class: 'fk-card', 'aria-label': 'Uploads', hidden: true }, [
            el('div', { class: 'fk-card-top' }, [head, colbtn, xbtn]),
            el('div', { class: 'fk-card-body' }, [list, more, el('div', { class: 'fk-card-foot' }, detbtn)]),
            status
        ]),
        dock = el('div', { class: 'fk-dock' }, [fab, card]);

    document.body.appendChild(dock);

    var base = 0,       // the card shows up2k's files from this index on (Close moves it)
        open = false,
        rows = {},
        tick = null,
        said = '';

    colbtn.addEventListener('click', function () {
        var c = !card.classList.contains('fk-col');
        card.classList.toggle('fk-col', c);
        colbtn.setAttribute('aria-expanded', c ? 'false' : 'true');
        colbtn.setAttribute('aria-label', c ? 'Expand' : 'Collapse');
    });

    xbtn.addEventListener('click', function () {
        var had = card.contains(document.activeElement);
        open = false;
        base = window.up2k ? up2k.ui.tab.length : 0;
        card.hidden = true;
        list.textContent = '';
        rows = {};
        stop();
        if (had) {
            var to = fab && fab.offsetParent ? fab : ui.newbtn && ui.newbtn.offsetParent ? ui.newbtn : null;
            if (to)
                to.focus({ preventScroll: true });
        }
    });

    detbtn.addEventListener('click', function () {
        if (ui.opentool)
            ui.opentool('up2k');
        else
            goto('up2k');
    });

    function text(html) {
        var t = document.createElement('div');
        t.innerHTML = html || '';
        return (t.textContent || '').trim();
    }

    function plural(n, one, many) {
        return n + ' ' + (n == 1 ? one : many);
    }

    function row(n, f) {
        var r = rows[n];
        if (r)
            return r;
        var vp = get_evpath(),
            path = uricom_dec(f.purl.indexOf(vp) === 0 ? f.purl.slice(vp.length) : f.purl) + f.name;
        r = rows[n] = {
            li: el('li', { class: 'fk-up' }),
            ico: el('span', { class: 'fk-up-ico' }),
            st: el('span', { class: 'fk-up-st' }),
            bar: el('progress', { max: '1', value: '0', 'aria-label': f.name })
        };
        r.li.appendChild(r.ico);
        r.li.appendChild(el('div', { class: 'fk-up-txt' }, [
            el('span', { class: 'fk-up-name', title: path, text: f.name }), r.st, r.bar
        ]));
        list.appendChild(r.li);
        return r;
    }

    function set(r, state, st, val) {
        if (r.state != state) {
            r.state = state;
            r.li.className = 'fk-up fk-up-' + state;
            r.ico.textContent = '';
            if (state == 'ok' || state == 'ng')
                r.ico.appendChild(ui.icon(state == 'ok' ? 'check' : 'alert'));
        }
        if (r.st.textContent != st)
            r.st.textContent = st;
        if (val === null)
            r.bar.removeAttribute('value');
        else if (r.bar.value != val)
            r.bar.value = val;
    }

    function render() {
        if (!window.up2k || !open)
            return stop();
        var tab = up2k.ui.tab,
            files = up2k.st.files,
            nok = 0, nng = 0, nbusy = 0, nrow = 0, nmore = 0;

        for (var n = base; n < tab.length; n++) {
            var fo = tab[n], f = files[n];
            if (!f || f.srch)
                continue;
            var state = fo.in == 'ok' ? 'ok' : fo.in == 'ng' ? 'ng' : 'busy';
            if (state == 'ok')
                nok++;
            else if (state == 'ng')
                nng++;
            else
                nbusy++;

            if (++nrow > MAXROWS) {
                nmore++;
                continue;
            }
            var r = row(n, f);
            if (state == 'ok')
                set(r, state, 'Done', 1);
            else if (state == 'ng')
                set(r, state, 'Failed: ' + (text(fo.hp) || text(fo.ht) || 'error'), 0);
            else if (fo.bd > 0 || f.t_uploading)
                set(r, state, humansize(fo.bd) + ' of ' + humansize(fo.bt), fo.bt ? fo.bd / fo.bt : 0);
            else if (fo.nh || f.t_hashing)
                set(r, state, 'Preparing', null);
            else
                set(r, state, 'Waiting', null);
        }

        if (!nrow)
            return;

        card.hidden = false;
        more.textContent = nmore ? 'and ' + plural(nmore, 'more file', 'more files') + ' (see Details)' : '';
        var h = nbusy ? 'Uploading ' + plural(nbusy, 'item', 'items') :
            plural(nok, 'upload', 'uploads') + ' complete' + (nng ? ', ' + nng + ' failed' : '');
        if (head.textContent != h)
            head.textContent = h;
        if (!nbusy) {
            stop();
            // once per finished batch, for a screen reader (the heading changes silently)
            if (said != h + base + tab.length) {
                said = h + base + tab.length;
                status.textContent = h;
            }
        }
    }

    function start() {
        open = true;
        if (!tick)
            tick = setInterval(render, 300);
        setTimeout(render, 0);
    }

    function stop() {
        if (tick)
            clearInterval(tick);
        tick = null;
    }

    function hook() {
        if (!window.up2k || !up2k.ui || up2k.ui.fk_card)
            return;
        var add = up2k.ui.addfile;
        up2k.ui.addfile = function () {
            var ret = add.apply(this, arguments);
            if (!up2k.uc.fsearch)
                start();
            return ret;
        };
        up2k.ui.fk_card = 1;
    }
    if (window.up2k)
        hook();
    else if (window.up2k_hooks)
        up2k_hooks.push(hook);

    // ---- keep the + button and the card above upstream's audio bar, and the list's last
    // row above both

    function below() {
        var w = ebi('widget'),
            h = 0;
        if (w && w.classList.contains('open')) {
            var r = w.getBoundingClientRect();
            h = Math.max(0, Math.round(window.innerHeight - r.top));
        }
        de.style.setProperty('--fk-below', h + 'px');
    }
    var wg = ebi('widget');
    if (wg) {
        if (window.MutationObserver)
            new MutationObserver(function () {
                below();
                setTimeout(below, 250);
            }).observe(wg, { attributes: true, attributeFilter: ['class'] });
        wg.addEventListener('transitionend', below);
    }
    window.addEventListener('resize', below);
    below();
    if (window.ResizeObserver)
        new ResizeObserver(function () {
            de.style.setProperty('--fk-dockh', dock.offsetHeight + 'px');
        }).observe(dock);

    if (!guest) {
        var menus = [fab];
        if (ui.newbtn)
            menus.push(ui.newbtn);
        menus.forEach(function (b) {
            ui.menu({
                trigger: b, label: 'New', title: 'New', items: function () {
                    return items(b);
                }
            });
        });
    }

    ui.style([
        // + New and the floating + only where the folder can be written to (upstream's
        // html.write, set by apply_perms)
        'html.fk:not(.write) .fk-newwrap,.fk-fab{display:none}',
        '.fk-sr{position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap}',
        '.fk-dock{position:fixed;z-index:25;right:0;bottom:var(--fk-below,0px);display:flex;flex-direction:column;',
        'align-items:flex-end;gap:16px;padding:0 max(16px,env(safe-area-inset-right)) 0 16px;pointer-events:none;',
        'font:14px/1.4 var(--fk-font);color:var(--fk-text)}',
        '.fk-dock>*{pointer-events:auto}',
        'html.fk #wrap{padding-bottom:max(7em,calc(var(--fk-dockh,0px) + var(--fk-below,0px) + 16px))}',
        // upstream's toasts ("N uploads OK", errors) come up bottom right too: above the card
        'html.fk #toast:not(.top){bottom:max(5em,calc(var(--fk-dockh,0px) + var(--fk-below,0px) + 16px))}',
        '.fk-fab{align-items:center;justify-content:center;width:56px;height:56px;margin:0;padding:0;border:0;',
        'border-radius:16px;background:var(--fk-active);color:#001d35;box-shadow:var(--fk-shadow);cursor:pointer}',
        '.fk-fab .fk-ico{width:28px;height:28px}',
        '.fk-fab:focus-visible,.fk-btn:focus-visible,.fk-nd-in:focus-visible{outline:2px solid var(--fk-focus);outline-offset:2px}',
        '.fk-dock{padding-bottom:calc(16px + env(safe-area-inset-bottom))}',
        '.fk-dock:has(>.fk-card:not([hidden])){padding-bottom:0}',

        // the card: Drive's upload box, bottom right
        '.fk-card{width:360px;max-width:calc(100vw - 32px);box-sizing:border-box;background:var(--fk-surface);',
        'border-radius:var(--fk-r) var(--fk-r) 0 0;box-shadow:var(--fk-shadow);overflow:hidden}',
        '.fk-card[hidden]{display:none}',
        '.fk-card-top{display:flex;align-items:center;gap:4px;padding:4px 4px 4px 20px;background:#f0f4f9}',
        '.fk-card-h{flex:1;min-width:0;margin:0;font:500 16px/1.3 var(--fk-font);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
        '.fk-card-col .fk-ico{transition:rotate .2s}',
        '.fk-card.fk-col .fk-card-col .fk-ico{rotate:180deg}',
        '.fk-card.fk-col .fk-card-body{display:none}',
        '.fk-card-list{list-style:none;margin:0;padding:4px 0;max-height:min(40dvh,320px);overflow:auto}',
        '.fk-up{display:flex;align-items:center;gap:12px;padding:8px 20px}',
        '.fk-up-ico{flex:none;width:24px;height:24px;color:var(--fk-muted)}',
        '.fk-up-ok .fk-up-ico{color:#188038}',
        '.fk-up-ng .fk-up-ico{color:#b3261e}',
        '.fk-up-txt{flex:1;min-width:0;display:flex;flex-direction:column;gap:2px}',
        '.fk-up-name{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
        '.fk-up-st{font-size:12px;color:var(--fk-muted);overflow-wrap:anywhere}',
        '.fk-up-ng .fk-up-st{color:#b3261e}',
        '.fk-up progress{appearance:none;border:0 solid;overflow:clip;width:100%;height:4px;border-radius:2px;',
        'background:#dde3ea;accent-color:var(--fk-accent)}',
        '.fk-up progress::-webkit-progress-bar{background:transparent}',
        '.fk-up progress::-webkit-progress-value{background:var(--fk-accent);border-radius:2px;transition:inline-size .3s}',
        '.fk-up progress::-moz-progress-bar{background:var(--fk-accent);border-radius:2px}',
        '.fk-up-ok progress,.fk-up-ng progress{display:none}',
        '.fk-card-more{margin:0;padding:0 20px 8px;color:var(--fk-muted);font-size:12px}',
        '.fk-card-foot{display:flex;justify-content:flex-end;padding:0 8px 8px}',

        // buttons and the name dialogs
        '.fk-btn{min-height:var(--fk-tap);padding:0 16px;border:0;border-radius:22px;background:transparent;',
        'color:var(--fk-accent);font:500 14px var(--fk-font);cursor:pointer}',
        '.fk-btn:hover{background:var(--fk-hover)}',
        '.fk-btn-p{background:var(--fk-accent);color:#fff}',
        '.fk-btn-p:hover{background:#0842a0}',
        '.fk-btn:disabled{opacity:.6;cursor:default}',
        '.fk-ndlg{width:min(400px,calc(100vw - 32px));border-radius:var(--fk-r);box-shadow:var(--fk-shadow)}',
        '.fk-nd{display:flex;flex-direction:column;padding:24px 24px 16px}',
        '.fk-nd h2{margin:0 0 16px;font:400 22px/1.3 var(--fk-font)}',
        '.fk-nd label{font-size:12px;color:var(--fk-muted);margin-bottom:4px}',
        '.fk-nd-in{min-height:var(--fk-tap);padding:0 12px;border:1px solid var(--fk-line);border-radius:4px;',
        'background:var(--fk-surface);color:var(--fk-text);font:16px var(--fk-font)}',
        '.fk-nd-err{margin:8px 0 0;min-height:1.4em;color:#b3261e}',
        '.fk-nd-err:empty{margin:0;min-height:0}',
        '.fk-nd-btns{display:flex;justify-content:flex-end;gap:8px;margin-top:16px}',

        '@media (max-width:799px){',
        'html.fk.write .fk-fab{display:inline-flex}',
        'html.fk-guest .fk-fab{display:none}',
        '.fk-dock{left:0}',
        '.fk-card{width:100%;max-width:none;border-radius:var(--fk-r) var(--fk-r) 0 0}',
        '.fk-card{padding-bottom:env(safe-area-inset-bottom)}',
        '.fk-dock:has(.fk-card:not([hidden])){padding-left:max(8px,env(safe-area-inset-left));padding-right:max(8px,env(safe-area-inset-right))}}'
    ].join(''));
})();
