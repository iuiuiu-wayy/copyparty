"use strict";

// fork-only: trims the control panel's "other stuff" section, hides the π link, adds a
// change-password form and an intro line on the share links page; see FORK.md.
// Loaded with --js-other /.cpr/w/ctlpanel.js, so it runs on every page except the file browser,
// after the page's own scripts (splash.js has already set the translated labels, so ours stick).
// The file browser gets --js-other too when --js-browser is empty; there it only hides the π.
// Plain DOM only: some of those pages (msg.html) don't load util.js. Labels are English only.

(function () {
    function ebi(id) {
        return document.getElementById(id);
    }

    var repl = ebi('repl');
    if (repl)
        repl.style.display = 'none';

    var head = ebi('cc'),             // the "other stuff:" heading
        list = head && head.nextElementSibling;

    if (head)
        chpw_form();

    // upstream changes your password through the login box: type the new one into #lp, then
    // click the small #x link; Enter or "login" there logs you out instead. This puts a form
    // of its own under "welcome back" and hides #x. #x is only on the page when chpw is on,
    // someone is logged in and it's not a share, so its presence is what shows the form.
    // The post is what #x sends (act=chpw, uname with --usernames, pw) to #lf's action;
    // handle_chpw answers with the msg page. It asks for no old password, as upstream.
    function chpw_form() {
        var x = ebi('x'),
            lf = ebi('lf'),
            un = ebi('un'),
            hi = un && un.parentNode;   // the "welcome back, <name>" paragraph

        if (!x || !lf || !hi || !hi.parentNode)
            return;

        x.style.display = 'none';

        function mk(tag, attrs) {
            var el = document.createElement(tag);
            for (var k in attrs)
                if (attrs.hasOwnProperty(k))
                    el.setAttribute(k, attrs[k]);
            return el;
        }

        var h1 = mk('h1', { id: 'fork_cph' });
        h1.textContent = 'change password:';

        var form = mk('form', {
            id: 'fork_cpf',
            method: 'post',
            enctype: 'multipart/form-data',
            action: lf.getAttribute('action')
        });
        form.appendChild(mk('input', { type: 'hidden', name: 'act', value: 'chpw' }));
        if (ebi('lu'))
            form.appendChild(mk('input', { type: 'hidden', name: 'uname', value: un.textContent }));

        var pw1 = mk('input', {
            type: 'password', name: 'pw', autocomplete: 'new-password',
            placeholder: ' new password', 'aria-label': 'new password', size: 20
        });
        // no name: the repeat stays in the browser
        var pw2 = mk('input', {
            type: 'password', autocomplete: 'new-password',
            placeholder: ' repeat new password', 'aria-label': 'repeat new password', size: 20
        });
        var msg = mk('div', { id: 'fork_cpm' });

        form.appendChild(pw1);
        form.appendChild(document.createTextNode(' '));
        form.appendChild(pw2);
        form.appendChild(document.createTextNode(' '));
        form.appendChild(mk('input', { type: 'submit', value: 'change password' }));
        form.appendChild(msg);

        // the server reads at most 64 bytes of pw; count utf-8 bytes, not characters
        function nbytes(s) {
            return unescape(encodeURIComponent(s)).length;
        }

        form.onsubmit = function (e) {
            var a = pw1.value,
                b = pw2.value,
                err = '',
                bad = pw1;

            if (!a || !b) {
                err = 'type the new password in both boxes';
                bad = a ? pw2 : pw1;
            }
            else if (a !== b) {
                err = 'the two passwords are not the same';
                bad = pw2;
            }
            else if (nbytes(a) > 64)
                err = 'too long: at most 64 bytes; letters with accents or symbols count as 2-4';

            msg.textContent = err;
            if (!err)
                return true;

            if (e && e.preventDefault)
                e.preventDefault();
            bad.focus();
            return false;
        };

        var div = document.createElement('div');
        div.appendChild(form);
        hi.parentNode.insertBefore(div, hi.nextSibling);
        hi.parentNode.insertBefore(h1, div);
    }

    // the share links page (?shares): say who a share link is for, on a line of its own
    // above upstream's notes (the first <span> in #wrap, "axs = perms ..."). A <p>, since
    // shares.css draws every #wrap>span as an inline underlined note
    var wrap = ebi('wrap');
    if (document.documentElement.id == 'ht_shr' && wrap) {
        var css = document.createElement('style');
        css.textContent = '#fork_shrintro{margin:.5em 0 0 0;line-height:1.5em}';
        document.head.appendChild(css);

        var intro = document.createElement('p');
        intro.id = 'fork_shrintro';
        intro.textContent = 'Links anyone can open without an account. Revoke one to stop it working.';
        wrap.insertBefore(intro, wrap.querySelector('#wrap>span') || ebi('tab'));
    }

    if (!list || !/\bagr\b/.test(list.className))
        return;

    head.textContent = 'more:';

    var recent = ebi('af');
    if (recent)
        recent.textContent = 'recently added files';

    // the same words as the file browser's "link" and "people" buttons (FORK.md)
    var shares = ebi('y'),
        grants = ebi('yg');
    if (shares)
        shares.textContent = 'your share links';
    if (grants)
        grants.textContent = 'your grants';

    // where each entry goes; any other entry (#wb, #ag, whatever upstream adds) sits between
    // these and logout, in upstream's order. Reset client settings is dropped; /?reset still works
    var ORDER = { y: 0, yg: 1, af: 2 },
        OTHER = 5,
        LOGOUT = 9;

    function slot(el) {
        if (ORDER.hasOwnProperty(el.id))
            return ORDER[el.id];
        // the logout button sits in its own <form>, which is what moves
        return el.querySelector('#lo') ? LOGOUT : OTHER;
    }

    // the entries are the element children; the <br /> between them are rebuilt below
    var ents = [];
    for (var a = 0; a < list.children.length; a++) {
        var el = list.children[a];
        if (el.tagName != 'BR' && el.id != 'k')
            ents.push({ el: el, slot: slot(el), i: a });
    }
    ents.sort(function (x, y) { return x.slot - y.slot || x.i - y.i; });

    while (list.firstChild)
        list.removeChild(list.firstChild);

    // a <form> is a block, so it needs no <br /> after it
    for (var b = 0; b < ents.length; b++) {
        list.appendChild(ents[b].el);
        if (ents[b].el.tagName != 'FORM')
            list.appendChild(document.createElement('br'));
    }
})();
