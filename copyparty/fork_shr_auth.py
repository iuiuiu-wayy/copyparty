# coding: utf-8
from __future__ import division, print_function, unicode_literals

# fork-only: under the share links (`shr`), only share link passwords count; an
# account password, login cookie or other account login is answered as a
# guest's there; see FORK.md "upstream edit: share links take only their own
# passwords" and .scratch/https-outside ticket 04

import hashlib
import os

from .util import ub64enc

if True:  # pylint: disable=using-constant-test
    from typing import Any


def share_pw_start(vfs: Any, acct: dict[str, str]) -> dict[str, str]:
    """AuthSrv._reload, share loader, before the first share: remember which
    accounts the config has, so the made-up share link users can be told
    apart later; returns password -> account, for passwords two can't share"""
    vfs.fork_shr_cfg = set(acct)
    vfs.fork_shr_acct = acct  # the share loader adds its s_ users here
    vfs.fork_shr_pw = {}
    return {v.strip(): k for k, v in acct.items()}


def share_pw_user(vfs: Any, acct: dict[str, str], s_pw: str) -> str:
    """AuthSrv._reload, share loader: a share link password equal to an
    account's. Upstream would make the usual s_ user with that password,
    which fails the "same password" check; instead make it with a password
    nobody knows, and let share_auth map the share link password to it under
    the share links only (where the account itself counts for nothing)"""
    zb = hashlib.sha512(s_pw.encode("utf-8")).digest()
    sun = "s_%s" % (ub64enc(zb)[4:16].decode("ascii"),)  # as upstream names it
    if sun not in acct:
        acct[sun] = ub64enc(os.urandom(48)).decode("ascii")
    vfs.fork_shr_pw[s_pw.strip()] = sun
    return sun


def in_share_area(cli: Any) -> bool:
    """the request is for the share link area (`/share`, `/share/<key>/...`)"""
    shr1 = cli.args.shr1
    return bool(shr1) and (cli.vpath + "/").startswith(shr1)


def _is_share_user(vfs: Any, uname: str) -> bool:
    """one of the made-up accounts the share loader gave share link passwords"""
    acct = getattr(vfs, "fork_shr_acct", None)
    return bool(acct) and uname in acct and uname not in vfs.fork_shr_cfg


def _pw_user(asrv: Any, pw: str) -> str:
    """the share link user of a password share_pw_user mapped, or ""; the
    map holds what shares.db holds, which is hashed with --ah-alg"""
    zd = getattr(asrv.vfs, "fork_shr_pw", None)
    return (zd.get(asrv.ah.hash(pw)) or "") if zd and pw else ""


def share_login(cli: Any, uname: str, pwd: str, opwd: str) -> tuple[str, str]:
    """httpcli.get_pwd_cookie, once upstream has looked up the password `opwd`
    (`uname` and the cookie value `pwd`): under the share links, a share link
    password's user, or nobody; returns the (uname, cookie value) to use"""
    if not in_share_area(cli):
        return uname, pwd
    vfs = cli.asrv.vfs
    sun = _pw_user(cli.asrv, opwd)
    if sun:
        return sun, cli.asrv.ases.get(sun) or opwd
    if uname and not _is_share_user(vfs, uname):
        return "", opwd  # an account's password: refused, and counts for a ban
    return uname, pwd


def share_auth(cli: Any, cookie_pw: str) -> None:
    """httpcli.run, once the login is known: under the share links, keep only a
    share link password's user; anyone else becomes a guest there"""
    if not in_share_area(cli):
        return
    vfs = cli.asrv.vfs
    sun = _pw_user(cli.asrv, cli.pw)
    if sun:
        cli.uname = sun
        return
    if cli.uname == "*" or _is_share_user(vfs, cli.uname):
        return
    cli.uname = "*"
    if cli.pw == cookie_pw:
        # a login cookie: nothing to refuse, and nothing to ban for
        cli.pw = ""
