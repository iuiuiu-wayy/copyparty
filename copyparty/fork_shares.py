# coding: utf-8
from __future__ import division, print_function, unicode_literals

# fork-only: GET /?shares&j, the share links the ?shares page lists, as json,
# for the drive-ux Share dialog; see FORK.md "upstream edit: share links as json"

import json
import time

from .util import Pebkac, quotep

if True:  # pylint: disable=using-constant-test
    from typing import Any


def share_url(cli: Any, skey: str, fns: list[str]) -> str:
    """the link handle_share answers with ("created share: <url>"); keep in step"""
    args = cli.args
    fn = quotep(fns[0]) if len(fns) == 1 else ""
    if args.shr_site:
        site = args.shr_site[:-1]
    else:
        site = "%s://%s" % ("https" if cli.is_https else "http", cli.host)
    return "%s%s%s%s/%s" % (site, args.SR, args.shr, skey, fn)


def tx_shares_json(cli: Any) -> bool:
    """the rows of HttpCli.tx_shares, under the same checks (keep in step):
    logged in, sharing on, the caller's own links (everyone's for --shr-adm)"""
    if cli.uname == "*":
        raise Pebkac(403, "you're not logged in")

    idx = cli.conn.get_u2idx()
    if not idx or not hasattr(idx, "p_end"):
        raise Pebkac(500, "server busy, cannot list shares; please retry in a bit")

    cur = idx.get_shr()
    if not cur:
        raise Pebkac(400, "huh, sharing must be disabled in the server config...")

    rows = cur.execute("select * from sh").fetchall()
    if cli.uname not in cli.args.shr_adm:
        rows = [x for x in rows if x[5] == cli.uname]

    ret = []
    q = "select vp from sf where k=? limit 99"
    for k, pw, vp, pr, st, un, t0, t1 in rows:
        fns = [x[0] for x in cur.execute(q, (k,)).fetchall()] if st else []
        ret.append(
            {
                "k": k,
                "url": share_url(cli, k, fns),
                "vp": "/" + vp,
                "files": fns,
                "pw": bool(pw),
                "pr": pr,
                "un": un,
                "t0": t0,
                "t1": t1,
            }
        )

    jtxt = json.dumps({"now": int(time.time()), "rows": ret})
    cli.reply(jtxt.encode("utf-8"), mime="application/json")
    return True
