"use strict";

// fork-only, disk-space ticket 03: a Storage section at the bottom of the nav, one row per
// disk the account can upload to (GET /?disks&j, fork_disks.py): a label, a bar of the used
// part and "X free of Y". Whole-disk numbers, not the account's own use. The label is
// "My files" for the disk holding the home folder, else the first folder under My files on
// that disk by its name (hdd1), else the volume's name (family); My files first, then by
// label. Refreshed with the list (reload_browser, which runs again when uploads end), at most
// every 30 s, and right away after an upload. Built with forkui.js and forkshell.js's nav;
// a guest (share link) gets nothing and makes no request. See FORK.md.

(function () {
    var ui = window.forkui;
    if (!ui || !ui.ok || !ui.shell || !ui.shell.home || !window.humansize)
        return;

    var navel = QS('.fk-nav');
    if (!navel)
        return;

    var el = ui.el,
        FULL = 90,          // percent used where the bar turns red (the email alert's default)
        EVERY = 30000,      // ms between refreshes
        home = plainpath(ui.shell.home),
        last = 0,           // when the last refresh was sent
        dirty = false,      // an upload started since then
        busy = false;

    // a path as the server writes vpaths: no --rp-loc prefix, no URL quoting
    function plainpath(p) {
        try {
            p = decodeURIComponent(p);
        }
        catch (e) { }
        return p.slice((window.SR || '').length);
    }

    // a volume as a person reads it, and how early it sorts: My files, its folders, the rest
    function name(vp) {
        if (vp == home)
            return ['My files', 0];
        if (vp.indexOf(home) === 0)
            return [vp.slice(home.length).replace(/\/$/, ''), 1];
        return [vp.replace(/^\/|\/$/g, ''), 2];
    }

    var list = el('ul', {}),
        box = el('div', { class: 'fk-disks', hidden: true }, [
            el('h2', { class: 'fk-dh', id: 'fk-dh', text: 'Storage' }),
            list
        ]);
    list.setAttribute('aria-labelledby', 'fk-dh');
    navel.appendChild(box);

    function render(disks) {
        var rows = (disks || []).filter(function (d) {
            return d && d.total > 0 && d.vols && d.vols.length;
        }).map(function (d) {
            var names = d.vols.map(name).sort(function (a, b) {
                return a[1] - b[1] || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0);
            });
            return { d: d, label: names[0][0], rank: names[0][1], all: names };
        }).sort(function (a, b) {
            return a.rank - b.rank || (a.label < b.label ? -1 : a.label > b.label ? 1 : 0);
        });

        list.textContent = '';
        rows.forEach(function (r) {
            var free = Math.max(0, Math.min(r.d.free, r.d.total)),
                pct = Math.round(100 * (r.d.total - free) / r.d.total),
                text = humansize(free) + ' free of ' + humansize(r.d.total),
                fill = el('span', {}),
                others = r.all.slice(1).map(function (n) {
                    return n[1] == 1 ? 'My files/' + n[0] : n[0];
                });

            fill.style.width = pct + '%';
            var bar = el('div', {
                class: 'fk-dbar', role: 'meter', 'aria-label': r.label,
                'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': '' + pct,
                'aria-valuetext': pct + '% used, ' + text
            }, fill);
            list.appendChild(el('li', {
                class: 'fk-disk' + (pct >= FULL ? ' fk-dfull' : ''),
                title: others.length ? 'Also on this disk: ' + others.join(', ') : null
            }, [
                el('div', { class: 'fk-dn', text: r.label, 'aria-hidden': 'true' }),
                bar,
                el('div', { class: 'fk-dt', text: text, 'aria-hidden': 'true' })
            ]));
        });
        box.hidden = !rows.length;
    }

    function refresh(force) {
        var now = Date.now();
        if (busy || (!force && !dirty && now - last < EVERY))
            return;
        busy = true;
        last = now;
        dirty = false;
        var xhr = new XMLHttpRequest();
        xhr.open('GET', SR + '/?disks&j', true);
        xhr.onload = xhr.onerror = function () {
            busy = false;
            if (xhr.status != 200)
                return;     // quietly: an old server, or du-who says no
            try {
                render(JSON.parse(xhr.responseText).disks);
            }
            catch (e) { }
        };
        xhr.send();
    }

    function after(obj, nm, fn) {
        var orig = obj[nm];
        if (typeof orig != 'function')
            return;
        obj[nm] = function () {
            var ret = orig.apply(this, arguments);
            fn();
            return ret;
        };
    }
    after(window, 'reload_browser', function () { refresh(false); });

    // an upload takes space: refresh at the next list reload, which up2k does when it ends
    function hook() {
        if (!window.up2k || !up2k.ui || up2k.ui.fk_disks)
            return;
        after(up2k.ui, 'addfile', function () { dirty = true; });
        up2k.ui.fk_disks = 1;
    }
    if (window.up2k)
        hook();
    else if (window.up2k_hooks)
        up2k_hooks.push(hook);

    ui.style([
        '.fk-disks{margin:16px 0 0;padding:12px 8px 0 12px;border-top:1px solid var(--fk-line)}',
        '.fk-disks[hidden]{display:none}',
        '.fk-dh{margin:0 0 8px;font:500 14px/1.4 var(--fk-font);color:var(--fk-text)}',
        '.fk-disks ul{list-style:none;margin:0;padding:0}',
        '.fk-disk{margin:0 0 12px;font-size:13px;line-height:1.4}',
        '.fk-dn{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--fk-text)}',
        '.fk-dbar{height:4px;margin:4px 0;border-radius:2px;background:#e3e3e3;overflow:hidden}',
        '.fk-dbar>span{display:block;height:100%;border-radius:2px;background:var(--fk-accent)}',
        '.fk-dfull .fk-dbar>span{background:#b3261e}',
        '.fk-dt{font-size:12px;color:var(--fk-muted)}',
        '.fk-dfull .fk-dt{color:#b3261e}'
    ].join('\n'));

    refresh(true);
})();
