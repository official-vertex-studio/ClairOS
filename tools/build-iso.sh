#!/bin/bash
# Fabrique l'image ISO de ClairOS avec live-build.
#   sudo tools/build-iso.sh [dossier des .deb] [dossier de sortie]
# À lancer sur Debian 12/13 en root, ou dans un conteneur « debian:trixie --privileged »
# (c'est ce que fait le workflow GitHub). Nécessite Internet (miroirs Debian).
# DRY_RUN=1 : prépare tout mais ne lance pas lb build (pour vérifier la configuration).
set -euo pipefail
ROOT=$(cd "$(dirname "$0")/.." && pwd)
DEBS=$(realpath "${1:-$ROOT/dist/debs}")
OUT=$(realpath -m "${2:-$ROOT/dist}")
WORK=${WORK:-/tmp/clairos-iso-build}
VERSION=$(tr -d ' \n' < "$ROOT/VERSION")

[ "$(id -u)" -eq 0 ] || { echo "Lancez ce script en root (sudo)." >&2; exit 1; }
ls "$DEBS"/clairos-system_*.deb "$DEBS"/clairos-desktop_*.deb >/dev/null \
    || { echo "Paquets introuvables dans $DEBS (lancez d'abord tools/build-debs.sh)." >&2; exit 1; }
if [ -z "${DRY_RUN:-}" ]; then
    command -v lb >/dev/null || { echo "live-build n'est pas installé (apt install live-build)." >&2; exit 1; }
fi

rm -rf "$WORK"
mkdir -p "$WORK" "$OUT"
cp -a "$ROOT/iso/." "$WORK/"
mkdir -p "$WORK/config/packages.chroot"
cp "$DEBS"/clairos-system_*.deb "$DEBS"/clairos-desktop_*.deb "$WORK/config/packages.chroot/"

# Les dépendances des paquets ClairOS sont ajoutées à la liste d'installation : ainsi elles
# sont déjà présentes quand les .deb locaux sont installés (et la liste suit toujours le paquet).
{
    echo "# Généré par build-iso.sh à partir des dépendances de clairos-system et clairos-desktop"
    for deb in "$WORK"/config/packages.chroot/*.deb; do
        dpkg-deb -f "$deb" Depends | tr ',' '\n' | sed -e 's/|.*//' -e 's/([^)]*)//g' -e 's/[[:space:]]//g' | grep -v '^$'
    done | grep -v '^clairos-' | sort -u
} > "$WORK/config/package-lists/clairos-deps.list.chroot"

sed -i "s/@VERSION@/$VERSION/g" "$WORK/config/includes.chroot/etc/calamares/branding/clairos/branding.desc"
find "$WORK/config/hooks" "$WORK/auto" "$WORK/config/includes.chroot/usr/lib/clairos" -type f -exec chmod +x {} +

cd "$WORK"
if [ -n "${DRY_RUN:-}" ]; then
    echo "DRY_RUN : configuration prête dans $WORK"
    cat config/package-lists/clairos-deps.list.chroot
    exit 0
fi

lb clean --purge >/dev/null 2>&1 || true
lb config
lb build

ISO=$(ls -1 ./*.iso | head -n1)
FINAL="$OUT/clairos-${VERSION}-amd64.iso"
mv "$ISO" "$FINAL"
( cd "$OUT" && sha256sum "$(basename "$FINAL")" > "$(basename "$FINAL").sha256" )
echo "ISO prête : $FINAL"
ls -lh "$FINAL"
