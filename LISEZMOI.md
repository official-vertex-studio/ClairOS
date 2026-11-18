# ClairOS — le système complet

ClairOS est un vrai système Linux (base **Debian 13 « trixie »**) qui démarre directement sur ton bureau ClairOS :
**pas de barre des tâches, pas de menu, pas d'autre fenêtre** — l'application *est* le système.

Ce dossier contient tout pour fabriquer :

* une **image ISO** (`clairos-X.Y.Z-amd64.iso`) à mettre sur une clé USB avec **Rufus**, **Ventoy**, balenaEtcher ou `dd` ;
* un **installateur graphique** (Calamares) : langue, **fuseau horaire**, **clavier AZERTY / QWERTY / autres**, disque, compte ;
* des **mises à jour par Internet, comme Ubuntu** : correctifs de sécurité automatiques + tes nouvelles versions de ClairOS, via un dépôt `apt` signé.

> ⚠️ **État honnête du projet** : le code, les paquets, le dépôt de mises à jour, la session plein écran et la configuration de l'installateur ont été testés. **L'ISO elle-même n'a pas pu être fabriquée ni démarrée sur un vrai PC par moi** (cela demande des droits et des téléchargements Debian impossibles dans mon environnement). C'est le workflow GitHub fourni qui la fabrique. Lors du premier essai, un petit réglage peut être nécessaire : envoie-moi le journal de l'étape en erreur et on corrige. Teste **toujours dans une machine virtuelle (VirtualBox/VMware) avant** de l'installer sur l'ordinateur de ta grand-mère.

---

## 1. Fabriquer l'ISO (sans rien installer sur ton PC)

Tu n'as besoin que d'un compte GitHub (gratuit). Le dépôt doit être **public** (c'est ce qui permet d'héberger gratuitement les mises à jour).

### Étape 1 — Mettre le projet sur GitHub
1. Crée un dépôt public (ex. `clairos`) et envoie-y **tout le contenu de ce dossier**.
2. Dans **Settings → Pages → Build and deployment → Source**, choisis **GitHub Actions**.

### Étape 2 — Créer la clé qui signe les mises à jour (une seule fois)
Ça demande un terminal Linux. Le plus simple sans rien installer : sur GitHub, bouton vert **Code → Codespaces → Create codespace**, puis dans le terminal :

```bash
bash tools/generate-signing-key.sh
```

Le script crée :
* `repo/keyring/clairos-archive-keyring.asc` → **à enregistrer dans le dépôt** (commit) ;
* `clairos-private-key.b64` → **SECRET**. Dans GitHub : **Settings → Secrets and variables → Actions → New repository secret**, nom `CLAIROS_GPG_PRIVATE_KEY`, valeur = tout le contenu du fichier. Garde une copie en lieu sûr (clé USB, gestionnaire de mots de passe) puis supprime-le du Codespace.

> Cette clé est ce qui empêche quiconque d'envoyer de faux « updates » à l'ordinateur de ta grand-mère. **Si tu la perds**, les ordinateurs déjà installés n'accepteront plus tes mises à jour. Ne la publie jamais.

### Étape 3 — Lancer la fabrication
Onglet **Actions → Construire ClairOS → Run workflow**. Compte ~25 à 45 minutes la première fois.
Le workflow :
1. compile l'application et fabrique les paquets `.deb` ;
2. publie le **dépôt de mises à jour** sur `https://TON-PSEUDO.github.io/clairos/apt` ;
3. fabrique l'**ISO** (téléchargeable dans *Artifacts → clairos-iso*, ou dans **Releases** si tu as créé une étiquette `v0.1.0`).

---

## 2. Mettre l'ISO sur une clé USB

* **Rufus** : choisis l'ISO, schéma de partition *GPT* (PC récent/UEFI) ou *MBR* (vieux PC), et accepte le mode **« Image ISO »** (ou *DD* si Rufus le propose et que ça ne démarre pas).
* **Ventoy** : copie simplement le fichier `.iso` sur la clé Ventoy.
* **Secure Boot** : l'image d'installation (live) n'est pas signée par Microsoft. Si l'ordinateur ne démarre pas sur la clé, désactive *Secure Boot* dans le BIOS le temps de l'installation. (Le système installé embarque `shim-signed` / `grub-efi-amd64-signed`.)

## 3. Installer

1. Démarre sur la clé. L'installateur ClairOS s'ouvre en plein écran (en français).
2. **Langue → Localisation (fuseau horaire) → Clavier (AZERTY, QWERTY…) → Disque → Utilisateur → Installer.**
3. Si tu **fermes** l'installateur sans installer, le bureau ClairOS démarre en **mode essai** (rien n'est modifié sur le PC).
4. Redémarre, retire la clé : ClairOS s'ouvre tout seul, sans mot de passe.

**Premier démarrage :** ouvre **Administration** et crée le **mot de passe administrateur** (écran « Créer le mot de passe »).

---

## 4. Ce que tu trouves dans l'Administration

| Page | Rôle |
|---|---|
| **Réseau** | Wi-Fi / Ethernet |
| **Mises à jour** | Vérifier, **installer**, suivre l'avancement, redémarrer si besoin |
| **Terminal (CMD)** | Un **vrai terminal root** (voir ci-dessous) |
| Galerie, Personnalisation, Applications, Sécurité, Alimentation | comme avant |

### Terminal (CMD) administrateur
* Visible uniquement après le mot de passe administrateur ; se **ferme tout seul** au verrouillage, à la sortie de l'administration ou après 10 min d'inactivité.
* Ouvre un shell **root** (`root@…:~#`). Exemples : `apt update && apt full-upgrade`, `nmcli device status`, `journalctl -b -p warning`.
* **Comment c'est protégé (important de le savoir)** : l'application tourne avec le compte de la grand-mère, qui appartient au groupe `clairos`. Ce groupe a le droit (fichier `/etc/sudoers.d/clairos`) de lancer **uniquement** trois outils en root sans mot de passe : le shell admin et les deux commandes de mise à jour. La porte d'entrée est donc **le mot de passe administrateur de l'application**. Conséquence : quelqu'un qui connaît le mot de passe du compte Linux et ouvre une console (Ctrl+Alt+F2) a aussi accès à root. Choisis donc un mot de passe de compte solide.

---

## 5. Les mises à jour, comment ça marche

* Chaque jour, le système cherche et installe **tout seul** les correctifs de sécurité Debian **et** tes versions de ClairOS (`unattended-upgrades`). Il ne redémarre jamais seul (réglable dans `/etc/apt/apt.conf.d/52clairos-unattended-upgrades`).
* Dans **Administration → Mises à jour**, on peut vérifier et installer tout de suite.
* **Pour publier une nouvelle version :** modifie ton code, change le numéro dans le fichier `VERSION` (ex. `0.2.0`), puis envoie sur GitHub (*push*). Le workflow fabrique les paquets et republie le dépôt ; tous les ClairOS installés se mettent à jour par Internet. Pas besoin de refaire une ISO (sauf pour de nouvelles installations).

## 6. Structure du dossier

```
desktop/     ton application (Tauri + React), + terminal admin + moteur de mise à jour
system/      paquet « clairos-system » : session plein écran, sudoers, apt, mises à jour auto
iso/         configuration live-build (liste de paquets, installateur Calamares, marque)
tools/       build-debs.sh · build-apt-repo.sh · build-iso.sh · generate-signing-key.sh
.github/     workflow qui fabrique tout
VERSION      numéro de version de ClairOS
```

Fabriquer en local (Debian 13 ou conteneur `debian:trixie --privileged`) : `tools/build-debs.sh`, puis `sudo tools/build-iso.sh`.

## 7. Réglages utiles

* **Écran blanc ou lent sur un vieux PC** : édite `/etc/clairos/session.env` (instructions dans le fichier).
* **Quitter Firefox** : Firefox garde une barre de titre avec un bouton de fermeture ; `Alt+F4` ferme n'importe quelle fenêtre.
* **« Fermer ClairOS »** dans l'Administration *redémarre* simplement l'application (le système la relance toujours : l'écran n'est jamais vide).
* **Journaux de mise à jour** : `/var/log/clairos/update.log`.

## 8. Limites connues / pistes

* L'ISO n'est **pas encore testée sur matériel réel** (voir l'avertissement en haut).
* PC 64 bits uniquement (pas de 32 bits ni d'ARM).
* Pas encore : imprimante (CUPS), Bluetooth, écran de démarrage animé (Plymouth), traduction de l'appli au-delà du français.
* Les icônes viennent du modèle Tauri : remplace `desktop/src-tauri/icons/` par ton logo.
