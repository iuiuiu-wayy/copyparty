# coding: utf-8
from __future__ import division, print_function, unicode_literals

# fork-only: how full each disk is (disk-space tickets 02 and 03; see FORK.md).
#   GET /?disks&j  one entry per filesystem behind the volumes the caller can
#                  write to, as json, for the file browser's storage bar
#   GET /?disks    a page with one row per filesystem behind the volumes the
#                  caller has `a` on, and the volumes whose folder is missing
# A "disk" is a filesystem: volumes are grouped by st_dev of their folder, and
# the numbers are the whole filesystem's (statvfs, as upstream's "free of"),
# not the volume's. Upstream's du_who decides who sees them, per volume.
# Neither reply holds a server path, only volume names.

import json
import os

from .bos import bos
from .util import Pebkac, get_df, humansize

if True:  # pylint: disable=using-constant-test
    from typing import Any


def _vp(vp: str) -> str:
    """a volume's name as the web UI writes it: /home/wayy/"""
    return "/%s/" % (vp,) if vp else "/"


def _du_ok(cli: Any, vp: str, vol: Any) -> bool:
    """upstream's check in tx_browser of who may see disk usage (du_who),
    for the caller on this volume"""
    zi = vol.flags.get("du_iwho", 9)
    can_r = vp in cli.rvol
    can_w = vp in cli.wvol
    return bool(zi) and (
        zi == 9
        or (zi == 7 and cli.uname != "*")
        or (zi == 5 and can_w)
        or (zi == 4 and can_w and can_r)
        or (zi == 3 and vp in cli.avol)
    )


def _dev(ap: str) -> int:
    """the filesystem a folder is on; raises OSError if it isn't there"""
    return bos.stat(ap).st_dev


def disks_of(cli: Any, vps: list[str]) -> tuple[list[dict[str, Any]], list[str]]:
    """the filesystems behind these volumes, each as {vols, free, total},
    and the names of the volumes whose folder isn't there"""
    vfs = cli.asrv.vfs
    by_dev: dict[int, dict[str, Any]] = {}
    missing: list[str] = []
    for vp in vps:
        vol = vfs.all_vols.get(vp)
        if not vol or not vol.realpath or vol.flags.get("is_file"):
            continue
        if not _du_ok(cli, vp, vol):
            continue
        try:
            dev = _dev(vol.realpath)
        except OSError:
            missing.append(_vp(vp))
            continue
        dsk = by_dev.get(dev)
        if not dsk:
            free, total, _ = get_df(vol.realpath, False)
            if not total:
                continue
            dsk = by_dev[dev] = {"vols": [], "free": free, "total": total}
        dsk["vols"].append(_vp(vp))

    ret = list(by_dev.values())
    for dsk in ret:
        dsk["vols"].sort()
    ret.sort(key=lambda x: x["vols"][0])
    return ret, sorted(missing)


def tx_disks(cli: Any) -> bool:
    if cli.uname == "*":
        raise Pebkac(401, "you must be logged in to see disk space")

    if "j" in cli.uparam:
        disks, _ = disks_of(cli, cli.wvol)
        cli.reply(json.dumps({"disks": disks}).encode("utf-8"), mime="application/json")
        return True

    disks, missing = disks_of(cli, cli.avol)
    for dsk in disks:
        free, total = dsk["free"], dsk["total"]
        dsk["pct"] = int(round(100.0 * (total - free) / total))
        dsk["hfree"] = humansize(free)
        dsk["htotal"] = humansize(total)
        dsk["hused"] = humansize(total - free)

    html = cli.j2s(_template(cli), this=cli, disks=disks, missing=missing)
    cli.reply(html.encode("utf-8"), status=200)
    return True


def _template(cli: Any) -> str:
    """the page's template, added to upstream's on first use, so httpsrv's
    list of templates stays as it is (as fork_grants does)"""
    j2 = cli.conn.hsrv.j2
    if "fork_disks" not in j2:
        import jinja2

        from .httpsrv import load_jinja2_resource

        env = jinja2.Environment()
        env.loader = jinja2.FunctionLoader(lambda f: load_jinja2_resource(cli.E, f))
        j2["fork_disks"] = env.get_template("disks.html")
    return "fork_disks"
