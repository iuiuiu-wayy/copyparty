# Copyparty (personal fork)

A self-hosted file server for a household. Each account holder has their own space, and can give other people access to parts of it without the admin editing the config.

## People

**Admin**:
The person who runs the server and edits its config: who has an account, which groups exist, and which volumes exist.
_Avoid_: root, superuser

**Admin account**:
The account the admin logs in with to do admin work (the control panel, other people's folders), kept apart from their everyday account.
_Avoid_: admin (on its own, when meaning the account)

**Account holder**:
Someone with a username and password on the server.
_Avoid_: user (ambiguous), member

**Guest**:
Someone with no account. They only reach what a share link opens for them.
_Avoid_: non-user, anonymous user, visitor

**Group**:
A named set of account holders, defined by the admin (e.g. `@family`).

## Where people connect from

**Inside**:
Connecting from the home network. Account holders can log in and use everything their accounts allow.
_Avoid_: local, LAN (as a name for this), internal

**Outside**:
Connecting from anywhere that is not Inside. Guests reach only share links; account holders can also log in and use what their accounts allow, except the admin account, which logs in only Inside.
_Avoid_: public, remote, internet side

## Spaces

**Volume**:
A folder the admin has mounted in the config, with permissions per account holder or group.
_Avoid_: mount, share (when meaning a volume)

**Home folder**:
An account holder's own volume, created for each account (`/home/<name>`).
_Avoid_: personal folder, user dir

**Shared with me**:
Every space an account holder can open that someone else gave them: grants they are a recipient of, and volumes the admin opened to them or to one of their groups. Their own home folder is not in it, and neither are share links, which are opened by their URL.
_Avoid_: shared folders, shared drives

## Giving access

**Owner**:
The account holder who created a share link or a grant. They can only give rights they hold themselves.

**Share link**:
A secret URL that opens a folder or a set of files to anyone who has it, optionally guarded by a password and an expiry.
_Avoid_: share (on its own), public link

**Dead link**:
A share link that no longer opens anything: it expired, was revoked, its owner lost the rights it gives, or the key never existed. Everyone who opens it is told the same thing, that it expired or doesn't exist, whatever the cause. It comes back if its owner regains the rights.
_Avoid_: broken link, expired link (expiry is only one cause)

**Grant**:
Access to a folder, given by its owner to a named account holder or group, without any secret link.
_Avoid_: share (on its own), user share, permission

**Recipient**:
The account holder or group a grant is given to.
_Avoid_: grantee, target

**Source folder**:
The folder a grant opens, identified by its path rather than its contents, so renaming it breaks the grant.

**Broken grant**:
A grant whose source folder no longer exists at its path. Recipients don't see it; the owner can still see and revoke it.

**Suspended grant**:
A grant whose owner no longer holds the rights it gives. Recipients don't see it, and it comes back if the owner regains those rights.
_Avoid_: disabled, expired (expiry is a separate, final end)
