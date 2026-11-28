# fork-disk-alert

Fork-only (disk-space ticket 04). Emails you when a disk is nearly full or missing, and once
when every disk is fine again. A Python 3 script (stdlib only) run by a systemd timer every
15 minutes, outside copyparty, so it still reports when copyparty is down.

- **missing**: nothing is mounted at the disk's mount point (unplugged, or it failed to mount at boot)
- **nearly full**: at least `threshold` percent used (default 90), counting the space only root
  may use as used, as `df`'s "Avail" does
- one mail lists every disk; it goes out when a disk becomes full or missing, again every
  `repeat-hours` (default 24) while any stays so, and once when all are fine again
- it reads only the mount table and `statvfs` of each mount point, so a sleeping HDD stays asleep

## Install (on the Pi)

The clone is at `/opt/copyparty`; the unit's `ExecStart` expects the script there.

1. **A Gmail app password** (free): in the Google account that sends the mail, turn on 2-Step
   Verification, then Security → App passwords → create one (name it e.g. "pi disk alert").
   Google shows 16 letters in groups of four; keep them for step 3, without the spaces.
2. **The config**:
   ```
   sudo mkdir -p /etc/fork-disk-alert
   sudo cp /opt/copyparty/contrib/fork-disk-alert/fork-disk-alert.example.conf /etc/fork-disk-alert/fork-disk-alert.conf
   sudo nano /etc/fork-disk-alert/fork-disk-alert.conf
   ```
   Fill in `user` (the Gmail address) and `to` (where alerts go); check `[disks]`.
3. **The password**, readable by root only (systemd hands it to the script):
   ```
   sudo install -m 600 -o root -g root /dev/null /etc/fork-disk-alert/smtp-password
   sudo nano /etc/fork-disk-alert/smtp-password
   ```
   One line: the app password.
4. **Look before sending anything**: this prints each disk and the mail it would send now
   (no password needed, nothing sent, no state kept):
   ```
   python3 /opt/copyparty/contrib/fork-disk-alert/fork-disk-alert.py --config /etc/fork-disk-alert/fork-disk-alert.conf --dry-run
   ```
5. **The units**, then a test mail run the way the timer runs it (a throwaway user, the password
   handed over by systemd):
   ```
   sudo cp /opt/copyparty/contrib/fork-disk-alert/fork-disk-alert.service /opt/copyparty/contrib/fork-disk-alert/fork-disk-alert.timer /etc/systemd/system/
   sudo systemctl daemon-reload
   sudo systemd-run --pipe --wait --collect -p DynamicUser=yes \
     -p LoadCredential=smtp-password:/etc/fork-disk-alert/smtp-password \
     /usr/bin/python3 -I /opt/copyparty/contrib/fork-disk-alert/fork-disk-alert.py \
     --config /etc/fork-disk-alert/fork-disk-alert.conf --test
   ```
   It prints `sent: ...` and a mail "test from fork-disk-alert" arrives (check spam the first
   time). Otherwise it prints why: `SMTPAuthenticationError` means a wrong address or app password.
6. **Start the timer**:
   ```
   sudo systemctl enable --now fork-disk-alert.timer
   systemctl list-timers fork-disk-alert.timer
   ```
   Each run logs one line per disk: `journalctl -u fork-disk-alert`.

After a `git pull` of the clone, copy the two unit files again only if they changed
(`git diff` names them); the script runs from the clone.

## Options

- `--dry-run`: print the disks and the mail it would send now; send nothing, keep no state
- `--test`: send a test mail with the current numbers now, whatever the state
- `--state FILE`, `--password-file FILE`: instead of systemd's `$STATE_DIRECTORY/state.json`
  and `$CREDENTIALS_DIRECTORY/smtp-password`

Other mail providers: `security = starttls` with port 587 is the other common setup.
