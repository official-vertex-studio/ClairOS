# shellcheck shell=bash
[ -r /etc/bash.bashrc ] && . /etc/bash.bashrc
[ -r /root/.bashrc ] && . /root/.bashrc
PS1='\[\e[1;31m\]root@\h\[\e[0m\]:\w# '
echo
echo "  ClairOS - terminal administrateur (root)"
echo "  Mises à jour : apt update && apt full-upgrade"
echo "  Réseau       : nmcli device status"
echo "  Journal      : journalctl -b -p warning"
echo "  Quitter      : exit"
echo
