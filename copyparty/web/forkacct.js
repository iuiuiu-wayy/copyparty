"use strict";

// fork-only, drive-ux: the account menu on the top bar's avatar (forkshell.js puts the
// avatar there); see FORK.md. Change password, My share links, My grants, Control panel,
// Log out, each at the --rp-loc prefix (SR). Not there for a guest or with ui_noacci (the
// shell leaves the avatar out); Control panel is left out with ui_nocpla, as upstream hides
// its own control-panel link (#goh). The avatar is outside upstream's #acc_info, which
// apply_perms rebuilds on every folder load, so nothing needs re-adding after a folder change.
// Replaces the fork's old control-panel link (acclink.js).

(function () {
    var ui = window.forkui,
        av = document.querySelector('.fk-top .fk-avatar');
    if (!ui || !ui.ok || !ui.menu || !av || !window.acct || acct == '*')
        return;

    var nocpla = !fullui && (window.ui_nocpla || /[?&]nocpla\b/.exec(sloc0)),
        grants = true;

    // grants may be off on this server: the recipients list answers 400 then (as the Share
    // dialog's Add people finds out). Shown until that answer comes
    var xhr = new XMLHttpRequest();
    xhr.open('GET', SR + '/?grants=rcpts', true);
    xhr.onload = xhr.onerror = function () {
        grants = this.status == 200;
    };
    xhr.send();

    // what upstream's logout button (#flogout in #acc_info) posts: act=logout to this page
    function logout() {
        var f = ui.el('form', { method: 'post', enctype: 'multipart/form-data', hidden: true },
            ui.el('input', { type: 'hidden', name: 'act', value: 'logout' }));
        document.body.appendChild(f);
        f.submit();
    }

    ui.menu({
        trigger: av, label: 'Account', title: acct, items: function () {
            return [
                // ctlpanel.js focuses its change-password form on #chpw
                { label: 'Change password', icon: 'key', href: SR + '/?h#chpw' },
                window.have_shr ? { label: 'My share links', icon: 'link', href: SR + '/?shares' } : null,
                grants ? { label: 'My grants', icon: 'people', href: SR + '/?grants' } : null,
                nocpla ? null : { label: 'Control panel', icon: 'tune', href: SR + '/?h' },
                { sep: true },
                { label: 'Log out', icon: 'logout', select: logout }
            ].filter(function (x) { return x; });
        }
    });
})();
