"use strict";

// fork-only, drive-ux: the rename dialog of the Drive-style file browser; see FORK.md.
// Rename on one item (selection bar, row menu, F2, upstream's own callers of fileman.rename)
// opens a small dialog with the name selected up to the extension (the whole name for a
// folder); Enter or Save sends upstream's own move request (POST <item>?move=<new path>) and
// a refusal shows the server's reason inline. Several items go to upstream's batch rename
// panel (#rui), unchanged. F2 with nothing selected renames the focused row.
// Built on forkui.js (dialog) and forklist.js (forkui.list, forkui.actions); the dialog
// reuses forknew.js's name-dialog styles (.fk-ndlg, .fk-nd, .fk-btn).
// For the other drive-ux scripts (the folder menu, ticket 12):
//   forkui.rename(item, opener)  item = { vp, fn, isd } as in msel.getsel() (vp: URL-encoded,
//                                with the --rp-loc prefix, no trailing slash); onrename(newvp)
//                                is called after the server took it, instead of reloading

(function () {
    var ui = window.forkui;
    if (!ui || !ui.ok || !ui.actions || !ui.list || !window.msel || !window.fileman ||
        !window.treectl || !window.L || !ebi('files'))
        return;

    var el = ui.el,
        cur = null,        // { item, opener, done }: what the open dialog renames
        pending = null;    // { name, sel }: the row to focus (and reselect) after the reload

    var input = el('input', {
        type: 'text', class: 'fk-nd-in', id: 'fk-rn-in', autocomplete: 'off',
        autocapitalize: 'off', spellcheck: 'false', enterkeyhint: 'done',
        'aria-describedby': 'fk-rn-err'
    }),
        err = el('p', { class: 'fk-nd-err', id: 'fk-rn-err', role: 'alert' }),
        ok = el('button', { type: 'submit', class: 'fk-btn fk-btn-p', text: 'Save' }),
        cancel = el('button', { type: 'button', class: 'fk-btn', text: 'Cancel' }),
        form = el('form', { class: 'fk-nd', method: 'dialog' }, [
            el('h2', { text: 'Rename' }),
            el('label', { for: input.id, text: 'New name' }),
            input, err,
            el('div', { class: 'fk-nd-btns' }, [cancel, ok])
        ]),
        d = ui.dialog({
            label: 'Rename', 'class': 'fk-ndlg', kids: form,
            onopen: function () {
                var it = cur.item;
                err.textContent = '';
                ok.disabled = false;
                input.value = it.fn;
                input.focus();
                var dot = it.isd ? -1 : it.fn.lastIndexOf('.');
                input.setSelectionRange(0, dot > 0 ? dot : it.fn.length);
            }
        });

    cancel.addEventListener('click', function () {
        d.close();
    });

    function fail(msg) {
        err.textContent = msg;
        ok.disabled = false;
        input.focus();
    }

    // native implicit submission: no Enter handler of our own, so an IME's Enter is safe
    form.addEventListener('submit', function (e) {
        e.preventDefault();
        if (!cur || ok.disabled)
            return;
        var it = cur.item,
            name = input.value.trim();
        if (!name)
            return fail('Type a name.');
        if (name.indexOf('/') >= 0)
            return fail('A name can\'t contain /.');
        if (name == '.' || name == '..')
            return fail('That name isn\'t allowed.');
        if (name == it.fn)
            return d.close();

        ok.disabled = true;
        err.textContent = '';
        var base = vsplit(it.vp)[0],
            dst = base + uricom_enc(name, false),
            job = cur,
            xhr = new XMLHttpRequest();
        xhr.open('POST', it.vp + '?move=' + dst, true);
        xhr.onload = xhr.onerror = function () {
            if (cur != job)
                return;
            if (xhr.status != 201)
                return fail('Could not rename it: ' +
                    (unpre(xhr.responseText || '').trim() || 'no answer from the server'));
            var a = ebi(it.id),
                tr = a && a.closest('tr');
            cur = null;
            if (job.done) {
                d.close();
                return job.done(dst);
            }
            pending = { name: name, sel: !!(tr && tr.classList.contains('sel')), dir: get_evpath() };
            d.close();
            treectl.goto();
            // tell upstream's other tabs, as its own rename does through paste's bus
            if (fileman.tx)
                fileman.tx(get_evpath());
        };
        xhr.send();
    });

    d.el.addEventListener('close', function () {
        cur = null;
    });

    // after the reload: the renamed row, focused and (if it was) selected again
    var orender = msel.render;
    msel.render = function () {
        var ret = orender.apply(this, arguments);
        var p = pending;
        pending = null;
        if (!p || p.dir != get_evpath())
            return ret;
        var all = msel.getall(), tr = null;
        for (var i = 0; i < all.length; i++)
            if (all[i].fn == p.name) {
                tr = ebi(all[i].id).closest('tr');
                break;
            }
        if (!tr)
            return ret;
        if (p.sel)
            ui.list.only([tr]);
        if (tr.hasAttribute('tabindex'))
            tr.focus({ preventScroll: false });
        return ret;
    };

    function open(item, opener, done) {
        var a = ebi(item.id),
            ae = document.activeElement;
        if (!opener)
            opener = ae && ae != document.body && !(ae.closest && ae.closest('[popover],dialog')) ? ae :
                a && a.closest('tr');
        cur = { item: item, opener: opener, done: done || null };
        d.open(opener && opener.isConnected ? opener : null);
    }

    function focusedrow() {
        var ae = document.activeElement,
            tr = ae && ae.closest && ae.closest('#files tbody tr');
        return tr && tr.querySelector('a[id]') && !tr.classList.contains('srch_hdr') ? tr : null;
    }

    // every caller of upstream's rename (F2, its button, its right-click menu): one item gets
    // our dialog, several (or no write rights: upstream's toast) stay upstream's
    var orename = fileman.rename;
    fileman.rename = function (e) {
        var sel = msel.getsel();
        if (!sel.length && !e) {
            var tr = focusedrow();
            if (tr) {
                ui.list.only([tr]);
                sel = msel.getsel();
            }
        }
        var seen = {}, uniq = [];
        for (var i = 0; i < sel.length; i++)
            if (!seen[sel[i].vp]) {
                seen[sel[i].vp] = 1;
                uniq.push(sel[i]);
            }
        var bren = ebi('fren');
        if (uniq.length != 1 || (bren && clgot(bren, 'hide')))
            return orename.apply(this, arguments);
        if (e && e.preventDefault)
            ev(e);
        open(uniq[0]);
    };
    if (ebi('fren'))
        ebi('fren').onclick = fileman.rename;

    // the selection bar's and the row menu's Rename
    ui.actions.rename = function () {
        fileman.rename({});
    };

    ui.rename = function (item, opener, done) {
        open(item, opener, done);
    };
})();
