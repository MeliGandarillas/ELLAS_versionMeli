#!/usr/bin/env bash
# Cada vez que subas cambios al servidor, desde la raíz del proyecto en la EC2:
#   bash deploy/deploy.sh          (usa los archivos que ya subiste con scp)
#   bash deploy/deploy.sh --git    (además baja antes los cambios de GitHub)
# Compila backend y frontend, y reinicia todo.
set -euo pipefail
REPO="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO"

if [ "${1:-}" = "--git" ]; then
  echo ">> Bajando cambios de GitHub"
  git pull --ff-only
fi

echo ">> Backend: compilando"
cd "$REPO/BACKEND/ELLAS"
if [ -f mvnw ]; then chmod +x mvnw; ./mvnw -q package -DskipTests; else mvn -q package -DskipTests; fi
sudo install -o ellas -g ellas target/ELLAS-0.0.1-SNAPSHOT.jar /opt/ellas/ellas.jar
sudo systemctl restart ellas-backend

echo ">> Frontend"
cd "$REPO/FRONTEND"
NODE_MAYOR=$(node -p "process.versions.node.split('.')[0]" 2>/dev/null || echo 0)
if [ "$NODE_MAYOR" -ge 20 ]; then
  npm ci --no-audit --no-fund
  npm run build
else
  echo "   Node 20+ no está instalado: se usa la carpeta dist/ que subiste compilada desde tu laptop"
  [ -f dist/index.html ] || { echo "   FALTA FRONTEND/dist: corre 'npm run build' en tu laptop y súbela con scp"; exit 1; }
fi
sudo rm -rf /var/www/ellas/*
sudo cp -r dist/* /var/www/ellas/
sudo nginx -t && sudo systemctl reload nginx

echo ">> Esperando a que arranque el backend"
for i in $(seq 1 30); do
  if curl -fs http://127.0.0.1:8080/actuator/health >/dev/null; then
    echo "Deploy listo ✔  (logs: sudo journalctl -u ellas-backend -f)"; exit 0
  fi
  sleep 2
done
echo "El backend no respondió. Revisa: sudo journalctl -u ellas-backend -n 80"; exit 1