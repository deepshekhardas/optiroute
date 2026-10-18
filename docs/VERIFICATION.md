# Executed verification — 18 October 2026

## Checks executed locally

- `npm run test:enterprise`: **11 passing tests**, covering company isolation, role escalation denial, idempotent create retries, payload conflicts, capacity rollback/release, state transitions, stale revisions, validation/page limits, membership revocation, last-admin protection, database reopen, append-only audit triggers, newer-schema refusal, native backup/restore, HTTP auth/origin/malformed request handling.
- `npm run lint`: TypeScript check passed for existing and new UI source.
- `npm run enterprise:build`: Vite UI and bundled Node service artifact built successfully.
- `npm audit --audit-level=high`: **0 known vulnerabilities reported** after targeted compatible dependency updates/overrides. This is a registry advisory snapshot, not proof of no exploitable bugs.
- Legacy frontend build passed after dependency changes; its existing large-bundle warning remains.

## Browser acceptance executed

Using the existing Comet session against the loopback service, with synthetic local sample data:

1. Created Northstar Demo order, 30 load units, version 1.
2. Assigned Demo Driver One, version 2.
3. Started delivery, version 3.
4. Marked delivered, version 4.
5. Observed server audit events for create, assign and both transitions.
6. Reloaded and confirmed the delivered version-4 record persisted.
7. Visually inspected the responsive shell in a same-origin 390×844 iframe; navigation, company selection and summary tiles fit. This is not complete real-device testing. Automated DOM width measurement across the iframe was unavailable and is not claimed.

Screenshots in this folder are actual local UI captures. No real order, customer, payment, carrier dispatch or message was sent.

## REA

REA analyzed the **compiled Node service artifact**, selecting `enterprise-dist/service.mjs` from the built application inventory. It parsed the selected file without a parse failure, retaining static relationships and explicit unknowns. The receipt includes artifact identity, evidence IDs, source selection, counts and limitations. Four other inventoried files were not selected; full runtime/semantic coverage is not claimed.

REA did not execute the service or establish tenant/permission correctness. Those conclusions are supported by the tests above, separately. No claim of formal verification, security certification or complete reverse engineering is made.

## Not yet verified

Real Firebase Admin credentials, revoked-token integration against the actual project, production HTTPS/reverse proxy, durable hosted storage, multi-replica behavior, load/soak tests, encrypted/off-host backups and independent recovery exercise, full keyboard/screen-reader/real-device acceptance. Authentication tests inject a verifier for controlled API tests; they do not claim to test Google's production authentication service. The existing hosted fleet preview is still the earlier demo, not this service.
