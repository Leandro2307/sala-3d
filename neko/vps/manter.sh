#!/bin/sh
# Roda a cada minuto (cron /etc/cron.d/sala3d-navegador). Tudo idempotente.
C=sala3d-navegador

# 1) O Caddy do catálogo precisa estar na rede do navegador para fazer o HTTPS dele. Se o
#    container do Caddy for recriado (deploy do catálogo), isto religa. A prioridade de
#    gateway negativa garante que a saída para a internet do Caddy continua pela rede dele.
docker network connect --gw-priority -100 --ip 172.30.99.2 navegador catalogo-caddy >/dev/null 2>&1

# 2) Modo "ocioso" do Linux para o navegador: ele só usa CPU que ninguém mais quer, e a API
#    do catálogo o interrompe na hora. Medido com vídeo ao vivo: sem isto o pior tempo de
#    resposta do catálogo ia a ~250 ms; com isto fica igual a sem vídeo (~90 ms).
#    O Docker não tem opção para isso, e o cgroup muda a cada vez que o container reinicia.
id=$(docker inspect -f '{{.Id}}' $C 2>/dev/null) || exit 0
cg=/sys/fs/cgroup/system.slice/docker-$id.scope
[ -f $cg/cpu.idle ] && [ "$(cat $cg/cpu.idle)" != 1 ] && echo 1 > $cg/cpu.idle
exit 0
