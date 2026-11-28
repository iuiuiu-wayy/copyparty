# fork-disk-watch

Fork-only (disk-space ticket 06, `docs/adr/0004`). Lets copyparty's extra disks come and go
while the Pi runs. The first disk (`/mnt/ssd`, every home folder) is not one of them: without it
copyparty stops, as before.

| what happens | what copyparty does |
|---|---|
| a disk is **pulled out** | keeps running, no restart; that disk's folder drops out of every My files within seconds, uploads to it are refused, the Storage bar and the disk space page show it gone, the disk alert mails within 15 minutes |
| it is **plugged back in** | the udev rule mounts it; copyparty restarts once to see it (startup takes as long as its first index scan); its folders are back |
| it is **removed safely** (below) | copyparty restarts once, without that disk, so it lets go of it and the file system is closed cleanly; then it can be pulled |

Pulling a disk out without the safe removal can leave NTFS "dirty" (see Recovery), and an
upload that was going to it is lost.

## Install (on the Pi)

Needs the disks' `/etc/fstab` lines and the copyparty drop-in `copyparty.service.d/disks.conf`
from `.scratch/deploy-pi/progress.md` step 7. The clone is at `/opt/copyparty`.

1. **The udev rule** (mount a disk when it is plugged in):
   ```
   sudo cp /opt/copyparty/contrib/fork-disk-watch/90-fork-disks.rules.example /etc/udev/rules.d/90-fork-disks.rules
   sudo nano /etc/udev/rules.d/90-fork-disks.rules
   ```
   Put each disk's `UUID=` from `/etc/fstab` in place of `<UUID-of-...>`. Then
   `sudo udevadm verify /etc/udev/rules.d/90-fork-disks.rules && sudo udevadm control --reload`.
2. **The watcher**, one instance per extra disk:
   ```
   sudo cp '/opt/copyparty/contrib/fork-disk-watch/fork-disk-watch@.service' /etc/systemd/system/
   sudo systemctl daemon-reload
   sudo systemctl enable fork-disk-watch@ssd2.service fork-disk-watch@hdd1.service fork-disk-watch@hdd2.service
   sudo systemctl start fork-disk-watch@ssd2.service fork-disk-watch@hdd1.service fork-disk-watch@hdd2.service
   ```
   Starting them restarts copyparty (once, or a few times in a row). `systemctl status 'fork-disk-watch@*'` shows each as
   `active (exited)` while its disk is mounted.

## Removing a disk safely

For `hdd1` (same for `ssd2`, `hdd2`):
```
sudo systemctl stop mnt-hdd1.mount
```
copyparty restarts without the disk. When it says `target is busy`, wait for copyparty to be
back (`systemctl is-active copyparty` says `active`) and run it again. Then check that nothing
holds the disk any more, and pull it:
```
sudo grep -l "$(readlink -f /dev/disk/by-uuid/<UUID-of-hdd1>)" /proc/[0-9]*/mountinfo
```
No output = free. For the WD (`ntfs-3g`), `pgrep -a ntfs-3g` also no longer lists `/mnt/hdd2`.

## Recovery

- **A disk doesn't come back** after plugging it in: `systemctl status mnt-hdd1.mount` says why.
  Mounting it by hand also restarts copyparty: `sudo systemctl start mnt-hdd1.mount`.
- **The first SSD (`/mnt/ssd`, every home folder) missing at boot**: copyparty needs it, so it
  doesn't start (the disk alert still mails `missing: ssd`). Plug it back in, then
  `sudo systemctl start copyparty` (the udev rule covers only the extra disks).
- **Used on a Windows PC while it was out**: shut Windows down fully (Shift + Shut down; Fast
  Startup leaves NTFS in a state Linux won't mount read-write). Files Windows added under
  `copyparty/` on `ssd2` or `hdd1` come back readable by root only (those mounts are
  `uid=0,gid=0,umask=077`), so copyparty can't open them until
  `sudo chown -R copyparty:copyparty <those files>`. The WD (`hdd2`) belongs to copyparty as a
  whole and needs nothing.
- **"dirty" / read-only after an unplug without safe removal**: Linux won't mount a dirty NTFS
  read-write. Best: plug it into a Windows PC and run `chkdsk X: /f`. On the Pi,
  `sudo ntfsfix -d /dev/disk/by-uuid/<UUID>` clears the flag after a few basic repairs (not a full
  check). Never mount with `force`.

## Hands-on check (once, after installing; and after kernel or copyparty updates)

The automated checks can't pull a real USB disk. Do this with a disk that holds nothing you'd
miss (a test file of your own in `My files/hdd1`), logged in as an everyday account in a browser.

1. **Pull it out** while the file browser is open on My files, without the safe removal.
   - [ ] copyparty keeps running (`systemctl is-active copyparty`), and other folders open
   - [ ] within a minute, reloading My files no longer shows `hdd1`, or opening it fails with an
         error; note which (the `ntfs3` disks may keep showing it from cache)
   - [ ] an upload to My files still works
   - [ ] the Storage bar (after a reload of the page) and `/?disks` show `hdd1` gone
   - [ ] `systemctl status mnt-hdd1.mount` is inactive; `fork-disk-watch@hdd1` inactive; copyparty
         did **not** restart (`systemctl show -p ActiveEnterTimestamp copyparty` unchanged)
   - [ ] within 15 minutes, the disk alert mail says `missing: hdd1`
2. **Plug it back in.**
   - [ ] within a minute it is mounted (`findmnt /mnt/hdd1`) and copyparty restarted once
   - [ ] if NTFS says dirty: Recovery above, then `sudo systemctl start mnt-hdd1.mount`
   - [ ] `hdd1` is back in My files with the test file; an upload into it works
   - [ ] note how long copyparty took to be back (`journalctl -u copyparty -n 50`)
   - [ ] the next disk alert run mails "disks back to normal"
3. **Safe removal**, then plug back in: the steps above; copyparty restarts once on removal and
   once on return, and the disk mounts read-write again without Recovery.
4. Repeat 1 and 2 with the WD (`hdd2`, `ntfs-3g`): it behaves differently inside (FUSE).
5. **Boot without it**: `sudo poweroff`, pull `hdd1` out, power the Pi on.
   - [ ] the Pi boots (up to ~15 s slower: the fstab line's device timeout) and copyparty is up
   - [ ] `hdd1` isn't in My files, an upload to My files works, `/?disks` lists `hdd1` as not found
   - [ ] nothing landed on the SD card: `sudo ls -A /mnt/hdd1` prints nothing
   - [ ] `systemctl is-active fork-disk-watch@hdd1` says `inactive`
   - [ ] about 5 minutes after boot, the disk alert mails `missing: hdd1`
   - [ ] plug it in: it mounts, copyparty restarts once, `hdd1` is back with its files
