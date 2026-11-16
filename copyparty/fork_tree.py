# coding: utf-8
from __future__ import division, print_function, unicode_literals

# fork-only: ?tree on a folder with no path on disk; see FORK.md
# "upstream edit: sidebar tree of a folder with no path on disk"

import os
import stat

if True:  # pylint: disable=using-constant-test
    from typing import Any

_DIR_ST = os.stat_result((stat.S_IFDIR | 0o755, 0, 0, 0, 0, 0, 0, 0, 0, 0))


def listable_vols(cli: Any) -> tuple[list[str], list[str]]:
    """the readable and writable volumes ?ls may show: rvol / wvol without
    unlistcr / unlistcw volumes; a copy of HttpCli.tx_ls_vols' filter, keep
    the two in step"""
    rvol = cli.rvol
    wvol = cli.wvol
    if cli.args.have_unlistc:
        allvols = cli.asrv.vfs.all_nodes
        rvol = [x for x in rvol if "unlistcr" not in allvols[x].flags]
        wvol = [x for x in wvol if "unlistcw" not in allvols[x].flags]
    return rvol, wvol


def tree_children(rvol: list[str], top: str) -> list[str]:
    """the first path segment below `top` of each volume in `rvol` that is
    mounted under it, at any depth; once each, in rvol order"""
    zs = "%s/" % (top,) if top else ""
    ret: list[str] = []
    for vp in rvol:
        if vp.startswith(zs) and len(vp) > len(zs):
            d1 = vp[len(zs) :].split("/", 1)[0]
            if d1 not in ret:
                ret.append(d1)
    return ret


def tree_virt(cli: Any, top: str) -> tuple[list[tuple[str, Any]], list[str]]:
    """gen_tree's fallback for a folder with no path on disk, as its
    (vfs_ls, vfs_virt names): the folders to list there, showing no more
    than ?ls (tx_ls_vols) does. A volume mounted right there goes in
    vfs_virt, which marks it offline when its path is missing; a folder
    that only leads to deeper volumes goes in vfs_ls as a plain folder,
    since vfs_virt would mark it offline (no read access on it)"""
    rvol = listable_vols(cli)[0]
    vols = set(rvol)
    ls = []
    virt = []
    for d1 in tree_children(rvol, top):
        if (top + "/" + d1 if top else d1) in vols:
            virt.append(d1)
        else:
            ls.append((d1, _DIR_ST))
    return ls, virt


def tx_tree_vols(cli: Any) -> bool:
    """?tree on a folder the user can't read (only volumes below it);
    allowed when the tree would list something there, else refused like
    any other request on it"""
    zs = "%s/" % (cli.vpath,)
    if not any(x.startswith(zs) for x in listable_vols(cli)[0]):
        ptn = cli.args.nonsus_urls
        if not ptn or not ptn.search(cli.vpath):
            cli.log("@%s has no access to %r" % (cli.uname, "/" + cli.vpath))
        return cli.tx_404(True)

    return cli.tx_tree()
