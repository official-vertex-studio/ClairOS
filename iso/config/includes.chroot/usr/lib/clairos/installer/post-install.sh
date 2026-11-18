#!/bin/bash
# Exécuté par Calamares DANS le système installé (chroot), juste après la création de l'utilisateur.
log() { echo "[clairos-post-install] $*"; }

USER_NAME=$(getent passwd 1000 | cut -d: -f1)
if [ -z "$USER_NAME" ]; then
    log "Aucun utilisateur (uid 1000) trouvé."
    exit 1
fi
log "Utilisateur : $USER_NAME"

# Ouverture automatique de la session ClairOS (aucun mot de passe à la connexion).
install -d /etc/lightdm/lightdm.conf.d
cat > /etc/lightdm/lightdm.conf.d/60-clairos-autologin.conf <<EOF
[Seat:*]
autologin-user=$USER_NAME
autologin-user-timeout=0
autologin-session=clairos
user-session=clairos
EOF

# Retire ce qui ne servait qu'à l'image live.
rm -f /etc/lightdm/lightdm.conf.d/90-clairos-live.conf /usr/share/xsessions/clairos-installer.desktop
rm -rf /etc/calamares
rm -f /etc/systemd/system/clairos-live-setup.service /etc/systemd/system/multi-user.target.wants/clairos-live-setup.service /usr/lib/clairos/installer/live-setup.sh

# Droits d'administration de l'application (terminal, mises à jour).
getent group clairos >/dev/null || addgroup --system clairos
usermod -aG clairos "$USER_NAME"
for g in nopasswdlogin autologin; do
    getent group "$g" >/dev/null || addgroup --system "$g"
    usermod -aG "$g" "$USER_NAME"
done

mkdir -p /etc/clairos
date -u +%FT%TZ > /etc/clairos/installed
log "Terminé."
exit 0
