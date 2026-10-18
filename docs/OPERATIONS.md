# Deployment and recovery runbook

## Local reviewer walkthrough

Use Node 24 LTS, npm and your existing checkout:

```sh
npm ci
cp firebase-applet-config.example.json firebase-applet-config.json
npm run enterprise:build
npm run enterprise:demo
```

Open the printed loopback URL (default http://127.0.0.1:4185). The local sample workspace requires no real Firebase sign-in. Its order writes genuinely persist in `runtime/demo.sqlite` and survive restart, but do not dispatch real deliveries. Never deploy this sample mode or load real company/customer records into it.

Walkthrough: create an order; assign its driver; start delivery; mark delivered; inspect Audit history. Attempt over-capacity assignment to see a rejected change. Refresh/restart to observe persistence. Unit/API tests separately verify cross-company denial, read-only roles, stale updates, idempotency and illegal transitions.

## Production configuration — prerequisite, not a completed deployment

1. Provision a supported persistent volume or first migrate the repository to a managed database. Do not put SQLite on ephemeral preview storage.
2. Configure a dedicated Firebase project, Google sign-in and authorized app domains. Fill the frontend web config from that project. Supply server-only application default credentials with minimal required permissions and set FIREBASE_PROJECT_ID. Never commit service accounts, private keys or tokens.
3. Set `APP_ORIGIN` to the exact HTTPS app origin, `OPTIR_DB` to a durable private path, PORT as appropriate and NODE_ENV=production. Do not set OPTIR_LOCAL_DEMO or FIREBASE_AUTH_EMULATOR_HOST.
4. Provision the company and first administrator using that user's verified Firebase UID, from a trusted operator shell:

```sh
node enterprise/provision.mjs company-01 "Example Logistics" VERIFIED_FIREBASE_UID
npm run enterprise:build
npm run enterprise:start
```

The service is separate from `server.ts`. Route only the enterprise service for enterprise data. Legacy Firestore demo routes and its unsigned operational endpoints are outside this service's protection boundary and must not be represented as enterprise endpoints.

5. Put the service behind managed TLS, preserve the configured app Host header at the trusted reverse proxy, restrict private volumes/credentials, configure gateway limits and monitoring, and test actual token revocation, identity lifecycle, roles, backup restore and device accessibility before customer acceptance. A successful local test does not establish these properties in hosting.

## Container deployment package

`Dockerfile.operations` packages only the operations service, runs as the unprivileged Node user, and uses `/data/operations.sqlite`. Mount a persistent volume at `/data`; run a single replica. Expose the container only through a TLS reverse proxy that preserves APP_ORIGIN's Host. The health check verifies process response only.

Build with a public Firebase web configuration matching the server project:

```sh
docker build -f Dockerfile.operations --build-arg FIREBASE_PROJECT_ID=YOUR_REAL_PROJECT --secret id=firebase_web_config,src=/private/firebase-web.json -t optiroute-operations:review .
```

The build rejects placeholder fields, malformed auth domains and mismatched projects. This validates configuration shape, not actual identity access. The public web configuration is compiled into browser assets; it is not a service-account credential. Never use an ADC/service-account file as that build secret.

At runtime supply NODE_ENV=production, APP_ORIGIN, FIREBASE_PROJECT_ID and GOOGLE_APPLICATION_CREDENTIALS pointing to a read-only server credential mount. Mount `/data` read-write for UID 1000 and keep credentials out of the image. Omit OPTIR_LOCAL_DEMO and emulator settings. Apply read-only root filesystem, a temporary `/tmp` mount, no-new-privileges and dropped Linux capabilities in the hosting runtime. Configure gateway limits, TLS and off-host encrypted backups before customer use.

Container execution has not been verified on this laptop: Docker CLI exists, but the Docker Desktop Linux engine is unavailable. Test image build, volume permissions, credential startup, real sign-in and restore in staging before promotion. No hosting destination or paid infrastructure has been provisioned by this package.

## Consistent backup

```sh
node enterprise/backup.mjs backups/operations-YYYYMMDD.sqlite
```

Set OPTIR_DB for a nondefault source. The command uses SQLite's backup API (including WAL state), refuses to overwrite an existing destination and checks the backup's integrity/schema. Treat backups as confidential. Add encryption, restricted storage, retention and off-host copies before production. Do not copy just a live `.sqlite` file while ignoring its WAL.

Restore only during controlled downtime: stop all writers, verify a backup with SQLite integrity checks, preserve the old database and its sidecars for rollback, restore the backup into an empty verified data directory, restart and check memberships/order counts/audit continuity. Do not blindly mix old WAL files with a restored database. Restore acceptance on an independent environment is still required.

## Failures and rollout

- Missing credentials/config: service refuses production startup; no fallback to sample identity.
- Newer database schema: service refuses to open it. Schema 1 is the only implemented version; review and back up before future migrations.
- Stale update/capacity conflict: 409 with no partial assignment or audit success; refresh the record.
- Expired token: 401; sign in again. Browser obtains a current token for requests.
- Local disk/full/process failure: transaction durability depends on SQLite/filesystem and storage configuration. Backups and host monitoring remain operator responsibilities.

The service's health endpoint is process health, not proof that Google authentication, storage backups or end-to-end delivery works. No uptime/SLA/SOC2 claim is made.
