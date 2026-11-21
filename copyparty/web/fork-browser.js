"use strict";

// fork-only: loads the fork's file-browser scripts; see FORK.md.
// Loaded with --js-browser /.cpr/w/fork-browser.js, since --js-browser takes one url.
// Each script's url is this one's with the file name swapped, so the --rp-loc prefix and
// copyparty's cache-busting query string carry over; the page's csp nonce is copied too.
// Scripts run in list order; one failing to load or throwing doesn't stop the rest.

(function () {
    var SCRIPTS = [
        'forkui.js',
        'forkshell.js',
        'forkacct.js',
        'grantbtn.js',
        'linkbtn.js',
        'rowsel.js',
        'dragmove.js',
        'forklist.js',
    ];

    var me = document.currentScript;
    if (!me || !me.src)
        return;

    var m = /^([^?#]*\/)[^\/?#]*(\?[^#]*)?/.exec(me.src),
        dir = m[1],
        qs = m[2] || '',
        i = 0;

    function next() {
        if (i >= SCRIPTS.length)
            return;

        var s = document.createElement('script');
        s.nonce = me.nonce;
        s.src = dir + SCRIPTS[i++] + qs;
        s.onload = s.onerror = next;
        document.body.appendChild(s);
    }
    next();
})();
