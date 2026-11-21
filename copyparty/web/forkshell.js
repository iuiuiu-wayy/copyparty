"use strict";

// fork-only, drive-ux: the Drive-style frame of the file browser; see FORK.md.
// A top bar (server name, search, More tools, avatar) and a left nav (New, My files,
// Shared with me, Recent uploads, with upstream's folder tree under the active entry),
// which is a drawer behind a menu button on a phone. Upstream's toolbar (#ops) is hidden;
// every tab of it opens from More tools, listed only when upstream shows the tab.
// A guest on a share link (and so anyone Outside) gets the top bar without nav or avatar,
// and this script makes no request for them (Outside passes only share links and /.cpr/).
// Built with forkui.js, which fork-browser.js loads first.

(function () {
    var ui = window.forkui;
    if (!ui || !ui.ok || !window.L || !window.treectl || !window.apply_perms || !window.goto ||
        !ebi('ops') || !ebi('tree') || !ebi('path'))
        return;

    var el = ui.el,
        de = document.documentElement,
        guest = acct == '*' || !!in_shr ||
            !!(window.have_shr && get_evpath().indexOf(SR + have_shr) === 0),
        home = SR + '/home/' + encodeURIComponent(acct) + '/',
        hasHome = !guest,
        view = '',      // '' = a folder, or the view shown: 'shared' / 'recent'
        nombar = !fullui && (window.ui_nombar || /[?&]nombar\b/.exec(sloc0));

    // light only for now (spec, Look): leave a dark theme for upstream's flat light
    if (!light && window.settheme)
        settheme.go(3);

    // upstream's tree is shown by our CSS inside the nav instead of its own panel, so
    // treectl must not position it; entree once to load the tree, then detree
    treectl.entree({}, true);
    treectl.detree({}, true);

    de.classList.add('fk');

    // upstream's page starts zoomed out to 0.8 on a phone, which shrinks every touch target;
    // ours are sized for scale 1. viewport-fit=cover lets env(safe-area-inset-*) work
    var vp = QS('meta[name=viewport]');
    if (vp)
        vp.setAttribute('content', 'width=device-width, initial-scale=1, viewport-fit=cover');
    de.classList.toggle('fk-guest', guest);

    var TOOLS = [
        ['mkdir', 'New folder'],
        ['new_md', 'New file'],
        ['up2k', 'Upload settings'],
        ['bup', 'Basic uploader'],
        ['unpost', 'Unpost'],
        ['search', 'Search'],
        ['msg', 'Message'],
        ['player', 'Audio player'],
        ['cfg', 'Settings']
    ];

    // upstream's tabs that are showing here, in our order; a tab upstream adds later is
    // listed after them under its own name
    function tools() {
        var ret = [],
            seen = {},
            tabs = QSA('#ops>a[data-dest]');

        // upstream's ui_nombar hides the whole toolbar, so More tools stays empty
        if (nombar)
            return ret;

        function shown(a) {
            return a && a.getAttribute('data-dest') && a.style.display != 'none';
        }
        for (var i = 0; i < TOOLS.length; i++) {
            var a = QS('#ops>a[data-dest="' + TOOLS[i][0] + '"]');
            seen[TOOLS[i][0]] = 1;
            if (shown(a))
                ret.push([TOOLS[i][0], TOOLS[i][1]]);
        }
        for (var i = 0; i < tabs.length; i++) {
            var d = tabs[i].getAttribute('data-dest');
            if (!seen[d] && shown(tabs[i]))
                ret.push([d, d]);
        }
        return ret;
    }

    function label(dest) {
        for (var i = 0; i < TOOLS.length; i++)
            if (TOOLS[i][0] == dest)
                return TOOLS[i][1];
        return dest;
    }

    // open one of upstream's tabs, as its toolbar button would, and bring it into view
    function opentool(dest) {
        showview('');
        if (!QS('#op_' + dest + '.act'))
            QS('#ops>a[data-dest="' + dest + '"]').click();
        var p = ebi('op_' + dest);
        if (p && p.classList.contains('act')) {
            window.scrollTo(0, 0);
            var f = QS('.opview.act input:not([type=hidden]):not([type=checkbox])');
            if (f && !TOUCH)
                f.focus({ preventScroll: true });
            else
                closebtn.focus({ preventScroll: true });
        }
    }

    // for the other drive-ux scripts: open one of upstream's tabs (forknew.js: Details)
    ui.opentool = opentool;

    // ---- top bar

    var menubtn = guest ? null : el('button', {
        type: 'button', class: 'fk-ibtn fk-menubtn', 'aria-label': 'Main menu',
        'aria-expanded': 'false', 'aria-controls': 'fk-drawer'
    }, ui.icon('menu'));

    var brand = el(guest ? 'span' : 'a', { class: 'fk-brand', href: guest ? null : home },
        [ui.icon('cloud'), el('span', { text: window.s_name || 'copyparty' })]);

    var q = el('input', {
        type: 'search', class: 'fk-q', 'aria-label': 'Search', placeholder: 'Search in this folder',
        autocomplete: 'off', enterkeyhint: 'search'
    });
    var search = el('form', {
        role: 'search', class: 'fk-search', on: {
            submit: function (e) {
                e.preventDefault();
                (ui.shell.onsearch || runsearch)(q.value);
            }
        }
    }, [ui.icon('search'), q]);

    // without forksearch.js (which sets ui.shell.onsearch) the box fills upstream's name
    // search and opens its panel
    function runsearch(txt) {
        if (!QS('#op_search.act'))
            opentool('search');
        var f = ebi('srch_namev');
        if (!f)
            return;
        f.value = txt;
        f.dispatchEvent(new Event('input', { bubbles: true }));
    }

    var morebtn = el('button', { type: 'button', class: 'fk-ibtn', 'aria-label': 'More tools' }, ui.icon('more'));

    // the avatar: the account holder's initial; forkacct.js makes it open the account menu.
    // Not there for a guest, nor with upstream's ui_noacci, which hides its account box
    var noacci = !fullui && (window.ui_noacci || /[?&]noacci\b/.exec(sloc0)),
        initial = (acct || '?').charAt(0).toUpperCase();

    var avatar = guest || noacci ? null : el('button', {
        type: 'button', class: 'fk-avatar', 'aria-label': 'Account: ' + acct, title: acct
    }, el('span', { 'aria-hidden': 'true', text: initial }));

    var top = el('header', { class: 'fk-top' }, [menubtn, brand, search, morebtn, avatar]);
    document.body.insertBefore(top, document.body.firstChild);

    // for the scripts after this one: the search box (forksearch.js) and opening a tool
    ui.shell = { search: search, q: q, opentool: opentool };

    ui.menu({
        trigger: morebtn, label: 'More tools', title: 'More tools', items: function () {
            return tools().map(function (t) {
                return { label: t[1], select: function () { opentool(t[0]); } };
            });
        }
    });

    // a close button over the open tab, since upstream's own (#opa_x) is in the hidden toolbar
    var closebtn = el('button', {
        type: 'button', class: 'fk-opclose', on: {
            click: function () {
                ebi('opa_x').click();
                morebtn.focus({ preventScroll: true });
            }
        }
    }, [ui.icon('close'), el('span', { class: 'fk-opname' })]);
    var opbar = el('div', { class: 'fk-opbar' }, closebtn);
    var first = QS('.opview');
    first.parentNode.insertBefore(opbar, first);

    function syncop() {
        var a = QS('#ops>a.act'),
            name = a ? label(a.getAttribute('data-dest')) : '';
        closebtn.setAttribute('aria-label', 'Close ' + name);
        closebtn.lastChild.textContent = name;
        search.style.display = tools().some(function (t) { return t[0] == 'search'; }) ? '' : 'none';
    }

    var ogoto = window.goto;
    window.goto = function () {
        var ret = ogoto.apply(this, arguments);
        syncop();
        return ret;
    };

    // ---- left nav

    if (guest) {
        ui.style(css());
        syncop();
        after(window, 'apply_perms', syncop);
        return;
    }

    var newbtn = el('button', { type: 'button', class: 'fk-new' }, [ui.icon('plus'), el('span', { text: 'New' })]);

    function entry(id, text, ico, href) {
        var a = el('a', { class: 'fk-ent', href: href, 'data-view': id }, [ui.icon(ico), el('span', { text: text })]);
        // a <div>, not an <li>: upstream's reload_tree walks up from the current folder
        // with closest('li'), and an <li> around the tree would never end that walk
        return el('div', { class: 'fk-entw', role: 'listitem' }, a);
    }

    // Shared with me and Recent uploads are views (forkviews.js); without script their links
    // go to the control panel's folder list and upstream's recent uploads
    var ents = {
        mine: entry('mine', 'My files', 'home', home),
        shared: entry('shared', 'Shared with me', 'people', SR + '/?h'),
        recent: entry('recent', 'Recent uploads', 'clock', SR + '/?ru')
    };
    var navel = el('nav', { class: 'fk-nav', 'aria-label': 'Main' }, [
        el('div', { class: 'fk-newwrap' }, newbtn),
        el('div', { role: 'list' }, [ents.mine, ents.shared, ents.recent])
    ]);

    // + New: its menu is forknew.js's
    ui.newbtn = newbtn;

    var side = el('div', { class: 'fk-side' });
    document.body.insertBefore(side, top.nextSibling);

    var drawer = ui.dialog({
        label: 'Main menu', 'class': 'fk-drawer', back: true,
        kids: el('div', { class: 'fk-drawer-h' }, [
            el('button', { type: 'button', class: 'fk-ibtn', 'aria-label': 'Close menu', autofocus: true }, ui.icon('close')),
            el('span', { class: 'fk-brand' }, [ui.icon('cloud'), el('span', { text: window.s_name || 'copyparty' })])
        ]),
        onopen: function () { menubtn.setAttribute('aria-expanded', 'true'); },
        onclose: function () { menubtn.setAttribute('aria-expanded', 'false'); }
    });
    drawer.el.id = 'fk-drawer';
    QS('.fk-drawer-h button').addEventListener('click', function () { drawer.close(); });
    menubtn.addEventListener('click', function () { drawer.open(menubtn); });

    // one nav, in the sidebar on a desktop and in the drawer on a phone
    function placenav() {
        if (ui.narrow.matches)
            drawer.el.appendChild(navel);
        else {
            drawer.close();
            side.appendChild(navel);
        }
    }
    placenav();
    if (ui.narrow.addEventListener)
        ui.narrow.addEventListener('change', placenav);

    // ---- the views that aren't folders: a section in the list's place, its h2 the view's
    // name; forkviews.js fills them through forkui.shell.views[id](section). Without it a
    // view keeps the plain link to upstream's page

    var VIEWS = {
        shared: ['Shared with me', 'The control panel lists every folder you can open.', SR + '/?h'],
        recent: ['Recent uploads', 'See the recent uploads page.', SR + '/?ru']
    };
    var phel = el('section', { class: 'fk-ph', 'aria-labelledby': 'fk-ph-h' });
    ebi('path').parentNode.insertBefore(phel, ebi('path'));

    // added to ui.shell (set above with the search box)
    ui.shell.views = {};
    // the nav entry of a view ('mine', 'shared', 'recent'), to hide or show it
    ui.shell.entry = function (id) { return ents[id] && ents[id].firstChild; };
    // the view showing ('' = a folder)
    ui.shell.view = function () { return view; };
    // the account's home folder (My files), SR-prefixed, URL-quoted
    ui.shell.home = home;

    function showview(v) {
        if (guest)
            return;
        view = v;
        de.classList.toggle('fk-inph', !!v);
        phel.textContent = '';
        phel.removeAttribute('aria-busy');
        if (v) {
            var p = VIEWS[v];
            phel.appendChild(el('h2', { id: 'fk-ph-h', text: p[0], tabindex: '-1' }));
            if (ui.shell.views[v])
                ui.shell.views[v](phel);
            else
                phel.appendChild(el('p', {}, el('a', { href: p[2], text: p[1] })));
        }
        syncnav();
    }

    function plain(e) {
        return !(e.button || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey);
    }

    navel.addEventListener('click', function (e) {
        var a = e.target.closest && e.target.closest('a.fk-ent');
        if (!a || !plain(e))
            return;
        e.preventDefault();
        var v = a.getAttribute('data-view');
        if (v == 'mine') {
            showview('');
            treectl.goto(home, true);
            return;
        }
        if (QS('.opview.act'))
            ebi('opa_x').click();
        showview(v);
        var h = ebi('fk-ph-h');
        if (h)
            h.focus({ preventScroll: true });
    });

    // ---- the active entry, with upstream's tree under it starting at that entry's folder

    function active() {
        if (view)
            return view;
        var p = get_evpath();
        if (hasHome && p.indexOf(home) === 0)
            return 'mine';
        return 'shared';
    }

    function syncnav() {
        var act = active();
        for (var k in ents) {
            var a = ents[k].firstChild;
            if (k == act)
                a.setAttribute('aria-current', 'page');
            else
                a.removeAttribute('aria-current');
        }
        ents.mine.style.display = hasHome ? '' : 'none';
        var tree = ebi('tree');
        if (view || act == 'recent') {
            tree.classList.add('fk-tnone');
            return;
        }
        tree.classList.remove('fk-tnone');
        if (tree.parentNode != ents[act])
            ents[act].appendChild(tree);
        trimtree(act == 'mine' ? home : SR + '/' + (get_evpath().slice(SR.length + 1).split('/')[0] || '') + '/');
    }

    function dec(p) {
        p = (p || '').split('?')[0];
        try {
            return decodeURIComponent(p);
        }
        catch (e) {
            return p;
        }
    }

    // show the subtree of the folder at `root` as if it were the whole tree: its ancestors'
    // own links and every other branch are hidden; upstream's markup is
    // #treeul > li > a(+/-) + a[href] + ul > li ...
    function trimtree(root) {
        var lis = QSA('#treeul li');
        for (var i = 0; i < lis.length; i++)
            lis[i].classList.remove('fk-tpath', 'fk-tout');

        var want = dec(root),
            links = QSA('#treeul li>a+a'),
            li = null;
        for (var i = 0; i < links.length; i++)
            if (dec(links[i].getAttribute('href')) == want) {
                li = links[i].parentNode;
                break;
            }

        ebi('tree').classList.toggle('fk-tnone', !li);
        while (li && li.tagName == 'LI') {
            li.classList.add('fk-tpath');
            var sib = li.parentNode.children;
            for (var i = 0; i < sib.length; i++)
                if (sib[i] != li)
                    sib[i].classList.add('fk-tout');
            li = li.parentNode.parentNode;
        }
    }

    function after(obj, name, fn) {
        var orig = obj[name];
        obj[name] = function () {
            var ret = orig.apply(this, arguments);
            fn();
            return ret;
        };
    }

    // a folder listing ends the view; every listing and tree update re-syncs
    after(treectl, 'gentab', function () {
        if (view)
            showview('');
    });
    after(treectl, 'rendertree', syncnav);
    after(window, 'reload_browser', syncnav);
    after(window, 'apply_perms', syncop);

    // My files only for an account with a home folder (/home/<name>/, as the control panel
    // lands); and / itself lands there when / is a folder this account can open
    var xhr = new XMLHttpRequest();
    xhr.open('GET', SR + '/home/?ls', true);
    xhr.onload = function () {
        if (this.status != 200)
            return;
        var dirs = [];
        try {
            dirs = JSON.parse(this.responseText).dirs || [];
        }
        catch (e) {
            return;
        }
        hasHome = dirs.some(function (d) {
            return d.href.split('?')[0].replace(/\/$/, '') == encodeURIComponent(acct);
        });
        if (hasHome && get_evpath() == SR + '/' && !location.search)
            return location.replace(home);
        syncnav();
    };
    xhr.send();

    ui.style(css());
    syncop();
    syncnav();

    function css() {
        return [
            // the page: our bar on top, the nav on the left, upstream's content beside it
            'html.fk,html.fk body{background:var(--fk-bg)}',
            'html.fk body{font-family:var(--fk-font)}',
            'html.fk #ops,html.fk #acc_info,html.fk #srv_info,html.fk #entree,html.fk #treeh,',
            'html.fk #docul,html.fk #treepar{display:none!important}',
            'html.fk #op_cfg div:has(>#themes){display:none}',
            'html.fk #op_cfg h3:has(+div>#themes){display:none}',
            '.fk-top{position:sticky;top:0;z-index:20;display:flex;align-items:center;gap:8px;',
            'height:var(--fk-top);padding:0 8px 0 max(8px,env(safe-area-inset-left));box-sizing:border-box;',
            'background:var(--fk-bg);color:var(--fk-text);font:16px/1.4 var(--fk-font)}',
            '.fk-brand{display:flex;align-items:center;gap:8px;min-width:0;padding:0 8px;height:var(--fk-tap);',
            'color:var(--fk-text);text-decoration:none;font-size:20px;white-space:nowrap;border-radius:var(--fk-r)}',
            '.fk-brand .fk-ico{width:32px;height:32px;color:var(--fk-accent)}',
            '.fk-brand span{overflow:hidden;text-overflow:ellipsis}',
            'a.fk-brand:focus-visible,.fk-avatar:focus-visible,.fk-ent:focus-visible,.fk-new:focus-visible,',
            '.fk-opclose:focus-visible,.fk-ph a:focus-visible{outline:2px solid var(--fk-focus);outline-offset:2px}',
            '.fk-search{flex:1 1 auto;display:flex;align-items:center;gap:8px;max-width:720px;min-width:0;',
            'height:48px;margin:0 auto 0 calc(var(--fk-nav) - 230px);padding:0 16px;box-sizing:border-box;',
            'border-radius:24px;background:#e9eef6;color:var(--fk-muted)}',
            '.fk-search:focus-within{background:var(--fk-surface);box-shadow:var(--fk-shadow)}',
            '.fk-q{flex:1;min-width:0;border:0;outline:0;background:transparent;color:var(--fk-text);font:16px var(--fk-font)}',
            '.fk-avatar{display:inline-flex;align-items:center;justify-content:center;flex:none;width:var(--fk-tap);',
            'height:var(--fk-tap);padding:0;margin:0;border:0;border-radius:50%;background:transparent;cursor:pointer}',
            '.fk-avatar:hover{background:var(--fk-hover)}',
            '.fk-avatar span{display:inline-flex;align-items:center;justify-content:center;width:32px;height:32px;',
            'border-radius:50%;background:#0b8043;color:#fff;font:500 16px var(--fk-font)}',
            '.fk-menubtn{display:none}',

            // the nav (sidebar on a desktop)
            '.fk-side{position:fixed;z-index:15;left:0;top:var(--fk-top);bottom:0;width:var(--fk-nav);overflow:auto;',
            'padding-left:env(safe-area-inset-left);box-sizing:border-box;background:var(--fk-bg)}',
            'html.fk:not(.fk-guest) body{padding-left:var(--fk-nav)}',
            'html.fk #wrap{margin-left:1.5em!important}',
            '.fk-nav{padding:8px 12px 16px 8px;font:14px/1.4 var(--fk-font);color:var(--fk-text)}',
            '.fk-nav ul{list-style:none;margin:0;padding:0}',
            '.fk-newwrap{padding:4px 0 12px 8px}',
            '.fk-new{display:inline-flex;align-items:center;gap:12px;height:56px;padding:0 20px 0 16px;',
            'border:0;border-radius:16px;background:var(--fk-new);color:var(--fk-text);box-shadow:var(--fk-shadow);',
            'font:500 14px var(--fk-font);cursor:pointer}',
            '.fk-new:hover{background:#edf2fc}',
            '.fk-ent{display:flex;align-items:center;gap:12px;min-height:var(--fk-tap);padding:0 16px 0 12px;',
            'border-radius:22px;color:var(--fk-text);text-decoration:none}',
            '.fk-ent:hover{background:var(--fk-hover)}',
            '.fk-ent[aria-current]{background:var(--fk-active);font-weight:600}',
            '.fk-ent .fk-ico{color:var(--fk-muted)}',

            // upstream's tree, under the active entry
            'html.fk #tree{display:block!important;position:static!important;width:auto!important;',
            'height:auto!important;top:auto!important;bottom:auto!important;margin:2px 0 6px;padding:0;',
            'overflow:visible;background:transparent;border:0;box-shadow:none;font-size:14px}',
            'html.fk-guest #tree,html.fk #tree.fk-tnone{display:none!important}',
            'html.fk .fk-nav #treeul{position:static;left:auto;width:auto;margin:0;padding:0 0 0 20px;border:0}',
            'html.fk .fk-nav #tree ul{border:0;margin:0;padding:0 0 0 14px}',
            'html.fk .fk-nav #tree li{margin:0;padding:0;border:0;list-style:none;white-space:nowrap}',
            'html.fk .fk-nav #treeul li.fk-tout{display:none}',
            'html.fk .fk-nav #treeul li.fk-tpath>a{display:none}',
            'html.fk .fk-nav #treeul li.fk-tpath>ul{padding-left:0}',
            'html.fk .fk-nav #tree ul a{display:inline-flex;align-items:center;min-height:36px;box-sizing:border-box;',
            'vertical-align:middle;padding:0 8px;border-radius:18px;color:var(--fk-text);background:transparent;',
            'text-decoration:none;width:auto;line-height:1.2}',
            'html.fk .fk-nav #tree ul a:first-child{justify-content:center;width:28px;padding:0;color:var(--fk-muted);',
            'font:16px/1 var(--fk-font)}',
            'html.fk .fk-nav #tree ul a+a{max-width:calc(100% - 32px);overflow:hidden;text-overflow:ellipsis}',
            'html.fk .fk-nav #tree ul a:hover{background:var(--fk-hover)}',
            'html.fk .fk-nav #tree ul a.hl{background:var(--fk-active);color:var(--fk-text);font-weight:600}',
            '@media (pointer:coarse){html.fk .fk-nav #tree ul a{min-height:var(--fk-tap)}}',

            // upstream's tabs, opened from More tools
            '.fk-opbar{display:none;padding:8px 16px 0}',
            'html.op_open .fk-opbar{display:block}',
            '.fk-opclose{display:inline-flex;align-items:center;gap:8px;min-height:var(--fk-tap);padding:0 16px 0 10px;',
            'border:1px solid var(--fk-line);border-radius:22px;background:var(--fk-surface);color:var(--fk-text);',
            'font:500 14px var(--fk-font);cursor:pointer}',
            'html.fk .opview{scroll-margin-top:var(--fk-top)}',

            // the views that aren't folders
            '.fk-ph{display:none;margin:24px 1.5em;max-width:40em;color:var(--fk-text);font:16px/1.5 var(--fk-font)}',
            'html.fk-inph .fk-ph{display:block}',
            'html.fk-inph #path,html.fk-inph #wrap,html.fk-inph .opview,html.fk-inph .fk-opbar{display:none!important}',
            '.fk-ph h2{margin:0 0 12px;font:400 22px/1.3 var(--fk-font);outline:0}',
            '.fk-ph a{color:var(--fk-accent)}',

            // the phone drawer
            '.fk-drawer{margin:0;inset:0 auto 0 0;width:min(20em,85dvw);max-width:none;height:100dvh;max-height:none;',
            'border-radius:0 var(--fk-r) var(--fk-r) 0;background:var(--fk-bg);overflow:auto;',
            'padding:env(safe-area-inset-top) 0 env(safe-area-inset-bottom) env(safe-area-inset-left)}',
            '.fk-drawer-h{display:flex;align-items:center;gap:4px;height:var(--fk-top);padding:0 8px}',
            '@media (prefers-reduced-motion:no-preference){',
            '.fk-drawer{transition:translate .2s,display .2s allow-discrete,overlay .2s allow-discrete;translate:-100% 0}',
            '.fk-drawer[open]{translate:0 0}',
            '@starting-style{.fk-drawer[open]{translate:-100% 0}}}',

            '@media (max-width:799px){',
            'html.fk:not(.fk-guest) body{padding-left:0}',
            '.fk-side{display:none}',
            '.fk-menubtn{display:inline-flex}',
            '.fk-top{gap:4px;height:56px;--fk-top:56px}',
            '.fk-top>.fk-brand{display:none}',
            'html.fk-guest .fk-top>.fk-brand{display:flex;font-size:18px;flex:1}',
            '.fk-search{margin:0;height:44px;padding:0 12px}',
            'html.fk #wrap{margin-left:.5em!important;margin-right:.5em!important}',
            // a list wider than the phone scrolls on its own, not the page: a wider page
            // grows the layout viewport and puts fixed bars and sheets off screen (ticket 03
            // redoes the list; upstream's sticky header is lost here until then)
            'html.fk #wrap{overflow-x:auto}',
            '.fk-ph{margin:16px}}'
        ].join('');
    }
})();
