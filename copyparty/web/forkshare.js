"use strict";

// fork-only, drive-ux: the Share dialog; see FORK.md. One dialog for the selection bar, the
// row menu, upstream's share hotkey and anything else that shares: its General access part
// (Restricted / Anyone with the link) creates a share link through upstream's ?share request
// (password, expiry), and lists every share link on the item with copy-link and revoke, from
// the share-link list as json (GET /?shares&j, fork_shares.py). Refusals are shown as the
// server gives them. Built with forkui.js; replaces forkui.actions.share (forklist.js).
// Only for an account holder who may share here (upstream's can_shr, #fshr not hidden):
// a guest never sees Share, and nothing here makes a request until the dialog opens.
// API for later scripts:
//   forkui.share.open(item, opener)  open the dialog on an item (item() / item(rows))
//   forkui.share.item(rows)  the item a share acts on: the rows (one folder, or files of one
//                         folder), or the current folder without rows; null (with a toast)
//                         for a mix it can't share. { path: url path with --rp-loc, decoded,
//                         a folder's ending in '/'; dir: bool; files: [names] (a file share);
//                         name: what to call it; vp: the folder's volume path, no slashes }
//   forkui.share.section({ id, order, render(item, box) })  add a part to the dialog
//                         (ticket 09's "Add people"); render runs on every open with an
//                         emptied box; the link part has order 20, put people before it
//   forkui.share.links(item, done)  done(err, rows): the share links on the item, rows of
//                         /?shares&j (k, url, vp, files, pw, pr, un, t0, t1); for Details
//   forkui.share.say(text)  announce in the dialog's polite status line

(function () {
    var ui = window.forkui;
    if (!ui || !ui.ok || !ui.list || !ui.actions || !window.fileman || !window.msel || !ebi('fshr') ||
        !window.acct || acct == '*')
        return;

    var el = ui.el;

    // ---- what is shared

    function refusal(msg) {
        toast.err(10, msg);
        return null;
    }

    function full(a) {
        var h = noq_href(a);
        return uricom_dec(h.charAt(0) == '/' ? h : get_evpath() + h);
    }

    function lastname(p) {
        var s = p.replace(/\/+$/, '').split('/');
        return s[s.length - 1] || '/';
    }

    // the volume path the share-link list uses: no --rp-loc, no slashes around it
    function volpath(p) {
        if (SR && p.indexOf(SR + '/') === 0)
            p = p.slice(SR.length);
        return p.replace(/^\/+|\/+$/g, '');
    }

    function item(rows) {
        rows = rows || [];
        var paths = [];
        for (var a = 0; a < rows.length; a++) {
            var l = rows[a].cells[1] && rows[a].cells[1].querySelector('a[id]');
            if (l)
                paths.push(full(l));
        }
        var cur = uricom_dec(get_evpath());
        if (!paths.length || (paths.length == 1 && /\/$/.test(paths[0]))) {
            var p = paths[0] || cur;
            return { path: p, dir: true, files: [], name: lastname(p), vp: volpath(p) };
        }
        var dir = paths[0].replace(/[^\/]*$/, ''),
            files = [];
        for (var b = 0; b < paths.length; b++) {
            if (/\/$/.test(paths[b]))
                return refusal('Share one folder, or files from one folder.');
            if (paths[b].replace(/[^\/]*$/, '') != dir)
                return refusal('Share files from one folder at a time.');
            files.push(lastname(paths[b]));
        }
        return {
            path: dir, dir: false, files: files, vp: volpath(dir),
            name: files.length == 1 ? files[0] : files.length + ' files'
        };
    }

    // ---- talking to the server

    // the server's reason, minus the <pre> and the URL line every error ends with
    function reason(xhr) {
        if (!xhr.status)
            return 'No answer from the server.';
        var txt = (xhr.responseText || '').replace(/\s*URL:[^\n]*\s*$/, '');
        txt = new DOMParser().parseFromString(hunpre(txt), 'text/html').body.textContent.trim();
        return txt || 'Error ' + xhr.status + '.';
    }

    function req(method, url, body, done) {
        var xhr = new XMLHttpRequest();
        xhr.open(method, url, true);
        if (body !== null)
            xhr.setRequestHeader('Content-Type', 'text/plain');
        xhr.onload = xhr.onerror = function () {
            done(xhr);
        };
        xhr.send(body);
    }

    function onitem(it, r) {
        var vp = r.vp.replace(/^\/+|\/+$/g, '');
        if (vp != it.vp)
            return false;
        if (it.dir)
            return !r.files.length;
        for (var a = 0; a < r.files.length; a++)
            if (has(it.files, r.files[a]))
                return true;
        return false;
    }

    function links(it, done) {
        req('GET', SR + '/?shares&j', null, function (xhr) {
            if (xhr.status != 200)
                return done(reason(xhr));
            try {
                var j = JSON.parse(xhr.responseText);
            }
            catch (e) {
                return done('The server sent no list of links.');
            }
            var now = j.now || Date.now() / 1000;
            done(null, j.rows.filter(function (r) {
                return onitem(it, r);
            }).map(function (r) {
                r.dead = !!r.t1 && r.t1 < now;
                r.left = r.t1 ? r.t1 - now : 0;
                return r;
            }).sort(function (a, b) {
                return a.t0 - b.t0;
            }));
        });
    }

    // ---- the dialog

    var head = el('h2', { id: 'fk-sh-h', class: 'fk-sh-h' }),
        secs = el('div', { class: 'fk-sh-secs' }),
        live = el('p', { class: 'fk-vh', role: 'status' }),
        done = el('button', { type: 'button', class: 'fk-sh-btn fk-sh-btn-p', text: 'Done' }),
        body = el('div', { class: 'fk-sh' }, [
            head, secs, live, el('div', { class: 'fk-sh-foot' }, done)
        ]),
        dlg = ui.dialog({ label: 'Share', 'class': 'fk-shdlg', kids: body }),
        sections = [],
        cur = null,
        lastsay = '';

    dlg.el.removeAttribute('aria-label');
    dlg.el.setAttribute('aria-labelledby', 'fk-sh-h');
    done.addEventListener('click', function () {
        dlg.close();
    });

    function say(txt) {
        // the same words twice in a row would not be read out again
        if (txt == lastsay)
            txt += ' ';
        lastsay = txt;
        live.textContent = '';
        setTimeout(function () {
            live.textContent = txt;
        }, 50);
    }

    function section(s) {
        s.box = el('section', { class: 'fk-sh-sec' });
        sections.push(s);
        sections.sort(function (a, b) {
            return (a.order || 0) - (b.order || 0);
        });
        secs.textContent = '';
        for (var a = 0; a < sections.length; a++)
            secs.appendChild(sections[a].box);
    }

    function open(it, opener) {
        if (!it)
            return;
        cur = it;
        head.textContent = 'Share “' + it.name + '”';
        live.textContent = lastsay = '';
        for (var a = 0; a < sections.length; a++) {
            sections[a].box.textContent = '';
            sections[a].render(it, sections[a].box);
        }
        dlg.open(opener);
        // the first thing to act on: General access, or a section's own first field
        var f = secs.querySelector('select,input,button');
        if (f)
            f.focus();
    }

    // ---- General access: share links

    var ROLES = {
        view: { label: 'Viewer', perms: ['read'] },
        both: { label: 'Viewer and uploader', perms: ['read', 'write'] },
        up: { label: 'Uploader (can’t see the files)', perms: ['write'] }
    };

    var EXPIRY = [
        ['', 'Never'], ['60', '1 hour'], ['1440', '1 day'], ['10080', '7 days'], ['43200', '30 days']
    ];

    function roles(it) {
        var ret = [];
        if (has(perms, 'read'))
            ret.push('view');
        if (it.dir && has(perms, 'write')) {
            if (has(perms, 'read'))
                ret.push('both');
            ret.push('up');
        }
        return ret;
    }

    function access(pr) {
        var r = pr.indexOf('r') >= 0 || pr.indexOf('g') >= 0,
            w = pr.indexOf('w') >= 0;
        return r && w ? 'Viewer and uploader' : w ? 'Uploader' : 'Viewer';
    }

    function left(r) {
        if (!r.t1)
            return 'never expires';
        if (r.dead)
            return 'expired';
        var m = r.left / 60;
        return 'expires in ' + (m < 90 ? Math.max(1, Math.round(m)) + ' min' :
            m < 36 * 60 ? Math.round(m / 60) + ' hours' : Math.round(m / 1440) + ' days');
    }

    var nfield = 0;

    function field(label, input, hint) {
        input.id = 'fk-sh-f' + (++nfield);
        return el('div', { class: 'fk-sh-field' }, [
            el('label', { for: input.id, text: label }), input,
            hint ? el('span', { class: 'fk-sh-hint', text: hint }) : null
        ]);
    }

    function opt(v, label, sel) {
        return el('option', { value: v, text: label, selected: !!sel });
    }

    // copy without the Clipboard API where it's missing (plain http on the LAN is no secure
    // context): select the link's own field, inside the dialog (the page behind is inert)
    function copy(txt, input, done) {
        function legacy() {
            input.focus();
            input.select();
            input.setSelectionRange(0, txt.length);
            var ok = false;
            try {
                ok = document.execCommand('copy');
            }
            catch (e) { }
            done(ok);
        }
        if (window.isSecureContext && navigator.clipboard && navigator.clipboard.writeText)
            return navigator.clipboard.writeText(txt).then(function () { done(true); }, legacy);
        legacy();
    }

    function linkpart(it, box) {
        var mine = roles(it),
            rows = [],
            err = el('p', { class: 'fk-sh-err', role: 'alert' }),
            gen = el('select', { class: 'fk-sh-in' }, [
                opt('no', 'Restricted'), opt('any', 'Anyone with the link')
            ]),
            gdesc = el('p', { class: 'fk-sh-desc' }),
            list = el('ul', { class: 'fk-sh-links', 'aria-label': 'Links' }),
            ask = el('div', { class: 'fk-sh-ask', hidden: true }),
            more = el('button', {
                type: 'button', class: 'fk-sh-btn', hidden: true
            }, [ui.icon('plus'), el('span', { text: 'Another link' })]),
            key = el('input', {
                type: 'text', class: 'fk-sh-in', autocomplete: 'off', autocapitalize: 'off',
                spellcheck: 'false', placeholder: 'random'
            }),
            role = el('select', { class: 'fk-sh-in' }),
            pw = el('input', {
                type: 'text', class: 'fk-sh-in', autocomplete: 'off', autocapitalize: 'off',
                spellcheck: 'false', placeholder: 'none'
            }),
            exp = el('select', { class: 'fk-sh-in' }),
            mk = el('button', { type: 'submit', class: 'fk-sh-btn fk-sh-btn-p', text: 'Create link' }),
            form = el('form', { class: 'fk-sh-form', hidden: true }, [
                field('Access', role), field('Password (optional)', pw), field('Expires', exp),
                field('Link name (optional)', key, 'Letters, digits, - and _'),
                el('div', { class: 'fk-sh-btns' }, mk)
            ]),
            busy = false,
            another = false;

        for (var a = 0; a < mine.length; a++)
            role.appendChild(opt(mine[a], ROLES[mine[a]].label));
        for (var b = 0; b < EXPIRY.length; b++)
            exp.appendChild(opt(EXPIRY[b][0], EXPIRY[b][1], EXPIRY[b][0] == '10080'));

        box.appendChild(el('h3', { class: 'fk-sh-sh', text: 'General access' }));
        box.appendChild(el('div', { class: 'fk-sh-gen' }, [
            el('span', { class: 'fk-sh-gico' }, ui.icon('link')),
            el('div', { class: 'fk-sh-gtxt' }, [field('Who can open it', gen), gdesc])
        ]));
        box.appendChild(err);
        box.appendChild(ask);
        box.appendChild(list);
        box.appendChild(more);
        box.appendChild(form);

        function fail(msg) {
            err.textContent = msg;
        }

        function draw() {
            var any = gen.value == 'any';
            gdesc.textContent = any ?
                'Anyone who has a link below can open it, no account needed.' :
                'Only people with access can open it.';
            list.textContent = '';
            for (var a = 0; a < rows.length; a++)
                list.appendChild(linkrow(rows[a]));
            list.hidden = !rows.length;
            if (any && !mine.length && !rows.length)
                fail('You can\u2019t make a link to this.');
            form.hidden = !any || !mine.length || (rows.length && !another);
            more.hidden = !any || !rows.length || !mine.length || !form.hidden;
        }

        function linkrow(r) {
            var url = el('input', {
                type: 'text', class: 'fk-sh-url', readonly: true, value: r.url,
                'aria-label': 'Link ' + r.k
            }),
                cp = el('button', { type: 'button', class: 'fk-sh-btn', text: 'Copy link' }),
                rm = el('button', {
                    type: 'button', class: 'fk-ibtn', title: 'Remove link', 'aria-label': 'Remove link ' + r.k
                }, ui.icon('delete')),
                meta = [access(r.pr), r.pw ? 'password' : '', left(r),
                    r.un != acct ? 'made by ' + r.un : ''].filter(Boolean).join(' · ');

            url.value = r.url;
            cp.addEventListener('click', function () {
                copy(r.url, url, function (ok) {
                    if (ok)
                        return say('Link copied');
                    url.focus();
                    url.select();
                    say('Copying is blocked here: the link is selected, copy it from there.');
                });
            });
            rm.addEventListener('click', function () {
                revoke([r], function () {
                    say('Link removed');
                });
            });
            return el('li', { class: 'fk-sh-link' + (r.dead ? ' fk-sh-dead' : '') }, [
                el('div', { class: 'fk-sh-lt' }, [url, el('span', { class: 'fk-sh-meta', text: meta })]),
                el('div', { class: 'fk-sh-lb' }, [cp, rm])
            ]);
        }

        function load(then) {
            links(it, function (e, rs) {
                if (cur !== it)
                    return;
                if (e)
                    return fail('Could not list the links: ' + e);
                rows = rs;
                gen.value = rows.length ? 'any' : 'no';
                ask.hidden = true;
                draw();
                if (then)
                    then();
            });
        }

        function revoke(rs, then) {
            if (busy)
                return;
            busy = true;
            fail('');
            var i = 0;
            (function next() {
                if (i >= rs.length) {
                    busy = false;
                    return load(function () {
                        then();
                        var f = list.querySelector('button') || gen;
                        f.focus();
                    });
                }
                var r = rs[i++];
                req('POST', SR + '/?eshare=rm&skey=' + encodeURIComponent(r.k), null, function (xhr) {
                    if (xhr.status != 200) {
                        busy = false;
                        fail('Could not remove ' + r.k + ': ' + reason(xhr));
                        return load();
                    }
                    next();
                });
            })();
        }

        gen.addEventListener('change', function () {
            fail('');
            if (gen.value == 'no' && rows.length) {
                // turning links off removes them: ask first
                var n = rows.length,
                    no = el('button', { type: 'button', class: 'fk-sh-btn', text: 'Keep' }),
                    yes = el('button', {
                        type: 'button', class: 'fk-sh-btn fk-sh-btn-d',
                        text: n == 1 ? 'Remove link' : 'Remove ' + n + ' links'
                    });
                ask.textContent = '';
                ask.appendChild(el('p', {
                    id: 'fk-sh-askq',
                    text: (n == 1 ? 'Remove the link? ' : 'Remove all ' + n + ' links? ') +
                        'Anyone who has it can no longer open it.'
                }));
                ask.appendChild(el('div', { class: 'fk-sh-btns' }, [no, yes]));
                no.setAttribute('aria-describedby', 'fk-sh-askq');
                ask.hidden = false;
                no.addEventListener('click', function () {
                    ask.hidden = true;
                    gen.value = 'any';
                    draw();
                    gen.focus();
                });
                yes.addEventListener('click', function () {
                    revoke(rows.slice(), function () {
                        say(n == 1 ? 'Link removed' : n + ' links removed');
                    });
                });
                no.focus();
                return;
            }
            ask.hidden = true;
            draw();
        });

        more.addEventListener('click', function () {
            another = true;
            draw();
            role.focus();
        });

        key.addEventListener('input', function () {
            var v = key.value.replace(/[^0-9a-zA-Z_-]/g, '_');
            if (v != key.value)
                key.value = v;
        });

        form.addEventListener('submit', function (e) {
            e.preventDefault();
            if (busy || !mine.length)
                return;
            busy = mk.disabled = true;
            fail('');
            var body = {
                k: key.value || randstr(12).replace(/l/g, 'n'),
                vp: it.files.length ? it.files.map(function (f) { return it.path + f; }) : [it.path],
                pw: pw.value,
                exp: exp.value,
                perms: ROLES[role.value].perms
            };
            req('POST', SR + '/?share', JSON.stringify(body), function (xhr) {
                busy = mk.disabled = false;
                if (xhr.status != 201)
                    return fail(reason(xhr));
                key.value = pw.value = '';
                another = false;
                load(function () {
                    say('Link created');
                    var l = list.lastChild && list.lastChild.querySelector('button');
                    if (l)
                        l.focus();
                });
            });
        });

        fail('');
        list.hidden = true;
        gdesc.textContent = 'Checking for links…';
        load();
    }

    section({ id: 'link', order: 20, render: linkpart });

    // ---- hooking in

    var S = ui.share = {
        open: open, item: item, section: section, links: links, say: say, dialog: dlg
    };

    ui.actions.share = function (rows) {
        S.open(S.item(rows), document.activeElement);
    };

    // upstream's share (its button and hotkey) opens this dialog too; the button's onclick
    // holds upstream's function, not the property
    fileman.share = function (e) {
        if (e && e.preventDefault)
            e.preventDefault();
        S.open(S.item(ui.list.rows(true)), document.activeElement);
    };
    ebi('fshr').onclick = fileman.share;

    ui.style([
        '.fk-shdlg{width:min(560px,calc(100vw - 32px));max-height:calc(100dvh - 32px);',
        'border-radius:var(--fk-r);box-shadow:var(--fk-shadow);overflow:auto}',
        '.fk-shdlg:modal{overscroll-behavior:contain}',
        '.fk-shdlg::backdrop{overflow:hidden;overscroll-behavior:contain}',
        '.fk-sh{display:flex;flex-direction:column;gap:8px;padding:24px 24px 16px}',
        '.fk-sh-h{margin:0 0 8px;font:400 22px/1.3 var(--fk-font);overflow-wrap:anywhere}',
        '.fk-sh-sec{display:flex;flex-direction:column;gap:8px}',
        '.fk-sh-sec+.fk-sh-sec{margin-top:16px}',
        '.fk-sh-sh{margin:0;font:500 16px/1.4 var(--fk-font)}',
        '.fk-sh-gen{display:flex;gap:12px;align-items:flex-start}',
        '.fk-sh-gico{display:inline-flex;align-items:center;justify-content:center;flex:none;width:40px;',
        'height:40px;margin-top:18px;border-radius:50%;background:#e9eef6;color:var(--fk-muted)}',
        '.fk-sh-gtxt{flex:1;min-width:0}',
        '.fk-sh-desc{margin:4px 0 0;color:var(--fk-muted);font-size:13px}',
        '.fk-sh-field{display:flex;flex-direction:column;gap:4px}',
        '.fk-sh-field label{font-size:12px;color:var(--fk-muted)}',
        '.fk-sh-hint{font-size:12px;color:var(--fk-muted)}',
        '.fk-sh-in,.fk-sh-url{box-sizing:border-box;width:100%;min-height:var(--fk-tap);padding:0 12px;',
        'border:1px solid var(--fk-line);border-radius:4px;background:var(--fk-surface);color:var(--fk-text);',
        'font:16px var(--fk-font)}',
        '.fk-sh-url{min-height:36px;border-color:transparent;background:#f0f4f9;font-size:14px;text-overflow:ellipsis}',
        '.fk-sh-form{display:grid;grid-template-columns:1fr 1fr;gap:12px;padding:12px;border-radius:8px;background:#f8fafd}',
        '.fk-sh-form[hidden],.fk-sh-ask[hidden],.fk-sh-links[hidden]{display:none}',
        '.fk-sh-form .fk-sh-btns{grid-column:1/-1}',
        '.fk-sh-links{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:8px}',
        '.fk-sh-link{display:flex;flex-wrap:wrap;align-items:center;gap:4px 8px}',
        '.fk-sh-lt{flex:1 1 240px;min-width:0;display:flex;flex-direction:column;gap:2px}',
        '.fk-sh-lb{display:flex;align-items:center;gap:4px;margin-left:auto}',
        '.fk-sh-meta{font-size:12px;color:var(--fk-muted)}',
        '.fk-sh-dead .fk-sh-meta{color:#b3261e}',
        '.fk-sh-err{margin:0;color:#b3261e;overflow-wrap:anywhere}',
        '.fk-sh-err:empty{display:none}',
        '.fk-sh-ask{padding:12px;border-radius:8px;background:#fce8e6}',
        '.fk-sh-ask p{margin:0 0 8px}',
        '.fk-sh-btns,.fk-sh-foot{display:flex;justify-content:flex-end;gap:8px}',
        '.fk-sh-foot{margin-top:8px}',
        '.fk-sh-btn{display:inline-flex;align-items:center;gap:6px;min-height:var(--fk-tap);padding:0 16px;',
        'border:0;border-radius:22px;background:transparent;color:var(--fk-accent);font:500 14px var(--fk-font);cursor:pointer}',
        '.fk-sh-btn[hidden]{display:none}',
        '.fk-sh-btn:hover{background:var(--fk-hover)}',
        '.fk-sh-btn-p{background:var(--fk-accent);color:#fff}',
        '.fk-sh-btn-p:hover{background:#0842a0}',
        '.fk-sh-btn-d{background:#b3261e;color:#fff}',
        '.fk-sh-btn-d:hover{background:#8c1d18}',
        '.fk-sh-btn:disabled{opacity:.6;cursor:default}',
        '.fk-sh-btn:focus-visible,.fk-sh-in:focus-visible,.fk-sh-url:focus-visible{outline:2px solid var(--fk-focus);outline-offset:2px}',
        '.fk-sh>.fk-sh-btn,.fk-sh-sec>.fk-sh-btn{align-self:flex-start}',
        '.fk-vh:where(:not(:focus-within,:active)){position:absolute!important;clip-path:inset(50%)!important;',
        'overflow:hidden!important;width:1px!important;height:1px!important;margin:-1px!important;',
        'padding:0!important;border:0!important;white-space:nowrap!important}',
        '@media (max-width:799px){',
        '.fk-shdlg{width:calc(100vw - 16px);max-height:calc(100dvh - 16px)}',
        '.fk-sh{padding:20px 16px 12px}',
        '.fk-sh-form{grid-template-columns:1fr}',
        '.fk-sh-gico{display:none}}'
    ].join(''));
})();
