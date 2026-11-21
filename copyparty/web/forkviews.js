"use strict";

// fork-only, drive-ux: the nav's views that aren't folders; see FORK.md.
// Shared with me: "From people", the grants this account is a recipient of, grouped by owner
// (the listings of the grants folder, /<top>/ and /<top>/<owner>/, which only hold mounted
// grants, so suspended, broken and expired ones never show), and "Server folders", what the
// root listing gives other than the account's own home folder and the grants folder.
// Recent uploads: upstream's ?ru&j (newest uploads in every indexed volume this account
// can read) as a table of Name, Location, Uploaded, Size and By; By and Uploaded are blank
// where the server hides them. Its nav entry is hidden when ?ru answers other than 200
// (--no-ups-page, no index). Only requests the page could already make; none for a guest
// (forkshell.js gives them no nav and no forkui.shell.views).
// Built with forkui.js and forkshell.js (forkui.shell). API for later scripts:
//   forkui.views.shared(done)  done({people: [{owner, dirs: [{name, href}]}],
//                              server: [{name, href}]}); href SR-prefixed, URL-quoted
//   forkui.views.recent(done)  done(ups or null): ?ru&j's list, null when refused

(function () {
    var ui = window.forkui;
    if (!ui || !ui.ok || !ui.shell || !ui.shell.views || !window.treectl)
        return;

    var el = ui.el,
        shell = ui.shell,
        gen = 0;    // bumped by every render, so a late reply for a view left behind is dropped

    function getjson(url, done) {
        var xhr = new XMLHttpRequest();
        xhr.open('GET', url, true);
        xhr.onload = function () {
            var j = null;
            if (this.status == 200)
                try {
                    j = JSON.parse(this.responseText);
                }
                catch (e) { }
            done(j);
        };
        xhr.onerror = function () { done(null); };
        xhr.send();
    }

    function plainpath(href) {
        return uricom_dec(href.split('?')[0]);
    }

    // ---- the data

    // the folders other people and the server opened to this account
    function shared(done) {
        var top = null,
            root = null,
            server = [],
            people = [],
            wait = 2,
            home = plainpath(shell.home);

        getjson(SR + '/?grants=rcpts', function (j) {
            top = j && j.top ? '' + j.top : null;
            step();
        });
        getjson(SR + '/?ls', function (j) {
            root = j && j.dirs ? j.dirs : [];
            step();
        });

        function step() {
            if (--wait)
                return;
            wait = 1;
            root.forEach(function (d) {
                var href = SR + '/' + d.href;
                if (top && plainpath(d.href).replace(/\/$/, '') == top)
                    return people_of(href);
                var out = [];
                server.push(out);
                folder(href, out);
            });
            finish();
        }

        // a folder holding the home folder (/home/) is listed in its place, without the
        // home folder; any other one is a server folder as it is. In root order
        function folder(href, out) {
            var p = plainpath(href);
            if (p == home)
                return;
            if (home.indexOf(p) !== 0)
                return out.push({ name: p.slice(SR.length + 1).replace(/\/$/, ''), href: href });
            wait++;
            getjson(href + '?ls', function (j) {
                (j && j.dirs || []).forEach(function (d) {
                    var sub = [];
                    out.push(sub);
                    folder(href + d.href, sub);
                });
                finish();
            });
        }

        function people_of(href) {
            wait++;
            getjson(href + '?ls', function (j) {
                (j && j.dirs || []).forEach(function (d) {
                    var who = { owner: plainpath(d.href).replace(/\/$/, ''), dirs: [] };
                    people.push(who);
                    wait++;
                    getjson(href + d.href + '?ls', function (j) {
                        (j && j.dirs || []).forEach(function (g) {
                            who.dirs.push({ name: plainpath(g.href).replace(/\/$/, ''), href: href + d.href + g.href });
                        });
                        finish();
                    });
                });
                finish();
            });
        }

        function finish() {
            if (--wait)
                return;
            var flat = [];
            (function walk(xs) {
                xs.forEach(function (x) {
                    if (x.href)
                        flat.push(x);
                    else
                        walk(x);
                });
            })(server);
            done({
                people: people.filter(function (p) { return p.dirs.length; }).sort(function (a, b) {
                    return a.owner.localeCompare(b.owner);
                }),
                server: flat
            });
        }
    }

    function recent(done) {
        getjson(SR + '/?ru&j', function (j) {
            done(j && j.ups ? j.ups : null);
        });
    }

    ui.views = { shared: shared, recent: recent };

    // ---- the views

    // folder links open in the list, as the tree would; other links (files) as links do
    function golist(e) {
        var a = e.target.closest && e.target.closest('a[data-dir]');
        if (!a || e.button || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey)
            return;
        e.preventDefault();
        treectl.goto(a.getAttribute('href'), true);
    }

    function loading(sec) {
        sec.setAttribute('aria-busy', 'true');
        sec.appendChild(el('p', { class: 'fk-vmsg', text: 'Loading…' }));
        return ++gen;
    }

    // false when the reply is for a view left since
    function ready(sec, id, me) {
        if (me != gen || shell.view() != id)
            return false;
        sec.removeAttribute('aria-busy');
        var p = sec.querySelector('.fk-vmsg');
        if (p)
            p.remove();
        return true;
    }

    function empty(sec, head, more) {
        sec.appendChild(el('div', { class: 'fk-vempty' }, [
            ui.icon('folder'), el('p', { class: 'fk-vempty-h', text: head }), el('p', { text: more })
        ]));
    }

    function dirlist(dirs) {
        return el('ul', { class: 'fk-vlist' }, dirs.map(function (d) {
            return el('li', {}, el('a', { class: 'fk-vrow', href: d.href, 'data-dir': '' }, [
                ui.icon('folder'), el('span', { text: d.name })
            ]));
        }));
    }

    function group(id, title, kids) {
        return el('section', { class: 'fk-vgroup', 'aria-labelledby': id }, [
            el('h3', { id: id, text: title })
        ].concat(kids));
    }

    shell.views.shared = function (sec) {
        var me = loading(sec);
        shared(function (r) {
            if (!ready(sec, 'shared', me))
                return;
            if (!r.people.length && !r.server.length)
                return empty(sec, 'Nothing is shared with you yet',
                    'Folders people give you, and server folders opened to you, show here.');
            if (r.people.length)
                sec.appendChild(group('fk-vpeople', 'From people', r.people.map(function (p) {
                    return el('div', { class: 'fk-vowner' }, [el('h4', { text: p.owner }), dirlist(p.dirs)]);
                })));
            if (r.server.length)
                sec.appendChild(group('fk-vserver', 'Server folders', [dirlist(r.server)]));
        });
    };

    function size(b) {
        return b < 1000 ? b + ' B' : humansize(b);
    }

    // where a folder is, as a person reads it: My files/trip, family/up
    function where(dir) {
        var p = plainpath(dir),
            h = plainpath(shell.home);
        if (p.indexOf(h) === 0)
            return ('My files/' + p.slice(h.length)).replace(/\/$/, '');
        return p.slice(SR.length + 1).replace(/\/$/, '') || '/';
    }

    function who(un) {
        return !un || un == '(?)' ? '' : un == '*' ? 'a guest' : un;
    }

    shell.views.recent = function (sec) {
        var me = loading(sec);
        recent(function (ups) {
            if (!ready(sec, 'recent', me))
                return;
            if (!ups)
                return sec.appendChild(el('p', { class: 'fk-vmsg' }, el('a', {
                    href: SR + '/?ru', text: 'The server did not list recent uploads; see the recent uploads page.'
                })));
            if (!ups.length)
                return empty(sec, 'No recent uploads',
                    'Files uploaded to folders you can open show here, newest first.');

            var cols = [['name', 'Name'], ['loc', 'Location'], ['at', 'Uploaded'], ['sz', 'Size'], ['by', 'By']];
            sec.appendChild(el('table', { class: 'fk-vtab' }, [
                el('caption', { class: 'fk-sr', text: 'Recent uploads' }),
                el('thead', {}, el('tr', {}, cols.map(function (c) {
                    return el('th', { scope: 'col', 'data-col': c[0], text: c[1] });
                }))),
                el('tbody', {}, ups.map(function (u) {
                    var vsp = vsplit(u.vp.split('?')[0]),
                        loc = where(vsp[0]);
                    return el('tr', {}, [
                        el('th', { scope: 'row', 'data-col': 'name' }, el('a', { href: u.vp, class: 'fk-vname' }, [
                            ui.icon('file'), el('span', { text: uricom_dec(vsp[1]) })
                        ])),
                        el('td', { 'data-col': 'loc' }, el('a', { href: vsp[0], 'data-dir': '', title: loc }, [
                            ui.icon('folder'), el('span', { text: loc })
                        ])),
                        el('td', { 'data-col': 'at', text: u.at ? unix2ui(u.at) : '' }),
                        el('td', { 'data-col': 'sz', text: size(u.sz) }),
                        el('td', { 'data-col': 'by', text: who(u.un) })
                    ]);
                }))
            ]));
        });
    };

    // the nav entry only where the server lists recent uploads for this account; the
    // filter matches no path (every one starts with a single /), so the reply stays small
    getjson(SR + '/?ru&j&filter=' + encodeURIComponent('^//'), function (j) {
        var a = shell.entry('recent');
        if (!j && a)
            a.parentNode.style.display = 'none';
    });

    var vsec = QS('.fk-ph');
    if (vsec)
        vsec.addEventListener('click', golist);

    ui.style(css());

    function css() {
        var S = '.fk-ph';
        return [
            S + '{container-type:inline-size}',
            '.fk-sr{position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap}',
            '.fk-vmsg{color:var(--fk-muted)}',
            '.fk-vempty{margin:48px auto;text-align:center;color:var(--fk-muted)}',
            '.fk-vempty .fk-ico{width:64px;height:64px;color:#c4c7c5}',
            '.fk-vempty-h{margin:8px 0 4px;color:var(--fk-text);font-size:18px}',
            S + '{max-width:none}',
            '.fk-vgroup h3{margin:24px 0 8px;font:500 16px/1.4 var(--fk-font)}',
            '.fk-vowner h4{margin:12px 0 4px;color:var(--fk-muted);font:500 14px/1.4 var(--fk-font)}',
            '.fk-vlist{list-style:none;margin:0;padding:0;border-top:1px solid #e1e3e1}',
            '.fk-vlist li{border-bottom:1px solid #e1e3e1}',
            '.fk-vrow{display:flex;align-items:center;gap:16px;min-height:48px;padding:0 12px;color:var(--fk-text);',
            'text-decoration:none;font:500 14px var(--fk-font)}',
            '.fk-vrow:hover,.fk-vtab tbody tr:hover{background:var(--fk-hover)}',
            '.fk-vrow .fk-ico,.fk-vtab .fk-ico{flex:none;color:#5f6368}',
            '.fk-vrow span{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
            // upstream's *:focus ring (ui.css) off, ours on focus-visible; its link colour off
            'html.fk .fk-ph h2:focus,html.fk .fk-ph a:focus{outline:0;box-shadow:none;border-radius:0}',
            'html.fk .fk-ph a.fk-vrow{color:var(--fk-text)}',
            'html.fk .fk-ph a.fk-vrow:focus-visible,html.fk .fk-vtab a:focus-visible{outline:2px solid var(--fk-focus);outline-offset:-2px}',

            '.fk-vtab{width:100%;border-collapse:collapse;table-layout:fixed;font:14px/1.4 var(--fk-font);color:var(--fk-muted)}',
            '.fk-vtab th,.fk-vtab td{height:48px;padding:0 8px;border-bottom:1px solid #e1e3e1;text-align:start;',
            'overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:400}',
            '.fk-vtab thead th{color:var(--fk-text);font-weight:500}',
            '.fk-vtab [data-col=loc]{width:28%}',
            '.fk-vtab [data-col=at]{width:150px}',
            '.fk-vtab [data-col=sz]{width:80px}',
            '.fk-vtab [data-col=by]{width:110px}',
            '.fk-vtab a{display:inline-flex;align-items:center;gap:12px;max-width:100%;min-height:40px;',
            'color:inherit;text-decoration:none;vertical-align:middle}',
            '.fk-vtab a span{min-width:0;overflow:hidden;text-overflow:ellipsis}',
            '.fk-vtab .fk-vname{gap:16px;color:var(--fk-text);font-weight:500}',
            '.fk-vtab [data-col=loc] a:hover span{text-decoration:underline}',

            // a phone: the name, and under it "by X, when"; the folder as a button on the right
            '@container (width < 600px){',
            '.fk-vtab,.fk-vtab tbody{display:block}',
            '.fk-vtab thead{display:none}',
            '.fk-vtab tbody tr{position:relative;display:grid;grid-template-columns:auto minmax(0,1fr) 48px;',
            'grid-template-areas:"name name loc" "by at loc";align-items:center;min-height:64px;',
            'border-bottom:1px solid #e1e3e1}',
            '.fk-vtab th,.fk-vtab td{display:block;width:auto!important;height:auto;border:0;padding:0}',
            '.fk-vtab [data-col=name]{grid-area:name;padding:8px 0 0 8px}',
            '.fk-vtab [data-col=by]{grid-area:by;padding:0 0 8px 48px;font-size:12px}',
            '.fk-vtab [data-col=at]{grid-area:at;padding:0 0 8px;font-size:12px}',
            '.fk-vtab [data-col=sz]{display:none}',
            '.fk-vtab [data-col=by]:not(:empty)::before{content:"by "}',
            '.fk-vtab tr:has([data-col=by]:not(:empty)) [data-col=at]:not(:empty)::before{content:", "}',
            '.fk-vtab [data-col=by]:empty{padding-right:0}',
            '.fk-vtab tr:has([data-col=by]:empty) [data-col=at]{padding-left:48px}',
            '.fk-vtab [data-col=loc]{grid-area:loc;align-self:stretch;display:flex;z-index:1}',
            '.fk-vtab [data-col=loc] a{justify-content:center;width:48px;min-height:48px;height:100%}',
            '.fk-vtab [data-col=loc] a span{position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap}',
            '.fk-vtab .fk-vname{min-height:28px}',
            // the whole row opens the file
            '.fk-vtab .fk-vname::after{content:"";position:absolute;inset:0 48px 0 0}',
            '}',
            '@media (max-width:799px){.fk-vrow{min-height:56px}}'
        ].join('');
    }
})();
