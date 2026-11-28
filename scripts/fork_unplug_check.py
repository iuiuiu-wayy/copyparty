#!/usr/bin/env python3
# coding: utf-8

# fork-only, local-only: a disk pulled out while copyparty runs (disk-space
# ticket 06). Run by scripts/fork-unplug-check.sh, which explains it; this is
# the driver. Python 3, stdlib only; needs sshfs, fusermount3 and sftp-server.
#
# The "disk" is a FUSE mount (sshfs in passive mode talking to a local
# sftp-server over two pipes), so it can be killed under copyparty without root,
# as the WD's ntfs-3g dies when it is pulled out. Its mount point stands for the
# Pi service's private view: an empty folder copyparty can't write to when the
# disk isn't there. copyparty's index of that volume lives on the disk (.hist),
# as on the Pi. One PASS / FAIL line per rule; exit 1 on any FAIL.

import json
import os
import shutil
import signal
import socket
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.request

SFTP = "/usr/lib/openssh/sftp-server"
PW = {"wayy": "pw-wayy-12", "acid": "pw-acid-12"}
fails = []


def say(ok, rule, why=""):
    if ok:
        print("PASS  " + rule)
    else:
        fails.append(rule)
        print("FAIL  %s%s" % (rule, "  (%s)" % (" ".join(str(why).split()),) if why else ""))
    sys.stdout.flush()


class Disk(object):
    """sshfs -o passive of `src` at `mnt`; kill() is pulling it out"""

    def __init__(self, src, mnt):
        self.src, self.mnt = src, mnt
        self.srv = self.fs = None

    def plug(self):
        a_r, a_w = os.pipe()  # sftp-server -> sshfs
        b_r, b_w = os.pipe()  # sshfs -> sftp-server
        self.srv = subprocess.Popen([SFTP], stdin=b_r, stdout=a_w)
        self.fs = subprocess.Popen(["sshfs", "-f", "-o", "passive", ":" + self.src, self.mnt], stdin=a_r, stdout=b_w)
        for fd in (a_r, a_w, b_r, b_w):
            os.close(fd)
        for _ in range(100):
            if os.path.ismount(self.mnt):
                return
            time.sleep(0.05)
        raise Exception("the FUSE disk did not mount at " + self.mnt)

    def kill(self):
        """the cable is pulled: the file system stops answering"""
        self.fs.kill()
        self.fs.wait()

    def clean(self):
        """what the host's unmount does once the disk is gone"""
        subprocess.call(["fusermount3", "-u", "-z", self.mnt], stderr=subprocess.DEVNULL)
        for p in (self.fs, self.srv):
            if p and p.poll() is None:
                p.kill()
                p.wait()


class Cpp(object):
    def __init__(self, py, top, conf, log, port):
        self.py, self.top, self.conf, self.logfn, self.port = py, top, conf, log, port
        self.p = None

    def start(self):
        log = open(self.logfn, "a")
        self.p = subprocess.Popen([self.py, "-m", "copyparty", "-c", self.conf], cwd=self.top, stdout=log, stderr=log)
        log.close()
        t0 = time.time()
        while time.time() - t0 < 60:
            if self.p.poll() is not None:
                raise Exception("copyparty exited at startup; see " + self.logfn)
            if req("GET", "?h", None, self.port, timeout=1)[0] == 200:
                return
            time.sleep(0.2)
        raise Exception("copyparty did not answer in 60 s")

    def alive(self):
        return self.p.poll() is None

    def stop(self):
        """seconds it took to stop on SIGTERM (systemd's stop), or None if it hung"""
        t0 = time.time()
        self.p.send_signal(signal.SIGTERM)
        try:
            self.p.wait(15)
            return time.time() - t0
        except subprocess.TimeoutExpired:
            self.p.kill()
            self.p.wait()
            return None


def req(method, url, user, port, body=None, timeout=10):
    """(status, body, seconds); status "TIMEOUT" or "ERR" when there is no reply"""
    hdrs = {"PW": "%s:%s" % (user, PW[user])} if user else {}
    r = urllib.request.Request("http://127.0.0.1:%d/%s" % (port, url), data=body, method=method, headers=hdrs)
    t0 = time.time()
    try:
        with urllib.request.urlopen(r, timeout=timeout) as f:
            return f.status, f.read(), time.time() - t0
    except urllib.error.HTTPError as ex:
        return ex.code, ex.read(), time.time() - t0
    except socket.timeout:
        return "TIMEOUT", b"", time.time() - t0
    except Exception as ex:
        return "ERR", repr(ex).encode("utf-8"), time.time() - t0


def free_port():
    s = socket.socket()
    s.bind(("127.0.0.1", 0))
    port = s.getsockname()[1]
    s.close()
    return port


def files_under(top):
    ret = []
    for dp, dn, fn in os.walk(top):
        dn[:] = [d for d in dn if d != ".hist"]
        ret += [os.path.relpath(os.path.join(dp, f), top) for f in fn]
    return sorted(ret)


def main():
    py, top = sys.argv[1], sys.argv[2]
    T = tempfile.mkdtemp(prefix="fork-unplug-")
    port = free_port()
    for d in ("ssd/family", "disk/copyparty", "sd/mnt/hdd2"):
        os.makedirs(os.path.join(T, d))
    mnt = os.path.join(T, "sd/mnt/hdd2")
    conf = os.path.join(T, "c.conf")
    with open(conf, "w") as f:
        f.write(
            """[global]
  i: 127.0.0.1
  p: %(port)d
  usernames
  e2dsa
  no-fastboot
  wram
  ses-db: %(t)s/ses.db
  chpw-db: %(t)s/chpw.json
[groups]
  family: wayy, acid
[accounts]
  wayy: %(pw1)s
  acid: %(pw2)s
[/home/${u}]
  %(t)s/ssd/home/${u}
  accs:
    A: ${u}
[/home/${u}/hdd2]
  %(t)s/sd/mnt/hdd2/copyparty/home/${u}
  accs:
    A: ${u}
[/family]
  %(t)s/ssd/family
  accs:
    rwmd: @family
"""
            % {"t": T, "port": port, "pw1": PW["wayy"], "pw2": PW["acid"]}
        )

    disk = Disk(os.path.join(T, "disk"), mnt)
    cpp = Cpp(py, top, conf, os.path.join(T, "log.txt"), port)

    def get(url, user="wayy", **ka):
        return req("GET", url, user, port, **ka)

    def put(url, body, user="wayy"):
        return req("PUT", url, user, port, body=body)

    def home_dirs(user="wayy"):
        st, b, _ = get("home/%s/?ls" % (user,))
        return [d["href"] for d in json.loads(b)["dirs"]] if st == 200 else st

    def disks():
        st, b, _ = get("?disks&j")
        return [d["vols"] for d in json.loads(b)["disks"]] if st == 200 else st

    try:
        # ---- 1: the disk is in
        disk.plug()
        cpp.start()
        say(home_dirs() == ["hdd2/"], "plugged in: My files lists hdd2", home_dirs())
        st = put("home/wayy/hdd2/keep.txt", b"on the disk")[0]
        say(st == 201 and os.path.isfile(os.path.join(T, "disk/copyparty/home/wayy/keep.txt")),
            "plugged in: an upload to hdd2 lands on the disk", st)
        say(len(disks()) == 2, "plugged in: the storage bar's json has two disks", disks())

        # ---- 2: pulled out while copyparty runs
        disk.kill()
        say(cpp.alive(), "pulled out: copyparty keeps running")
        st, _, t = get("home/wayy/hdd2/keep.txt")
        say(st not in (200, "TIMEOUT", "ERR") and t < 5, "pulled out: a file on it is refused, quickly", (st, round(t, 1)))
        st, _, t = get("home/wayy/hdd2/?ls")
        say(st not in (200, "TIMEOUT", "ERR") and t < 5, "pulled out: opening its folder is refused, quickly", (st, round(t, 1)))
        st = put("home/wayy/hdd2/lost.txt", b"x")[0]
        say(st not in (201, "TIMEOUT", "ERR"), "pulled out: an upload to it is refused", st)
        t0 = time.time()
        while time.time() - t0 < 30 and home_dirs() != []:
            time.sleep(0.5)
        say(home_dirs() == [], "pulled out: My files stops listing hdd2 within 30 s", home_dirs())
        say(disks() == [["/family/", "/home/wayy/"]], "pulled out: the storage bar's json drops it", disks())
        st, b, _ = get("?disks")
        say(st == 200 and b"<li>/home/wayy/hdd2/</li>" in b, "pulled out: the disk space page lists it as not found", st)
        for url, body, rule in (
            ("home/wayy/after.txt", b"home still works", "pulled out: an upload to My files works"),
            ("family/after.txt", b"family still works", "pulled out: an upload to another volume works"),
        ):
            st = put(url, body)[0]
            st2, b2, _ = get(url)
            say(st == 201 and (st2, b2) == (200, body), rule, (st, st2))
        st, b, _ = get("home/acid/hdd2/?ls", "acid")
        say(st not in (200, "TIMEOUT", "ERR"), "pulled out: another account's folder on it is refused too", st)
        say(get("?h")[0] == 200 and get("home/acid/?ls", "acid")[0] == 200,
            "pulled out: the control panel and other accounts' My files answer")
        st = get("?reload=cfg")[0]
        time.sleep(3)
        say(st == 200 and cpp.alive() and home_dirs() == [] and put("home/wayy/reloaded.txt", b"r")[0] == 201,
            "pulled out: a config reload works and keeps it out", st)
        say(sorted(os.listdir(os.path.join(T, "ssd/home/wayy"))) == [".hist", "after.txt", "reloaded.txt"],
            "pulled out: nothing meant for hdd2 landed on the first disk",
            os.listdir(os.path.join(T, "ssd/home/wayy")))
        took = cpp.stop()
        say(took is not None and took < 10, "pulled out: copyparty stops on SIGTERM within 10 s (the replug restart)", took)
        disk.clean()

        # ---- 3: copyparty restarts while the disk is out (the private view: an
        # empty folder it can't write to)
        os.chmod(mnt, 0o555)
        cpp.start()
        say(home_dirs() == [], "restart while out: My files leaves hdd2 out")
        st = put("home/wayy/hdd2/x.txt", b"x")[0]
        say(st not in (201, "TIMEOUT", "ERR") and os.listdir(mnt) == [],
            "restart while out: an upload to it is refused, nothing is written in its place", (st, os.listdir(mnt)))
        say(put("home/wayy/out.txt", b"o")[0] == 201, "restart while out: My files works")
        cpp.stop()
        os.chmod(mnt, 0o755)

        # ---- 4: plugged back in, copyparty restarted (fork-disk-watch's ExecStart)
        disk.plug()
        cpp.start()
        say(home_dirs() == ["hdd2/"], "plugged back in: My files lists hdd2 again", home_dirs())
        say(get("home/wayy/hdd2/keep.txt")[:2] == (200, b"on the disk"), "plugged back in: the file from before is there")
        say(put("home/wayy/hdd2/new.txt", b"new")[0] == 201, "plugged back in: uploads to it work")
        say(len(disks()) == 2, "plugged back in: the storage bar's json has two disks", disks())
        say(files_under(os.path.join(T, "disk")) == ["copyparty/home/wayy/keep.txt", "copyparty/home/wayy/new.txt"],
            "plugged back in: the disk holds exactly what was uploaded to it", files_under(os.path.join(T, "disk")))
        cpp.stop()
    except Exception as ex:
        say(False, "the check itself", repr(ex))
    finally:
        if cpp.p and cpp.p.poll() is None:
            cpp.p.kill()
        disk.clean()
        try:
            os.chmod(mnt, 0o755)
        except OSError:
            pass
        if fails and os.environ.get("E2E_KEEP") != "1":
            shutil.copy(os.path.join(T, "log.txt"), os.path.join(tempfile.gettempdir(), "fork-unplug-check.log"))
            print("copyparty's log: %s" % (os.path.join(tempfile.gettempdir(), "fork-unplug-check.log"),))
        if os.environ.get("E2E_KEEP") == "1":
            print("kept: " + T)
        else:
            shutil.rmtree(T, ignore_errors=True)

    print("%d failed" % (len(fails),) if fails else "all passed")
    return 1 if fails else 0


if __name__ == "__main__":
    sys.exit(main())
