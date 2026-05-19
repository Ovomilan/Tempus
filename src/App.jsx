import { useState, useEffect } from "react";
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

const ROLES = {
  cook: "Повар",
  waiter: "Официант",
  barista: "Бариста/Бармен",
  admin: "Администратор",
};

function calcLate(actualStr, scheduledStr) {
  const [ah, am] = actualStr.split(":").map(Number);
  const [sh, sm] = scheduledStr.split(":").map(Number);
  const diff = ah * 60 + am - (sh * 60 + sm);
  return diff > 0 ? diff : 0;
}

function fmt(date) {
  return new Date(date).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
}

function fmtDate(d) {
  return new Date(d).toLocaleDateString("ru-RU", { day: "numeric", month: "long" });
}

function hoursStr(start, end) {
  if (!start || !end) return "—";
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  const mins = eh * 60 + em - (sh * 60 + sm);
  if (mins <= 0) return "—";
  return `${Math.floor(mins / 60)}ч${mins % 60 > 0 ? ` ${mins % 60}м` : ""}`;
}

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

const s = {
  page: { fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif", fontSize: 15, color: "#1a1a1a", maxWidth: 420, margin: "0 auto", paddingBottom: "2rem", background: "#f5f5f5", minHeight: "100vh" },
  card: { background: "#fff", borderRadius: 12, border: "1px solid #e8e8e8", padding: "12px 14px", marginBottom: 10 },
  btn: (bg, color) => ({ width: "100%", padding: "15px", borderRadius: 12, background: bg, border: "none", color, fontSize: 16, fontWeight: 500, cursor: "pointer" }),
  badge: (bg, color) => ({ display: "inline-block", background: bg, color, fontSize: 11, padding: "3px 8px", borderRadius: 20, fontWeight: 500 }),
  avatar: (bg, color) => ({ width: 36, height: 36, borderRadius: "50%", background: bg, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 500, fontSize: 12, color, flexShrink: 0 }),
  label: { fontSize: 12, color: "#888", marginBottom: 4 },
  row: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "7px 0", borderBottom: "1px solid #f0f0f0" },
};

export default function App() {
  const [view, setView] = useState("employee");
  const [screen, setScreen] = useState("main");
  const [employees, setEmployees] = useState([]);
  const [venues, setVenues] = useState([]);
  const [schedules, setSchedules] = useState({});
  const [attendance, setAttendance] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [shift, setShift] = useState(null);
  const [geoStatus, setGeoStatus] = useState("idle");
  const [editingId, setEditingId] = useState(null);
  const [editVal, setEditVal] = useState({ start: "10:00", end: "19:00" });
  const [saving, setSaving] = useState(false);

  useEffect(() => { loadAll(); }, []);

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
      if (e1) throw e1;
      if (e2) throw e2;
      if (e3) throw e3;
      if (e4) throw e4;
      setEmployees(emps || []);
      setVenues(vens || []);
      const schMap = {};
      (schs || []).forEach((s) => { schMap[s.employee_id] = s; });
      setSchedules(schMap);
      setAttendance(att || []);
    } catch (e) {
      setError("Ошибка: " + (e.message || JSON.stringify(e)));
    }
    setLoading(false);
  }

  function checkGeo(cb) {
    setGeoStatus("checking");
    setScreen("geo");
    if (!navigator.geolocation) { setTimeout(() => cb(true), 800); return; }
    navigator.geolocation.getCurrentPosition(
      () => { setGeoStatus("ok"); setTimeout(() => cb(true), 600); },
      () => { setGeoStatus("demo"); setTimeout(() => cb(true), 900); },
      { timeout: 6000, enableHighAccuracy: true }
    );
  }

  async function startShift() {
    checkGeo(async () => {
      const emp = employees[0];
      if (!emp) return;
      const now = new Date();
      const sch = schedules[emp.id];
      const lateMin = sch ? calcLate(fmt(now), sch.start_time) : 0;
      const { data, error } = await supabase.from("attendance").insert({
        employee_id: emp.id,
        shift_date: todayStr(),
        start_at: now.toISOString(),
        late_minutes: lateMin,
      }).select().single();
      if (error) { setError(error.message); setScreen("main"); return; }
      setShift({ id: data.id, startStr: fmt(now), late: lateMin });
      setScreen("active");
      loadAll();
    });
  }

  async function endShift() {
    checkGeo(async () => {
      const now = new Date();
      const { error } = await supabase.from("attendance").update({ end_at: now.toISOString() }).eq("id", shift.id);
      if (error) { setError(error.message); return; }
      setShift((s) => ({ ...s, endStr: fmt(now) }));
      setScreen("done");
      loadAll();
    });
  }

  async function saveSchedule() {
    setSaving(true);
    const existing = schedules[editingId];
    const { error } = existing
      ? await supabase.from("schedules").update({ start_time: editVal.start, end_time: editVal.end }).eq("employee_id", editingId)
      : await supabase.from("schedules").insert({ employee_id: editingId, start_time: editVal.start, end_time: editVal.end });
    if (!error) {
      setSchedules((s) => ({ ...s, [editingId]: { ...(s[editingId] || {}), start_time: editVal.start, end_time: editVal.end } }));
      setEditingId(null);
    } else {
      setError(error.message);
    }
    setSaving(false);
  }

  function Tabs() {
    return (
      <div style={{ display: "flex", background: "#fff", borderBottom: "1px solid #e8e8e8" }}>
        {[["employee", "Сотрудник"], ["admin", "Администратор"]].map(([v, label]) => (
          <button key={v} onClick={() => { setView(v); setScreen("main"); }}
            style={{ flex: 1, padding: "13px 0", background: "none", border: "none", borderBottom: view === v ? `2px solid ${accent}` : "2px solid transparent", fontWeight: view === v ? 500 : 400, fontSize: 14, color: view === v ? accent : "#888", cursor: "pointer" }}>
            {label}
          </button>
        ))}
      </div>
    );
  }

  if (loading) return (
    <div style={{ ...s.page, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
      <div style={{ fontSize: 22, fontWeight: 500, color: accent, marginBottom: 8 }}>Tempus</div>
      <div style={{ fontSize: 13, color: "#888" }}>Загрузка...</div>
    </div>
  );

  if (error) return (
    <div style={s.page}>
      <Tabs />
      <div style={{ margin: 16, background: "#FCEBEB", borderRadius: 12, padding: 16 }}>
        <div style={{ fontWeight: 500, color: danger, marginBottom: 6 }}>Ошибка</div>
        <div style={{ fontSize: 13, color: danger }}>{error}</div>
      </div>
      <div style={{ padding: "0 16px" }}>
        <button onClick={() => { setError(null); loadAll(); }} style={s.btn(accentBg, accent)}>Повторить</button>
      </div>
    </div>
  );

  const emp = employees[0];
  const schedule = emp ? schedules[emp.id] : null;
  const todayAtt = attendance.filter((a) => a.employee_id === emp?.id);
  const activeAtt = todayAtt.find((a) => a.start_at && !a.end_at);

  if (screen === "geo") return (
    <div style={s.page}>
      <Tabs />
      <div style={{ textAlign: "center", padding: "60px 24px 0" }}>
        <div style={{ width: 64, height: 64, borderRadius: "50%", background: accentBg, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 20px", fontSize: 28, color: accent }}>📍</div>
        <div style={{ fontWeight: 500, fontSize: 16, marginBottom: 8 }}>Проверка геолокации</div>
        <div style={{ fontSize: 13, color: "#888" }}>
          {geoStatus === "checking" ? "Определяем местоположение..." : geoStatus === "demo" ? "Демо-режим" : "Подтверждено ✓"}
        </div>
      </div>
    </div>
  );

  if (screen === "active") return (
    <div style={s.page}>
      <Tabs />
      <div style={{ padding: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
          <div style={s.avatar(accentBg, accent)}>{emp?.initials}</div>
          <div>
            <div style={{ fontWeight: 500, fontSize: 14 }}>{emp?.name}</div>
            <div style={{ fontSize: 12, color: "#888" }}>{ROLES[emp?.role]}</div>
          </div>
        </div>
        <div style={{ background: accentBg, borderRadius: 14, padding: 20, marginBottom: 14 }}>
          <div style={{ fontSize: 11, color: accent, fontWeight: 500, marginBottom: 14, textTransform: "uppercase", letterSpacing: 0.5 }}>Смена идёт</div>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <div>
              <div style={{ fontSize: 11, color: "#0F6E56", marginBottom: 2 }}>Начало</div>
              <div style={{ fontSize: 32, fontWeight: 500, color: accent }}>{shift?.startStr}</div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 11, color: "#0F6E56", marginBottom: 2 }}>По графику до</div>
              <div style={{ fontSize: 32, fontWeight: 500, color: accent }}>{schedule?.end_time || "—"}</div>
            </div>
          </div>
          {shift?.late > 0 && (
            <div style={{ marginTop: 12, background: warnBg, borderRadius: 8, padding: "8px 12px" }}>
              <span style={{ fontSize: 13, color: warn, fontWeight: 500 }}>⚠️ Опоздание {shift.late} мин · начало в {schedule?.start_time}</span>
            </div>
          )}
        </div>
        <button onClick={endShift} style={s.btn(danger, "#fff")}>Завершить смену</button>
      </div>
    </div>
  );

  if (screen === "done") return (
    <div style={s.page}>
      <Tabs />
      <div style={{ padding: "32px 16px 0", textAlign: "center" }}>
        <div style={{ width: 60, height: 60, borderRadius: "50%", background: accentBg, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 14px", fontSize: 26 }}>✓</div>
        <div style={{ fontWeight: 500, fontSize: 18, marginBottom: 4 }}>Смена завершена</div>
        <div style={{ fontSize: 13, color: "#888", marginBottom: 20 }}>{fmtDate(new Date())}</div>
        <div style={{ background: "#f5f5f5", borderRadius: 12, padding: "14px 18px", textAlign: "left", marginBottom: 14 }}>
          {[["По графику", `${schedule?.start_time || "—"} – ${schedule?.end_time || "—"}`], ["Фактически", `${shift?.startStr} – ${shift?.endStr}`], ["Опоздание", shift?.late > 0 ? `${shift.late} мин` : "нет"]].map(([k, v]) => (
            <div key={k} style={s.row}>
              <span style={{ fontSize: 13, color: "#888" }}>{k}</span>
              <span style={{ fontSize: 13, fontWeight: 500, color: k === "Опоздание" && shift?.late > 0 ? warn : "#1a1a1a" }}>{v}</span>
            </div>
          ))}
        </div>
        <button onClick={() => { setShift(null); setScreen("main"); loadAll(); }} style={s.btn(accentBg, accent)}>На главную</button>
      </div>
    </div>
  );

  if (view === "admin") return (
    <div style={s.page}>
      <Tabs />
      <div style={{ padding: 16 }}>
        <div style={{ fontWeight: 500, fontSize: 16, marginBottom: 4 }}>График сотрудников</div>
        <div style={{ fontSize: 13, color: "#888", marginBottom: 14 }}>Нажмите на время чтобы изменить</div>
        {employees.map((e) => {
          const sch = schedules[e.id];
          const isEditing = editingId === e.id;
          const venue = venues.find((v) => v.id === e.venue_id);
          return (
            <div key={e.id} style={s.card}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: isEditing ? 12 : 0 }}>
                <div style={s.avatar(accentBg, accent)}>{e.initials}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 500, fontSize: 14 }}>{e.name}</div>
                  <div style={{ fontSize: 12, color: "#888" }}>{ROLES[e.role]} · {venue?.name}</div>
                </div>
                {!isEditing && (
                  <button onClick={() => { setEditingId(e.id); setEditVal({ start: sch?.start_time || "10:00", end: sch?.end_time || "19:00" }); }}
                    style={{ background: "#f5f5f5", border: "1px solid #e8e8e8", borderRadius: 8, padding: "6px 12px", fontSize: 13, cursor: "pointer" }}>
                    {sch ? `${sch.start_time} – ${sch.end_time}` : "Нет графика"}
                  </button>
                )}
              </div>
              {isEditing && (
                <div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 8 }}>
                    {[["Начало", "start"], ["Конец", "end"]].map(([label, key]) => (
                      <div key={key}>
                        <div style={s.label}>{label}</div>
                        <input type="time" value={editVal[key]} onChange={(ev) => setEditVal((v) => ({ ...v, [key]: ev.target.value }))}
                          style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: "1px solid #ddd", fontSize: 15, background: "#f5f5f5", boxSizing: "border-box" }} />
                      </div>
                    ))}
                  </div>
                  <div style={{ fontSize: 12, color: "#888", marginBottom: 10 }}>Длина смены: {hoursStr(editVal.start, editVal.end)}</div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button onClick={saveSchedule} disabled={saving}
                      style={{ flex: 1, padding: 9, borderRadius: 8, background: accent, border: "none", color: "#fff", fontSize: 14, fontWeight: 500, cursor: "pointer", opacity: saving ? 0.7 : 1 }}>
                      {saving ? "Сохраняем..." : "Сохранить"}
                    </button>
                    <button onClick={() => setEditingId(null)}
                      style={{ padding: "9px 16px", borderRadius: 8, background: "none", border: "1px solid #ddd", fontSize: 14, cursor: "pointer", color: "#888" }}>
                      Отмена
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}

        <div style={{ marginTop: 20 }}>
          <div style={{ fontWeight: 500, fontSize: 16, marginBottom: 12 }}>Журнал за сегодня</div>
          {employees.map((e) => {
            const att = attendance.find((a) => a.employee_id === e.id);
            const sch = schedules[e.id];
            return (
              <div key={e.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 0", borderBottom: "1px solid #f0f0f0" }}>
                <div style={s.avatar(att?.start_at ? accentBg : "#f0f0f0", att?.start_at ? accent : "#888")}>{e.initials}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 500 }}>{e.name}</div>
                  <div style={{ fontSize: 12, color: "#888" }}>
                    {att?.start_at ? `${fmt(att.start_at)}${att.end_at ? ` – ${fmt(att.end_at)}` : " · на смене"}` : sch ? `по графику: ${sch.start_time}` : "нет графика"}
                  </div>
                </div>
                <div style={{ textAlign: "right" }}>
                  {att?.start_at
                    ? <span style={s.badge(att.end_at ? "#f0f0f0" : accentBg, att.end_at ? "#888" : accent)}>{att.end_at ? "завершил" : "на смене"}</span>
                    : <span style={s.badge("#f0f0f0", "#888")}>не явился</span>
                  }
                  {att?.late_minutes > 0 && <div style={{ fontSize: 11, color: warn, marginTop: 3 }}>+{att.late_minutes} мин</div>}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );

  return (
    <div style={s.page}>
      <Tabs />
      <div style={{ padding: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
          <div style={s.avatar(accentBg, accent)}>{emp?.initials}</div>
          <div>
            <div style={{ fontWeight: 500, fontSize: 14 }}>{emp?.name}</div>
            <div style={{ fontSize: 12, color: "#888" }}>{ROLES[emp?.role]} · {venues.find((v) => v.id === emp?.venue_id)?.name}</div>
          </div>
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
          <button onClick={() => { setShift({ id: activeAtt.id, startStr: fmt(activeAtt.start_at), late: activeAtt.late_minutes }); setScreen("active"); }}
            style={{ ...s.btn(danger, "#fff"), marginBottom: 8 }}>
            Завершить смену
          </button>
        ) : (
          <button onClick={startShift} style={{ ...s.btn(accent, "#fff"), marginBottom: 8 }}>
            Начать смену
          </button>
        )}

        <div style={{ fontSize: 12, color: "#aaa", textAlign: "center", marginBottom: 20 }}>
          📍 Требуется находиться в зоне заведения
        </div>

        {todayAtt.length > 0 && (
          <>
            <div style={{ fontWeight: 500, fontSize: 14, marginBottom: 10 }}>Сегодня</div>
            {todayAtt.map((a, i) => (
              <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0", borderBottom: "1px solid #f0f0f0" }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 500 }}>{fmtDate(a.shift_date)}</div>
                  <div style={{ fontSize: 12, color: "#888" }}>{fmt(a.start_at)} – {a.end_at ? fmt(a.end_at) : "сейчас"}</div>
                </div>
                {a.late_minutes > 0
                  ? <span style={s.badge(warnBg, warn)}>+{a.late_minutes} мин</span>
                  : <span style={s.badge(accentBg, accent)}>вовремя</span>
                }
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  );
}
