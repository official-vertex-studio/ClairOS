#!/bin/bash
# Fabrique les paquets clairos-desktop (application) et clairos-system (système).
#
# Variables :
#   CLAIROS_REPO_URL  adresse du dépôt de mises à jour (https://…/apt)  [obligatoire]
#   BUILD_SUFFIX      ajouté à la version (ex. "+b12") pour que chaque build soit plus récent
#   BINARY            binaire de l'application (défaut : desktop/src-tauri/target/release/clairos-desktop)
#   OUT               dossier de sortie (défaut : dist/debs)
set -euo pipefail
ROOT=$(cd "$(dirname "$0")/.." && pwd)
cd "$ROOT"

VERSION_BASE=$(tr -d ' \n' < VERSION)
VERSION="${VERSION_BASE}${BUILD_SUFFIX:-}"
BINARY=${BINARY:-desktop/src-tauri/target/release/clairos-desktop}
OUT=${OUT:-dist/debs}
REPO_URL=${CLAIROS_REPO_URL:?CLAIROS_REPO_URL est obligatoire (ex. https://monnom.github.io/clairos/apt)}
KEY_ASC=repo/keyring/clairos-archive-keyring.asc

case "$REPO_URL" in https://*) ;; *) echo "CLAIROS_REPO_URL doit commencer par https://" >&2; exit 1;; esac
[ -x "$BINARY" ] || { echo "Binaire introuvable : $BINARY (compilez d'abord l'application)" >&2; exit 1; }
[ -f "$KEY_ASC" ] || { echo "Clé publique introuvable : $KEY_ASC (voir tools/generate-signing-key.sh)" >&2; exit 1; }

WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT
mkdir -p "$OUT"

installed_size() { du -sk "$1" | cut -f1; }

# ---------- clairos-desktop ----------
D="$WORK/desktop"
install -D -m 755 "$BINARY" "$D/usr/bin/clairos-desktop"
install -D -m 644 desktop/src-tauri/icons/128x128.png "$D/usr/share/icons/hicolor/128x128/apps/clairos-desktop.png"
install -D -m 644 system/rootfs/usr/share/applications/com.gab9sg.clairos.desktop \
    "$D/usr/share/applications/com.gab9sg.clairos.desktop"
mkdir -p "$D/DEBIAN"
sed -e "s/@VERSION@/$VERSION/" -e "s/@SIZE@/$(installed_size "$D")/" system/desktop-control.in > "$D/DEBIAN/control"
dpkg-deb --root-owner-group --build "$D" "$OUT/clairos-desktop_${VERSION}_amd64.deb" >/dev/null

# ---------- clairos-system ----------
S="$WORK/system"
mkdir -p "$S"
cp -a system/rootfs/. "$S/"
# Ce fichier appartient au paquet clairos-desktop (deux paquets ne peuvent pas posséder le même fichier).
rm -f "$S/usr/share/applications/com.gab9sg.clairos.desktop"
chmod 755 "$S/usr/lib/clairos/clairos-session" "$S/usr/lib/clairos/admin-shell" "$S/usr/lib/clairos/clairos-update"
chmod 440 "$S/etc/sudoers.d/clairos"

echo "$VERSION_BASE" > "$S/etc/clairos/version"
echo "$REPO_URL" > "$S/etc/clairos/update-url"
chmod 644 "$S/etc/clairos/version" "$S/etc/clairos/update-url"

install -d "$S/usr/share/keyrings" "$S/etc/apt/sources.list.d"
gpg --batch --yes --dearmor -o "$S/usr/share/keyrings/clairos-archive-keyring.gpg" "$KEY_ASC"
chmod 644 "$S/usr/share/keyrings/clairos-archive-keyring.gpg"
cat > "$S/etc/apt/sources.list.d/clairos.sources" <<EOF
Types: deb
URIs: $REPO_URL
Suites: stable
Components: main
Architectures: amd64
Signed-By: /usr/share/keyrings/clairos-archive-keyring.gpg
EOF

mkdir -p "$S/DEBIAN"
sed -e "s/@VERSION@/$VERSION/" -e "s/@SIZE@/$(installed_size "$S")/" system/control.in > "$S/DEBIAN/control"
install -m 755 system/postinst system/prerm "$S/DEBIAN/"
cp system/conffiles "$S/DEBIAN/conffiles"
dpkg-deb --root-owner-group --build "$S" "$OUT/clairos-system_${VERSION}_all.deb" >/dev/null

# Garde-fou : deux paquets ne doivent jamais contenir le même fichier (sinon l'installation échoue).
dups=$(for deb in "$OUT/clairos-desktop_${VERSION}_amd64.deb" "$OUT/clairos-system_${VERSION}_all.deb"; do
           dpkg-deb -c "$deb" | awk '{print $NF}' | grep -v '/$'
       done | sort | uniq -d)
if [ -n "$dups" ]; then echo "ERREUR : fichiers présents dans les deux paquets :" >&2; echo "$dups" >&2; exit 1; fi

echo "Paquets créés dans $OUT :"
ls -1 "$OUT"
