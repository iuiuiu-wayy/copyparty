"use strict";

// fork-only, drive-ux: the top bar's search box and its chips; see FORK.md.
// Typing (or Enter) searches names under the current folder with upstream's search, so the
// hits show in the list as upstream's search results. Type and Modified chips narrow them;
// Advanced opens upstream's full search form, filled with the name and dates. `/` focuses
// the box; Esc in it or its clear button end the search and bring the folder back. The box
// shows only where upstream shows its search tab (indexed volumes; forkshell.js hides it).
// Upstream searches every volume the account can read, so "under this folder" is a path
// term of the query; it holds files only. Built with forkui.js and forkshell.js.

(function () {
    var ui = window.forkui;
    if (!ui || !ui.ok || !ui.shell || !window.search_ui || !search_ui.render ||
        !window.reload_browser || !window.treectl || !ebi('q_raw') || !ebi('srch_namev') ||
        !ebi('srch_q') || !ebi('path'))
        return;

    var el = ui.el,
        de = document.documentElement,
        form = ui.shell.search,
        q = ui.shell.q,
        st = { type: '', when: '', from: '', to: '' },
        active = false,     // our results (or upstream's) are in the list
        sent = null,        // the query we last sent
        timer = 0;

    // extension groups of the Type chip
    var TYPES = [
        ['', 'Any type'],
        ['img', 'Images', 'jpg jpeg png gif webp avif heic heif bmp tif tiff svg jxl'],
        ['vid', 'Videos', 'mp4 mkv webm mov avi m4v wmv mpg mpeg 3gp'],
        ['aud', 'Audio', 'mp3 flac ogg opus m4a aac wav wma aif aiff'],
        ['pdf', 'PDFs', 'pdf'],
        ['doc', 'Documents', 'doc docx odt rtf txt md epub'],
        ['xls', 'Spreadsheets', 'xls xlsx ods csv'],
        ['ppt', 'Presentations', 'ppt pptx odp key'],
        ['zip', 'Archives', 'zip 7z rar tar gz tgz bz2 xz zst iso']
    ];

    var WHEN = [
        ['', 'Any time'],
        ['today', 'Today'],
        ['7', 'Last 7 days'],
        ['30', 'Last 30 days'],
        ['year', 'This year'],
        ['lastyear', 'Last year'],
        ['custom', 'Custom range…']
    ];

    function find(lst, k) {
        for (var a = 0; a < lst.length; a++)
            if (lst[a][0] == k)
                return lst[a];
        return lst[0];
    }

    // ---- the query, in the syntax upstream's form writes to its raw field

    function qv(v) {
        return /[\s"()]/.test(v) ? '"' + v.replace(/"/g, '\\"') + '"' : v;
    }

    // a word of the name, as upstream's form encodes its "name contains" field:
    // -word negates, ^ and $ anchor, else *word*
    function nameterm(tv) {
        var not = '';
        if (tv.charAt(0) == '-' && tv.length > 1) {
            tv = tv.slice(1);
            not = 'not ';
        }
        tv = tv.charAt(0) == '^' ? tv.slice(1) : '*' + tv;
        tv = tv.slice(-1) == '$' ? tv.slice(0, -1) : tv + '*';
        return not + 'name like ' + qv(tv);
    }

    // a local time as upstream's date fields take it (the server reads them as UTC)
    function iso(d) {
        return d.toISOString().slice(0, 19);
    }

    function midnight(days) {
        var d = new Date();
        return new Date(d.getFullYear(), d.getMonth(), d.getDate() - (days || 0));
    }

    function localday(s, next) {
        var m = /^(\d{4})-(\d\d)-(\d\d)$/.exec(s || '');
        return m ? new Date(+m[1], +m[2] - 1, +m[3] + (next ? 1 : 0)) : null;
    }

    // [after, before] as upstream's date fields, '' for no bound
    function range() {
        var w = st.when, y = new Date().getFullYear(), lo = null, hi = null;
        if (w == 'today')
            lo = midnight(0);
        else if (w == '7')
            lo = midnight(6);
        else if (w == '30')
            lo = midnight(29);
        else if (w == 'year')
            lo = new Date(y, 0, 1);
        else if (w == 'lastyear') {
            lo = new Date(y - 1, 0, 1);
            hi = new Date(y, 0, 1);
        }
        else if (w == 'custom') {
            lo = localday(st.from);
            hi = localday(st.to, true);
        }
        if (hi)
            hi = new Date(hi.getTime() - 1000);
        return [lo ? iso(lo) : '', hi ? iso(hi) : ''];
    }

    function folder() {
        return uricom_dec(get_evpath().slice(SR.length)).replace(/^\/+|\/+$/g, '');
    }

    function build(txt) {
        var parts = [],
            p = folder(),
            words = txt.split(/\s+/),
            t = find(TYPES, st.type),
            r = range();

        // the folder and everything under it: exact compares, since LIKE would take a _ or %
        // in a folder name as a wildcard and ignore ASCII case ('0' sorts right after '/')
        if (p)
            parts.push('( path = ' + qv(p) + ' or ( path > ' + qv(p + '/') + ' and path < ' + qv(p + '0') + ' ) )');
        for (var a = 0; a < words.length; a++)
            if (words[a])
                parts.push(nameterm(words[a]));
        if (t[2])
            parts.push('( ' + t[2].split(' ').map(function (x) {
                return 'name like *.' + x;
            }).join(' or ') + ' )');
        if (r[0])
            parts.push('date >= ' + r[0]);
        if (r[1])
            parts.push('date <= ' + r[1]);
        return parts.join(' and ');
    }

    // upstream's form shows what we searched for: the name and dates, its other fields off
    function fillform(txt, r) {
        var cs = QSA('#srch_form input[type=checkbox]');
        for (var a = 0; a < cs.length; a++)
            cs[a].checked = false;
        var f = { name: txt, dtl: r[0], dtu: r[1] };
        for (var k in f) {
            var v = ebi('srch_' + k + 'v'),
                c = ebi('srch_' + k + 'c');
            if (!v || !c)
                continue;
            v.value = f[k];
            c.checked = !!f[k];
        }
    }

    // ---- running and ending a search

    function run() {
        clearTimeout(timer);
        var txt = q.value.trim();
        if (!txt && !st.type && !st.when)
            return end();

        var raw = ebi('q_raw');
        fillform(txt, range());
        raw.value = sent = build(txt);
        active = true;
        sync();
        // upstream's Enter on its raw field: do_search with that query, now
        raw.onkeydown({ key: 'Enter' });
    }

    // forget our search; the list is the folder's again (or about to be)
    function reset() {
        clearTimeout(timer);
        active = false;
        sent = null;
        st.type = st.when = st.from = st.to = '';
        q.value = '';
        say('');
        sync();
    }

    function end() {
        var u = ebi('unsearch');
        reset();
        // upstream's close-search link restores the folder's listing
        if (u)
            u.click();
    }

    ui.shell.onsearch = run;

    q.addEventListener('input', function () {
        clearTimeout(timer);
        sync();
        if (q.value.trim())
            timer = setTimeout(run, 500);
        else if (active)
            timer = setTimeout(st.type || st.when ? run : end, 500);
    });

    q.addEventListener('keydown', function (e) {
        if (e.key != 'Escape' || (!q.value && !active))
            return;
        e.preventDefault();
        e.stopPropagation();
        end();
    });

    var clearbtn = el('button', {
        type: 'button', class: 'fk-ibtn fk-sclear', 'aria-label': 'Clear search', title: 'Clear search',
        on: {
            click: function () {
                end();
                q.focus();
            }
        }
    }, ui.icon('close'));
    form.appendChild(clearbtn);

    // ---- the chips

    function chip(label) {
        return el('button', { type: 'button', class: 'fk-chip' }, [el('span', { text: label }), ui.icon('caret')]);
    }

    var typeb = chip('Type'),
        whenb = chip('Modified'),
        advb = el('button', { type: 'button', class: 'fk-chip', on: { click: advanced } },
            [ui.icon('tune'), el('span', { text: 'Advanced' })]),
        bar = el('div', {
            class: 'fk-chips', role: 'toolbar', 'aria-label': 'Search filters', focusgroup: 'toolbar nowrap'
        }, [typeb, whenb, advb]),
        strip = el('div', { class: 'fk-sstrip' }, bar),
        status = el('p', { class: 'fk-sstat', role: 'status' }),
        ref = QS('.fk-selstrip') || ebi('path');
    ref.parentNode.insertBefore(strip, ref);
    ref.parentNode.insertBefore(status, ref);

    function advanced() {
        ui.shell.opentool('search');
    }

    // a set chip shows its value, and its name says which chip it is: "Type: Images"
    function setchip(b, name, label) {
        b.firstChild.textContent = label || name;
        b.classList.toggle('fk-on', !!label);
        if (label)
            b.setAttribute('aria-label', name + ': ' + label);
        else
            b.removeAttribute('aria-label');
    }

    function items(lst, key, onpick) {
        return function () {
            return lst.map(function (t) {
                return {
                    label: t[1], icon: st[key] == t[0] ? 'check' : null,
                    select: function () { onpick(t[0]); }
                };
            });
        };
    }

    ui.menu({
        trigger: typeb, label: 'Type', title: 'Type', items: items(TYPES, 'type', function (k) {
            st.type = k;
            run();
        })
    });

    ui.menu({
        trigger: whenb, label: 'Modified', title: 'Modified', items: items(WHEN, 'when', function (k) {
            if (k == 'custom')
                return custom.open(whenb);
            st.when = k;
            st.from = st.to = '';
            run();
        })
    });

    // the custom range: two dates
    var after = el('input', { type: 'date', id: 'fk-dt-a', name: 'after' }),
        before = el('input', { type: 'date', id: 'fk-dt-b', name: 'before' }),
        cform = el('form', {
            class: 'fk-range', method: 'dialog', on: {
                submit: function (e) {
                    e.preventDefault();
                    if (!after.value && !before.value)
                        return after.focus();
                    st.when = 'custom';
                    st.from = after.value;
                    st.to = before.value;
                    custom.close();
                    run();
                }
            }
        }, [
            el('h2', { text: 'Modified between' }),
            el('label', { 'for': 'fk-dt-a', text: 'After' }), after,
            el('label', { 'for': 'fk-dt-b', text: 'Before' }), before,
            el('div', { class: 'fk-dlgbtns' }, [
                el('button', { type: 'button', class: 'fk-tbtn', text: 'Cancel', on: { click: function () { custom.close(); } } }),
                el('button', { type: 'submit', class: 'fk-tbtn fk-primary', text: 'Apply' })
            ])
        ]),
        custom = ui.dialog({
            label: 'Modified between', 'class': 'fk-rangedlg', kids: cform,
            onopen: function () {
                after.value = st.from;
                before.value = st.to;
                after.focus();
            }
        });

    // one tab stop in the chips, arrows between them (where focusgroup is missing)
    if (!('focusGroup' in HTMLElement.prototype)) {
        var chipsl = [typeb, whenb, advb];
        chipsl.forEach(function (b, i) { b.tabIndex = i ? -1 : 0; });
        bar.addEventListener('focusin', function (e) {
            if (chipsl.indexOf(e.target) >= 0)
                chipsl.forEach(function (b) { b.tabIndex = b === e.target ? 0 : -1; });
        });
        bar.addEventListener('keydown', function (e) {
            var i = chipsl.indexOf(document.activeElement),
                rtl = getComputedStyle(bar).direction == 'rtl',
                step = { ArrowRight: rtl ? -1 : 1, ArrowLeft: rtl ? 1 : -1 }[e.key],
                to = e.key == 'Home' ? 0 : e.key == 'End' ? chipsl.length - 1 :
                    step && i >= 0 ? Math.min(chipsl.length - 1, Math.max(0, i + step)) : -1;
            if (to < 0)
                return;
            e.preventDefault();
            chipsl[to].focus();
        });
    }

    function sync() {
        de.classList.toggle('fk-insrch', active);
        clearbtn.hidden = !q.value && !active;
        var t = find(TYPES, st.type),
            w = find(WHEN, st.when),
            wl = w[1];
        if (st.when == 'custom')
            wl = (st.from || '…') + ' – ' + (st.to || '…');
        setchip(typeb, 'Type', st.type ? t[1] : '');
        setchip(whenb, 'Modified', st.when ? wl : '');
    }

    function say(txt) {
        status.textContent = txt;
    }

    // upstream's results are in: say how many; a search of upstream's own form (or its #q=
    // link) is one too, but not ours, so the chips start over
    var orender = search_ui.render;
    search_ui.render = function (res, xhr) {
        var ret = orender.apply(this, arguments);
        if (xhr && ebi('unsearch')) {
            if (xhr.q_raw != sent) {
                st.type = st.when = st.from = st.to = '';
                sent = null;
            }
            active = true;
            var n = res.hits.length;
            say(n ? (n == 1 ? '1 result' : n + ' results') + (res.trunc ? ', more on the server' : '') : 'No results');
            sync();
        }
        return ret;
    };

    // a listing replaced the results (a folder opened, or upstream's close link): no search
    var oreload = window.reload_browser;
    window.reload_browser = function () {
        var ret = oreload.apply(this, arguments);
        if (active && !ebi('unsearch')) {
            reset();
            if (treectl.hidden)
                treectl.show();
        }
        return ret;
    };

    // a refused search (rate limit, no index): upstream writes it in its panel's #srch_q
    new MutationObserver(function () {
        var s = ebi('srch_q');
        if (active && s.classList.contains('err'))
            say('Search failed: ' + s.textContent);
    }).observe(ebi('srch_q'), { childList: true, characterData: true, subtree: true, attributes: true });

    // `/` focuses the box, as in Drive
    window.addEventListener('keydown', function (e) {
        if (e.key != '/' || e.ctrlKey || e.metaKey || e.altKey || e.isComposing)
            return;
        var t = e.target,
            tag = t && t.tagName;
        if (tag == 'INPUT' || tag == 'TEXTAREA' || tag == 'SELECT' || (t && t.isContentEditable) ||
            QS('dialog[open]') || QS('.fk-menu:popover-open') || QS('#bbox-overlay.visible') ||
            !form.offsetParent)
            return;
        e.preventDefault();
        e.stopPropagation();
        q.focus();
        q.select();
    }, true);

    ui.style(css());
    sync();

    function css() {
        return [
            '.fk-q::-webkit-search-cancel-button{-webkit-appearance:none;appearance:none}',
            '.fk-search .fk-sclear{margin-right:-8px;width:36px;height:36px}',
            '.fk-search .fk-sclear[hidden]{display:none}',
            '.fk-sstrip{padding:12px 1.5em 4px}',
            'html:not(.fk-insrch) .fk-sstrip{display:none}',
            '.fk-chips{display:flex;flex-wrap:nowrap;gap:8px;overflow-x:auto;scrollbar-width:none;',
            'scroll-snap-type:x proximity;padding:2px}',
            '.fk-chips::-webkit-scrollbar{display:none}',
            '.fk-chip{display:inline-flex;align-items:center;gap:6px;flex:none;min-height:32px;padding:0 10px 0 14px;',
            'margin:0;border:1px solid var(--fk-line);border-radius:8px;background:var(--fk-surface);',
            'color:var(--fk-text);font:500 14px var(--fk-font);white-space:nowrap;cursor:pointer;scroll-snap-align:start}',
            '.fk-chip .fk-ico{width:18px;height:18px}',
            '.fk-chip:last-child{padding:0 14px 0 10px}',
            '@media (hover:hover){.fk-chip:hover{background:var(--fk-hover)}}',
            '.fk-chip.fk-on{background:var(--fk-active);border-color:var(--fk-active)}',
            '.fk-chip:focus-visible{outline:2px solid var(--fk-focus);outline-offset:2px}',
            '.fk-sstat{position:absolute;width:1px;height:1px;margin:-1px;padding:0;overflow:hidden;',
            'clip-path:inset(50%);white-space:nowrap;border:0}',
            '.fk-rangedlg{width:min(22em,calc(100vw - 32px));border-radius:var(--fk-r)}',
            '.fk-range{display:grid;gap:6px;padding:20px 24px 16px}',
            '.fk-range h2{margin:0 0 8px;font:400 22px/1.3 var(--fk-font)}',
            '.fk-range label{font-weight:500;margin-top:6px}',
            '.fk-range input{min-height:var(--fk-tap);padding:0 10px;border:1px solid var(--fk-line);',
            'border-radius:4px;font:16px var(--fk-font);color:var(--fk-text);background:var(--fk-surface)}',
            '.fk-dlgbtns{display:flex;justify-content:flex-end;gap:8px;margin-top:12px}',
            '.fk-range .fk-tbtn{display:inline-flex;align-items:center;min-height:var(--fk-tap);padding:0 16px;',
            'border:0;border-radius:22px;background:transparent;color:var(--fk-accent);font:500 14px var(--fk-font);cursor:pointer}',
            '.fk-range .fk-primary{background:var(--fk-accent);color:#fff}',
            '.fk-range .fk-tbtn:focus-visible{outline:2px solid var(--fk-focus);outline-offset:2px}',
            '@media (pointer:coarse){.fk-chip{min-height:var(--fk-tap)}.fk-search .fk-sclear{width:var(--fk-tap);height:var(--fk-tap)}}',
            '@media (max-width:799px){.fk-sstrip{padding:8px .5em 4px}.fk-chip{min-height:var(--fk-tap)}',
            '.fk-search .fk-sclear{width:var(--fk-tap);height:var(--fk-tap);margin-right:-12px}}'
        ].join('');
    }
})();
