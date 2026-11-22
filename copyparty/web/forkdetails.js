"use strict";

// fork-only, drive-ux: the Details panel; see FORK.md. ⓘ in the top bar (and Details in the
// selection bar's and the row menu's More, through forkui.actions.details) opens it. On a
// desktop it is a side panel that follows the selection (selection changes, folder changes,
// search results: it re-reads after every fileman.render); on a phone a full-screen sheet
// showing what was selected when it opened. Nothing selected: a prompt; several: "N items
// selected"; one: its type, size, modified and location (read from the row upstream drew),
// and for an account holder Who has access: their own grants and share links on the item,
// from forkui.share.people / .links (the json lists), each opening the Share dialog.
// A guest (and so anyone Outside) gets no Who has access and this script makes no request.
// Built with forkui.js; loaded after forklist.js, forkshare.js and forkpeople.js.

(function () {
    var ui = window.forkui;
    if (!ui || !ui.ok || !ui.list || !ui.actions || !window.fileman || !window.msel ||
        !QS('.fk-top') || !ebi('files'))
        return;

    var el = ui.el,
        de = document.documentElement,
        guest = de.classList.contains('fk-guest') || !window.acct || acct == '*',
        S = guest ? null : ui.share;

    // ---- what the rows say

    function full(a) {
        var h = noq_href(a);
        return uricom_dec(h.charAt(0) == '/' ? h : get_evpath() + h);
    }

    function lastname(p) {
        var s = p.replace(/\/+$/, '').split('/');
        return s[s.length - 1] || '/';
    }

    var TYPES = [
        ['Image', /^(jpe?g|png|gif|webp|avif|bmp|svg|heic|heif|tiff?|jxl|ico)$/],
        ['Video', /^(mp4|mkv|webm|mov|avi|m4v|wmv|flv|mpe?g|ogv|3gp)$/],
        ['Audio', /^(mp3|flac|wav|ogg|oga|opus|m4a|aac|wma|aiff?|alac)$/],
        ['PDF', /^pdf$/],
        ['Spreadsheet', /^(xlsx?|ods|fods|csv|tsv)$/],
        ['Presentation', /^(pptx?|odp|fodp|key)$/],
        ['Document', /^(docx?|odt|fodt|rtf|epub)$/],
        ['Text', /^(txt|md|log|ini|conf|cfg|json|xml|ya?ml|toml|html?|css|js|py|sh)$/],
        ['Archive', /^(zip|tar|gz|tgz|bz2|xz|7z|rar|zst)$/]
    ];

    function kind(name, dir) {
        if (dir)
            return 'Folder';
        var m = /\.([^.\/]+)$/.exec(name),
            ext = m ? m[1].toLowerCase() : '';
        for (var a = 0; a < TYPES.length; a++)
            if (TYPES[a][1].test(ext))
                return TYPES[a][0];
        return ext ? ext.toUpperCase() + ' file' : 'File';
    }

    function size(tr) {
        var c = tr.cells[2],
            n = c ? parseInt(c.getAttribute('sortv')) : NaN;
        if (isNaN(n))
            return '';
        if (n < 1024)
            return n == 1 ? '1 byte' : n + ' bytes';
        return c.textContent.trim() + ' (' + n.toLocaleString('en') + ' bytes)';
    }

    // the list's Date column, th[name=ts] (filecols may have hidden it: the cell is still there)
    function modified(tr) {
        var th = QS('#files>thead th[name="ts"]'),
            c = th ? tr.cells[th.cellIndex] : tr.cells[tr.cells.length - 1];
        return c ? c.textContent.trim() : '';
    }

    // a folder path as the person knows it: "My files › trip" for their home folder
    function where(p) {
        var home = ui.shell && ui.shell.home ? uricom_dec(ui.shell.home) : null,
            parts;
        if (home && p.indexOf(home) === 0)
            parts = ['My files'].concat(p.slice(home.length).split('/'));
        else
            parts = p.slice(SR.length).split('/');
        parts = parts.filter(function (x) { return x; });
        return parts.length ? parts.join(' › ') : 'Server';
    }

    function href(p) {
        return p.split('/').map(encodeURIComponent).join('/');
    }

    // what to show for these rows, read now (a phone's row menu gives the old selection back)
    function info(rows) {
        if (rows.length != 1)
            return { n: rows.length };
        var tr = rows[0],
            a = tr.cells[1] && tr.cells[1].querySelector('a[id]');
        if (!a)
            return { n: 0 };
        var path = full(a),
            dir = /\/$/.test(path),
            name = lastname(path),
            loc = path.replace(dir ? /[^\/]*\/$/ : /[^\/]*$/, '');
        return {
            n: 1, name: name, dir: dir, type: kind(name, dir), size: dir ? '' : size(tr),
            mod: modified(tr), loc: loc, item: S ? S.item([tr]) : null
        };
    }

    // ---- the panel

    var head = el('h2', { class: 'fk-det-h', tabindex: '-1' }),
        closebtn = el('button', {
            type: 'button', class: 'fk-ibtn', 'aria-label': 'Close details', title: 'Close details',
            on: { click: function () { close(); } }
        }, ui.icon('close')),
        content = el('div', { class: 'fk-det-c' }),
        box = el('div', { class: 'fk-det' }, [el('div', { class: 'fk-det-top' }, [head, closebtn]), content]);

    var aside = el('aside', { id: 'fk-det', class: 'fk-det-side', 'aria-label': 'Details', hidden: true, 'data-fk-keys': '' });
    document.body.appendChild(aside);

    var dlg = ui.dialog({
        label: 'Details', 'class': 'fk-detdlg', back: true,
        onclose: function () {
            shown = null;
            sync();
        }
    });

    var ibtn = el('button', {
        type: 'button', class: 'fk-ibtn fk-detbtn', 'aria-label': 'Details', title: 'Details', 'aria-expanded': 'false',
        on: { click: function () { isopen() ? close() : open(null, ibtn); } }
    }, ui.icon('info'));
    var more = QS('.fk-top > button[aria-label="More tools"]');
    QS('.fk-top').insertBefore(ibtn, more || null);

    var side = false,   // the desktop panel is open
        shown = null,   // the phone sheet's info, while it is open
        opener = null,
        token = 0;

    function isopen() {
        return side || dlg.el.open;
    }

    function move(to) {
        if (box.parentNode == to)
            return;
        if ('moveBefore' in Element.prototype && box.parentNode)
            to.moveBefore(box, null);
        else
            to.appendChild(box);
    }

    function sync() {
        ibtn.setAttribute('aria-expanded', isopen() ? 'true' : 'false');
        de.classList.toggle('fk-detopen', side);
    }

    function open(rows, from) {
        opener = from || document.activeElement;
        rows = rows || ui.list.rows(true);
        if (ui.narrow.matches) {
            shown = info(rows);
            move(dlg.el);
            draw(shown);
            dlg.open(opener);
        }
        else {
            side = true;
            move(aside);
            aside.hidden = false;
            draw(info(rows));
        }
        sync();
        head.focus({ preventScroll: true });
    }

    function close() {
        if (dlg.el.open)
            return dlg.close();
        if (!side)
            return;
        var back = aside.contains(document.activeElement);
        side = false;
        aside.hidden = true;
        sync();
        if (back) {
            var to = opener && opener.isConnected && opener.getClientRects().length ? opener : ibtn;
            to.focus({ preventScroll: true });
        }
    }

    aside.addEventListener('keydown', function (e) {
        if (e.key == 'Escape' && !e.defaultPrevented) {
            e.preventDefault();
            e.stopPropagation();
            close();
        }
    });

    // on a phone the panel is a sheet; leaving the desktop size closes the side panel
    if (ui.narrow.addEventListener)
        ui.narrow.addEventListener('change', function () {
            if (ui.narrow.matches && side)
                close();
        });

    // ---- drawing

    function row(dt, dd) {
        return [el('dt', { text: dt }), el('dd', {}, dd)];
    }

    function draw(it) {
        content.textContent = '';
        token++;
        if (!it.n || it.n > 1) {
            head.textContent = 'Details';
            content.appendChild(el('div', { class: 'fk-det-empty' }, [
                ui.icon(it.n ? 'file' : 'info'),
                el('p', { text: it.n ? it.n + ' items selected' : 'Select a file or folder to see its details.' })
            ]));
            return;
        }
        head.textContent = '';
        head.appendChild(ui.icon(it.dir ? 'folder' : 'file'));
        head.appendChild(el('span', { text: it.name }));

        if (S && it.item)
            content.appendChild(whobox(it));

        var loc = el('a', {
            href: href(it.loc), text: where(it.loc), on: {
                click: function (e) {
                    if (e.button || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey || !window.treectl)
                        return;
                    e.preventDefault();
                    treectl.goto(this.getAttribute('href'), true);
                }
            }
        });
        var dl = el('dl', { class: 'fk-det-dl' }, [].concat(
            row('Type', it.type),
            it.dir ? [] : row('Size', it.size),
            it.mod ? row('Modified', it.mod) : [],
            row('Location', loc)
        ));
        content.appendChild(el('h3', { class: 'fk-det-sh', text: it.dir ? 'Folder details' : 'File details' }));
        content.appendChild(dl);
    }

    // ---- Who has access

    function canshare() {
        var b = ebi('fshr');
        return !!b && !clgot(b, 'hide');
    }

    function left(s) {
        var m = s / 60;
        return m < 90 ? Math.max(1, Math.round(m)) + ' min' :
            m < 36 * 60 ? Math.round(m / 60) + ' hours' : Math.round(m / 1440) + ' days';
    }

    function role(pr) {
        var r = pr.indexOf('r') >= 0, w = pr.indexOf('w') >= 0;
        return r && w ? 'Viewer and uploader' : w ? 'Uploader' : 'Viewer';
    }

    function grantline(r) {
        var m = [role(r.pr)];
        if (r.state == 'expired')
            m.push('expired');
        else if (r.t1)
            m.push('expires in ' + left(r.left));
        if (r.state != 'active' && r.state != 'expired')
            m.push('paused');
        return {
            ico: 'people', who: r.rcpt.charAt(0) == '@' ? r.rcpt.slice(1) + ' (group)' : r.rcpt, meta: m.join(' · ')
        };
    }

    function linkline(r) {
        var m = [role(r.pr)];
        if (r.pw)
            m.push('password');
        m.push(r.dead ? 'expired' : r.t1 ? 'expires in ' + left(r.left) : 'never expires');
        return { ico: 'link', who: 'Anyone with the link', meta: m.join(' · ') };
    }

    function whobox(it) {
        var sec = el('section', { class: 'fk-det-who', 'aria-labelledby': 'fk-det-wh' }),
            list = el('ul', { class: 'fk-det-wl', 'aria-label': 'Who has access' }),
            note = el('p', { class: 'fk-det-note', text: 'Checking who has access…' });
        sec.appendChild(el('h3', { id: 'fk-det-wh', class: 'fk-det-sh', text: 'Who has access' }));
        sec.appendChild(list);
        sec.appendChild(note);
        sec.setAttribute('aria-busy', 'true');
        fill(it, list, note, sec, token);
        return sec;
    }

    // both lists, a moment after the selection settles (arrows or Shift run through rows fast)
    function fill(it, list, note, sec, my) {
        setTimeout(function () {
            if (my != token)
                return;
            var got = {}, n = 0, err = null;

            function one(what) {
                return function (e, rows) {
                    if (e && what == 'links')
                        err = e;
                    got[what] = e ? [] : rows;
                    if (++n == 2 && my == token)
                        show(it, list, note, sec, got, err);
                };
            }
            if (S.people)
                S.people(it.item, one('people'));
            else
                one('people')(null, []);
            S.links(it.item, one('links'));
        }, 200);
    }

    function show(it, list, note, sec, got, err) {
        sec.removeAttribute('aria-busy');
        var lines = got.people.map(grantline).concat(got.links.map(linkline)),
            can = canshare();
        list.textContent = '';
        lines.forEach(function (l) {
            var kids = [ui.icon(l.ico), el('span', { class: 'fk-det-wt' }, [
                el('span', { class: 'fk-det-wn', text: l.who }), el('span', { class: 'fk-det-wm', text: l.meta })
            ])];
            list.appendChild(el('li', {}, can ? el('button', {
                type: 'button', class: 'fk-det-wb', on: {
                    click: function () { S.open(it.item, this); }
                }
            }, kids) : el('div', { class: 'fk-det-wb' }, kids)));
        });
        note.textContent = err ? 'Couldn’t check the share links: ' + err : lines.length ? '' : 'Not shared by you.';
        note.hidden = !note.textContent;
        if (can && !sec.querySelector('.fk-det-share'))
            sec.appendChild(el('button', {
                type: 'button', class: 'fk-det-share', text: 'Manage access', on: {
                    click: function () { S.open(it.item, this); }
                }
            }));
    }

    // after the Share dialog closes, the lists may have changed
    if (S && S.dialog)
        S.dialog.el.addEventListener('close', function () {
            if (dlg.el.open && shown)
                draw(shown);
            else if (side)
                draw(info(ui.list.rows(true)));
        });

    // ---- following the selection: fileman.render runs after every selection change,
    // folder load and search result (msel.selui)

    var queued = false;
    var orender = fileman.render;
    fileman.render = function () {
        var ret = orender.apply(this, arguments);
        if (side && !queued) {
            queued = true;
            setTimeout(function () {
                queued = false;
                if (side)
                    draw(info(ui.list.rows(true)));
            }, 0);
        }
        return ret;
    };

    // Details in the selection bar's and the row menu's More
    ui.actions.details = function (rows) {
        open(rows.slice(), document.activeElement);
    };

    ui.style([
        '.fk-detbtn[aria-expanded="true"]{background:var(--fk-active)}',
        '.fk-det-side{position:fixed;z-index:14;top:var(--fk-top);right:0;bottom:0;width:var(--fk-det);',
        'box-sizing:border-box;overflow:auto;overscroll-behavior:contain;background:var(--fk-surface);',
        'border-left:1px solid var(--fk-line)}',
        '.fk-det-side[hidden]{display:none}',
        'html.fk-detopen body{padding-right:var(--fk-det)}',
        ':root{--fk-det:340px}',
        '.fk-det{font:14px/1.45 var(--fk-font);color:var(--fk-text);padding:8px 8px 24px 20px}',
        '.fk-det-top{display:flex;align-items:center;gap:8px;min-height:56px}',
        '.fk-det-h{flex:1;min-width:0;display:flex;align-items:center;gap:10px;margin:0;',
        'font:400 18px/1.3 var(--fk-font);overflow-wrap:anywhere}',
        '.fk-det-h:focus{outline:0}.fk-det-h:focus-visible{outline:2px solid var(--fk-focus);outline-offset:2px}',
        '.fk-det-h .fk-ico{flex:none;color:var(--fk-muted)}',
        '.fk-det-c{padding-right:12px}',
        '.fk-det-empty{display:flex;flex-direction:column;align-items:center;gap:12px;padding:48px 8px;',
        'text-align:center;color:var(--fk-muted)}',
        '.fk-det-empty .fk-ico{width:64px;height:64px}',
        '.fk-det-empty p{margin:0}',
        '.fk-det-sh{margin:20px 0 8px;font:500 15px/1.4 var(--fk-font)}',
        '.fk-det-wl{list-style:none;margin:0;padding:0}',
        '.fk-det-wl:empty{display:none}',
        '.fk-det-wb{display:flex;align-items:center;gap:12px;width:100%;min-height:var(--fk-tap);padding:6px 8px;',
        'box-sizing:border-box;border:0;border-radius:8px;background:transparent;color:inherit;font:inherit;text-align:left}',
        'button.fk-det-wb{cursor:pointer}button.fk-det-wb:hover{background:var(--fk-hover)}',
        '.fk-det-wb .fk-ico{flex:none;color:var(--fk-muted)}',
        '.fk-det-wt{display:flex;flex-direction:column;min-width:0}',
        '.fk-det-wn{overflow-wrap:anywhere}',
        '.fk-det-wm{font-size:12px;color:var(--fk-muted)}',
        '.fk-det-note{margin:4px 0;color:var(--fk-muted)}',
        '.fk-det-note[hidden]{display:none}',
        '.fk-det-share{min-height:var(--fk-tap);margin-top:8px;padding:0 16px;border:1px solid var(--fk-line);',
        'border-radius:22px;background:transparent;color:var(--fk-accent);font:500 14px var(--fk-font);cursor:pointer}',
        '.fk-det-share:hover{background:var(--fk-hover)}',
        '.fk-det-wb:focus-visible,.fk-det-share:focus-visible,.fk-det a:focus-visible{outline:2px solid var(--fk-focus);outline-offset:2px}',
        '.fk-det a:focus{outline:0}',
        '.fk-det-dl{display:grid;grid-template-columns:auto 1fr;gap:10px 16px;margin:0}',
        '.fk-det-dl dt{color:var(--fk-muted)}',
        '.fk-det-dl dd{margin:0;min-width:0;overflow-wrap:anywhere}',
        '.fk-det-dl a{color:var(--fk-accent)}',
        '.fk-detdlg{width:100vw;max-width:none;height:100dvh;max-height:none;margin:0;border-radius:0;',
        'overflow:auto;overscroll-behavior:contain;padding:env(safe-area-inset-top) env(safe-area-inset-right) ',
        'env(safe-area-inset-bottom) env(safe-area-inset-left);box-sizing:border-box}',
        '.fk-detdlg .fk-det{padding:4px 4px 24px 16px}',
        '.fk-detdlg .fk-det-top{position:sticky;top:0;z-index:1;background:var(--fk-surface)}',
        '@media (max-width:1100px){:root{--fk-det:300px}}'
    ].join(''));
})();
