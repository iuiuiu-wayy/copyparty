"use strict";

// fork-only: a checkbox on every row of the file list, and a select-all box in the header;
// see FORK.md. Loaded by fork-browser.js, so upstream's browser.js stays as it is.
// The `sel` class on each `#files tbody tr` stays the one source of truth (upstream's msel
// reads it); the boxes only show it, and clicking one goes through msel like a row click.
// The box is appended to the lead cell, not prepended: upstream's right-click menu reads the
// lead cell's first node (play / text links). It is placed over the cell's left padding,
// so it still shows first, as tall as the row (the tap area), without making rows taller.

(function () {
    if (!window.msel || !ebi('files'))
        return;

    var css = mknod('style');
    css.textContent = [
        '#files tbody td:first-child { position: relative; padding-left: 2.2em; }',
        '#files tbody .rsel { position: absolute; left: 0; top: 0; bottom: 0; width: 2em; display: flex; align-items: center; justify-content: center; cursor: pointer; }',
        '#files .rsel input { margin: 0; cursor: pointer; }',
        '#files th .rsel { display: inline-block; margin-left: .3em; cursor: pointer; }',
        '@media (pointer: coarse) {',
        '  #files tbody td:first-child { height: 32px; padding-left: 2.6em; }',
        '  #files tbody .rsel { width: 2.4em; }',
        '  #files .rsel input { width: 1.3em; height: 1.3em; }',
        '}'
    ].join('\n');
    document.head.appendChild(css);

    function rows() {
        return QSA('#files tbody tr' + (ebi('unsearch') ? ':not(.srch_hdr)' : ''));
    }

    // a <label> around the box: a bigger tap target, and a click on the label
    // reaches the box as a click of its own, so only the box's click is handled.
    // Returns the box; its label is box.parentNode
    function mkbox(cls, onclick) {
        var lbl = mknod('label'),
            box = mknod('input');

        box.type = 'checkbox';
        box.tabIndex = -1;
        box.onclick = onclick;
        lbl.className = 'rsel ' + cls;
        lbl.appendChild(box);
        lbl.onclick = function (e) {
            e.stopPropagation();  // no row toggle, no header sort
        };
        lbl.onmousedown = function (e) {
            e.preventDefault();  // keep focus on the row, not the box
        };
        return box;
    }

    // one row's box: toggle that row as upstream's row click does (msel.seltgl, which
    // also does shift-click ranges). seltgl gets a stand-in event, since ev() would
    // preventDefault the real one and the browser would then undo the box's tick
    function rowclick(e) {
        e.stopPropagation();
        var td = this.closest('td'),
            tr = td.parentNode;

        msel.seltgl.call(td, { "shiftKey": e.shiftKey });
        this.checked = clgot(tr, 'sel');
        if (tr.hasAttribute('tabindex') && tr.focus)
            tr.focus({ "preventScroll": true });
    }

    // the header's box: select all, or clear all once every row is selected.
    // Counts the rows' `sel` class, not msel.getsel(): right after a sort that
    // lists each selected file twice (upstream's msel.load(true)).
    // A stand-in event here too: given null, ev() falls back to window.event
    function allclick(e) {
        e.stopPropagation();
        var trs = rows(),
            nsel = QSA('#files tbody tr.sel' + (ebi('unsearch') ? ':not(.srch_hdr)' : '')).length;

        msel.evsel({}, !trs.length || nsel < trs.length);
    }

    // add missing boxes and tick each as its row's `sel` class says
    function sync() {
        var trs = rows(),
            nsel = 0;

        for (var a = 0, aa = trs.length; a < aa; a++) {
            var tr = trs[a],
                td = tr.cells[0];

            if (!td)
                continue;

            var box = td.querySelector('.rsel input');
            if (!box) {
                box = mkbox('rsel-row', rowclick);
                td.appendChild(box.parentNode);
            }
            box.checked = clgot(tr, 'sel');
            if (box.checked)
                nsel++;
        }

        var th = QS('#files th[name="lead"]');
        if (!th)
            return;

        var allbox = th.querySelector('.rsel input');
        if (!allbox) {
            allbox = mkbox('rsel-all', allclick);
            allbox.parentNode.title = 'select all / none';
            th.appendChild(allbox.parentNode);
        }
        allbox.checked = !!trs.length && nsel == trs.length;
        allbox.indeterminate = nsel > 0 && nsel < trs.length;
    }

    // run sync() after obj[name] each time it is called
    function after(obj, name) {
        var orig = obj[name];
        obj[name] = function () {
            var ret = orig.apply(this, arguments);
            sync();
            return ret;
        };
    }

    after(msel, 'selui');
    after(msel, 'render');

    // rewrites each header cell (filecols.add_btns), dropping the select-all box;
    // runs after msel.render for search results, and when a column is hidden or shown
    if (window.filecols && filecols.set_style)
        after(filecols, 'set_style');

    sync();
})();
