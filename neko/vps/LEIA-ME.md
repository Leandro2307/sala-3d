# Navegador compartilhado na VPS

Roda na VPS 103.199.185.217, a mesma do Catálogo Atendro, sem atrapalhar o catálogo:

- **CPU**: modo ocioso do Linux (`cpu.idle`, aplicado pelo `manter.sh`) e teto de 0,9 núcleo.
  O navegador só usa o processador que a API não quer. Medido com vídeo ao vivo tocando: o
  catálogo responde no mesmo tempo de quando não tem vídeo.
- **Memória**: teto de 1,8 GB. Se faltar memória, o kernel derruba o navegador primeiro.
- **Rede**: `firewall.sh` deixa o navegador sair para a internet, mas bloqueia a VPS (SSH,
  portas), a API do catálogo, as redes do Docker e os endereços internos.
- **HTTPS**: um bloco a mais no fim de `/opt/catalogo/deploy/Caddyfile`
  (`navegador.103-199-185-217.sslip.io`). O bloco do catálogo não foi mexido.

## O que fica onde

| VPS | Para quê |
| --- | --- |
| `/opt/sala3d-navegador/docker-compose.yml` | o container `sala3d-navegador` (neko + Firefox) |
| `/opt/sala3d-navegador/.env` | senhas e token (só root lê) |
| `/opt/sala3d-navegador/perfil/` | perfil do Firefox: os logins (cookies) ficam aqui |
| `firewall.sh` + `sala3d-navegador-firewall.service` | isolamento de rede, refeito a cada boot |
| `abrir.py` + `sala3d-abrir.service` | atalhos (ícone do YouTube etc.), chamados pelo Render |
| `manter.sh` + `/etc/cron.d/sala3d-navegador` | a cada minuto: Caddy ligado à rede do navegador e CPU ociosa |

No Render vão `BROWSER_URL`, `BROWSER_PASSWORD` e `BROWSER_OPEN_TOKEN`. Os valores estão no
`.env` da VPS e nunca vão para o repositório.

## Comandos úteis (na VPS, como root)

```sh
cd /opt/sala3d-navegador
docker compose restart              # reinicia o navegador (o login continua)
docker compose logs -f --tail 50    # ver o que está acontecendo
docker stats sala3d-navegador       # CPU e memória agora
```

**Se reenviar a pasta `deploy/` do catálogo**, o bloco do navegador some do Caddyfile. Para
religar, cole o conteúdo de `Caddyfile.navegador` de volta no fim do arquivo e rode:

```sh
docker exec catalogo-caddy caddy reload --config /etc/caddy/Caddyfile --adapter caddyfile
```

## Remover tudo

```sh
cd /opt/sala3d-navegador
rm /etc/cron.d/sala3d-navegador
systemctl disable --now sala3d-abrir sala3d-navegador-firewall
rm /etc/systemd/system/sala3d-abrir.service /etc/systemd/system/sala3d-navegador-firewall.service
docker network disconnect navegador catalogo-caddy
docker compose down
# depois apague o bloco "Sala 3D" do fim de /opt/catalogo/deploy/Caddyfile e recarregue o Caddy
```
