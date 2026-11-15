"use strict";

// fork-only: trims the control panel's "other stuff" section and hides the π link; see FORK.md.
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

    if (!list || !/\bagr\b/.test(list.className))
        return;

    head.textContent = 'more:';

    var recent = ebi('af');
    if (recent)
        recent.textContent = 'recently added files';

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
