import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import "./ui.css";

function Operations() {
  const [mode, setMode] = useState("loading"),
    [token, setToken] = useState(""),
    [user, setUser] = useState<any>(null);
  const [tenants, setTenants] = useState<any[]>([]),
    [tenant, setTenant] = useState(""),
    [orders, setOrders] = useState<any[]>([]),
    [drivers, setDrivers] = useState<any[]>([]),
    [audit, setAudit] = useState<any[]>([]);
  const [tab, setTab] = useState("Orders"),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [filter, setFilter] = useState("all"),
    [search, setSearch] = useState("");
  const [offset, setOffset] = useState(0),
    [hasNext, setHasNext] = useState(false),
    [auditCursor, setAuditCursor] = useState(0);
  const [orderForm, setOrderForm] = useState({
      client: "",
      address: "",
      volume: 1,
    }),
    [driverForm, setDriverForm] = useState({ name: "", capacity: 100 });
  const [memberForm, setMemberForm] = useState({ uid: "", role: "viewer" }),
    [pendingKey, setPendingKey] = useState(() => crypto.randomUUID());
  const [members, setMembers] = useState<any[]>([]);
  const selected = tenants.find((t) => t.id === tenant),
    canWrite = selected && selected.role !== "viewer",
    isAdmin = selected?.role === "admin";
  async function api(
    path: string,
    method = "GET",
    body?: unknown,
    key?: string,
  ) {
    const liveToken =
      mode === "firebase" && user ? await user.getIdToken() : token;
    const response = await fetch("/api" + path, {
      method,
      headers: {
        ...(liveToken ? { Authorization: "Bearer " + liveToken } : {}),
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
        ...(key ? { "Idempotency-Key": key } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const result = await response.json();
    if (!response.ok)
      throw new Error(
        (result.error || "Request failed") +
          " · Reference " +
          (response.headers.get("X-Request-ID") || "unavailable"),
      );
    return result;
  }
  useEffect(() => {
    let unsubscribe: (() => void) | undefined,
      active = true;
    fetch("/api/config")
      .then((r) => {
        if (!r.ok) throw Error("Service unavailable");
        return r.json();
      })
      .then(async (c) => {
        if (!active) return;
        setMode(c.mode);
        if (c.mode === "local-demo") setToken("local");
        else {
          const { auth } = await import("../src/lib/firebase");
          const { onAuthStateChanged } = await import("firebase/auth");
          if (active)
            unsubscribe = onAuthStateChanged(auth, async (u) => {
              setUser(u);
              setToken(u ? await u.getIdToken() : "");
            });
        }
      })
      .catch((e) => {
        if (active) {
          setMode("error");
          setError(e.message);
        }
      });
    return () => {
      active = false;
      unsubscribe?.();
    };
  }, []);
  useEffect(() => {
    if (token)
      api("/tenants")
        .then((list) => {
          setTenants(list);
          setTenant(list[0]?.id || "");
        })
        .catch((e) => setError(e.message));
    else {
      setTenants([]);
      setTenant("");
    }
  }, [token]);
  async function load(company = tenant, page = offset) {
    if (!company) return;
    const root = "/tenants/" + encodeURIComponent(company);
    const [rows, people] = await Promise.all([
      api(root + "/orders?limit=50&offset=" + page),
      api(root + "/drivers"),
    ]);
    setOrders(rows);
    setDrivers(people);
    setHasNext(rows.length === 50);
  }
  useEffect(() => {
    let active = true;
    if (tenant) {
      setError("");
      setAudit([]);
      setAuditCursor(0);
      setOffset(0);
      const root = "/tenants/" + encodeURIComponent(tenant);
      Promise.all([
        api(root + "/orders?limit=50&offset=0"),
        api(root + "/drivers"),
      ])
        .then(([rows, people]) => {
          if (active) {
            setOrders(rows);
            setDrivers(people);
            setHasNext(rows.length === 50);
          }
        })
        .catch((e) => {
          if (active) setError(e.message);
        });
    }
    return () => {
      active = false;
    };
  }, [tenant]);
  async function action(work: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await work();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function history(more = false) {
    const rows = await api(
      "/tenants/" +
        encodeURIComponent(tenant) +
        "/audit?after=" +
        (more ? auditCursor : 0),
    );
    setAudit((p) => (more ? [...p, ...rows] : rows));
    setAuditCursor(rows.at(-1)?.id || 0);
  }
  const root = "/tenants/" + encodeURIComponent(tenant);
  const visible = orders.filter(
    (o) =>
      (filter === "all" || o.status === filter) &&
      (o.client + " " + o.address + " " + o.id)
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  return (
    <div className="workspace">
      <aside>
        <a className="brand" href="/">
          ◎ OptiRoute <small>OPERATIONS</small>
        </a>
        <p className="aside-label">WORKSPACE</p>
        <nav aria-label="Operations sections">
          {[
            "Orders",
            "Drivers",
            ...(isAdmin ? ["Audit history", "Team access"] : []),
          ].map((item) => (
            <button
              key={item}
              aria-current={tab === item ? "page" : undefined}
              onClick={() => {
                setTab(item);
                if (item === "Audit history") action(() => history());
                if (item === "Team access")
                  action(async () =>
                    setMembers(
                      await api(
                        "/tenants/" + encodeURIComponent(tenant) + "/members",
                      ),
                    ),
                  );
              }}
            >
              {item}
              <span>↗</span>
            </button>
          ))}
        </nav>
        <p className="aside-foot">
          Controlled workflows.
          <br />
          Clear accountability.
        </p>
      </aside>
      <main>
        <header>
          <div>
            <p className="eyebrow">OPERATIONS / {tab.toUpperCase()}</p>
            <h1>{tab === "Orders" ? "Every delivery. One workspace." : tab}</h1>
          </div>
          <div className="identity">
            {mode === "local-demo"
              ? "Local sample workspace"
              : user?.email || "Sign in required"}
            <span>{selected?.role || "No company selected"}</span>
          </div>
        </header>
        <p className={"environment " + (mode === "local-demo" ? "sample" : "")}>
          {mode === "local-demo"
            ? "LOCAL DEMO · Synthetic records are saved in this local SQLite database. No real dispatch, GPS or messages."
            : "ENTERPRISE FOUNDATION · Company-scoped service. Production rollout requires infrastructure and acceptance checks."}
        </p>
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
        {notice && (
          <p role="status" className="success">
            {notice}
          </p>
        )}
        {!token && mode === "firebase" && (
          <section className="panel">
            <h2>Sign in to your company</h2>
            <p>
              Your administrator must grant membership before operational data
              is available.
            </p>
            <button
              onClick={() =>
                action(async () => {
                  const { auth } = await import("../src/lib/firebase");
                  const { signInWithPopup, GoogleAuthProvider } = await import(
                    "firebase/auth"
                  );
                  await signInWithPopup(auth, new GoogleAuthProvider());
                })
              }
            >
              Continue with Google
            </button>
          </section>
        )}
        {token && (
          <>
            <div className="workspace-bar">
              <label>
                Company
                <select
                  value={tenant}
                  disabled={busy}
                  onChange={(e) => {
                    setTenant(e.target.value);
                    setTab("Orders");
                  }}
                >
                  {tenants.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name} · {t.role}
                    </option>
                  ))}
                </select>
              </label>
              <button
                className="secondary"
                disabled={busy || !tenant}
                onClick={() => action(() => load())}
              >
                Refresh records
              </button>
            </div>
            {!tenant && (
              <section className="panel">
                <h2>No company access yet</h2>
                <p>
                  Ask the deployment administrator to provision your verified
                  Firebase UID. There is no self-service role elevation.
                </p>
              </section>
            )}
            {tenant && (
              <>
                <div className="stats">
                  <article>
                    <span>Orders on this page</span>
                    <strong>{orders.length}</strong>
                  </article>
                  <article>
                    <span>Awaiting assignment</span>
                    <strong>
                      {orders.filter((o) => o.status === "queued").length}
                    </strong>
                  </article>
                  <article>
                    <span>In transit</span>
                    <strong>
                      {orders.filter((o) => o.status === "in_transit").length}
                    </strong>
                  </article>
                  <article>
                    <span>Registered drivers</span>
                    <strong>{drivers.length}</strong>
                  </article>
                </div>
                {tab === "Orders" && (
                  <>
                    <div className="toolbar">
                      <label>
                        Search this page
                        <input
                          value={search}
                          onChange={(e) => setSearch(e.target.value)}
                          placeholder="Client, address or order ID"
                        />
                      </label>
                      <label>
                        Status
                        <select
                          value={filter}
                          onChange={(e) => setFilter(e.target.value)}
                        >
                          {[
                            "all",
                            "queued",
                            "assigned",
                            "in_transit",
                            "delivered",
                            "cancelled",
                          ].map((s) => (
                            <option key={s}>{s}</option>
                          ))}
                        </select>
                      </label>
                    </div>
                    {canWrite && (
                      <form
                        className="panel form-row"
                        onSubmit={(e) => {
                          e.preventDefault();
                          action(async () => {
                            await api(
                              root + "/orders",
                              "POST",
                              orderForm,
                              pendingKey,
                            );
                            setPendingKey(crypto.randomUUID());
                            setOrderForm({
                              client: "",
                              address: "",
                              volume: 1,
                            });
                            setOffset(0);
                            await load(tenant, 0);
                            setNotice("Order saved.");
                          });
                        }}
                      >
                        <label>
                          Client
                          <input
                            required
                            maxLength={100}
                            value={orderForm.client}
                            disabled={busy}
                            onChange={(e) => {
                              setPendingKey(crypto.randomUUID());
                              setOrderForm({
                                ...orderForm,
                                client: e.target.value,
                              });
                            }}
                          />
                        </label>
                        <label>
                          Delivery address
                          <input
                            required
                            maxLength={300}
                            value={orderForm.address}
                            disabled={busy}
                            onChange={(e) => {
                              setPendingKey(crypto.randomUUID());
                              setOrderForm({
                                ...orderForm,
                                address: e.target.value,
                              });
                            }}
                          />
                        </label>
                        <label>
                          Load units
                          <input
                            type="number"
                            min="0.01"
                            step="0.01"
                            max="1000000"
                            required
                            value={orderForm.volume}
                            disabled={busy}
                            onChange={(e) => {
                              setPendingKey(crypto.randomUUID());
                              setOrderForm({
                                ...orderForm,
                                volume: Number(e.target.value),
                              });
                            }}
                          />
                        </label>
                        <button disabled={busy}>Create order</button>
                      </form>
                    )}
                    <section className="panel table-scroll">
                      <table>
                        <caption>
                          Company orders · page {offset / 50 + 1} · quantities
                          use shared load units
                        </caption>
                        <thead>
                          <tr>
                            <th>Client / address</th>
                            <th>Status</th>
                            <th>Load</th>
                            <th>Driver</th>
                            <th>Version</th>
                            <th>Next action</th>
                          </tr>
                        </thead>
                        <tbody>
                          {visible.map((o) => (
                            <tr key={o.id}>
                              <td>
                                <strong>{o.client}</strong>
                                <small>{o.address}</small>
                                <small className="mono">
                                  {o.id.slice(0, 8)}
                                </small>
                              </td>
                              <td>
                                <span className={"status " + o.status}>
                                  {o.status.replace("_", " ")}
                                </span>
                              </td>
                              <td>{o.volume}</td>
                              <td>
                                {drivers.find((d) => d.id === o.driver)?.name ||
                                  "Unassigned"}
                              </td>
                              <td>v{o.version}</td>
                              <td>
                                {canWrite && (
                                  <div className="row-actions">
                                    {["queued", "assigned"].includes(
                                      o.status,
                                    ) && (
                                      <select
                                        aria-label={"Assign " + o.client}
                                        disabled={busy}
                                        value=""
                                        onChange={(e) => {
                                          const id = e.target.value;
                                          if (id)
                                            action(async () => {
                                              await api(
                                                root +
                                                  "/orders/" +
                                                  o.id +
                                                  "/assign",
                                                "POST",
                                                {
                                                  driverId: id,
                                                  version: o.version,
                                                },
                                              );
                                              await load();
                                              setNotice("Assignment saved.");
                                            });
                                        }}
                                      >
                                        <option value="">Assign driver…</option>
                                        {drivers.map((d) => (
                                          <option key={d.id} value={d.id}>
                                            {d.name} · {d.capacity} units
                                          </option>
                                        ))}
                                      </select>
                                    )}
                                    {["assigned", "in_transit"].includes(
                                      o.status,
                                    ) && (
                                      <button
                                        disabled={busy}
                                        onClick={() =>
                                          action(async () => {
                                            await api(
                                              root +
                                                "/orders/" +
                                                o.id +
                                                "/status",
                                              "POST",
                                              {
                                                status:
                                                  o.status === "assigned"
                                                    ? "in_transit"
                                                    : "delivered",
                                                version: o.version,
                                              },
                                            );
                                            await load();
                                          })
                                        }
                                      >
                                        {o.status === "assigned"
                                          ? "Start delivery"
                                          : "Mark delivered"}
                                      </button>
                                    )}
                                    {["queued", "assigned"].includes(
                                      o.status,
                                    ) && (
                                      <button
                                        className="secondary"
                                        disabled={busy}
                                        onClick={() =>
                                          action(async () => {
                                            if (
                                              !window.confirm(
                                                "Cancel this order? It will remain in audit history.",
                                              )
                                            )
                                              return;
                                            await api(
                                              root +
                                                "/orders/" +
                                                o.id +
                                                "/status",
                                              "POST",
                                              {
                                                status: "cancelled",
                                                version: o.version,
                                              },
                                            );
                                            await load();
                                          })
                                        }
                                      >
                                        Cancel
                                      </button>
                                    )}
                                  </div>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      {!visible.length && (
                        <p className="empty">
                          No matching orders on this page.
                        </p>
                      )}
                    </section>
                    <div className="pagination">
                      <button
                        disabled={busy || offset === 0}
                        className="secondary"
                        onClick={() =>
                          action(async () => {
                            await load(tenant, offset - 50);
                            setOffset(offset - 50);
                          })
                        }
                      >
                        Previous page
                      </button>
                      <button
                        disabled={busy || !hasNext}
                        className="secondary"
                        onClick={() =>
                          action(async () => {
                            await load(tenant, offset + 50);
                            setOffset(offset + 50);
                          })
                        }
                      >
                        Next page
                      </button>
                    </div>
                  </>
                )}
                {tab === "Drivers" && (
                  <>
                    {isAdmin && (
                      <form
                        className="panel form-row"
                        onSubmit={(e) => {
                          e.preventDefault();
                          action(async () => {
                            await api(root + "/drivers", "POST", driverForm);
                            setDriverForm({ name: "", capacity: 100 });
                            await load();
                            setNotice("Driver registered.");
                          });
                        }}
                      >
                        <label>
                          Name
                          <input
                            required
                            maxLength={100}
                            value={driverForm.name}
                            onChange={(e) =>
                              setDriverForm({
                                ...driverForm,
                                name: e.target.value,
                              })
                            }
                          />
                        </label>
                        <label>
                          Capacity units
                          <input
                            required
                            type="number"
                            min="0.01"
                            max="1000000"
                            step="0.01"
                            value={driverForm.capacity}
                            onChange={(e) =>
                              setDriverForm({
                                ...driverForm,
                                capacity: Number(e.target.value),
                              })
                            }
                          />
                        </label>
                        <button disabled={busy}>Register driver</button>
                      </form>
                    )}
                    <section className="driver-grid">
                      {drivers.map((d) => (
                        <article className="panel" key={d.id}>
                          <span className="avatar">{d.name[0]}</span>
                          <h2>{d.name}</h2>
                          <p>{d.capacity} load units capacity</p>
                          <small className="mono">{d.id}</small>
                        </article>
                      ))}
                    </section>
                  </>
                )}
                {tab === "Audit history" && isAdmin && (
                  <section className="panel">
                    <h2>Accountable changes</h2>
                    <p>
                      Server-recorded events. Application code cannot edit or
                      delete these rows.
                    </p>
                    <ol className="timeline">
                      {audit.map((a) => (
                        <li key={a.id}>
                          <span className="mono">
                            #{a.id} · {new Date(a.at).toLocaleString()}
                          </span>
                          <strong>{a.action}</strong>
                          <span>Actor: {a.actor}</span>
                          <small className="mono">Entity: {a.entity}</small>
                          <small className="mono">{a.detail}</small>
                        </li>
                      ))}
                    </ol>
                    <button
                      className="secondary"
                      disabled={busy || audit.length === 0}
                      onClick={() => action(() => history(true))}
                    >
                      Load next events
                    </button>
                  </section>
                )}
                {tab === "Team access" && isAdmin && (
                  <>
                    <form
                      className="panel form-row"
                      onSubmit={(e) => {
                        e.preventDefault();
                        action(async () => {
                          await api(
                            root +
                              "/members/" +
                              encodeURIComponent(memberForm.uid),
                            "PUT",
                            { role: memberForm.role },
                          );
                          const list = await api("/tenants");
                          setTenants(list);
                          if (
                            list.find((t: any) => t.id === tenant)?.role ===
                            "admin"
                          )
                            setMembers(await api(root + "/members"));
                          setNotice("Membership saved.");
                        });
                      }}
                    >
                      <label>
                        Verified Firebase UID
                        <input
                          required
                          maxLength={128}
                          value={memberForm.uid}
                          onChange={(e) =>
                            setMemberForm({
                              ...memberForm,
                              uid: e.target.value,
                            })
                          }
                        />
                      </label>
                      <label>
                        Role
                        <select
                          value={memberForm.role}
                          onChange={(e) =>
                            setMemberForm({
                              ...memberForm,
                              role: e.target.value,
                            })
                          }
                        >
                          {["viewer", "dispatcher", "admin"].map((r) => (
                            <option key={r}>{r}</option>
                          ))}
                        </select>
                      </label>
                      <button disabled={busy}>Save membership</button>
                      <p className="form-note">
                        Viewer: read records. Dispatcher: create and move
                        orders. Admin: manage drivers, membership and audit
                        access. The last admin cannot be demoted or removed.
                      </p>
                    </form>
                    <section className="panel">
                      <h2>Current membership</h2>
                      {members.map((m) => (
                        <div className="member-row" key={m.uid}>
                          <span className="mono">{m.uid}</span>
                          <span>{m.role}</span>
                          <button
                            className="secondary"
                            disabled={busy}
                            onClick={() =>
                              action(async () => {
                                if (
                                  !window.confirm(
                                    "Revoke this company membership?",
                                  )
                                )
                                  return;
                                await api(
                                  root +
                                    "/members/" +
                                    encodeURIComponent(m.uid),
                                  "DELETE",
                                );
                                const list = await api("/tenants");
                                setTenants(list);
                                if (!list.some((t: any) => t.id === tenant))
                                  setTenant(list[0]?.id || "");
                                else setMembers(await api(root + "/members"));
                                setNotice("Membership revoked.");
                              })
                            }
                          >
                            Revoke access
                          </button>
                        </div>
                      ))}
                    </section>
                  </>
                )}
              </>
            )}
          </>
        )}
      </main>
    </div>
  );
}
createRoot(document.getElementById("root")!).render(<Operations />);
