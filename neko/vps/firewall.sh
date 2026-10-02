#!/bin/sh
# Isola o navegador compartilhado. Qualquer pessoa da sala digita endereços nele, então ele
# pode sair para a internet, mas não alcança:
#   - a própria VPS (SSH, portas locais) — exceto o Caddy chamando o abrir.py (atalhos);
#   - as redes do Docker (a API do catálogo), endereços internos e de metadados do provedor.
# Idempotente: refaz as cadeias do zero. O systemd roda no boot, depois do Docker
# (sala3d-navegador-firewall.service). "firewall.sh remover" tira tudo.
set -e
REDE=172.30.99.0/24
GW=172.30.99.1
CADDY=172.30.99.2

limpar() {
  while iptables -D DOCKER-USER -s $REDE -j SALA3D-NAV 2>/dev/null; do :; done
  while iptables -D INPUT -s $REDE -j SALA3D-NAV-IN 2>/dev/null; do :; done
  for c in SALA3D-NAV SALA3D-NAV-IN; do
    iptables -F $c 2>/dev/null || true
    iptables -X $c 2>/dev/null || true
  done
}

limpar
[ "$1" = remover ] && exit 0

# saindo da rede do navegador para fora da VPS (passa pelo Docker: cadeia DOCKER-USER)
iptables -N SALA3D-NAV
iptables -A SALA3D-NAV -m conntrack --ctstate ESTABLISHED,RELATED -j RETURN
for d in 10.0.0.0/8 172.16.0.0/12 192.168.0.0/16 169.254.0.0/16 100.64.0.0/10 127.0.0.0/8; do
  iptables -A SALA3D-NAV -d $d -j DROP
done
iptables -I DOCKER-USER -s $REDE -j SALA3D-NAV

# da rede do navegador para a própria VPS: só o Caddy, só na porta dos atalhos
iptables -N SALA3D-NAV-IN
iptables -A SALA3D-NAV-IN -m conntrack --ctstate ESTABLISHED,RELATED -j RETURN
iptables -A SALA3D-NAV-IN -s $CADDY -d $GW -p tcp --dport 8090 -j ACCEPT
iptables -A SALA3D-NAV-IN -j DROP
iptables -I INPUT -s $REDE -j SALA3D-NAV-IN
