#!/bin/bash
# Image live uniquement : prépare le compte « user » AVANT l'écran de connexion.
# - mot de passe imposé : live
# - groupes nécessaires à l'ouverture automatique de session
# - sudo sans mot de passe (l'installateur Calamares doit tourner en root)
U=user
for _ in $(seq 1 30); do
    id "$U" >/dev/null 2>&1 && break
    sleep 1
done
if ! id "$U" >/dev/null 2>&1; then
    echo "clairos-live-setup : le compte $U n'existe pas."
    exit 0
fi
echo "$U:live" | chpasswd
for g in nopasswdlogin autologin sudo; do
    getent group "$g" >/dev/null || groupadd -r "$g"
    usermod -aG "$g" "$U"
done
install -d -m 755 /etc/sudoers.d
echo "$U ALL=(ALL) NOPASSWD: ALL" > /etc/sudoers.d/clairos-live
chmod 440 /etc/sudoers.d/clairos-live
visudo -cf /etc/sudoers.d/clairos-live >/dev/null || rm -f /etc/sudoers.d/clairos-live
echo "clairos-live-setup : compte $U prêt."
exit 0
