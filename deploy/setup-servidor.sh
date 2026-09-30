#!/usr/bin/env bash
# PRIMERA VEZ en la EC2 (Amazon Linux 2023). Se corre UNA sola vez desde la raíz del repo:
#   bash deploy/setup-servidor.sh
# Antes: copia BACKEND/ELLAS/.env al servidor (scp) con CORS_ORIGENES=https://3-133-109-72.sslip.io
set -euo pipefail
cd "$(dirname "$0")/.."
DOMINIO=3-133-109-72.sslip.io

echo ">> Instalando Java 21, Nginx y Certbot"
sudo dnf install -y java-21-amazon-corretto-devel nginx certbot python3-certbot-nginx

echo ">> Usuario sin privilegios para el backend"
id ellas &>/dev/null || sudo useradd -r -s /usr/sbin/nologin ellas
sudo install -d -o ellas -g ellas /opt/ellas
sudo mkdir -p /var/www/ellas

echo ">> Archivo .env del backend (contraseñas) -> /opt/ellas/.env"
if [ -f BACKEND/ELLAS/.env ]; then
  sudo install -m 600 -o ellas -g ellas BACKEND/ELLAS/.env /opt/ellas/.env
else
  echo "FALTA BACKEND/ELLAS/.env: súbelo con scp y vuelve a correr este script"; exit 1
fi

echo ">> Servicio del backend y configuración de Nginx"
sudo cp deploy/ellas-backend.service /etc/systemd/system/
sudo cp deploy/nginx-ellas.conf /etc/nginx/conf.d/ellas.conf
sudo systemctl daemon-reload
sudo systemctl enable ellas-backend
sudo systemctl enable --now nginx

echo ">> Apagando el backend que se lanzó a mano con nohup (si sigue vivo)"
pkill -f "java -jar target/ELLAS" || true

echo ">> Primer deploy"
bash deploy/deploy.sh

echo ">> HTTPS (el navegador solo da la ubicación con https)"
sudo certbot --nginx -d "$DOMINIO" --non-interactive --agree-tos --register-unsafely-without-email --redirect

echo "Listo: https://$DOMINIO"
