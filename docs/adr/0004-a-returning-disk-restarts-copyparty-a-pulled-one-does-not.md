# A disk coming back restarts copyparty; a disk pulled out does not

Account holders have folders on the Pi's extra disks, and a disk may be pulled out while copyparty runs. Pulled out, copyparty keeps running as it is: upstream already leaves a folder it can no longer read out of listings, refuses it, and writes nothing in its place (checked by `scripts/fork-unplug-check.sh` with a FUSE disk killed mid-run). A disk that comes back, or one being removed safely, restarts copyparty once (`contrib/fork-disk-watch`, a systemd unit per disk), because the service's private view of the disks (`TemporaryFileSystem=` + `BindPaths=`, which keeps copyparty to each disk's `copyparty` folder) is fixed when it starts: a disk mounted later is invisible to it, and it holds an open disk until it restarts.

## Considered Options

- **Restart on every change, pulled out too**: rejected. A restart re-indexes every volume before listening (`no-fastboot`), so everyone would lose copyparty for a while to tidy up a folder upstream already hides.
- **Detect a dead disk inside copyparty and re-attach it live**: rejected. It needs edits in upstream's listing and reload code, and how a kernel file system (ntfs3) behaves once its USB device is gone depends on the kernel; the private view would still need a restart to see the disk again.
- **Drop the private view, so a remounted disk shows up by itself**: rejected. It is what gives copyparty only the `copyparty` folder of the WD, whose `ntfs-3g` mount belongs to copyparty as a whole (the user's rule of 2026-11-27).

## Consequences

- Plugging a disk back in costs everyone one copyparty restart; uploads in progress pause and resume.
- Until then, and after a pull-out on an `ntfs3` disk that keeps answering from cache, a folder on that disk may still show and fail when opened; the hands-on check in `contrib/fork-disk-watch/README.md` records which.
