#!/bin/bash
# Crée la clé qui signe les mises à jour de ClairOS (à faire UNE SEULE FOIS).
#  - clé publique  -> repo/keyring/clairos-archive-keyring.asc   (à enregistrer dans git)
#  - clé privée    -> clairos-private-key.b64                      (SECRET : à coller dans GitHub, ne jamais publier)
# Si vous perdez la clé privée, les ordinateurs déjà installés n'accepteront plus vos mises à jour.
set -euo pipefail
ROOT=$(cd "$(dirname "$0")/.." && pwd)
cd "$ROOT"
mkdir -p repo/keyring
[ -f repo/keyring/clairos-archive-keyring.asc ] && { echo "Une clé existe déjà (repo/keyring). Supprimez-la d'abord si vous voulez vraiment en changer." >&2; exit 1; }

export GNUPGHOME
GNUPGHOME=$(mktemp -d)
trap 'rm -rf "$GNUPGHOME"' EXIT
chmod 700 "$GNUPGHOME"

gpg --batch --pinentry-mode loopback --passphrase '' \
    --quick-generate-key "ClairOS Archive Signing Key <clairos@users.noreply.github.com>" rsa4096 sign never
gpg --armor --export > repo/keyring/clairos-archive-keyring.asc
gpg --armor --export-secret-keys | base64 -w0 > clairos-private-key.b64
chmod 600 clairos-private-key.b64

cat <<EOF

Terminé.
1. Ajoutez/commitez : repo/keyring/clairos-archive-keyring.asc
2. Dans GitHub : Settings > Secrets and variables > Actions > New repository secret
   Nom   : CLAIROS_GPG_PRIVATE_KEY
   Valeur: tout le contenu du fichier clairos-private-key.b64
3. Gardez une copie de clairos-private-key.b64 en lieu sûr, puis supprimez-la d'ici.
EOF
