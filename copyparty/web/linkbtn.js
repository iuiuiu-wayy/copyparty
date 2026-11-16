"use strict";

// fork-only: says who upstream's share link is for; see FORK.md.
// Loaded by fork-browser.js (--js-browser /.cpr/w/fork-browser.js), so upstream's
// browser.js stays as it is. Relabels the "share" button to "link", replaces its two
// tooltips, and puts a "who this is for" line at the top of the share-link dialog.
// English only, like the fork's other labels.

(function () {
    var bshr = ebi('fshr');
    if (!bshr || !window.fileman || !window.L || acct == '*')
        return;

    var WHO = 'Anyone with this link can open it, no account needed.';

    bshr.innerHTML = '🔗<span>link</span>';

    // upstream's render() re-sets the tooltip from these on every selection change
    L.fs_sc = 'a link anyone can open, no account needed';
    L.fs_ss = 'a link to the selected files; anyone with it can open them';
    bshr.setAttribute('tt', msel.getsel().length ? L.fs_ss : L.fs_sc);

    // share() rebuilds #shui's whole content on every open, so add the line after each
    // call; it returns early (a toast, no dialog) for a selection it refuses
    function who() {
        var shui = ebi('shui'),
            box = shui && shui.firstElementChild;

        if (!box || !ebi('sh_apply') || ebi('fork_shwho'))
            return;

        var p = mknod('p', 'fork_shwho');
        p.className = 'fork_who';
        p.textContent = WHO;
        box.insertBefore(p, box.firstChild);
    }

    var share = fileman.share;
    fileman.share = function () {
        var ret = share.apply(this, arguments);
        who();
        return ret;
    };
    // the button's onclick holds upstream's function, not the property; the hotkey
    // calls fileman.share() and so gets the wrap already
    bshr.onclick = fileman.share;
})();
