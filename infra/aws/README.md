# Desplegar ShareGrams en AWS

Arquitectura: **una instancia EC2** corre el editor web (estático, vía nginx) y el backend NestJS (proceso Node vía systemd, puerto 3000); **RDS** aloja PostgreSQL aparte. Sin Docker, sin balanceador de carga — la versión más simple que funciona de verdad para un proyecto académico.

```
Internet
   │
   ├── :80   → nginx → build estático de apps/web
   └── :3000 → Node (apps/api, NestJS + WebSockets) ── RDS PostgreSQL
```

## 1. Crear la base de datos (RDS)

Consola de AWS → RDS → **Crear base de datos**:
- Motor: **PostgreSQL**.
- Plantilla: **Capa gratuita** (free tier).
- Identificador: `sharegrams-db`.
- Usuario maestro: `sharegrams_app`, con una contraseña que anotes (la vas a necesitar en `.env`).
- Instancia: `db.t3.micro` o `db.t4g.micro` (gratis el primer año).
- Conectividad → **Public access: Yes** (más simple para empezar; si tu curso pide que no sea pública, hay que meter la EC2 y la RDS en la misma VPC/subred privada, avisame y lo ajustamos).
- Grupo de seguridad: creá uno nuevo, ej. `sharegrams-db-sg`.
- Nombre de la base de datos inicial: `sharegrams`.

Cuando esté lista (tarda unos minutos), copiá el **Endpoint** (algo como `sharegrams-db.xxxxx.us-east-1.rds.amazonaws.com`) — lo vas a necesitar para `DATABASE_URL`.

En el grupo de seguridad de la RDS (`sharegrams-db-sg`), agregá una regla de entrada: **PostgreSQL (5432)**, origen = el grupo de seguridad de la EC2 (lo creás en el paso 2, después volvés acá a agregar esta regla).

## 2. Crear el servidor (EC2)

Consola de AWS → EC2 → **Lanzar instancia**:
- AMI: **Amazon Linux 2023**.
- Tipo: `t2.micro` o `t3.micro` (free tier).
- Par de claves: creá uno nuevo, descargá el `.pem` (lo necesitás para conectarte por SSH).
- Grupo de seguridad: creá uno nuevo, ej. `sharegrams-ec2-sg`, con estas reglas de entrada:
  - SSH (22) — origen: tu IP (`Mi IP` en el dropdown).
  - HTTP (80) — origen: `0.0.0.0/0`.
  - TCP personalizado (3000) — origen: `0.0.0.0/0` (la API).

Anotá la **IP pública** de la instancia una vez que arranque.

Volvé al grupo de seguridad de la RDS y agregá la regla de entrada pendiente del paso 1 (puerto 5432, origen = `sharegrams-ec2-sg`).

## 3. Conectarte y preparar el servidor

```bash
chmod 400 tu-clave.pem
ssh -i tu-clave.pem ec2-user@<IP-PUBLICA-EC2>
```

Ya conectado, instalar Node 20 (vía NodeSource, para no depender de qué versión traiga el repo de Amazon Linux por defecto), git y nginx:

```bash
curl -fsSL https://rpm.nodesource.com/setup_20.x | sudo bash -
sudo dnf install -y nodejs git nginx
node -v   # confirmar que sea v20.x
sudo systemctl enable --now nginx
```

Clonar el repo:

```bash
git clone https://github.com/sebach0/ShareGrams.git /home/ec2-user/sharegrams
cd /home/ec2-user/sharegrams
```

## 4. Configurar variables de entorno

```bash
cp infra/aws/.env.production.example apps/api/.env
nano apps/api/.env
```

Completar `DATABASE_URL` con el endpoint de RDS del paso 1, y generar un `JWT_SECRET` nuevo (el comando para generarlo está comentado adentro del archivo).

## 5. Instalar nginx y el servicio del backend

```bash
sudo cp infra/aws/nginx.conf /etc/nginx/conf.d/sharegrams.conf
sudo rm -f /etc/nginx/conf.d/default.conf 2>/dev/null || true
sudo nginx -t && sudo systemctl reload nginx

sudo cp infra/aws/sharegrams-api.service /etc/systemd/system/sharegrams-api.service
sudo systemctl daemon-reload
sudo systemctl enable sharegrams-api
```

## 6. Primer deploy

```bash
chmod +x infra/aws/deploy.sh
VITE_API_URL=http://<IP-PUBLICA-EC2>:3000 ./infra/aws/deploy.sh
```

Esto instala dependencias, corre las migraciones de Prisma contra RDS, compila `apps/api` y `apps/web`, publica el build del web para nginx, y arranca el backend con systemd.

Verificar:
- `http://<IP-PUBLICA-EC2>/` → el editor de ShareGrams.
- `http://<IP-PUBLICA-EC2>:3000` → 404 de NestJS (normal, es la raíz de la API).
- `sudo systemctl status sharegrams-api` → `active (running)`.
- `sudo journalctl -u sharegrams-api -f` → logs en vivo si algo falla.

## Redeploys siguientes

Después de la primera vez, un deploy nuevo es un solo comando desde `/home/ec2-user/sharegrams`:

```bash
VITE_API_URL=http://<IP-PUBLICA-EC2>:3000 ./infra/aws/deploy.sh
```

## Conectar la app móvil (Fase 12) a este backend

Una vez desplegado un backend GENERADO (no ShareGrams en sí, sino uno que generaste con "⚙ Generar Backend" y corriste en tu propia infraestructura), la app móvil se conecta igual que en local: `http://<esa-IP-o-dominio>:<puerto>`. Si también querés desplegar un backend generado en AWS, es el mismo patrón EC2+RDS de esta guía, en una instancia aparte.

## Limitaciones de este setup (a propósito, para no sobre-complicar)

- Sin HTTPS (no hay certificado ni dominio propio configurado). Para eso hace falta un dominio + Certbot/ACM, es un paso aparte si lo necesitás.
- Un solo servidor, sin autoescalado ni balanceo — de sobra para una demo/entrega académica, no para producción real.
- El backend queda expuesto directo en el puerto 3000 sin nginx en el medio (ver comentario en `nginx.conf`) — funciona porque CORS ya está permisivo (`origin: '*'`) en `apps/api`.
