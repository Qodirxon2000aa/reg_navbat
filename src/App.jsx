import { useEffect, useMemo, useRef, useState } from "react";
import locationData from "./locationData.json";
import districtsData from "./newDistricts.json";
import mobileOperators from "./mobileOperators.json";

const RAW_API = import.meta.env.VITE_API_URL || "http://localhost:5001/api";
const API = RAW_API.replace(/\/$/, "");
const EVENTS_URL = `${API.replace(/\/api$/i, "")}/api/events`;

const emptyPatient = {
  firstName: "",
  lastName: "",
  birthDate: "",
  phonePrefix: "",
  phone: "",
  operatorId: "",
  region: "",
  district: "",
  address: ""
};

export default function App() {
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [registration, setRegistration] = useState(null);
  const [services, setServices] = useState([]);
  const [serviceDepartments, setServiceDepartments] = useState([]);
  const [patient, setPatient] = useState(emptyPatient);
  const [selectedServiceSection, setSelectedServiceSection] = useState("");
  const [selectedServiceId, setSelectedServiceId] = useState("");
  const [cartItems, setCartItems] = useState([]);
  const [step, setStep] = useState("login");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [reprintTicketId, setReprintTicketId] = useState("");
  const [now, setNow] = useState(() => new Date());
  const [recentCustomers, setRecentCustomers] = useState([]);
  const [recentSearchQuery, setRecentSearchQuery] = useState("");
  const [isRecentModalOpen, setIsRecentModalOpen] = useState(false);
  const [recentExactDate, setRecentExactDate] = useState("");
  const [recentFromDate, setRecentFromDate] = useState("");
  const [recentToDate, setRecentToDate] = useState("");
  const [isRecentModalLoading, setIsRecentModalLoading] = useState(false);
  const recentListRef = useRef(null);

  const filteredRecentCustomers = useMemo(() => {
    const q = recentSearchQuery.trim().toLowerCase();
    const matched = !q
      ? recentCustomers
      : recentCustomers.filter((row) => {
          const fn = String(row?.firstName || "").toLowerCase();
          const ln = String(row?.lastName || "").toLowerCase();
          const full = `${fn} ${ln}`.replace(/\s+/g, " ").trim();
          const tokens = q.split(/\s+/).filter(Boolean);
          if (tokens.length === 0) return true;
          return tokens.every((tok) => full.includes(tok) || fn.includes(tok) || ln.includes(tok));
        });
    return [...matched].sort(
      (a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()
    );
  }, [recentCustomers, recentSearchQuery]);

  const selectedRegion = useMemo(
    () => locationData.regions.find((r) => String(r.soato_id) === String(patient.region)) || null,
    [patient.region]
  );
  const prefixOptions = useMemo(
    () =>
      mobileOperators.flatMap((operator) =>
        (operator.prefixes || []).map((prefix) => ({
          value: String(prefix),
          label: `${String(prefix)} - ${operator.name}`,
          operatorId: operator.id
        }))
      ),
    []
  );
  const districtOptions = useMemo(() => {
    if (!selectedRegion?.id) return [];
    return districtsData
      .filter((district) => Number(district.region_id) === Number(selectedRegion.id))
      .sort((a, b) => a.name_uz.localeCompare(b.name_uz, "uz"));
  }, [selectedRegion?.id]);
  const selectedDistrict = useMemo(
    () => districtOptions.find((district) => String(district.soato_id) === String(patient.district)) || null,
    [districtOptions, patient.district]
  );
  const addressOptions = useMemo(() => {
    if (!selectedDistrict?.soato_id) return [];
    const districtPrefix = String(selectedDistrict.soato_id);
    const districts = Array.isArray(locationData?.districts) ? locationData.districts : [];
    const names = districts
      .filter((district) => String(district.soato_id || "").startsWith(districtPrefix))
      .map((district) => district.name_uz)
      .filter(Boolean);
    return [...new Set(names)].sort((a, b) => a.localeCompare(b, "uz"));
  }, [selectedDistrict?.soato_id]);
  const detectedOperator = useMemo(() => {
    if (!patient.phonePrefix) return null;
    return mobileOperators.find((operator) => (operator.prefixes || []).includes(String(patient.phonePrefix))) || null;
  }, [patient.phonePrefix]);
  const fullPhone = useMemo(() => {
    const local = String(patient.phone || "").replace(/\D/g, "");
    if (!patient.phonePrefix) return local;
    return `${patient.phonePrefix}${local}`;
  }, [patient.phonePrefix, patient.phone]);
  const filteredServices = useMemo(() => {
    const section = String(selectedServiceSection || "").trim().toUpperCase();
    if (!section) return [];
    return services.filter((s) => String(s?.section || "").trim().toUpperCase() === section);
  }, [services, selectedServiceSection]);
  const cartTotal = useMemo(
    () => cartItems.reduce((sum, item) => sum + Number(item?.price || 0), 0),
    [cartItems]
  );

  const clockTime = now.toLocaleTimeString("uz-UZ", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  });
  const clockDate = now.toLocaleDateString("uz-UZ", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric"
  });

  const loadRecentCustomers = async (registrationId, options = {}) => {
    if (!registrationId) return;
    try {
      const params = new URLSearchParams();
      params.set("registrationId", registrationId);
      params.set("limit", String(options.limit || 14));
      if (options.date) params.set("date", options.date);
      if (options.fromDate) params.set("fromDate", options.fromDate);
      if (options.toDate) params.set("toDate", options.toDate);
      const response = await fetch(
        `${API}/registration/recent-customers?${params.toString()}`,
        { cache: "no-store" }
      );
      const data = await response.json().catch(() => ({}));
      if (!response.ok) return;
      setRecentCustomers(Array.isArray(data.rows) ? data.rows : []);
    } catch {
      /* ignore */
    }
  };
  const loadRecentCustomersForModal = async () => {
    if (!registration?.id) return;
    setIsRecentModalLoading(true);
    try {
      await loadRecentCustomers(registration.id, {
        limit: 500,
        date: recentExactDate,
        fromDate: recentFromDate,
        toDate: recentToDate
      });
    } finally {
      setIsRecentModalLoading(false);
    }
  };

  const fillPatientFromRecent = (row) => {
    const rowRegionName = String(row?.region || "").trim();
    const rowDistrictName = String(row?.district || "").trim();
    const digits = String(row?.phone || "").replace(/\D/g, "");
    const normalizedPhone = digits.startsWith("998") && digits.length >= 12 ? digits.slice(3) : digits.slice(-9);
    const phonePrefix = normalizedPhone.slice(0, 2);
    const phoneLocal = normalizedPhone.slice(2, 9);

    const region = locationData.regions.find((item) => item.name_uz === rowRegionName) || null;
    const district = districtsData.find(
      (item) => Number(item.region_id) === Number(region?.id) && String(item.name_uz || "").trim() === rowDistrictName
    );

    setPatient({
      firstName: String(row?.firstName || "").trim(),
      lastName: String(row?.lastName || "").trim(),
      birthDate: String(row?.birthDate || "").trim(),
      phonePrefix: phonePrefix || "",
      phone: phoneLocal || "",
      operatorId: "",
      region: region ? String(region.soato_id) : "",
      district: district ? String(district.soato_id) : "",
      address: String(row?.address || "").trim()
    });

    // Recent customer tanlanganda xizmatni avtomatik qo'ymaslik kerak.
    setSelectedServiceSection("");
    setSelectedServiceId("");
    setStep("patient");
    setError("");
  };

  const doLogin = async () => {
    setLoading(true);
    setError("");
    setMessage("");
    try {
      const r = await fetch(`${API}/registration/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ login, password })
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) {
        setError(data.message || "Login xatoligi");
        return;
      }
      setRegistration(data.registration);
      const rs = await fetch(`${API}/registration/services`, { cache: "no-store" });
      const sd = await rs.json().catch(() => ({}));
      if (!rs.ok) {
        setError(sd.message || "Xizmatlarni olib bo'lmadi");
        return;
      }
      setServices(Array.isArray(sd.services) ? sd.services : []);
      setServiceDepartments(Array.isArray(sd.departments) ? sd.departments : []);
      await loadRecentCustomers(data.registration?.id);
      setStep("patient");
    } catch {
      setError("Server bilan aloqa yo'q");
    } finally {
      setLoading(false);
    }
  };

  const goService = () => {
    if (patient.firstName.trim().length < 2) return setError("Ism kamida 2 harf bo'lsin");
    if (patient.lastName.trim().length < 2) return setError("Familiya kamida 2 harf bo'lsin");
    if (!patient.birthDate) return setError("Tug'ilgan sanani kiriting");
    if (!patient.phonePrefix) return setError("Operator kodini tanlang");
    if (String(patient.phone).replace(/\D/g, "").length !== 7) return setError("Telefonning qolgan 7 raqamini kiriting");
    if (!detectedOperator) return setError("Telefon prefiksi qo'llab-quvvatlanmaydi");
    if (!patient.region.trim() || !patient.district.trim() || !patient.address.trim()) {
      return setError("Viloyat, tuman, manzil to'liq bo'lsin");
    }
    setError("");
    setStep("service");
  };

  const clearPatientForm = () => {
    setPatient(emptyPatient);
    setError("");
  };

  const addServiceToCart = (service) => {
    const id = String(service?.id || "");
    if (!id) return;
    setCartItems((prev) => {
      if (prev.some((item) => String(item.id) === id)) return prev;
      return [
        ...prev,
        {
          id,
          name: String(service?.name || "Xizmat"),
          section: String(service?.section || "").toUpperCase(),
          doctorName: String(service?.doctorName || ""),
          price: Number(service?.price || 0)
        }
      ];
    });
    setSelectedServiceId(id);
    setError("");
  };

  const removeServiceFromCart = (serviceId) => {
    setCartItems((prev) => prev.filter((item) => String(item.id) !== String(serviceId)));
    setSelectedServiceId((prev) => (String(prev) === String(serviceId) ? "" : prev));
  };

  const printCartSummary = () => {
    if (cartItems.length === 0) return setError("Savat bo'sh");
    const opened = window.open("", "_blank", "width=420,height=640");
    if (!opened) return setError("Chek oynasi ochilmadi");
    const rows = cartItems
      .map(
        (item, idx) =>
          `<tr><td>${idx + 1}</td><td>${item.name}</td><td>${item.section || "-"}</td><td>${Number(item.price || 0).toLocaleString("uz-UZ")}</td></tr>`
      )
      .join("");
    opened.document.write(`<!doctype html><html><head><title>Umumiy chek</title><style>body{font-family:Arial,sans-serif;padding:14px;}h3{margin:0 0 10px;}table{width:100%;border-collapse:collapse;}th,td{border:1px solid #bbb;padding:6px;font-size:12px;text-align:left;}tfoot td{font-weight:700;} .meta{font-size:12px;margin:6px 0 10px;color:#333;}</style></head><body><h3>Registratsiya umumiy chek</h3><div class="meta">${patient.firstName || ""} ${patient.lastName || ""} | ${new Date().toLocaleString("uz-UZ")}</div><table><thead><tr><th>#</th><th>Xizmat</th><th>Bo'lim</th><th>Narx</th></tr></thead><tbody>${rows}</tbody><tfoot><tr><td colspan="3">Jami</td><td>${cartTotal.toLocaleString("uz-UZ")} so'm</td></tr></tfoot></table></body></html>`);
    opened.document.close();
    opened.focus();
    opened.print();
  };

  const submitRegistration = async () => {
    if (cartItems.length === 0) return setError("Kamida bitta xizmatni savatga qo'shing");
    setLoading(true);
    setError("");
    setMessage("");
    try {
      const batchId = `regbatch-${registration.id}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      for (const item of cartItems) {
        const r = await fetch(`${API}/registration/register-patient`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            registrationId: registration.id,
            registrationBatchId: batchId,
            batchId,
            ...patient,
            phone: fullPhone,
            operatorId: detectedOperator?.id || patient.operatorId,
            region: selectedRegion?.name_uz || patient.region,
            district: selectedDistrict?.name_uz || patient.district,
            serviceId: item.id
          })
        });
        const data = await r.json().catch(() => ({}));
        if (!r.ok) {
          setError(data.message || "Saqlashda xatolik");
          return;
        }
      }
      setMessage("Savat kassaga yuborildi");
      setPatient(emptyPatient);
      setSelectedServiceSection("");
      setSelectedServiceId("");
      setCartItems([]);
      await loadRecentCustomers(registration.id);
      setStep("patient");
    } catch {
      setError("Server bilan aloqa yo'q");
    } finally {
      setLoading(false);
    }
  };

  const reprintTicket = async (ticketId) => {
    if (!registration?.id || !ticketId) return;
    setError("");
    setReprintTicketId(String(ticketId));
    try {
      const response = await fetch(`${API}/registration/reprint-ticket`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          registrationId: registration.id,
          ticketId
        })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(data.message || "Qayta chek chiqarishda xatolik");
        return;
      }
      setMessage(data.message || "Qayta chek printerga yuborildi");
    } catch {
      setError("Server bilan aloqa yo'q");
    } finally {
      setReprintTicketId("");
    }
  };

  useEffect(() => {
    setError("");
  }, [step]);

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!registration?.id) return undefined;
    void loadRecentCustomers(registration.id);
    const poll = setInterval(() => void loadRecentCustomers(registration.id), 15000);
    const events = new EventSource(EVENTS_URL);
    const refresh = () => void loadRecentCustomers(registration.id);
    events.addEventListener("state-updated", refresh);
    events.onerror = refresh;
    return () => {
      clearInterval(poll);
      events.close();
    };
  }, [registration?.id]);

  useEffect(() => {
    if (!isRecentModalOpen) return;
    void loadRecentCustomersForModal();
  }, [isRecentModalOpen, recentExactDate, recentFromDate, recentToDate]);

  useEffect(() => {
    setPatient((prev) => {
      const nextOperatorId = detectedOperator?.id || "";
      if (prev.operatorId === nextOperatorId) return prev;
      return { ...prev, operatorId: nextOperatorId };
    });
  }, [detectedOperator?.id]);

  useEffect(() => {
    if (!message) return undefined;
    const timer = setTimeout(() => setMessage(""), 2400);
    return () => clearTimeout(timer);
  }, [message]);

  useEffect(() => {
    const el = recentListRef.current;
    if (!el) return;
    requestAnimationFrame(() => {
      el.scrollTop = 0;
    });
  }, [filteredRecentCustomers]);

  if (step === "login" || !registration) {
    return (
      <div className="auth-shell">
        <div className="auth-card">
          <h1 style={{ marginTop: 0, marginBottom: 6 }}>Registratsiya</h1>
          <p style={{ color: "rgba(255,255,255,.6)", margin: 0 }}>Login orqali kiring</p>
          <div className="row" style={{ marginTop: 12 }}>
            <div>
              <label>Login</label>
              <input value={login} onChange={(e) => setLogin(e.target.value)} />
            </div>
            <div>
              <label>Parol</label>
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
            </div>
          </div>
          <div style={{ marginTop: 12 }}>
            <button className="primary" onClick={doLogin} disabled={loading}>
              {loading ? "Kutilmoqda..." : "Kirish"}
            </button>
          </div>
          {error ? <p style={{ color: "#fca5a5", marginTop: 12 }}>{error}</p> : null}
        </div>
      </div>
    );
  }

  return (
    <div className="wrap kassa-layout">
      <section className="kassa-left">
        <div className="card ui-entrance">
          <h1 style={{ marginTop: 0, marginBottom: 6 }}>Registratsiya</h1>
          <p style={{ color: "rgba(255,255,255,.6)", margin: 0 }}>
            {registration ? `${registration.name} (${registration.login})` : "Login orqali kiring"}
          </p>
        </div>

        {step === "patient" && (
          <div className="card ui-entrance step-card">
            <h3>Bemor ma'lumotlari</h3>
            <div className="row">
              <div>
                <label>Ism</label>
                <input value={patient.firstName} onChange={(e) => setPatient((p) => ({ ...p, firstName: e.target.value }))} />
              </div>
              <div>
                <label>Familiya</label>
                <input value={patient.lastName} onChange={(e) => setPatient((p) => ({ ...p, lastName: e.target.value }))} />
              </div>
              <div>
                <label>Tug'ilgan sana</label>
                <input
                  type="date"
                  value={patient.birthDate}
                  max={new Date().toISOString().slice(0, 10)}
                  onChange={(e) => setPatient((p) => ({ ...p, birthDate: e.target.value }))}
                />
              </div>
              <div>
                <label>Telefon</label>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: 8 }}>
                  <select
                    value={patient.phonePrefix}
                    onChange={(e) => setPatient((p) => ({ ...p, phonePrefix: e.target.value, phone: "" }))}
                  >
                    <option value="">Kod tanlang...</option>
                    {prefixOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                  <input
                    value={patient.phone}
                    onChange={(e) =>
                      setPatient((p) => ({ ...p, phone: String(e.target.value || "").replace(/\D/g, "").slice(0, 7) }))
                    }
                    placeholder="1234567"
                    disabled={!patient.phonePrefix}
                  />
                </div>
              </div>
              <div>
                <label>Viloyat</label>
                <select
                  value={patient.region}
                  onChange={(e) =>
                    setPatient((p) => ({
                      ...p,
                      region: e.target.value,
                      district: "",
                      address: ""
                    }))
                  }
                >
                  <option value="">Viloyatni tanlang...</option>
                  {locationData.regions.map((region) => (
                    <option key={region.id} value={region.soato_id}>
                      {region.name_uz}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label>Tuman</label>
                <select
                  value={patient.district}
                  onChange={(e) => setPatient((p) => ({ ...p, district: e.target.value, address: "" }))}
                  disabled={!patient.region}
                >
                  <option value="">{patient.region ? "Tumanni tanlang..." : "Avval viloyat tanlang"}</option>
                  {districtOptions.map((district) => (
                    <option key={district.id} value={district.soato_id}>
                      {district.name_uz}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label>Yashash manzili</label>
                <select
                  value={patient.address}
                  onChange={(e) => setPatient((p) => ({ ...p, address: e.target.value }))}
                  disabled={!patient.district}
                >
                  <option value="">{patient.district ? "Yashash manzilini tanlang..." : "Avval tuman tanlang"}</option>
                  {addressOptions.map((addressName) => (
                    <option key={addressName} value={addressName}>
                      {addressName}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <button type="button" onClick={clearPatientForm}>Tozalash</button>
              <button className="primary" onClick={goService}>Davom etish</button>
            </div>
          </div>
        )}

        {step === "service" && (
          <div className="card ui-entrance step-card">
            <h3>Bo'lim va xizmat tanlash</h3>
            <p style={{ marginTop: 0, color: "rgba(255,255,255,.65)" }}>
              Avval bo&apos;limni, keyin xizmatni card orqali tanlang.
            </p>

            {!selectedServiceSection ? (
              <div className="service-transition" style={{ marginBottom: 14 }}>
                <div className="pos-grid pos-grid-departments">
                  {(serviceDepartments.length ? serviceDepartments : []).map((d) => {
                    const section = String(d.section || "").toUpperCase();
                    const isActive = section === String(selectedServiceSection || "").toUpperCase();
                    return (
                      <button
                        key={section}
                        type="button"
                        className={`pos-card pos-card-department ${isActive ? "active" : ""}`}
                        onClick={() => {
                          setSelectedServiceSection(section);
                          setSelectedServiceId("");
                          setError("");
                        }}
                      >
                        <strong>{section || "—"}</strong>
                        <span>{d.title || "Bo'lim"}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : null}

            {selectedServiceSection ? (
              <div className="service-transition">
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 10 }}>
                  <p style={{ margin: 0, color: "rgba(255,255,255,.75)" }}>
                    Tanlangan bo&apos;lim: <strong>{selectedServiceSection}</strong>
                  </p>
                  <button
                    type="button"
                    style={{ width: "auto", paddingInline: 12 }}
                    onClick={() => {
                      setSelectedServiceSection("");
                      setSelectedServiceId("");
                    }}
                  >
                    Bo&apos;limni almashtirish
                  </button>
                </div>
                <div className="pos-grid">
                  {filteredServices.map((s) => {
                    const isActive = String(s.id || "") === String(selectedServiceId || "");
                    const inCart = cartItems.some((item) => String(item.id) === String(s.id || ""));
                    return (
                      <button
                        key={s.id}
                        type="button"
                        className={`pos-card ${isActive || inCart ? "active" : ""}`}
                        onClick={() => {
                          addServiceToCart(s);
                        }}
                      >
                        <strong>{s.name || "Xizmat"}</strong>
                        <span>{s.doctorName || "Shifokor belgilanmagan"}</span>
                        <span>{Number(s.price || 0).toLocaleString("uz-UZ")} so&apos;m</span>
                        {inCart ? <span className="in-cart-badge">Savatda</span> : null}
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : (
              <p style={{ color: "rgba(255,255,255,.55)" }}>Xizmatlar chiqishi uchun bo'lim tanlang.</p>
            )}

            <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <button
                type="button"
                onClick={() => {
                  if (selectedServiceSection) {
                    setSelectedServiceSection("");
                    setSelectedServiceId("");
                    return;
                  }
                  setStep("patient");
                }}
              >
                Orqaga
              </button>
              <button
                type="button"
                className="primary"
                onClick={() => void submitRegistration()}
                disabled={cartItems.length === 0 || loading}
              >
                {loading ? "Yuborilmoqda..." : "Kassaga yuborish"}
              </button>
            </div>
          </div>
        )}

        {error ? <p style={{ color: "#fca5a5" }}>{error}</p> : null}
        {message ? <div className="save-toast">{message}</div> : null}
      </section>

      {registration ? (
        <section className="kassa-middle">
          <div className="card ui-entrance step-card cart-card">
          <div className="cart-header">
            <h3 style={{ margin: 0 }}>Savatcha</h3>
            <button type="button" style={{ width: "auto", paddingInline: 12 }} onClick={() => setCartItems([])} disabled={cartItems.length === 0}>
              Tozalash
            </button>
          </div>
          <p style={{ color: "rgba(255,255,255,.68)", marginTop: 8 }}>
            Tanlangan xizmatlar: <strong>{cartItems.length}</strong>
          </p>

          <div className="cart-list">
            {cartItems.length === 0 ? (
              <p className="customers-empty">Hozircha savat bo&apos;sh.</p>
            ) : (
              cartItems.map((item) => (
                <div key={item.id} className="cart-row">
                  <div>
                    <strong>{item.name}</strong>
                    <p>
                      {item.section || "-"}
                      {item.doctorName ? ` | ${item.doctorName}` : ""}
                    </p>
                  </div>
                  <div className="cart-row-right">
                    <span>{Number(item.price || 0).toLocaleString("uz-UZ")} so&apos;m</span>
                    <button type="button" style={{ width: "auto", padding: "6px 10px" }} onClick={() => removeServiceFromCart(item.id)}>
                      O&apos;chirish
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="cart-footer">
            <div className="cart-total">
              <span>Umumiy summa</span>
              <strong>{cartTotal.toLocaleString("uz-UZ")} so&apos;m</strong>
            </div>
            <div className="cart-actions">
              <button type="button" onClick={printCartSummary} disabled={cartItems.length === 0}>
                Umumiy chek
              </button>
              <button type="button" className="primary" onClick={() => void submitRegistration()} disabled={cartItems.length === 0 || loading}>
                {loading ? "Yuborilmoqda..." : "Kassaga saqlash"}
              </button>
            </div>
          </div>
          </div>
        </section>
      ) : null}

      <aside className="kassa-right">
        <div className="card clock-card ui-entrance">
          <p className="clock-title">Soat</p>
          <div className="clock-time">{clockTime}</div>
          <p className="clock-date">{clockDate}</p>
        </div>
        <div className="card customers-card ui-entrance">
          <p className="customers-title">Oxirgi mijozlar</p>
          <button
            type="button"
            style={{ marginBottom: 10 }}
            onClick={() => setIsRecentModalOpen(true)}
          >
            Filterli modalni ochish
          </button>
          <div className="recent-filters">
            <label>Ism yoki familiya bo‘yicha qidirish</label>
            <input
              value={recentSearchQuery}
              onChange={(e) => setRecentSearchQuery(e.target.value)}
              placeholder="Masalan: Ali yoki Karimova..."
            />
          </div>
          <div className="customers-list" ref={recentListRef}>
            {recentCustomers.length === 0 ? (
              <p className="customers-empty">Hozircha yozuv yo'q</p>
            ) : filteredRecentCustomers.length === 0 ? (
              <p className="customers-empty">Qidiruv bo‘yicha natija yo‘q</p>
            ) : (
              filteredRecentCustomers.map((row) => (
                <div key={row.id} className="customer-row" onClick={() => fillPatientFromRecent(row)}>
                  <div>
                    <strong>{row.firstName || "—"} {row.lastName || ""}</strong>
                    <p>
                      {row.service || "Xizmat yo'q"}
                      {row.operator ? ` | ${row.operator}` : ""}
                    </p>
                    <button
                      type="button"
                      style={{ width: "auto", padding: "4px 8px", marginTop: 6, fontSize: 11 }}
                      onClick={(e) => {
                        e.stopPropagation();
                        void reprintTicket(row.id);
                      }}
                    >
                      {reprintTicketId === String(row.id || "") ? "..." : "Qayta chek"}
                    </button>
                  </div>
                  <span>
                    {new Date(row.createdAt).toLocaleTimeString("uz-UZ", { hour: "2-digit", minute: "2-digit" })}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      </aside>

      {isRecentModalOpen ? (
        <div className="recent-modal-overlay" onClick={() => setIsRecentModalOpen(false)}>
          <div className="recent-modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="recent-modal-head">
              <h3 style={{ margin: 0 }}>Mijozlar filtri</h3>
              <button type="button" style={{ width: "auto", padding: "6px 10px" }} onClick={() => setIsRecentModalOpen(false)}>
                Yopish
              </button>
            </div>
            <div className="recent-modal-filters">
              <input type="date" value={recentExactDate} onChange={(e) => setRecentExactDate(e.target.value)} />
              <input type="date" value={recentFromDate} onChange={(e) => setRecentFromDate(e.target.value)} />
              <input type="date" value={recentToDate} onChange={(e) => setRecentToDate(e.target.value)} />
              <input
                value={recentSearchQuery}
                onChange={(e) => setRecentSearchQuery(e.target.value)}
                placeholder="Ism/familiya filter"
              />
              <button type="button" onClick={() => void loadRecentCustomersForModal()} disabled={isRecentModalLoading}>
                {isRecentModalLoading ? "Yuklanmoqda..." : "Qidirish"}
              </button>
            </div>
            <div className="customers-list">
              {filteredRecentCustomers.length === 0 ? (
                <p className="customers-empty">Filter bo&apos;yicha natija yo&apos;q</p>
              ) : (
                filteredRecentCustomers.map((row) => (
                  <div key={`modal-${row.id}`} className="customer-row" onClick={() => { fillPatientFromRecent(row); setIsRecentModalOpen(false); }}>
                    <div>
                      <strong>{row.firstName || "—"} {row.lastName || ""}</strong>
                      <p>{row.service || "Xizmat yo'q"}</p>
                      <button
                        type="button"
                        style={{ width: "auto", padding: "4px 8px", marginTop: 6, fontSize: 11 }}
                        onClick={(e) => {
                          e.stopPropagation();
                          void reprintTicket(row.id);
                        }}
                      >
                        {reprintTicketId === String(row.id || "") ? "..." : "Qayta chek"}
                      </button>
                    </div>
                    <span>{String(row.createdAt || "").slice(0, 16).replace("T", " ")}</span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
