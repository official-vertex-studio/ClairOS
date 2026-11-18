#!/bin/bash
# Construit et signe le dépôt apt de ClairOS à partir des .deb.
#   tools/build-apt-repo.sh <dossier des .deb> <dossier de sortie>
# Variables : CLAIROS_GPG_PRIVATE_KEY_FILE (clé privée base64, défaut : clairos-private-key.b64)
#             GNUPGHOME déjà initialisé avec la clé ? alors rien d'autre à fournir.
set -euo pipefail
DEBS=${1:?dossier des .deb}
OUT=${2:?dossier de sortie}
SUITE=stable
[ -n "${CLAIROS_GPG_PRIVATE_KEY_FILE:-}" ] && CLAIROS_GPG_PRIVATE_KEY_FILE=$(realpath "$CLAIROS_GPG_PRIVATE_KEY_FILE")
OUT=$(realpath -m "$OUT"); DEBS=$(realpath "$DEBS")

REPO="$OUT/apt"
rm -rf "$REPO"
mkdir -p "$REPO/pool/main" "$REPO/dists/$SUITE/main/binary-amd64"
cp "$DEBS"/*.deb "$REPO/pool/main/"

cd "$REPO"
apt-ftparchive packages pool/main > "dists/$SUITE/main/binary-amd64/Packages"
gzip -9kf "dists/$SUITE/main/binary-amd64/Packages"
xz -9kf "dists/$SUITE/main/binary-amd64/Packages"

apt-ftparchive \
    -o APT::FTPArchive::Release::Origin=ClairOS \
    -o APT::FTPArchive::Release::Label=ClairOS \
    -o APT::FTPArchive::Release::Suite=$SUITE \
    -o APT::FTPArchive::Release::Codename=$SUITE \
    -o APT::FTPArchive::Release::Architectures=amd64 \
    -o APT::FTPArchive::Release::Components=main \
    -o "APT::FTPArchive::Release::Description=Mises a jour de ClairOS" \
    release "dists/$SUITE" > "dists/$SUITE/Release"

if [ -n "${CLAIROS_GPG_PRIVATE_KEY_FILE:-}" ]; then
    export GNUPGHOME
    GNUPGHOME=$(mktemp -d); chmod 700 "$GNUPGHOME"
    trap 'rm -rf "$GNUPGHOME"' EXIT
    base64 -d "$CLAIROS_GPG_PRIVATE_KEY_FILE" | gpg --batch --import 2>/dev/null
fi
KEYID=$(gpg --batch --list-secret-keys --with-colons | awk -F: '/^fpr:/ {print $10; exit}')
[ -n "$KEYID" ] || { echo "Aucune clé privée disponible pour signer le dépôt." >&2; exit 1; }

gpg --batch --yes --pinentry-mode loopback --passphrase '' -u "$KEYID" \
    --clearsign -o "dists/$SUITE/InRelease" "dists/$SUITE/Release"
gpg --batch --yes --pinentry-mode loopback --passphrase '' -u "$KEYID" \
    -abs -o "dists/$SUITE/Release.gpg" "dists/$SUITE/Release"

echo "Dépôt signé créé dans $REPO"
