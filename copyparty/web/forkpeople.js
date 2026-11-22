"use strict";

// fork-only, drive-ux: the Share dialog's "Add people and groups" part; see FORK.md. An owner
// gives a folder to an account or a config group (a grant: POST /?grant), read-only or read +
// upload, with an optional time limit, and sees the folder's grants with revoke
// (POST /?egrant=rm), from the grant list as json (GET /?grants&j, fork_grants.py). The
// people to pick from are ?grants=rcpts. For a file it is disabled with a note (grants are
// folders only). Refusals are shown as the server gives them. Replaces the 🤝 people button
// (grantbtn.js). Built on forkshare.js (forkui.share.section, order 10: before General access).
// Nothing here makes a request until the dialog opens, and a guest never gets the dialog.
// API for later scripts:
//   forkui.share.people(item, done)  done(err, rows): the grants on the item (a folder), rows
//                         of /?grants&j (gid, owner, rcpt, src, name, at, pr, t1, state,
//                         plus left: seconds to go, 0 = never); [] for files and when grants
//                         are off; for Details

(function () {
    var ui = window.forkui;
    if (!ui || !ui.ok || !ui.share || !window.acct || acct == '*')
        return;

    var el = ui.el,
        S = ui.share,
        rcpts = null;  // ?grants=rcpts once it answered 200; false once it said grants are off

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

    function getjson(url, done) {
        req('GET', url, null, function (xhr) {
            if (xhr.status != 200)
                return done(xhr);
            try {
                done(null, JSON.parse(xhr.responseText));
            }
            catch (e) {
                done(xhr);
            }
        });
    }

    // the grant list's src of an item: "/vol/path/", or "/"
    function src(it) {
        return it.vp ? '/' + it.vp + '/' : '/';
    }

    function grants(it, done) {
        if (!it.dir)
            return done(null, []);
        getjson(SR + '/?grants&j', function (xhr, j) {
            // grants off in the server config: none to list
            if (xhr && xhr.status == 400 && /grants are disabled/.test(xhr.responseText || ''))
                return done(null, []);
            if (xhr)
                return done(reason(xhr));
            var now = j.now || Date.now() / 1000;
            done(null, j.rows.filter(function (r) {
                return r.src == src(it) && r.owner == acct;
            }).map(function (r) {
                r.left = r.t1 ? r.t1 - now : 0;
                return r;
            }));
        });
    }

    // ---- words

    function whoname(r) {
        return r.charAt(0) == '@' ? r.slice(1) + ' (group)' : r;
    }

    var STATES = {
        expired: 'expired',
        suspended: 'paused: you no longer have those rights here',
        broken: 'paused: the folder is gone',
        'no members': 'paused: nobody in that group',
        'hidden folder': 'never shown: a hidden folder'
    };

    function meta(r) {
        var ret = [r.pr == 'rw' ? 'Viewer and uploader' : 'Viewer'];
        if (r.state == 'expired')
            ret.push('expired');
        else if (!r.t1)
            ret.push('never expires');
        else {
            var m = r.left / 60;
            ret.push('expires in ' + (m < 90 ? Math.max(1, Math.round(m)) + ' min' :
                m < 36 * 60 ? Math.round(m / 60) + ' hours' : Math.round(m / 1440) + ' days'));
        }
        if (r.state != 'active' && r.state != 'expired')
            ret.push(STATES[r.state] || r.state);
        return ret.join(' · ');
    }

    var LIMITS = [
        ['', 'Never'], ['60', '1 hour'], ['1440', '1 day'], ['10080', '7 days'], ['43200', '30 days']
    ];

    var nfield = 0;

    function fid() {
        return 'fk-pp-f' + (++nfield);
    }

    function field(label, input, hint) {
        input.id = input.id || fid();
        var h = hint ? el('span', { id: fid(), class: 'fk-sh-hint', text: hint }) : null;
        if (h)
            input.setAttribute('aria-describedby', h.id);
        return el('div', { class: 'fk-sh-field' }, [el('label', { for: input.id, text: label }), input, h]);
    }

    function opt(v, label, sel) {
        return el('option', { value: v, text: label, selected: !!sel });
    }

    function radio(name, v, label, on) {
        var id = fid();
        return el('div', { class: 'fk-pp-radio' }, [
            el('input', { type: 'radio', id: id, name: name, value: v, checked: !!on }),
            el('label', { for: id, text: label })
        ]);
    }

    // ---- the part

    var nform = 0;

    function part(it, box) {
        var hid = 'fk-pp-h' + (++nform),
            err = el('p', { class: 'fk-sh-err', role: 'alert' }),
            pick = el('select', { class: 'fk-sh-in', disabled: !it.dir }),
            list = el('ul', { class: 'fk-sh-links fk-pp-list', 'aria-label': 'Shared with', hidden: true }),
            busy = false,
            rows = [];

        box.appendChild(el('h3', { id: hid, class: 'fk-sh-sh', text: 'Add people and groups' }));

        if (!it.dir) {
            box.appendChild(field('Add a person or group', pick,
                'People can only be given folders, use a link for a file.'));
            return;
        }

        var read = has(perms, 'read'),
            write = read && has(perms, 'write'),
            gname = it.name == '/' ? '' : it.name,
            name = el('input', {
                type: 'text', class: 'fk-sh-in', autocomplete: 'off', autocapitalize: 'off',
                spellcheck: 'false', value: gname, placeholder: gname
            }),
            limit = el('select', { class: 'fk-sh-in' }),
            rname = 'fk-pp-r' + nform,
            add = el('button', { type: 'submit', class: 'fk-sh-btn fk-sh-btn-p', text: 'Add' }),
            role = el('fieldset', { class: 'fk-pp-role' }, [
                el('legend', { text: 'Role' }),
                radio(rname, 'r', 'Viewer', true),
                write ? radio(rname, 'rw', 'Viewer and uploader') : null
            ]),
            form = el('form', { class: 'fk-sh-form fk-pp-form', 'aria-labelledby': hid }, [
                el('div', { class: 'fk-pp-who' }, field('Add a person or group', pick)),
                role,
                field('Time limit', limit),
                field('Folder name they see', name, 'They find it under Shared with me, from ' + acct + '.'),
                el('div', { class: 'fk-sh-btns' }, add)
            ]);

        for (var a = 0; a < LIMITS.length; a++)
            limit.appendChild(opt(LIMITS[a][0], LIMITS[a][1]));

        box.appendChild(err);
        box.appendChild(list);
        if (!read) {
            box.appendChild(el('p', { class: 'fk-sh-desc', text: 'You can’t give people this folder: you can’t open it.' }));
            loadlist();
            return;
        }
        box.appendChild(form);

        function fail(msg) {
            err.textContent = msg;
        }

        function fill(j) {
            pick.textContent = '';
            if (!j.accounts.length && !j.groups.length) {
                form.hidden = true;
                box.appendChild(el('p', {
                    class: 'fk-sh-desc', text: 'There is nobody to give it to; ask the admin to add accounts or groups.'
                }));
                return;
            }
            pick.appendChild(opt('', 'Pick someone', true));
            pick.firstChild.disabled = true;
            var g;
            if (j.accounts.length) {
                g = el('optgroup', { label: 'People' });
                for (var a = 0; a < j.accounts.length; a++)
                    g.appendChild(opt(j.accounts[a], j.accounts[a]));
                pick.appendChild(g);
            }
            if (j.groups.length) {
                g = el('optgroup', { label: 'Groups' });
                for (var b = 0; b < j.groups.length; b++)
                    g.appendChild(opt(j.groups[b], whoname(j.groups[b])));
                pick.appendChild(g);
            }
        }

        function off() {
            // grants are off on this server: no part at all
            box.hidden = true;
        }

        function draw() {
            list.textContent = '';
            for (var a = 0; a < rows.length; a++)
                list.appendChild(item(rows[a]));
            list.hidden = !rows.length;
        }

        function item(r) {
            var rm = el('button', {
                type: 'button', class: 'fk-ibtn', title: 'Remove access',
                'aria-label': 'Remove access for ' + whoname(r.rcpt)
            }, ui.icon('delete'));
            rm.addEventListener('click', function () {
                revoke(r);
            });
            return el('li', { class: 'fk-sh-link' + (r.state == 'active' ? '' : ' fk-sh-dead') }, [
                el('span', { class: 'fk-pp-ico' }, ui.icon(r.rcpt.charAt(0) == '@' ? 'people' : 'share')),
                el('div', { class: 'fk-sh-lt' }, [
                    el('span', { class: 'fk-pp-who', text: whoname(r.rcpt) + (r.name != gname ? ' (as ' + r.name + ')' : '') }),
                    el('span', { class: 'fk-sh-meta', text: meta(r) })
                ]),
                el('div', { class: 'fk-sh-lb' }, rm)
            ]);
        }

        function loadlist(then) {
            grants(it, function (e, rs) {
                if (e)
                    return fail('Could not list who has access: ' + e);
                rows = rs;
                draw();
                if (then)
                    then();
            });
        }

        function revoke(r) {
            if (busy)
                return;
            busy = true;
            fail('');
            req('POST', SR + '/?egrant=rm&gid=' + encodeURIComponent(r.gid), null, function (xhr) {
                busy = false;
                if (xhr.status != 200) {
                    fail('Could not remove ' + whoname(r.rcpt) + ': ' + reason(xhr));
                    return loadlist();
                }
                loadlist(function () {
                    S.say(whoname(r.rcpt) + ' can no longer open it');
                    var f = list.querySelector('button') || pick;
                    f.focus();
                });
            });
        }

        form.addEventListener('submit', function (e) {
            e.preventDefault();
            if (busy)
                return;
            fail('');
            if (!pick.value) {
                fail('Pick a person or group first.');
                return pick.focus();
            }
            var pr = form.querySelector('input[name="' + rname + '"]:checked'),
                who = pick.value,
                body = {
                    vp: it.path,
                    rcpt: who,
                    name: name.value || gname,
                    perms: pr && pr.value == 'rw' ? ['read', 'write'] : ['read'],
                    exp: limit.value ? parseInt(limit.value) : 0
                };
            busy = add.disabled = true;
            req('POST', SR + '/?grant', JSON.stringify(body), function (xhr) {
                busy = add.disabled = false;
                if (xhr.status != 201) {
                    fail(reason(xhr));
                    return pick.focus();
                }
                pick.value = '';
                name.value = gname;
                loadlist(function () {
                    S.say(whoname(who) + ' can now open it');
                    pick.focus();
                });
            });
        });

        if (rcpts === false)
            return off();
        if (rcpts)
            fill(rcpts);
        else {
            pick.appendChild(opt('', 'Loading…', true));
            getjson(SR + '/?grants=rcpts', function (xhr, j) {
                if (xhr) {
                    if (xhr.status == 400) {
                        rcpts = false;
                        return off();
                    }
                    return fail('Could not load the people to pick from: ' + reason(xhr));
                }
                rcpts = j;
                var f = document.activeElement == pick;
                fill(j);
                if (f)
                    pick.focus();
            });
        }
        loadlist();
    }

    S.section({ id: 'people', order: 10, render: part });
    S.people = grants;

    ui.style([
        '.fk-pp-form{grid-template-columns:1fr 1fr}',
        '.fk-pp-form .fk-pp-who{grid-column:1/-1}',
        '.fk-pp-form[hidden],.fk-pp-list[hidden],.fk-sh-sec[hidden]{display:none}',
        '.fk-pp-role{display:flex;flex-direction:column;gap:0;margin:0;padding:0;border:0;min-width:0}',
        '.fk-pp-role legend{padding:0;margin-bottom:4px;font-size:12px;color:var(--fk-muted)}',
        '.fk-pp-radio{display:flex;align-items:center;gap:8px;min-height:var(--fk-tap)}',
        '.fk-pp-radio input{width:20px;height:20px;margin:0;accent-color:var(--fk-accent)}',
        '.fk-pp-radio label{flex:1;padding:10px 0;margin:-10px 0;cursor:pointer}',
        '.fk-pp-radio input:focus-visible{outline:2px solid var(--fk-focus);outline-offset:2px}',
        '.fk-sh-in:disabled{background:#f0f4f9;color:var(--fk-muted)}',
        '.fk-pp-ico{display:inline-flex;align-items:center;justify-content:center;flex:none;width:40px;',
        'height:40px;border-radius:50%;background:#e9eef6;color:var(--fk-muted)}',
        '.fk-pp-list .fk-pp-who{overflow-wrap:anywhere}',
        '@media (max-width:799px){.fk-pp-form{grid-template-columns:1fr}.fk-pp-ico{display:none}}'
    ].join(''));
})();
