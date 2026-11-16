# coding: utf-8
from __future__ import division, print_function, unicode_literals

# fork-only: ?tree on a folder with no path on disk; see FORK.md
# "upstream edit: sidebar tree of a folder with no path on disk"

if True:  # pylint: disable=using-constant-test
    from typing import Any


def tx_tree_vols(cli: Any) -> bool:
    """?tree on a folder the user can't read (only volumes below it),
    allowed when ?ls (tx_ls_vols) would list something there and showing
    no more than it: unlistcr volumes are dropped from the rvol that
    gen_tree's fallback lists"""
    allvols = cli.asrv.vfs.all_nodes
    rvol = cli.rvol
    wvol = cli.wvol
    if cli.args.have_unlistc:
        rvol = [x for x in rvol if "unlistcr" not in allvols[x].flags]
        wvol = [x for x in wvol if "unlistcw" not in allvols[x].flags]

    zs = "%s/" % (cli.vpath,)
    if not [x for x in rvol + wvol if x.startswith(zs)]:
        return cli.tx_404(True)

    cli.rvol = rvol
    return cli.tx_tree()
