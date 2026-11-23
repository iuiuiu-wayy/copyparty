# coding: utf-8
from __future__ import division, print_function, unicode_literals

# fork-only: under the share links (`shr`), only share link passwords count; an
# account password, login cookie or other account login is answered as a
# guest's there, and copyparty's static files (`/.cpr/`, also open to Outside)
# take no login at all; see FORK.md "upstream edit: share links take only their own
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


def in_static_area(cli: Any) -> bool:
    """the request is for copyparty's static files (`/.cpr/...`), which share
    pages load and nginx opens to Outside; not `.cpr/metrics` (--stats), which
    takes its own login"""
    vp = cli.vpath
    return (vp + "/").startswith(".cpr/") and vp != ".cpr/metrics"


def _is_share_user(vfs: Any, uname: str) -> bool:
    """one of the made-up accounts the share loader gave share link passwords"""
    acct = getattr(vfs, "fork_shr_acct", None)
    return bool(acct) and uname in acct and uname not in vfs.fork_shr_cfg


def _pw_user(asrv: Any, pw: str) -> str:
    """the share link user of a password share_pw_user mapped, or ""; the
    map holds what shares.db holds, which is hashed with --ah-alg"""
    zd = getattr(asrv.vfs, "fork_shr_pw", None)
    return (zd.get(asrv.ah.hash(pw)) or "") if zd and pw else ""


def _cookie_share_user(asrv: Any, cookie_pw: str) -> str:
    """the share link user a login cookie belongs to, or """""
    if not cookie_pw:
        return ""
    sun = _pw_user(asrv, cookie_pw)
    if sun:
        return sun
    un = asrv.sesa.get(cookie_pw) or asrv.iacct.get(asrv.ah.hash(cookie_pw))
    return un if un and _is_share_user(asrv.vfs, un) else ""


def share_login(cli: Any, uname: str, pwd: str, opwd: str) -> tuple[str, str]:
    """httpcli.get_pwd_cookie, once upstream has looked up the password `opwd`
    (`uname` and the cookie value `pwd`): under the share links, a share link
    password's user, or nobody; returns the (uname, cookie value) to use.
    Under the static files, nobody: no cookie, no log, no ban, so a password
    tried there tells nothing"""
    if in_static_area(cli):
        return "", "x"
    if not in_share_area(cli):
        return uname, pwd
    vfs = cli.asrv.vfs
    sun = _pw_user(cli.asrv, opwd)
    if sun:
        return sun, cli.asrv.ases.get(sun) or opwd
    if uname and not _is_share_user(vfs, uname):
        # an account's password: refused, and counts for a ban like a wrong
        # one; but logged with no password or hash (it is a correct one), and
        # "x" so that upstream logs nothing more
        cli.log("account login refused under a share link", 3)
        cli.cbonk(cli.conn.hsrv.gpwd, opwd, "pw", "invalid passwords")
        return "", "x"
    return uname, pwd


def share_auth(cli: Any, cookie_pw: str) -> None:
    """httpcli.run, once the login is known: under the share links, keep only a
    share link password's user; anyone else becomes a guest there. Under the
    static files everyone is a guest, and no password is looked at"""
    if in_static_area(cli):
        cli.uname = "*"
        cli.pw = ""
        return
    if not in_share_area(cli):
        return
    vfs = cli.asrv.vfs
    sun = _pw_user(cli.asrv, cli.pw)
    if sun:
        cli.uname = sun
        return
    if cli.uname == "*" or _is_share_user(vfs, cli.uname):
        return
    # an account's login
    if cli.pw != cookie_pw and cli.pw != cli.uparam.get(cli.args.pw_urlp):
        # its correct password in basic auth or the PW header, which a browser
        # keeps sending; with a share link's cookie beside it, that cookie
        # counts: nothing refused, nothing to ban for, the cookie kept
        sun = _cookie_share_user(cli.asrv, cookie_pw)
        if sun:
            cli.uname = sun
            cli.pw = cookie_pw
            return
    cli.uname = "*"
    if cli.pw == cookie_pw:
        # a login cookie: nothing to refuse, and nothing to ban for
        cli.pw = ""
