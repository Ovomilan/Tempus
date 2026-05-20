import { useState, useEffect, useRef } from "react";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  "https://rtedjpnitxjlfbkvrxcv.supabase.co",
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJ0ZWRqcG5pdHhqbGZia3ZyeGN2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkyMTQyNTcsImV4cCI6MjA5NDc5MDI1N30.vxRHh-mHRwMUSMZ0glE1n6vEEUNElIHcZGiC8OUWRaI"
);

const accent = "#1D9E75";
const accentBg = "#E1F5EE";
const warn = "#BA7517";
const warnBg = "#FAEEDA";
const danger = "#E24B4A";
const dangerBg = "#FCEBEB";
const ROLES = { cook: "Повар", waiter: "Официант", barista: "Бариста/Бармен", admin: "Администратор" };
const ROLE_OPTIONS = ["cook", "waiter", "barista", "admin"];

function calcLate(actualStr, scheduledStr) {
  const [ah, am] = actualStr.split(":").map(Number);
  const [sh, sm] = scheduledStr.split(":").map(Number);
  const diff = ah * 60 + am - (sh * 60 + sm);
  return diff > 0 ? diff : 0;
}
function fmt(date) { return new Date(date).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" }); }
function fmtDate(d) { return new Date(d).toLocaleDateString("ru-RU", { day: "numeric", month: "long" }); }
function hoursStr(start, end) {
  if (!start || !end) return "—";
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  const mins = eh * 60 + em - (sh * 60 + sm);
  if (mins <= 0) return "—";
  return `${Math.floor(mins / 60)}ч${mins % 60 > 0 ? ` ${mins % 60}м` : ""}`;
}
function todayStr() { return new Date().toISOString().slice(0, 10); }
function getInitials(name) {
  const parts = name.trim().split(" ");
  return parts.length >= 2 ? parts[0][0] + parts[1][0] : parts[0].slice(0, 2);
}

const s = {
  page: { fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif", fontSize: 15, color: "#1a1a1a", maxWidth: 420, margin: "0 auto", paddingBottom: "2rem", background: "#f5f5f5", minHeight: "100vh" },
  card: { background: "#fff", borderRadius: 12, border: "1px solid #e8e8e8", padding: "12px 14px", marginBottom: 10 },
  btn: (bg, color) => ({ width: "100%", padding: "14px", borderRadius: 12, background: bg, border: "none", color, fontSize: 15, fontWeight: 500, cursor: "pointer" }),
  badge: (bg, color) => ({ display: "inline-block", background: bg, color, fontSize: 11, padding: "3px 8px", borderRadius: 20, fontWeight: 500 }),
  avatar: (bg, color, size = 36) => ({ width: size, height: size, borderRadius: "50%", background: bg, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 500, fontSize: size > 44 ? 18 : 12, color, flexShrink: 0 }),
  input: { width: "100%", padding: "10px 12px", borderRadius: 10, border: "1px solid #ddd", fontSize: 15, background: "#f5f5f5", boxSizing: "border-box" },
  label: { fontSize: 12, color: "#888", marginBottom: 4 },
  row: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: "1px solid #f0f0f0" },
};

export default function App() {
  const [view, setView] = useState("employee");
  const [screen, setScreen] = useState("select");
  const [employees, setEmployees] = useState([]);
  const [venues, setVenues] = useState([]);
  const [schedules, setSchedules] = useState({});
  const [attendance, setAttendance] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [currentUser, setCurrentUser] = useState(null);
  const [shift, setShift] = useState(null);
  const [pin, setPin] = useState("");
  const [pinError, setPinError] = useState(false);
  const [geoStatus, setGeoStatus] = useState("idle");
  const [selfieBlob, setSelfieBlob] = useState(null);
  const [selfieUrl, setSelfieUrl] = useState(null);
  const [cameraStream, setCameraStream] = useState(null);
  const [adminAuthed, setAdminAuthed] = useState(false);
  const [adminPassword, setAdminPassword] = useState("");
  const [adminError, setAdminError] = useState(false);
  const [adminTab, setAdminTab] = useState("dashboard");
  const [selectedVenueId, setSelectedVenueId] = useState(null);
  const [editingEmp, setEditingEmp] = useState(null);
  const [editEmpVal, setEditEmpVal] = useState({});
  const [addingEmp, setAddingEmp] = useState(false);
  const [newEmp, setNewEmp] = useState({ name: "", role: "waiter", venue_id: "", pin: "" });
  const [saving, setSaving] = useState(false);
  const [selectedSelfie, setSelectedSelfie] = useState(null);
  const [reportMonth, setReportMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [reportData, setReportData] = useState([]);
  const [reportLoading, setReportLoading] = useState(false);
  const videoRef = useRef(null);
  const canvasRef = useRef(null);

  useEffect(() => { loadAll(); }, []);

  useEffect(() => {
    if (screen !== "selfie" && cameraStream) {
      cameraStream.getTracks().forEach(t => t.stop());
      setCameraStream(null);
    }
  }, [screen]);

  useEffect(() => {
    if (adminAuthed && adminTab === "report") loadReport();
  }, [adminAuthed, adminTab, reportMonth, selectedVenueId]);

  async function loadAll() {
    setLoading(true);
    setError(null);
    try {
      const [{ data: emps, error: e1 }, { data: vens, error: e2 }, { data: schs, error: e3 }, { data: att, error: e4 }] = await Promise.all([
        supabase.from("employees").select("*"),
        supabase.from("venues").select("*"),
        supabase.from("schedules").select("*"),
        supabase.from("attendance").select("*").eq("shift_date", todayStr()),
      ]);
      if (e1) throw e1; if (e2) throw e2; if (e3) throw e3; if (e4) throw e4;
      setEmployees(emps || []);
      setVenues(vens || []);
      const schMap = {};
      (schs || []).forEach(s => { schMap[s.employee_id] = s; });
      setSchedules(schMap);
      setAttendance(att || []);
      if (vens && vens.length > 0 && !selectedVenueId) setSelectedVenueId(vens[0].id);
    } catch (e) { setError("Ошибка: " + (e.message || JSON.stringify(e))); }
    setLoading(false);
  }

  async function loadReport() {
    setReportLoading(true);
    const from = `${reportMonth}-01`;
    const to = `${reportMonth}-31`;
    const { data, error } = await supabase
      .from("attendance")
      .select("*, employees(name, initials, role, venue_id)")
      .gte("shift_date", from)
      .lte("shift_date", to)
      .order("shift_date", { ascending: false });
    if (!error) setReportData((data || []).filter(r => r.employees?.venue_id === selectedVenueId));
    setReportLoading(false);
  }

  function exportCSV() {
    const rows = [["Дата", "Сотрудник", "Роль", "Приход", "Уход", "Опоздание (мин)"]];
    reportData.forEach(r => {
      rows.push([
        r.shift_date,
        r.employees?.name || "",
        ROLES[r.employees?.role] || "",
        r.start_at ? fmt(r.start_at) : "—",
        r.end_at ? fmt(r.end_at) : "—",
        r.late_minutes || 0,
      ]);
    });
    const csv = rows.map(r => r.join(",")).join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `otchet_${reportMonth}.csv`; a.click();
  }

  function checkAdminPassword() {
    if (adminPassword === "Televizor123") { setAdminAuthed(true); setAdminError(false); setAdminPassword(""); }
    else { setAdminError(true); setAdminPassword(""); }
  }

  function selectEmployee(emp) { setCurrentUser(emp); setPin(""); setPinError(false); setScreen("pin"); }

  function handlePin(digit) {
    if (pin.length < 4) {
      const np = pin + digit;
      setPin(np);
      if (np.length === 4) setTimeout(() => checkPin(np), 100);
    }
  }

  function checkPin(entered) {
    if (entered === currentUser.pin) { setPinError(false); setScreen("main"); }
    else { setPinError(true); setPin(""); }
  }

  function checkGeo(cb) {
    setGeoStatus("checking"); setScreen("geo");
    if (!navigator.geolocation) { setTimeout(() => cb(true), 800); return; }
    navigator.geolocation.getCurrentPosition(
      () => { setGeoStatus("ok"); setTimeout(() => cb(true), 600); },
      () => { setGeoStatus("demo"); setTimeout(() => cb(true), 900); },
      { timeout: 6000, enableHighAccuracy: true }
    );
  }

  async function startCamera() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" }, audio: false });
      setCameraStream(stream);
      if (videoRef.current) { videoRef.current.srcObject = stream; videoRef.current.play(); }
    } catch { startShiftWithSelfie(null); }
  }

  function takeSelfie() {
    const video = videoRef.current, canvas = canvasRef.current;
    if (!video || !canvas) return;
    canvas.width = video.videoWidth; canvas.height = video.videoHeight;
    canvas.getContext("2d").drawImage(video, 0, 0);
    canvas.toBlob(blob => {
      setSelfieBlob(blob);
      setSelfieUrl(URL.createObjectURL(blob));
      cameraStream?.getTracks().forEach(t => t.stop());
      setCameraStream(null);
    }, "image/jpeg", 0.8);
  }

  async function startShiftWithSelfie(blob) {
    const now = new Date();
    const sch = schedules[currentUser.id];
    const lateMin = sch ? calcLate(fmt(now), sch.start_time) : 0;
    let photoUrl = null;
    if (blob) {
      const fileName = `${currentUser.id}_${Date.now()}.jpg`;
      const { error: ue } = await supabase.storage.from("selfies").upload(fileName, blob, { contentType: "image/jpeg" });
      if (!ue) { const { data } = supabase.storage.from("selfies").getPublicUrl(fileName); photoUrl = data.publicUrl; }
    }
    const { data, error } = await supabase.from("attendance").insert({
      employee_id: currentUser.id, shift_date: todayStr(), start_at: now.toISOString(), late_minutes: lateMin, photo_url: photoUrl,
    }).select().single();
    if (error) { setError(error.message); setScreen("main"); return; }
    setShift({ id: data.id, startStr: fmt(now), late: lateMin, photoUrl });
    setSelfieBlob(null); setSelfieUrl(null);
    setScreen("active"); loadAll();
  }

  function startShift() { checkGeo(() => { setScreen("selfie"); setTimeout(startCamera, 300); }); }

  async function endShift() {
    checkGeo(async () => {
      const now = new Date();
      const { error } = await supabase.from("attendance").update({ end_at: now.toISOString() }).eq("id", shift.id);
      if (error) { setError(error.message); return; }
      setShift(s => ({ ...s, endStr: fmt(now) })); setScreen("done"); loadAll();
    });
  }

  async function saveEmployee() {
    setSaving(true);
    const initials = getInitials(editEmpVal.name);
    const { error } = await supabase.from("employees").update({
      name: editEmpVal.name, initials, role: editEmpVal.role,
      venue_id: parseInt(editEmpVal.venue_id), pin: editEmpVal.pin,
    }).eq("id", editingEmp.id);
    if (!error) { setEditingEmp(null); loadAll(); }
    else setError(error.message);
    setSaving(false);
  }

  async function deleteEmployee(id) {
    if (!window.confirm("Удалить сотрудника?")) return;
    await supabase.from("schedules").delete().eq("employee_id", id);
    await supabase.from("attendance").delete().eq("employee_id", id);
    await supabase.from("employees").delete().eq("id", id);
    loadAll();
  }

  async function addEmployee() {
    setSaving(true);
    const initials = getInitials(newEmp.name);
    const { error } = await supabase.from("employees").insert({
      name: newEmp.name, initials, role: newEmp.role, venue_id: parseInt(newEmp.venue_id), pin: newEmp.pin,
    });
    if (!error) { setAddingEmp(false); setNewEmp({ name: "", role: "waiter", venue_id: "", pin: "" }); loadAll(); }
    else setError(error.message);
    setSaving(false);
  }

  async function saveSchedule(empId, start, end) {
    const existing = schedules[empId];
    if (existing) await supabase.from("schedules").update({ start_time: start, end_time: end }).eq("employee_id", empId);
    else await supabase.from("schedules").insert({ employee_id: empId, start_time: start, end_time: end });
    loadAll();
  }

  function Tabs() {
    return (
      <div style={{ display: "flex", background: "#fff", borderBottom: "1px solid #e8e8e8" }}>
        {[["employee", "Сотрудник"], ["admin", "Администратор"]].map(([v, label]) => (
          <button key={v} onClick={() => { setView(v); if (v === "employee") { setScreen("select"); setCurrentUser(null); setPin(""); } }}
            style={{ flex: 1, padding: "13px 0", background: "none", border: "none", borderBottom: view === v ? `2px solid ${accent}` : "2px solid transparent", fontWeight: view === v ? 500 : 400, fontSize: 14, color: view === v ? accent : "#888", cursor: "pointer" }}>
            {label}
          </button>
        ))}
      </div>
    );
  }

  if (loading) return (
    <div style={{ ...s.page, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
      <div style={{ fontSize: 24, fontWeight: 600, color: accent, marginBottom: 8 }}>Tempus</div>
      <div style={{ fontSize: 13, color: "#888" }}>Загрузка...</div>
    </div>
  );

  if (error) return (
    <div style={s.page}>
      <Tabs />
      <div style={{ margin: 16, background: dangerBg, borderRadius: 12, padding: 16 }}>
        <div style={{ fontWeight: 500, color: danger, marginBottom: 6 }}>Ошибка</div>
        <div style={{ fontSize: 13, color: danger }}>{error}</div>
      </div>
      <div style={{ padding: "0 16px" }}>
        <button onClick={() => { setError(null); loadAll(); }} style={s.btn(accentBg, accent)}>Повторить</button>
      </div>
    </div>
  );

  if (selectedSelfie) return (
    <div style={s.page}>
      <div style={{ padding: 16 }}>
        <button onClick={() => setSelectedSelfie(null)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 14, color: "#888", marginBottom: 12 }}>← Назад</button>
        <div style={{ fontWeight: 500, fontSize: 16, marginBottom: 4 }}>{selectedSelfie.name}</div>
        <div style={{ fontSize: 13, color: "#888", marginBottom: 16 }}>{selectedSelfie.time} · {selectedSelfie.date}</div>
        <img src={selectedSelfie.url} alt="selfie" style={{ width: "100%", borderRadius: 16, transform: "scaleX(-1)" }} />
        <div style={{ marginTop: 16, display: "flex", gap: 10 }}>
          <button onClick={() => setSelectedSelfie(null)} style={{ ...s.btn(accentBg, accent), flex: 1 }}>✓ Принять</button>
          <button onClick={() => setSelectedSelfie(null)} style={{ ...s.btn(dangerBg, danger), flex: 1 }}>✗ Отклонить</button>
        </div>
      </div>
    </div>
  );

  if (view === "admin" && !adminAuthed) return (
    <div style={s.page}>
      <Tabs />
      <div style={{ padding: 16, textAlign: "center" }}>
        <div style={{ width: 60, height: 60, borderRadius: "50%", background: "#f0f0f0", display: "flex", alignItems: "center", justifyContent: "center", margin: "40px auto 16px", fontSize: 26 }}>🔒</div>
        <div style={{ fontWeight: 500, fontSize: 18, marginBottom: 4 }}>Панель администратора</div>
        <div style={{ fontSize: 13, color: "#888", marginBottom: 24 }}>Введите пароль</div>
        <input type="password" placeholder="Пароль" value={adminPassword}
          onChange={e => { setAdminPassword(e.target.value); setAdminError(false); }}
          onKeyDown={e => e.key === "Enter" && checkAdminPassword()}
          style={{ ...s.input, marginBottom: 8, border: adminError ? `1px solid ${danger}` : "1px solid #ddd" }} />
        {adminError && <div style={{ color: danger, fontSize: 13, marginBottom: 12 }}>Неверный пароль</div>}
        <button onClick={checkAdminPassword} style={s.btn(accent, "#fff")}>Войти</button>
      </div>
    </div>
  );

  if (view === "admin") {
    const venueEmps = employees.filter(e => e.venue_id === selectedVenueId);
    const venueAtt = attendance.filter(a => venueEmps.some(e => e.id === a.employee_id));
    const lateCount = venueAtt.filter(a => a.late_minutes > 0).length;
    const onShift = venueAtt.filter(a => a.start_at && !a.end_at).length;
    const absent = venueEmps.length - venueAtt.length;

    return (
      <div style={s.page}>
        <Tabs />
        <div style={{ padding: "12px 16px 0", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ fontWeight: 500, fontSize: 16 }}>Администратор</div>
          <button onClick={() => setAdminAuthed(false)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 13, color: "#888" }}>Выйти</button>
        </div>

        <div style={{ display: "flex", gap: 8, padding: "10px 16px", overflowX: "auto" }}>
          {[["dashboard", "Дашборд"], ["employees", "Сотрудники"], ["report", "Отчёт"]].map(([t, label]) => (
            <button key={t} onClick={() => setAdminTab(t)}
              style={{ padding: "7px 16px", borderRadius: 20, border: "none", background: adminTab === t ? accent : "#fff", color: adminTab === t ? "#fff" : "#888", fontSize: 13, fontWeight: adminTab === t ? 500 : 400, cursor: "pointer", whiteSpace: "nowrap" }}>
              {label}
            </button>
          ))}
        </div>

        <div style={{ display: "flex", gap: 8, padding: "0 16px 12px", overflowX: "auto" }}>
          {venues.map(v => (
            <button key={v.id} onClick={() => setSelectedVenueId(v.id)}
              style={{ padding: "6px 14px", borderRadius: 20, border: selectedVenueId === v.id ? `2px solid ${accent}` : "1px solid #ddd", background: selectedVenueId === v.id ? accentBg : "#fff", color: selectedVenueId === v.id ? accent : "#888", fontSize: 13, cursor: "pointer", whiteSpace: "nowrap", fontWeight: selectedVenueId === v.id ? 500 : 400 }}>
              {v.name}
            </button>
          ))}
        </div>

        <div style={{ padding: "0 16px" }}>
          {adminTab === "dashboard" && (
            <div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 16 }}>
                {[["На смене", onShift, accent], ["Опоздали", lateCount, warn], ["Отсутствуют", absent, danger]].map(([label, val, color]) => (
                  <div key={label} style={{ background: "#fff", borderRadius: 12, padding: "12px 10px", textAlign: "center", border: "1px solid #e8e8e8" }}>
                    <div style={{ fontSize: 26, fontWeight: 600, color }}>{val}</div>
                    <div style={{ fontSize: 11, color: "#888", marginTop: 2 }}>{label}</div>
                  </div>
                ))}
              </div>
              <div style={{ fontWeight: 500, fontSize: 15, marginBottom: 10 }}>Журнал сегодня</div>
              {venueEmps.length === 0 && <div style={{ fontSize: 13, color: "#888" }}>Нет сотрудников в этом объекте</div>}
              {venueEmps.map(e => {
                const att = attendance.find(a => a.employee_id === e.id);
                const sch = schedules[e.id];
                return (
                  <div key={e.id} style={s.card}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <div style={s.avatar(att?.start_at ? accentBg : "#f0f0f0", att?.start_at ? accent : "#888")}>{e.initials}</div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 14, fontWeight: 500 }}>{e.name}</div>
                        <div style={{ fontSize: 12, color: "#888" }}>
                          {att?.start_at ? `${fmt(att.start_at)}${att.end_at ? ` – ${fmt(att.end_at)}` : " · на смене"}` : sch ? `по графику: ${sch.start_time}` : "нет графика"}
                        </div>
                      </div>
                      <div style={{ textAlign: "right" }}>
                        {att?.start_at
                          ? <span style={s.badge(att.end_at ? "#f0f0f0" : accentBg, att.end_at ? "#888" : accent)}>{att.end_at ? "завершил" : "на смене"}</span>
                          : <span style={s.badge("#f0f0f0", "#888")}>не явился</span>}
                        {att?.late_minutes > 0 && <div style={{ fontSize: 11, color: warn, marginTop: 3 }}>+{att.late_minutes} мин</div>}
                      </div>
                    </div>
                    {att?.photo_url && (
                      <div style={{ marginTop: 10, display: "flex", alignItems: "center", gap: 10 }}>
                        <img src={att.photo_url} alt="selfie" onClick={() => setSelectedSelfie({ url: att.photo_url, name: e.name, time: fmt(att.start_at), date: fmtDate(att.shift_date) })}
                          style={{ width: 56, height: 56, borderRadius: 10, objectFit: "cover", transform: "scaleX(-1)", cursor: "pointer", border: "2px solid #e8e8e8" }} />
                        <button onClick={() => setSelectedSelfie({ url: att.photo_url, name: e.name, time: fmt(att.start_at), date: fmtDate(att.shift_date) })}
                          style={{ background: "none", border: "none", cursor: "pointer", fontSize: 13, color: accent }}>
                          Проверить фото →
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {adminTab === "report" && (
            <div>
              <div style={{ display: "flex", gap: 10, marginBottom: 14, alignItems: "center" }}>
                <input type="month" value={reportMonth} onChange={e => setReportMonth(e.target.value)}
                  style={{ flex: 1, padding: "10px 12px", borderRadius: 10, border: "1px solid #ddd", fontSize: 15, background: "#f5f5f5" }} />
                <button onClick={exportCSV} style={{ padding: "10px 14px", borderRadius: 10, background: accentBg, border: "none", color: accent, fontSize: 13, fontWeight: 500, cursor: "pointer", whiteSpace: "nowrap" }}>
                  ⬇ CSV
                </button>
              </div>
              {reportLoading ? (
                <div style={{ textAlign: "center", padding: 32, color: "#888", fontSize: 13 }}>Загрузка...</div>
              ) : reportData.length === 0 ? (
                <div style={{ textAlign: "center", padding: 32, color: "#888", fontSize: 13 }}>Нет данных за этот период</div>
              ) : (
                <>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 16 }}>
                    {[
                      ["Смен", reportData.length, accent],
                      ["Опозданий", reportData.filter(r => r.late_minutes > 0).length, warn],
                      ["Ср. опоздание", reportData.filter(r => r.late_minutes > 0).length > 0
                        ? Math.round(reportData.filter(r => r.late_minutes > 0).reduce((s, r) => s + r.late_minutes, 0) / reportData.filter(r => r.late_minutes > 0).length) + " мин"
                        : "0 мин", "#888"],
                    ].map(([label, val, color]) => (
                      <div key={label} style={{ background: "#fff", borderRadius: 12, padding: "12px 10px", textAlign: "center", border: "1px solid #e8e8e8" }}>
                        <div style={{ fontSize: 22, fontWeight: 600, color }}>{val}</div>
                        <div style={{ fontSize: 11, color: "#888", marginTop: 2 }}>{label}</div>
                      </div>
                    ))}
                  </div>
                  {reportData.map((r, i) => {
                    const emp = r.employees;
                    return (
                      <div key={i} style={s.card}>
                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                          <div style={s.avatar(accentBg, accent)}>{emp?.initials || "?"}</div>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontWeight: 500, fontSize: 14 }}>{emp?.name}</div>
                            <div style={{ fontSize: 12, color: "#888" }}>
                              {new Date(r.shift_date).toLocaleDateString("ru-RU", { day: "numeric", month: "long", weekday: "short" })}
                            </div>
                          </div>
                          {r.late_minutes > 0
                            ? <span style={s.badge(warnBg, warn)}>+{r.late_minutes} мин</span>
                            : <span style={s.badge(accentBg, accent)}>вовремя</span>}
                        </div>
                        <div style={{ display: "flex", gap: 20, marginTop: 10, paddingTop: 10, borderTop: "1px solid #f0f0f0" }}>
                          <div>
                            <div style={{ fontSize: 11, color: "#888" }}>Приход</div>
                            <div style={{ fontSize: 14, fontWeight: 500 }}>{r.start_at ? fmt(r.start_at) : "—"}</div>
                          </div>
                          <div>
                            <div style={{ fontSize: 11, color: "#888" }}>Уход</div>
                            <div style={{ fontSize: 14, fontWeight: 500 }}>{r.end_at ? fmt(r.end_at) : "—"}</div>
                          </div>
                          {r.start_at && r.end_at && (
                            <div>
                              <div style={{ fontSize: 11, color: "#888" }}>Итого</div>
                              <div style={{ fontSize: 14, fontWeight: 500 }}>
                                {(() => { const mins = Math.round((new Date(r.end_at) - new Date(r.start_at)) / 60000); return `${Math.floor(mins / 60)}ч ${mins % 60}м`; })()}
                              </div>
                            </div>
                          )}
                        </div>
                        {r.photo_url && (
                          <img src={r.photo_url} onClick={() => setSelectedSelfie({ url: r.photo_url, name: emp?.name, time: fmt(r.start_at), date: fmtDate(r.shift_date) })}
                            style={{ width: 48, height: 48, borderRadius: 8, objectFit: "cover", transform: "scaleX(-1)", cursor: "pointer", border: "2px solid #e8e8e8", marginTop: 8 }} />
                        )}
                      </div>
                    );
                  })}
                </>
              )}
            </div>
          )}

          {adminTab === "employees" && (
            <div>
              <button onClick={() => { setAddingEmp(true); setNewEmp({ name: "", role: "waiter", venue_id: selectedVenueId || venues[0]?.id, pin: "" }); }}
                style={{ ...s.btn(accent, "#fff"), marginBottom: 14 }}>
                + Добавить сотрудника
              </button>
              {addingEmp && (
                <div style={{ ...s.card, marginBottom: 14, border: `1px solid ${accent}` }}>
                  <div style={{ fontWeight: 500, fontSize: 14, marginBottom: 12 }}>Новый сотрудник</div>
                  {[["Имя и фамилия", "name", "text"], ["PIN (4 цифры)", "pin", "number"]].map(([label, key, type]) => (
                    <div key={key} style={{ marginBottom: 10 }}>
                      <div style={s.label}>{label}</div>
                      <input type={type} value={newEmp[key]} onChange={e => setNewEmp(v => ({ ...v, [key]: e.target.value }))} style={s.input} />
                    </div>
                  ))}
                  <div style={{ marginBottom: 10 }}>
                    <div style={s.label}>Роль</div>
                    <select value={newEmp.role} onChange={e => setNewEmp(v => ({ ...v, role: e.target.value }))} style={s.input}>
                      {ROLE_OPTIONS.map(r => <option key={r} value={r}>{ROLES[r]}</option>)}
                    </select>
                  </div>
                  <div style={{ marginBottom: 12 }}>
                    <div style={s.label}>Объект</div>
                    <select value={newEmp.venue_id} onChange={e => setNewEmp(v => ({ ...v, venue_id: e.target.value }))} style={s.input}>
                      {venues.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
                    </select>
                  </div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button onClick={addEmployee} disabled={saving || !newEmp.name || !newEmp.pin}
                      style={{ flex: 1, padding: 10, borderRadius: 10, background: accent, border: "none", color: "#fff", fontSize: 14, fontWeight: 500, cursor: "pointer", opacity: saving ? 0.7 : 1 }}>
                      {saving ? "Сохраняем..." : "Добавить"}
                    </button>
                    <button onClick={() => setAddingEmp(false)}
                      style={{ padding: "10px 16px", borderRadius: 10, background: "none", border: "1px solid #ddd", fontSize: 14, cursor: "pointer", color: "#888" }}>
                      Отмена
                    </button>
                  </div>
                </div>
              )}
              {employees.filter(e => e.venue_id === selectedVenueId).map(e => {
                const sch = schedules[e.id];
                const isEditing = editingEmp?.id === e.id;
                return (
                  <div key={e.id} style={s.card}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: isEditing ? 12 : 0 }}>
                      <div style={s.avatar(accentBg, accent)}>{e.initials}</div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 500, fontSize: 14 }}>{e.name}</div>
                        <div style={{ fontSize: 12, color: "#888" }}>{ROLES[e.role]} · {sch ? `${sch.start_time}–${sch.end_time}` : "нет графика"}</div>
                      </div>
                      {!isEditing && (
                        <div style={{ display: "flex", gap: 6 }}>
                          <button onClick={() => { setEditingEmp(e); setEditEmpVal({ name: e.name, role: e.role, venue_id: e.venue_id, pin: e.pin || "", start: sch?.start_time || "10:00", end: sch?.end_time || "19:00" }); }}
                            style={{ padding: "6px 10px", borderRadius: 8, background: "#f5f5f5", border: "1px solid #e8e8e8", fontSize: 13, cursor: "pointer" }}>✏️</button>
                          <button onClick={() => deleteEmployee(e.id)}
                            style={{ padding: "6px 10px", borderRadius: 8, background: dangerBg, border: "none", fontSize: 13, cursor: "pointer" }}>🗑</button>
                        </div>
                      )}
                    </div>
                    {isEditing && (
                      <div>
                        {[["Имя и фамилия", "name", "text"], ["PIN (4 цифры)", "pin", "number"]].map(([label, key, type]) => (
                          <div key={key} style={{ marginBottom: 10 }}>
                            <div style={s.label}>{label}</div>
                            <input type={type} value={editEmpVal[key]} onChange={ev => setEditEmpVal(v => ({ ...v, [key]: ev.target.value }))} style={s.input} />
                          </div>
                        ))}
                        <div style={{ marginBottom: 10 }}>
                          <div style={s.label}>Роль</div>
                          <select value={editEmpVal.role} onChange={ev => setEditEmpVal(v => ({ ...v, role: ev.target.value }))} style={s.input}>
                            {ROLE_OPTIONS.map(r => <option key={r} value={r}>{ROLES[r]}</option>)}
                          </select>
                        </div>
                        <div style={{ marginBottom: 10 }}>
                          <div style={s.label}>Объект</div>
                          <select value={editEmpVal.venue_id} onChange={ev => setEditEmpVal(v => ({ ...v, venue_id: ev.target.value }))} style={s.input}>
                            {venues.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
                          </select>
                        </div>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
                          {[["Начало смены", "start"], ["Конец смены", "end"]].map(([label, key]) => (
                            <div key={key}>
                              <div style={s.label}>{label}</div>
                              <input type="time" value={editEmpVal[key]} onChange={ev => setEditEmpVal(v => ({ ...v, [key]: ev.target.value }))} style={s.input} />
                            </div>
                          ))}
                        </div>
                        <div style={{ display: "flex", gap: 8 }}>
                          <button onClick={async () => { await saveEmployee(); await saveSchedule(e.id, editEmpVal.start, editEmpVal.end); }} disabled={saving}
                            style={{ flex: 1, padding: 10, borderRadius: 10, background: accent, border: "none", color: "#fff", fontSize: 14, fontWeight: 500, cursor: "pointer", opacity: saving ? 0.7 : 1 }}>
                            {saving ? "Сохраняем..." : "Сохранить"}
                          </button>
                          <button onClick={() => setEditingEmp(null)}
                            style={{ padding: "10px 16px", borderRadius: 10, background: "none", border: "1px solid #ddd", fontSize: 14, cursor: "pointer", color: "#888" }}>
                            Отмена
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    );
  }

  if (screen === "select") return (
    <div style={s.page}>
      <Tabs />
      <div style={{ padding: 16 }}>
        <div style={{ fontWeight: 500, fontSize: 18, marginBottom: 4 }}>Добро пожаловать</div>
        <div style={{ fontSize: 13, color: "#888", marginBottom: 16 }}>Выберите свой объект</div>
        <div style={{ display: "flex", gap: 8, marginBottom: 20, overflowX: "auto" }}>
          {venues.map(v => (
            <button key={v.id} onClick={() => setSelectedVenueId(v.id)}
              style={{ padding: "8px 16px", borderRadius: 20, border: selectedVenueId === v.id ? `2px solid ${accent}` : "1px solid #ddd", background: selectedVenueId === v.id ? accentBg : "#fff", color: selectedVenueId === v.id ? accent : "#888", fontSize: 13, cursor: "pointer", whiteSpace: "nowrap", fontWeight: selectedVenueId === v.id ? 500 : 400 }}>
              {v.name}
            </button>
          ))}
        </div>
        <div style={{ fontSize: 13, color: "#888", marginBottom: 12 }}>Выберите своё имя</div>
        {employees.filter(e => e.venue_id === selectedVenueId).map(emp => {
          const att = attendance.find(a => a.employee_id === emp.id);
          return (
            <button key={emp.id} onClick={() => selectEmployee(emp)}
              style={{ width: "100%", background: "#fff", border: "1px solid #e8e8e8", borderRadius: 12, padding: "12px 14px", marginBottom: 10, cursor: "pointer", display: "flex", alignItems: "center", gap: 12, textAlign: "left" }}>
              <div style={s.avatar(accentBg, accent, 44)}>{emp.initials}</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 500, fontSize: 15 }}>{emp.name}</div>
                <div style={{ fontSize: 12, color: "#888" }}>{ROLES[emp.role]}</div>
              </div>
              {att?.start_at && !att?.end_at && <span style={s.badge(accentBg, accent)}>на смене</span>}
            </button>
          );
        })}
      </div>
    </div>
  );

  if (screen === "pin") return (
    <div style={s.page}>
      <Tabs />
      <div style={{ padding: 16, textAlign: "center" }}>
        <button onClick={() => setScreen("select")} style={{ background: "none", border: "none", cursor: "pointer", color: "#888", fontSize: 14, marginBottom: 20, display: "flex", alignItems: "center", gap: 4 }}>← Назад</button>
        <div style={{ ...s.avatar(accentBg, accent, 64), margin: "0 auto 12px" }}>{currentUser?.initials}</div>
        <div style={{ fontWeight: 500, fontSize: 18 }}>{currentUser?.name}</div>
        <div style={{ fontSize: 13, color: "#888", marginBottom: 32 }}>Введите PIN-код</div>
        <div style={{ display: "flex", justifyContent: "center", gap: 16, marginBottom: 32 }}>
          {[0,1,2,3].map(i => <div key={i} style={{ width: 16, height: 16, borderRadius: "50%", background: i < pin.length ? (pinError ? danger : accent) : "#e0e0e0", transition: "background 0.2s" }} />)}
        </div>
        {pinError && <div style={{ color: danger, fontSize: 13, marginBottom: 16 }}>Неверный PIN</div>}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, maxWidth: 280, margin: "0 auto" }}>
          {[1,2,3,4,5,6,7,8,9,"",0,"⌫"].map((d, i) => (
            <button key={i} onClick={() => { if (d === "⌫") setPin(p => p.slice(0,-1)); else if (d !== "") handlePin(String(d)); }}
              style={{ padding: "18px 0", borderRadius: 12, background: d === "" ? "transparent" : "#fff", border: d === "" ? "none" : "1px solid #e8e8e8", fontSize: d === "⌫" ? 20 : 22, fontWeight: 500, cursor: d === "" ? "default" : "pointer" }}>
              {d}
            </button>
          ))}
        </div>
      </div>
    </div>
  );

  if (screen === "geo") return (
    <div style={s.page}><Tabs />
      <div style={{ textAlign: "center", padding: "60px 24px 0" }}>
        <div style={{ width: 64, height: 64, borderRadius: "50%", background: accentBg, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 20px", fontSize: 28 }}>📍</div>
        <div style={{ fontWeight: 500, fontSize: 16, marginBottom: 8 }}>Проверка геолокации</div>
        <div style={{ fontSize: 13, color: "#888" }}>{geoStatus === "checking" ? "Определяем..." : geoStatus === "demo" ? "Демо-режим" : "Подтверждено ✓"}</div>
      </div>
    </div>
  );

  if (screen === "selfie") return (
    <div style={s.page}><Tabs />
      <div style={{ padding: 16 }}>
        <div style={{ fontWeight: 500, fontSize: 16, marginBottom: 4 }}>Сделайте селфи</div>
        <div style={{ fontSize: 13, color: "#888", marginBottom: 16 }}>Фото сохранится в журнале</div>
        {!selfieUrl ? (
          <div>
            <div style={{ borderRadius: 16, overflow: "hidden", background: "#000", marginBottom: 16, aspectRatio: "1" }}>
              <video ref={videoRef} autoPlay playsInline muted style={{ width: "100%", height: "100%", objectFit: "cover", transform: "scaleX(-1)" }} />
            </div>
            <canvas ref={canvasRef} style={{ display: "none" }} />
            <button onClick={takeSelfie} style={s.btn(accent, "#fff")}>📸 Сделать фото</button>
          </div>
        ) : (
          <div>
            <img src={selfieUrl} alt="selfie" style={{ width: "100%", borderRadius: 16, marginBottom: 16, transform: "scaleX(-1)" }} />
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => { setSelfieUrl(null); setSelfieBlob(null); startCamera(); }} style={{ flex: 1, padding: 14, borderRadius: 12, background: "#f5f5f5", border: "1px solid #e8e8e8", fontSize: 15, cursor: "pointer" }}>Переснять</button>
              <button onClick={() => startShiftWithSelfie(selfieBlob)} style={{ flex: 2, padding: 14, borderRadius: 12, background: accent, border: "none", color: "#fff", fontSize: 15, fontWeight: 500, cursor: "pointer" }}>Начать смену ✓</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );

  const schedule = currentUser ? schedules[currentUser.id] : null;
  const todayAtt = attendance.filter(a => a.employee_id === currentUser?.id);
  const activeAtt = todayAtt.find(a => a.start_at && !a.end_at);
  const venue = venues.find(v => v.id === currentUser?.venue_id);

  if (screen === "active") return (
    <div style={s.page}><Tabs />
      <div style={{ padding: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
          <div style={s.avatar(accentBg, accent, 40)}>{currentUser?.initials}</div>
          <div>
            <div style={{ fontWeight: 500, fontSize: 14 }}>{currentUser?.name}</div>
            <div style={{ fontSize: 12, color: "#888" }}>{ROLES[currentUser?.role]} · {venue?.name}</div>
          </div>
        </div>
        <div style={{ background: accentBg, borderRadius: 14, padding: 20, marginBottom: 14 }}>
          <div style={{ fontSize: 11, color: accent, fontWeight: 500, marginBottom: 14, textTransform: "uppercase", letterSpacing: 0.5 }}>Смена идёт</div>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <div><div style={{ fontSize: 11, color: "#0F6E56", marginBottom: 2 }}>Начало</div><div style={{ fontSize: 32, fontWeight: 500, color: accent }}>{shift?.startStr}</div></div>
            <div style={{ textAlign: "right" }}><div style={{ fontSize: 11, color: "#0F6E56", marginBottom: 2 }}>По графику до</div><div style={{ fontSize: 32, fontWeight: 500, color: accent }}>{schedule?.end_time || "—"}</div></div>
          </div>
          {shift?.late > 0 && (
            <div style={{ marginTop: 12, background: warnBg, borderRadius: 8, padding: "8px 12px" }}>
              <span style={{ fontSize: 13, color: warn, fontWeight: 500 }}>⚠️ Опоздание {shift.late} мин · начало в {schedule?.start_time}</span>
            </div>
          )}
        </div>
        {shift?.photoUrl && <img src={shift.photoUrl} alt="selfie" style={{ width: 70, height: 70, borderRadius: 10, objectFit: "cover", transform: "scaleX(-1)", marginBottom: 14 }} />}
        <button onClick={endShift} style={s.btn(danger, "#fff")}>Завершить смену</button>
      </div>
    </div>
  );

  if (screen === "done") return (
    <div style={s.page}><Tabs />
      <div style={{ padding: "32px 16px 0", textAlign: "center" }}>
        <div style={{ width: 60, height: 60, borderRadius: "50%", background: accentBg, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 14px", fontSize: 26, color: accent }}>✓</div>
        <div style={{ fontWeight: 500, fontSize: 18, marginBottom: 4 }}>Смена завершена</div>
        <div style={{ fontSize: 13, color: "#888", marginBottom: 20 }}>{fmtDate(new Date())}</div>
        <div style={{ background: "#f5f5f5", borderRadius: 12, padding: "14px 18px", textAlign: "left", marginBottom: 14 }}>
          {[["По графику", `${schedule?.start_time || "—"} – ${schedule?.end_time || "—"}`], ["Фактически", `${shift?.startStr} – ${shift?.endStr}`], ["Опоздание", shift?.late > 0 ? `${shift.late} мин` : "нет"]].map(([k, v]) => (
            <div key={k} style={s.row}><span style={{ fontSize: 13, color: "#888" }}>{k}</span><span style={{ fontSize: 13, fontWeight: 500, color: k === "Опоздание" && shift?.late > 0 ? warn : "#1a1a1a" }}>{v}</span></div>
          ))}
        </div>
        <button onClick={() => { setShift(null); setCurrentUser(null); setScreen("select"); loadAll(); }} style={s.btn(accentBg, accent)}>Выйти</button>
      </div>
    </div>
  );

  return (
    <div style={s.page}><Tabs />
      <div style={{ padding: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
          <div style={s.avatar(accentBg, accent, 44)}>{currentUser?.initials}</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 500, fontSize: 15 }}>{currentUser?.name}</div>
            <div style={{ fontSize: 12, color: "#888" }}>{ROLES[currentUser?.role]} · {venue?.name}</div>
          </div>
          <button onClick={() => { setCurrentUser(null); setScreen("select"); }} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 13, color: "#888" }}>Выйти</button>
        </div>
        {schedule && (
          <div style={{ background: "#fff", borderRadius: 12, border: "1px solid #e8e8e8", padding: "14px 16px", marginBottom: 14 }}>
            <div style={s.label}>График на сегодня</div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ fontSize: 22, fontWeight: 500 }}>{schedule.start_time} – {schedule.end_time}</div>
              <span style={{ fontSize: 12, color: "#888" }}>{hoursStr(schedule.start_time, schedule.end_time)}</span>
            </div>
          </div>
        )}
        {activeAtt ? (
          <button onClick={() => { setShift({ id: activeAtt.id, startStr: fmt(activeAtt.start_at), late: activeAtt.late_minutes, photoUrl: activeAtt.photo_url }); setScreen("active"); }}
            style={{ ...s.btn(danger, "#fff"), marginBottom: 8 }}>Завершить смену</button>
        ) : (
          <button onClick={startShift} style={{ ...s.btn(accent, "#fff"), marginBottom: 8 }}>Начать смену</button>
        )}
        <div style={{ fontSize: 12, color: "#aaa", textAlign: "center", marginBottom: 20 }}>📍 Геолокация · 📸 Селфи · 🔐 PIN</div>
        {todayAtt.length > 0 && <>
          <div style={{ fontWeight: 500, fontSize: 14, marginBottom: 10 }}>Сегодня</div>
          {todayAtt.map((a, i) => (
            <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0", borderBottom: "1px solid #f0f0f0" }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 500 }}>{fmtDate(a.shift_date)}</div>
                <div style={{ fontSize: 12, color: "#888" }}>{fmt(a.start_at)} – {a.end_at ? fmt(a.end_at) : "сейчас"}</div>
              </div>
              {a.late_minutes > 0 ? <span style={s.badge(warnBg, warn)}>+{a.late_minutes} мин</span> : <span style={s.badge(accentBg, accent)}>вовремя</span>}
            </div>
          ))}
        </>}
      </div>
    </div>
  );
}
