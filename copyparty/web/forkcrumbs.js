"use strict";

// fork-only, drive-ux: the breadcrumb and the folder menu of the Drive-style file browser;
// see FORK.md. Upstream's breadcrumb (#path, rebuilt by reload_browser on every listing) is
// redone after each rebuild as <nav aria-label="Breadcrumbs"><ol>, inside #path, so
// upstream's own show / hide of #path (tree, search) still applies:
// - it starts at My files (the home folder), at Shared with me (a link that opens that view)
//   for any other folder, or at the share link's name for a guest;
// - earlier parts are upstream's own links, moved into the list, so upstream's click handler
//   (#path onclick) still navigates and dragmove.js still takes them as drop targets;
// - the last part, the current folder, is a button opening the folder menu: New folder,
//   Upload files, Upload folder (forknew.js), Share (forkshare.js), Rename (forkrename.js),
//   Download (upstream's folder zip), each only where allowed; with none, plain text;
// - on a phone the parts between the first and the current folder collapse into a "…" menu.
// Built with forkui.js, after forkshell.js / forknew.js / forkshare.js / forkrename.js.

(function () {
    var ui = window.forkui;
    if (!ui || !ui.ok || !window.treectl || !window.reload_browser || !window.L ||
        !ebi('path') || !ebi('entree'))
        return;

    var el = ui.el,
        P = ebi('path'),
        de = document.documentElement,
        guest = !window.acct || acct == '*' || !!window.in_shr ||
            !!(window.have_shr && get_evpath().indexOf(SR + have_shr) === 0),
        parentok = {},      // encoded folder path -> its parent's perms allow a rename into it
        mid = [];           // the collapsed parts: [{ label, href }]

    var ol = el('ol'),
        nav = el('nav', { class: 'fk-crumbs', 'aria-label': 'Breadcrumbs' }, ol);

    // the "…" button and the current folder's button are kept from one listing to the next
    // (their menus hold them as where focus goes back to)
    var dots = el('button', {
        type: 'button', class: 'fk-cdots', 'aria-label': 'Show the folders in between',
        'aria-haspopup': 'menu', 'aria-expanded': 'false'
    }, ui.icon('more'));
    dots.firstChild.firstChild.setAttribute('d', 'M5.5 12h.01M12 12h.01M18.5 12h.01');
    var curbtn = el('button', {
        type: 'button', class: 'fk-ccur', 'aria-haspopup': 'menu', 'aria-expanded': 'false',
        'aria-current': 'page'
    }, [el('span', { class: 'fk-cname' }), ui.icon('caret')]);
    var curtxt = el('span', { class: 'fk-ccur fk-cname', 'aria-current': 'page' });

    function perm(p) {
        return has(window.perms || [], p);
    }

    function hid(id) {
        var b = ebi(id);
        return !b || clgot(b, 'hide');
    }

    // ---- what the current folder offers

    var info = { name: '', vp: '', root: true };

    function canrename() {
        if (guest || info.root || !ui.rename || !window.have_mv || !perm('move') || !perm('write'))
            return false;
        // inside My files the parent is the same volume; elsewhere the parent's own perms
        // say whether anything can be written there (a volume's root has a parent with no
        // path on disk, which answers with no perms)
        return info.home || parentok[info.vp] === true;
    }

    function zipurl() {
        var z = ebi('zip1');
        if (!window.have_zip || !z || z.style.display == 'none' || !perm('read') || ebi('unsearch'))
            return null;
        return z.getAttribute('href');
    }

    var RELABEL = { 'File upload': 'Upload files', 'Folder upload': 'Upload folder' };

    function items() {
        var ret = [],
            cr = ui.create && !ebi('unsearch') ? ui.create.items(curbtn) : [];
        for (var a = 0; a < cr.length; a++) {
            // the folder menu has no New text file (the spec's list); + New keeps it
            if (cr[a].label == 'New text file')
                continue;
            cr[a].label = RELABEL[cr[a].label] || cr[a].label;
            ret.push(cr[a]);
        }
        var grp = [];
        if (ui.share && !guest && !hid('fshr') && (window.perms || []).length)
            grp.push({
                label: 'Share', icon: 'share', select: function () {
                    ui.share.open(ui.share.item(), curbtn);
                }
            });
        if (canrename())
            grp.push({ label: 'Rename', icon: 'rename', select: rename });
        var z = zipurl();
        if (z)
            grp.push({ label: 'Download', icon: 'download', href: z });
        if (ret.length && grp.length)
            ret.push({ sep: true });
        return ret.concat(grp);
    }

    function rename() {
        var vp = info.vp.replace(/\/$/, '');
        ui.rename({ vp: vp, fn: info.name, isd: true }, curbtn, function (newvp) {
            var to = newvp + '/';
            hist_replace(to);
            treectl.goto(to);
            if (window.fileman && fileman.tx)
                fileman.tx(vp + '/');
        });
    }

    var fmenu = ui.menu({
        label: 'Folder actions', dense: true, items: items,
        title: function () { return info.name; }
    });
    var dmenu = ui.menu({
        label: 'Folders in between', title: 'Folders', items: function () {
            return mid.map(function (p) {
                return { label: p.label, icon: 'folder', select: function () { treectl.goto(p.href, true); } };
            });
        }
    });

    // as forkui.menu does for its own trigger: a press on the button of the open menu (which
    // light-dismissed it already) only closes it
    function opener(btn, M) {
        btn.addEventListener('click', function (e) {
            e.preventDefault();
            e.stopPropagation();
            if (M.from() == btn && (M.isOpen() || Date.now() - M.shut() < 300))
                return M.close();
            M.open(e.detail === 0, { from: btn });
        });
        btn.addEventListener('keydown', function (e) {
            if (e.key != 'ArrowDown')
                return;
            e.preventDefault();
            M.open(true, { from: btn });
        });
    }
    opener(curbtn, fmenu);
    opener(dots, dmenu);

    // ---- the trail

    function enc(a) {
        return a.getAttribute('href').split('?')[0];
    }

    function li(kids, cls) {
        return el('li', { class: cls || null }, kids);
    }

    function sync() {
        var links = [], kids = P.children;
        for (var a = 0; a < kids.length; a++)
            if (kids[a].tagName == 'A' && kids[a].id != 'entree')
                links.push(kids[a]);
        if (!links.length)
            return;

        // drop upstream's separators; our own are drawn by CSS
        var is = P.querySelectorAll(':scope>i');
        for (var a = 0; a < is.length; a++)
            P.removeChild(is[a]);

        var shell = ui.shell || null,
            home = shell && !guest ? shell.home : null,
            evp = get_evpath(),
            first = 0,
            label = null,
            lead = null;

        if (guest && window.have_shr && evp.indexOf(SR + have_shr) === 0) {
            var key = evp.slice((SR + have_shr).length).split('/')[0];
            for (var a = 0; a < links.length; a++)
                if (enc(links[a]) == SR + have_shr + key + '/')
                    first = a;
        }
        else if (home && evp.indexOf(home) === 0) {
            for (var a = 0; a < links.length; a++)
                if (enc(links[a]) == home) {
                    first = a;
                    label = 'My files';
                }
        }
        else if (shell && shell.entry && shell.entry('shared') && !guest) {
            // a folder outside My files: under Shared with me, as the nav and Move to… show it
            first = Math.min(links.length - 1, SR.split('/').length);
            if (links.length > 1)
                lead = el('a', {
                    href: SR + '/?h', 'data-fk-view': 'shared', text: 'Shared with me', on: {
                        click: function (e) {
                            if (e.button || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey)
                                return;
                            e.preventDefault();
                            e.stopPropagation();
                            shell.entry('shared').click();
                        }
                    }
                });
        }

        var keep = links.slice(first),
            last = keep.pop();
        for (var a = 0; a < first; a++)
            P.removeChild(links[a]);
        P.removeChild(last);

        info = {
            name: label && !keep.length ? label : (links.length == 1 && !guest ? 'All folders' : last.textContent),
            vp: enc(last),
            root: !keep.length || (!!home && enc(last) == home),
            home: !!home && evp.indexOf(home) === 0
        };
        if (label && keep.length)
            keep[0].textContent = label;

        var parts = [];
        if (lead)
            parts.push(lead);
        parts = parts.concat(keep);

        ol.textContent = '';
        mid = [];
        // a phone shows the first part, "…" and the current folder: the room beside the
        // Layout toggle is too small for a parent as well
        for (var a = 0; a < parts.length; a++) {
            var inmid = a > 0;
            if (inmid && parts[a].tagName == 'A')
                mid.push({ label: parts[a].textContent, href: parts[a].getAttribute('href') });
            ol.appendChild(li(parts[a], inmid ? 'fk-cmid' : null));
            if (a == 0 && parts.length > 1)
                ol.appendChild(li(dots, 'fk-cdotw'));
        }
        ol.appendChild(li(null, 'fk-clast'));
        P.appendChild(nav);
        fillcur();

        if (!info.home && !info.root && !guest && window.have_mv && perm('move') && !(info.vp in parentok))
            checkparent(info.vp);
    }

    function fillcur() {
        var box = ol.lastChild,
            any = items().length > 0,
            b = any ? curbtn : curtxt;
        if (fmenu.isOpen() && !any)
            fmenu.close();
        curbtn.firstChild.textContent = curtxt.textContent = info.name;
        if (box.firstChild != b) {
            box.textContent = '';
            box.appendChild(b);
        }
    }

    function checkparent(vp) {
        parentok[vp] = false;
        var up = vp.replace(/[^\/]*\/$/, ''),
            xhr = new XMLHttpRequest();
        xhr.open('GET', up + '?ls', true);
        xhr.onload = function () {
            var ok = false;
            try {
                var p = JSON.parse(this.responseText).perms || [];
                ok = this.status == 200 && has(p, 'write');
            }
            catch (e) { }
            parentok[vp] = ok;
            if (ok && info.vp == vp)
                fillcur();
        };
        xhr.send();
    }

    function after(obj, name, fn) {
        var orig = obj[name];
        obj[name] = function () {
            var ret = orig.apply(this, arguments);
            fn();
            return ret;
        };
    }

    after(window, 'reload_browser', sync);
    // perms and the share button are settled after the listing; re-check what the menu holds
    if (window.fileman && fileman.render)
        after(fileman, 'render', function () {
            if (nav.parentNode)
                fillcur();
        });
    sync();

    var C = 'html.fk .fk-crumbs';
    ui.style([
        // upstream's #path box, kept (its display is upstream's), restyled as our row; a block
        // formatting context, so it takes the room beside the floated Layout toggle
        'html.fk:not(.fk-hassel):not(.fk-inph) #path:not([style*="none"]){display:flow-root!important}',
        'html.fk #path{margin:8px 0 4px;padding:0;font:400 18px/1.3 var(--fk-font);color:var(--fk-text);',
        'text-shadow:none;min-width:0}',
        'html.fk #path>#docname{display:none}',
        C + ' ol{display:flex;flex-wrap:wrap;align-items:center;gap:0 2px;margin:0;padding:0;list-style:none}',
        C + ' li{display:flex;align-items:center;min-width:0;margin:0;padding:0}',
        C + ' li+li::before{content:"";flex:none;width:20px;height:20px;margin:0 2px;background:var(--fk-muted);',
        '-webkit-mask:var(--fk-chev) center/contain no-repeat;mask:var(--fk-chev) center/contain no-repeat}',
        C + '{--fk-chev:url("data:image/svg+xml,' + encodeURIComponent(
            '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#000" ' +
            'stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6l-6 6"/></svg>') + '")}',
        C + ' a,' + C + ' button{display:inline-flex;align-items:center;gap:2px;min-height:40px;max-width:100%;',
        'box-sizing:border-box;margin:0;padding:0 12px;border:0;border-radius:20px;background:transparent;',
        'color:var(--fk-muted);font:inherit;text-decoration:none;white-space:nowrap;overflow:hidden;',
        'text-overflow:ellipsis;cursor:pointer;position:static;z-index:auto}',
        C + ' a{display:block;line-height:40px}',
        C + ' a:hover,' + C + ' button:hover{background:var(--fk-hover);color:var(--fk-text)}',
        C + ' a:hover{text-decoration:underline}',
        C + ' a:focus,' + C + ' button:focus{outline:0;box-shadow:none}',
        C + ' a:focus-visible,' + C + ' button:focus-visible{outline:2px solid var(--fk-focus);outline-offset:-2px}',
        C + ' .fk-ccur{color:var(--fk-text);font-weight:400;font-size:1.25em}',
        C + ' button.fk-ccur{padding-right:8px}',
        C + ' button.fk-ccur[aria-expanded=true]{background:var(--fk-press)}',
        C + ' span.fk-ccur{display:block;padding:0 12px;line-height:40px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
        C + ' .fk-cname{min-width:0;overflow:hidden;text-overflow:ellipsis}',
        C + ' .fk-ccur .fk-ico{width:20px;height:20px}',
        C + ' .fk-cdots{width:40px;padding:0;justify-content:center}',
        C + ' .fk-cdotw{display:none}',
        '@media (forced-colors:active){' + C + ' li+li::before{background:CanvasText;forced-color-adjust:none}' +
        C + ' [aria-current]{text-decoration:underline}}',
        '@media (pointer:coarse){' + C + ' a,' + C + ' button,' + C + ' span.fk-ccur{min-height:44px;line-height:44px}' +
        C + ' .fk-cdots{width:44px}}',
        // a phone: one line, the middle collapsed; ancestors give way before the current folder
        '@media (max-width:799px){',
        'html.fk #path{margin:4px 0;font-size:16px}',
        C + ' ol{flex-wrap:nowrap}',
        C + ' .fk-cmid{display:none}',
        C + ' .fk-cdotw{display:flex;flex:none}',
        C + ' li{flex:0 1 auto}',
        C + ' li.fk-clast{flex:0 0 auto;max-width:65%}',
        C + ' a,' + C + ' button{padding:0 6px}',
        C + ' button.fk-ccur{padding-right:2px}',
        C + ' .fk-ccur{font-size:1.125em}',
        C + ' li+li::before{width:14px;margin:0}}'
    ].join(''));
})();
