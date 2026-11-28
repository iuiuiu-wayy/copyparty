#!/bin/bash
# fork-only, local-only: a disk pulled out while copyparty runs, against a real copyparty
# from this checkout (disk-space ticket 06, docs/adr/0004).
#   ./scripts/fork-unplug-check.sh          (E2E_KEEP=1 keeps the temp folder)
# The disk is a FUSE mount (sshfs talking to a local sftp-server over pipes), killed under
# copyparty as the WD's ntfs-3g dies when it is pulled out; no root, no real disk. Checks that
# copyparty keeps running and serving everything else, refuses that disk's folder quickly and
# drops it from My files, the storage bar and the disk space page, writes nothing in its place,
# stops promptly; that a restart with the disk out leaves it out; and that after plugging it
# back in and restarting (what fork-disk-watch does) its files are there. Not covered: a kernel
# file system (ntfs3) on a vanished USB device, which needs the hands-on check in
# contrib/fork-disk-watch/README.md. Prints one PASS/FAIL line per rule and exits non-zero on
# any failure. Never logs in to another machine. Not in the pre-commit hook: it needs FUSE.
set -u

top=$(cd "$(dirname "$0")/.." && pwd)
main=$(dirname "$(git -C "$top" rev-parse --path-format=absolute --git-common-dir)")
py=$main/.venv/bin/python

die() {
    echo "fork-unplug-check: $*" >&2
    exit 2
}

[ -x "$py" ] || die "no $py; create it as in CLAUDE.md (Commands)"
command -v sshfs >/dev/null || die "sshfs not found (apt install sshfs)"
command -v fusermount3 >/dev/null || die "fusermount3 not found (apt install fuse3)"
[ -x /usr/lib/openssh/sftp-server ] || die "no /usr/lib/openssh/sftp-server (apt install openssh-sftp-server)"
[ -w /dev/fuse ] || die "/dev/fuse is not writable"

exec python3 -I "$top/scripts/fork_unplug_check.py" "$py" "$top"
