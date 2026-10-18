# Operations API v1

Production endpoints require `Authorization: Bearer <Firebase ID token>`, verified by the server. Never use a service-account secret in browser code. Use the company ID returned by `GET /api/tenants`; it is not sufficient authorization by itself.

Mutations require JSON with a 16 KiB request limit. Cross-origin requests are rejected unless their Origin equals configured APP_ORIGIN. The service returns a request-reference header. There is no permissive CORS policy.

| Endpoint                                             | Purpose                                            | Permission       |
| ---------------------------------------------------- | -------------------------------------------------- | ---------------- |
| `GET /health`                                        | Process health and schema version; no company data | Public           |
| `GET /api/config`                                    | Local-demo or Firebase mode                        | Public           |
| `GET /api/tenants`                                   | Current user's memberships                         | Signed-in        |
| `GET /api/tenants/:company/orders?limit=50&offset=0` | At most 100 orders per page                        | Member           |
| `GET /api/tenants/:company/drivers`                  | Driver registry                                    | Member           |
| `POST /api/tenants/:company/orders`                  | Create queued order                                | Dispatcher/admin |
| `POST /api/tenants/:company/orders/:id/assign`       | Capacity-checked assignment                        | Dispatcher/admin |
| `POST /api/tenants/:company/orders/:id/status`       | Guarded status transition                          | Dispatcher/admin |
| `POST /api/tenants/:company/drivers`                 | Register a driver                                  | Admin            |
| `PUT /api/tenants/:company/members/:uid`             | Grant/update role                                  | Admin            |
| `GET /api/tenants/:company/members`                  | Current membership registry                        | Admin            |
| `DELETE /api/tenants/:company/members/:uid`          | Revoke company access; preserve audit              | Admin            |
| `GET /api/tenants/:company/audit?after=0`            | Up to 100 audit events after cursor                | Admin            |

Create order (also send an `Idempotency-Key` header, max 128 characters):

```json
{ "client": "Example Client", "address": "Example depot", "volume": 25 }
```

Assignment:

```json
{ "driverId": "<company-driver-id>", "version": 1 }
```

Transition:

```json
{ "status": "in_transit", "version": 2 }
```

Driver registration: `{"name":"Example Driver","capacity":100}`. Membership: `{"role":"viewer"}` (`admin`, `dispatcher`, `viewer` only).

## Outcomes

- 201: newly created record. Order response contains `{order, replayed:false}`.
- 200: read/mutation result, or idempotent replay with `{order, replayed:true}`.
- 400: invalid fields, quantity, JSON, page or version.
- 401: missing/invalid/expired/revoked sign-in.
- 403: company/role/origin denied.
- 404: company-scoped entity missing or unknown API route.
- 409: stale version, invalid transition, insufficient capacity, changed idempotent payload or last-admin protection. Refresh before resolving; do not blindly overwrite/retry.
- 413: oversized request. 415: mutation content type is not JSON.
- 503: identity verification infrastructure is unavailable; this is not an invalid-user verdict.
- 429: process-local per-identity rate limit; respect Retry-After.

The current rate limit is not a distributed abuse-protection service. Driver registration and membership updates do not have create-order idempotency receipts. There is no public tenant-provisioning endpoint, order-delete endpoint, payment endpoint or automatic dispatch webhook.
