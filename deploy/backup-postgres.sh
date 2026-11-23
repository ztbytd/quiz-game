#!/bin/sh
set -eu
umask 077
backup_root=/var/backups/zhixu
test -d "$backup_root"
backup_path="$backup_root/zhixu-$(date -u +%Y%m%dT%H%M%SZ)-$$.dump"
test ! -e "$backup_path"
test ! -e "$backup_path.partial"
runuser -u postgres -- pg_dump --format=custom --dbname=zhixu > "$backup_path.partial"
test -s "$backup_path.partial"
mv -- "$backup_path.partial" "$backup_path"
printf 'Created PostgreSQL backup: %s\n' "$backup_path"
