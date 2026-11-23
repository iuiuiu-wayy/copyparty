#!/usr/bin/env python3
# coding: utf-8
from __future__ import division, print_function, unicode_literals

# fork-only: under the share links, only share link passwords count; an account
# password or login cookie is answered as a guest's (https-outside ticket 04)

import base64
import io
import json
import os
import shutil
import sqlite3
import tempfile
import unittest
import zipfile

from copyparty.authsrv import AuthSrv
from copyparty.httpcli import HttpCli
from tests import util as tu
from copyparty.util import Garda
from tests.util import Cfg

KEY = "abcdefghijkl"  # an open share link of /d/
PKEY = "pwpwpwpwpwpw"  # a share link of /d/ with the password "spw"
AKEY = "acacacacacac"  # a share link of /d/ whose password is alice's
WKEY = "wwwwwwwwwwww"  # an open share link of /d/ with upload


def basic(zs):
    return "Authorization: Basic %s\r\n" % (
        base64.b64encode(zs.encode("utf-8")).decode("ascii"),
    )


# every way upstream takes an account password, as extra request headers
# and/or a query suffix
ACCOUNT_PW = [
    ("", "pw=pa"),
    ("PW: pa\r\n", ""),
    (basic("alice:pa"), ""),
    (basic("pa"), ""),
]


class TestForkShrAuth(unittest.TestCase):
    def log(self, src, msg, c=0):
        pass

    def setUp(self):
        self.conn = None
        self.td = tu.get_ramdisk()
        td = os.path.join(self.td, "vfs")
        os.mkdir(td)
        os.chdir(td)
        for fp in ("d/f.txt", "priv/secret.txt"):
            dp = os.path.dirname(fp)
            if not os.path.isdir(dp):
                os.makedirs(dp)
            with open(fp, "wb") as f:
                f.write(fp.encode("utf-8"))

        db = sqlite3.connect("a.db")
        with db:
            db.execute(
                "create table sh (k text, pw text, vp text, pr text, st int, un text, t0 int, t1 int)"
            )
            db.execute("create table sf (k text, vp text)")
        db.close()

        db = sqlite3.connect("ses.db")  # what svchub makes at startup
        with db:
            db.execute("create table us (un text, si text, t0 int)")
        db.close()

    def tearDown(self):
        if self.conn:
            self.conn.shutdown()
        os.chdir(tempfile.gettempdir())
        shutil.rmtree(self.td)

    def cinit(self, **ka):
        self.args = Cfg(
            a=["alice:pa", "bob:pb"],
            v=["d:d:A,alice:r,bob", "priv:priv:A,alice"],
            shr="/shr/",
            shr1="shr/",
            shr_db="a.db",
            shr_v=False,
            chpw=True,
            chpw_db="chpw.json",
            chpw_no=[],
            chpw_len=8,
            chpw_v=0,
            ses_db="ses.db",
            no_ses=False,  # the default; login cookies hold a session, not the password
            ses_len=20,
            **ka
        )
        self.reload()

    def reload(self):
        if self.conn:
            self.conn.shutdown()
            self.conn = None
        self.asrv = AuthSrv(self.args, self.log)
        self.conn = tu.VHttpConn(self.args, self.asrv, self.log, b"", True)
        self.conn.hsrv.gpwc = Garda("")
        self.conn.hsrv.nban = 0
        self.load_splash()

    def load_splash(self):
        # the test http server has no templates; give it the control panel's
        import jinja2

        from copyparty.__init__ import E
        from copyparty.httpsrv import load_jinja2_resource

        env = jinja2.Environment()
        env.loader = jinja2.FunctionLoader(lambda f: load_jinja2_resource(E, f))
        self.conn.hsrv.j2["splash"] = env.get_template("splash.html")

    def req(self, method, url, extra="", body=b""):
        h = "%s /%s HTTP/1.1\r\nConnection: close\r\n%s\r\n"
        buf = (h % (method, url, extra)).encode("utf-8") + body
        HttpCli(self.conn.setbuf(buf)).run()
        h, b = self.conn.s._reply.split(b"\r\n\r\n", 1)
        return int(h.split(b" ", 2)[1]), h.decode("utf-8", "replace"), b

    def get(self, url, extra=""):
        st, _, b = self.req("GET", url, extra)
        return st, b

    def post_json(self, url, jt, extra=""):
        buf = json.dumps(jt).encode("utf-8")
        hdr = "Content-Type: application/json\r\nContent-Length: %d\r\n" % (len(buf),)
        return self.req("POST", url, hdr + extra, buf)

    def post_form(self, url, form, extra=""):
        # multipart, as the login and change-password forms send it
        bnd = "XbOuNdArYx"
        zsl = []
        for k, v in form:
            zsl.append("--%s\r\nContent-Disposition: form-data; name=\"%s\"\r\n\r\n%s\r\n" % (bnd, k, v))
        zsl.append("--%s--\r\n" % (bnd,))
        buf = "".join(zsl).encode("utf-8")
        hdr = "Content-Type: multipart/form-data; boundary=%s\r\n" % (bnd,)
        hdr += "Content-Length: %d\r\n" % (len(buf),)
        return self.req("POST", url, hdr + extra, buf)

    def login(self, url, pw):
        """the password prompt; returns (the cookie it set, or "", the body)"""
        st, h, b = self.post_form(url, [("act", "login"), ("cppwd", pw)])
        for ln in h.split("\r\n"):
            if ln.lower().startswith("set-cookie: cppwd="):
                ck = ln.split(":", 1)[1].strip().split(";")[0]
                if ck != "cppwd=x":
                    return ck, b
        return "", b

    def ck(self, cookie):
        return "Cookie: %s\r\n" % (cookie,)

    def share(self, key, pw="", perms=("read",), vp="/d/"):
        jt = {"k": key, "vp": [vp], "pw": pw, "exp": "", "perms": list(perms)}
        st, h, b = self.post_json("?pw=pa&share", jt)
        self.assertEqual(st, 201, b)
        self.reload()  # what the broker's reload does in a real server

    def two_links(self):
        self.cinit()
        self.share(KEY)
        self.share(PKEY, pw="spw")

    def test_account_password_gets_no_control_panel_data(self):
        self.two_links()
        st, b = self.get("?h&pw=pa")
        self.assertIn(b"alice", b)  # outside the share links, as before
        for url in ("shr/%s/?h&pw=pa" % (KEY,), "shr/?h&pw=pa"):
            st, b = self.get(url)
            self.assertNotIn(b"alice", b, url)
            self.assertNotIn(b"/priv", b, url)

    def test_share_password_still_opens_its_link(self):
        self.two_links()
        f = "shr/%s/f.txt" % (PKEY,)
        self.assertEqual(self.get(f)[0], 401)
        self.assertEqual(self.get(f + "?pw=nope")[0], 401)
        self.assertEqual(self.get(f + "?pw=spw"), (200, b"d/f.txt"))
        self.assertEqual(self.get(f, "PW: spw\r\n")[0], 200)

        ck, b = self.login("shr/%s/" % (PKEY,), "spw")
        self.assertTrue(ck, b)
        self.assertEqual(self.get(f, self.ck(ck)), (200, b"d/f.txt"))

        ck, b = self.login("shr/%s/" % (PKEY,), "nope")
        self.assertFalse(ck, b)

    def url(self, path, q):
        if not q:
            return path
        return path + ("&" if "?" in path else "?") + q

    def test_account_password_any_way_is_a_guests(self):
        self.two_links()
        for hdr, q in ACCOUNT_PW:
            # outside the share links, as before
            self.assertEqual(self.get(self.url("priv/secret.txt", q), hdr)[0], 200)
            self.assertIn(b"/priv", self.get(self.url("?h", q), hdr)[1])
            # under them, a guest
            for path in ("shr/%s/?h" % (KEY,), "shr/%s/" % (KEY,), "shr/?h"):
                st, b = self.get(self.url(path, q), hdr)
                self.assertNotIn(b"/priv", b, (path, hdr, q))
            st, b = self.get(self.url("shr/%s/f.txt" % (PKEY,), q), hdr)
            self.assertEqual(st, 401, (hdr, q))
            st, b = self.get(self.url("shr/%s/f.txt" % (KEY,), q), hdr)
            self.assertEqual((st, b), (200, b"d/f.txt"), (hdr, q))

    def test_account_cookie_is_a_guests(self):
        self.two_links()
        ck, b = self.login("", "pa")
        self.assertTrue(ck, b)
        hck = self.ck(ck)
        self.assertIn(b"/priv", self.get("?h", hck)[1])
        for path in ("shr/%s/?h" % (KEY,), "shr/?h"):
            st, h, b = self.req("GET", path, hck)
            self.assertNotIn(b"/priv", b, path)
            self.assertNotIn("cppwd=x", h, path)  # still logged in elsewhere
        self.assertEqual(self.get("shr/%s/f.txt" % (PKEY,), hck)[0], 401)
        self.assertEqual(self.get("shr/%s/f.txt" % (KEY,), hck), (200, b"d/f.txt"))
        self.assertEqual(self.get("priv/secret.txt", hck)[0], 200)

    def test_owner_sees_her_link_as_a_guest_does(self):
        self.two_links()
        hck = self.ck(self.login("", "pa")[0])
        f = "shr/%s/f.txt" % (PKEY,)
        self.assertEqual(self.get(f, hck)[0], 401)
        self.assertEqual(self.get(f + "?pw=spw", hck), (200, b"d/f.txt"))
        sck, b = self.login("shr/%s/" % (PKEY,), "spw")
        self.assertEqual(self.get(f, self.ck(sck)), (200, b"d/f.txt"))

    def chpw_all_ways(self, path):
        hck = self.ck(self.login("", "pa")[0])
        for hdr, q in ACCOUNT_PW + [(hck, "")]:
            st, h, b = self.post_form(self.url(path, q), [("act", "chpw"), ("pw", "newpassword1")], hdr)
            self.assertNotIn("new password OK", b.decode("utf-8", "replace"), (hdr, q))
        self.reload()  # the broker's reload after a change (a no-op in tests)
        self.assertEqual(self.get("priv/secret.txt?pw=pa")[0], 200)
        self.assertEqual(self.get("priv/secret.txt?pw=newpassword1")[0], 401)

    def test_no_password_change_under_a_share_link(self):
        self.two_links()
        self.chpw_all_ways("shr/%s/" % (KEY,))
        self.chpw_all_ways("shr/")
        # outside, as before
        st, h, b = self.post_form("?pw=pa", [("act", "chpw"), ("pw", "newpassword1")])
        self.reload()
        self.assertEqual(self.get("priv/secret.txt?pw=newpassword1")[0], 200)

    def n_shares(self):
        db = sqlite3.connect("a.db")
        try:
            return db.execute("select count(*) from sh").fetchone()[0]
        finally:
            db.close()

    def test_no_share_creation_under_a_share_link(self):
        self.two_links()
        n = self.n_shares()
        hck = self.ck(self.login("", "pa")[0])
        jt = {"k": "zzzzzzzzzzzz", "vp": ["/priv/"], "pw": "", "exp": "", "perms": ["read"]}
        for path in ("shr/%s/?share" % (KEY,), "shr/?share"):
            for hdr, q in ACCOUNT_PW + [(hck, "")]:
                st, h, b = self.post_json(self.url(path, q), jt, hdr)
                self.assertNotEqual(st, 201, (path, hdr, q, b))
        self.assertEqual(self.n_shares(), n)
        self.assertNotEqual(self.get("shr/zzzzzzzzzzzz/secret.txt")[0], 200)

    def banned(self):
        return bool(self.conn.hsrv.bans)

    def test_account_password_at_the_prompt_is_refused_and_counts_for_a_ban(self):
        self.two_links()
        self.conn.hsrv.gpwd = Garda("2,60,1")
        ck, b = self.login("shr/%s/" % (KEY,), "pa")
        self.assertFalse(ck, b)
        self.assertFalse(self.banned())
        self.login("shr/%s/" % (PKEY,), "pb")
        self.assertTrue(self.banned())

    def test_account_password_in_the_url_counts_for_a_ban(self):
        self.two_links()
        self.conn.hsrv.gpwd = Garda("2,60,1")
        self.get("shr/%s/f.txt?pw=pa" % (PKEY,))
        self.get("shr/%s/f.txt?pw=pb" % (PKEY,))
        self.assertTrue(self.banned())

    def test_wrong_share_password_still_counts_for_a_ban(self):
        self.two_links()
        self.conn.hsrv.gpwd = Garda("2,60,1")
        self.login("shr/%s/" % (PKEY,), "nope1")
        self.assertFalse(self.banned())
        self.login("shr/%s/" % (PKEY,), "nope2")
        self.assertTrue(self.banned())

    def test_login_cookie_under_a_share_link_never_bans(self):
        self.two_links()
        self.conn.hsrv.gpwd = Garda("2,60,1")
        for un, pw in (("alice", "pa"), ("bob", "pb")):
            hck = self.ck(self.login("", pw)[0])
            for _ in range(3):
                self.conn.freshen_pwd = 0  # every request freshens the cookie
                self.get("shr/%s/f.txt" % (PKEY,), hck)
                self.get("shr/%s/?h" % (KEY,), hck)
        self.assertFalse(self.banned())

    def test_guest_keeps_what_a_link_gives(self):
        self.cinit()
        self.share(KEY)
        self.share(WKEY, perms=("read", "write"))
        for hdr in ("", self.ck(self.login("", "pa")[0])):
            st, b = self.get("shr/%s/?zip" % (KEY,), hdr)
            self.assertEqual(st, 200)
            names = zipfile.ZipFile(io.BytesIO(b)).namelist()
            self.assertIn("%s/f.txt" % (KEY,), names)
            st, b = self.get("shr/%s/?tar" % (KEY,), hdr)
            self.assertEqual(st, 200)

            fn = "up%d.txt" % (len(hdr),)
            st, h, b = self.req(
                "PUT", "shr/%s/%s" % (WKEY, fn), hdr + "Content-Length: 2\r\n", b"ok"
            )
            self.assertEqual(st, 201, b)
            with open("d/" + fn, "rb") as f:
                self.assertEqual(f.read(), b"ok")

    def test_dead_link_answers_as_before(self):
        self.two_links()
        want = self.get("shr/nonexistentk/")
        for hdr, q in ACCOUNT_PW:
            self.assertEqual(self.get(self.url("shr/nonexistentk/", q), hdr)[0], want[0])

    def test_share_password_equal_to_an_account_password(self):
        self.cinit()
        self.share(AKEY, pw="pa")
        f = "shr/%s/f.txt" % (AKEY,)
        self.assertEqual(self.get(f)[0], 401)
        self.assertEqual(self.get(f + "?pw=pa"), (200, b"d/f.txt"))
        self.assertNotIn(b"/priv", self.get("shr/%s/?h&pw=pa" % (AKEY,))[1])

        ck, b = self.login("shr/%s/" % (AKEY,), "pa")
        self.assertTrue(ck, b)
        self.assertEqual(self.get(f, self.ck(ck)), (200, b"d/f.txt"))
        # that cookie is the share link's, not alice's
        self.assertIn(self.get("priv/secret.txt", self.ck(ck))[0], (401, 403))
        # alice herself, as before
        self.assertEqual(self.get("priv/secret.txt?pw=pa")[0], 200)
        hck = self.ck(self.login("", "pa")[0])
        self.assertEqual(self.get("priv/secret.txt", hck)[0], 200)
        self.assertEqual(self.get(f, hck)[0], 401)


if __name__ == "__main__":
    unittest.main()
