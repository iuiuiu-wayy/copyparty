"use strict";

// fork-only: a "control-panel" link next to logout in the file browser's account box
// (#acc_info); see FORK.md. Loaded by fork-browser.js, so upstream's browser.js stays as it is.
// upstream's apply_perms rebuilds the box on every folder load, so the link is re-added after
// each call. Hidden like upstream's own control-panel link (#goh) with ui_nocpla / ?nocpla.

(function () {
    if (!window.L || !window.apply_perms)
        return;

    if (!fullui && (window.ui_nocpla || /[?&]nocpla\b/.exec(sloc0)))
        return;

    // on a phone upstream's #srv_info (host name, free space) is drawn over the left of the
    // account box; lift the box (it has its own background) so the link stays readable
    document.head.appendChild(mknod('style', '', '#facp{margin-right:.6em}#acc_info{z-index:1}'));

    function add() {
        var lo = ebi('flogout');
        if (acct == '*' || !lo || ebi('facp'))
            return;

        var a = mknod('a', 'facp');
        a.href = SR + '/?h';
        a.textContent = L.goh;
        lo.parentNode.insertBefore(a, lo);
    }

    var orig = apply_perms;
    window.apply_perms = function () {
        var ret = orig.apply(this, arguments);
        add();
        return ret;
    };
    add();
})();
