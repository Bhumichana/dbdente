"use client";

import { Armchair, Building2, FlaskConical, KeyRound, Package, Pencil, Stethoscope, Users } from "lucide-react";
import { useCallback, useEffect, useState, type Dispatch, type SetStateAction } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Alert, Skeleton } from "@/components/ui/feedback";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { TBody, TD, TH, THead, Table } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "@/components/ui/toast";
import { api, ApiError } from "@/lib/api";
import { cn } from "@/lib/cn";
import { navFor } from "@/lib/nav";
import { useSession } from "@/lib/session";
import { ROLE_LABEL, type Role, type SettingsChair, type SettingsClinic, type SettingsData, type SettingsLab, type SettingsUser } from "@/lib/types";
import { ActiveBadge, ActiveToggle, EditDialog, isActive, Toolbar, upsert } from "./parts";
import { MaterialSettings, ProcedureSettings } from "./ProcedureSettings";

export type SetData = Dispatch<SetStateAction<SettingsData | null>>;

const TABS = [
  { value: "clinic", label: "ข้อมูลคลินิก", icon: Building2 },
  { value: "procedures", label: "หัตถการและราคา", icon: Stethoscope },
  { value: "materials", label: "วัสดุ", icon: Package },
  { value: "labs", label: "แล็บ", icon: FlaskConical },
  { value: "chairs", label: "เก้าอี้ทำฟัน", icon: Armchair },
  { value: "users", label: "ผู้ใช้และบทบาท", icon: Users },
] as const;

/** ตั้งค่าคลินิก (เจ้าของเท่านั้น) — ค่าพื้นฐานที่หน้าอื่นดึงไปใช้ */
export function SettingsPage() {
  const [data, setData] = useState<SettingsData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<string>("clinic");
  const load = useCallback(
    () =>
      api<SettingsData>("/api/settings")
        .then(setData)
        .catch((e) => setError(e.message)),
    [],
  );
  useEffect(() => {
    load();
  }, [load]);

  if (error) return <Alert className="m-6">{error}</Alert>;
  if (!data) return <Skeleton className="m-6 h-64" />;

  return (
    <Tabs value={tab} onValueChange={setTab} className="flex min-h-full flex-col">
      <TabsList aria-label="หมวดการตั้งค่า">
        {TABS.map((t) => (
          <TabsTrigger key={t.value} value={t.value}>
            <t.icon />
            {t.label}
          </TabsTrigger>
        ))}
      </TabsList>
      <div className="mx-auto w-full max-w-6xl p-4 sm:p-6">
        <TabsContent value="clinic">
          <ClinicTab clinic={data.clinic} setData={setData} />
        </TabsContent>
        <TabsContent value="procedures">
          <ProcedureSettings data={data} setData={setData} />
        </TabsContent>
        <TabsContent value="materials">
          <MaterialSettings data={data} setData={setData} />
        </TabsContent>
        <TabsContent value="labs">
          <LabsTab labs={data.labs} setData={setData} />
        </TabsContent>
        <TabsContent value="chairs">
          <ChairsTab chairs={data.chairs} setData={setData} />
        </TabsContent>
        <TabsContent value="users">
          <UsersTab users={data.users} setData={setData} />
        </TabsContent>
      </div>
    </Tabs>
  );
}

// ---------- ข้อมูลคลินิก + PIN Kiosk ----------
function ClinicTab({ clinic, setData }: { clinic: SettingsClinic; setData: SetData }) {
  const [form, setForm] = useState({ name: clinic.name, address: clinic.address ?? "", taxId: clinic.taxId ?? "", phone: clinic.phone ?? "" });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<{ message: string; field?: string } | null>(null);
  const [pin, setPin] = useState({ a: "", b: "" });
  const [pinErr, setPinErr] = useState<string | null>(null);
  const dirty = form.name !== clinic.name || form.address !== (clinic.address ?? "") || form.taxId !== (clinic.taxId ?? "") || form.phone !== (clinic.phone ?? "");
  const fe = (f: string) => (err?.field === f ? err.message : null);
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm({ ...form, [k]: e.target.value });

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_340px]">
      <Card>
        <CardHeader title="ข้อมูลคลินิก" description="แสดงบนหัวใบเสร็จและเอกสารยินยอม" />
        <form
          className="grid gap-4 p-4"
          noValidate
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setErr(null);
            try {
              const c = await api<SettingsClinic>("/api/settings/clinic", { method: "PUT", body: JSON.stringify(form) });
              setData((d) => d && { ...d, clinic: c });
              setForm({ name: c.name, address: c.address ?? "", taxId: c.taxId ?? "", phone: c.phone ?? "" });
              // ชื่อคลินิกในเมนูด้านข้างมาจาก session
              useSession.setState((s) => (s.user ? { user: { ...s.user, clinicName: c.name } } : s));
              toast("บันทึกข้อมูลคลินิกแล้ว");
            } catch (e) {
              setErr({ message: (e as Error).message, field: e instanceof ApiError ? (e.body.field as string | undefined) : undefined });
            } finally {
              setBusy(false);
            }
          }}
        >
          <Field label="ชื่อคลินิก" error={fe("name")}>
            {(p) => <Input {...p} value={form.name} onChange={set("name")} />}
          </Field>
          <Field label="ที่อยู่" error={fe("address")}>
            {(p) => <Textarea {...p} value={form.address} onChange={set("address")} rows={2} />}
          </Field>
          <div className="grid items-start gap-4 sm:grid-cols-2">
            <Field label="เลขประจำตัวผู้เสียภาษี" hint="13 หลัก (ถ้ามี)" error={fe("taxId")}>
              {(p) => <Input {...p} value={form.taxId} onChange={set("taxId")} inputMode="numeric" className="font-mono" />}
            </Field>
            <Field label="เบอร์โทร" error={fe("phone")}>
              {(p) => <Input {...p} value={form.phone} onChange={set("phone")} inputMode="tel" className="font-mono" />}
            </Field>
          </div>
          <p className="text-xs text-ink-500">
            รหัสคลินิก <span className="font-mono text-ink-700">{clinic.code}</span> ใช้นำหน้า PatientID ใน PACS — เปลี่ยนไม่ได้ เพื่อไม่ให้ภาพ X-ray เดิมหลุดจากคนไข้
          </p>
          {err && !err.field && <Alert>{err.message}</Alert>}
          <div className="flex justify-end">
            <Button type="submit" disabled={busy || !dirty}>
              {busy ? "กำลังบันทึก…" : "บันทึก"}
            </Button>
          </div>
        </form>
      </Card>

      <Card className="self-start">
        <CardHeader
          title={
            <span className="flex items-center gap-2">
              <KeyRound className="size-4 text-teal-600" />
              PIN ออกจากโหมด Kiosk
            </span>
          }
          description="ใช้ปลดล็อกแท็บเล็ตเซ็นเอกสารยินยอม"
        />
        <form
          className="grid gap-3 p-4"
          noValidate
          onSubmit={async (e) => {
            e.preventDefault();
            setPinErr(null);
            if (pin.a !== pin.b) return setPinErr("PIN สองช่องไม่ตรงกัน");
            try {
              await api("/api/settings/kiosk-pin", { method: "PUT", body: JSON.stringify({ pin: pin.a }) });
              setData((d) => d && { ...d, clinic: { ...d.clinic, hasKioskPin: true } });
              setPin({ a: "", b: "" });
              toast("เปลี่ยน PIN แล้ว");
            } catch (e) {
              setPinErr((e as Error).message);
            }
          }}
        >
          <p className="text-sm">
            สถานะ: {clinic.hasKioskPin ? <Badge tone="success">ตั้งแล้ว</Badge> : <Badge tone="warning">ยังไม่ได้ตั้ง</Badge>}
          </p>
          <Field label="PIN ใหม่ (4–8 หลัก)">
            {(p) => (
              <Input {...p} type="password" inputMode="numeric" autoComplete="new-password" value={pin.a} onChange={(e) => setPin({ ...pin, a: e.target.value.replace(/\D/g, "") })} maxLength={8} className="font-mono tracking-widest" />
            )}
          </Field>
          <Field label="ยืนยัน PIN" error={pinErr}>
            {(p) => (
              <Input {...p} type="password" inputMode="numeric" autoComplete="new-password" value={pin.b} onChange={(e) => setPin({ ...pin, b: e.target.value.replace(/\D/g, "") })} maxLength={8} className="font-mono tracking-widest" />
            )}
          </Field>
          <Button type="submit" variant="secondary" disabled={pin.a.length < 4 || !pin.b}>
            เปลี่ยน PIN
          </Button>
        </form>
      </Card>
    </div>
  );
}

// ---------- แล็บ ----------
function LabsTab({ labs, setData }: { labs: SettingsLab[]; setData: SetData }) {
  const [showInactive, setShowInactive] = useState(false);
  const [edit, setEdit] = useState<SettingsLab | "new" | null>(null);
  const [form, setForm] = useState({ name: "", phone: "", active: true });
  const open = (l: SettingsLab | "new") => {
    setForm(l === "new" ? { name: "", phone: "", active: true } : { name: l.name, phone: l.phone ?? "", active: isActive(l) });
    setEdit(l);
  };
  const shown = labs.filter((l) => showInactive || isActive(l));

  return (
    <div className="grid gap-4">
      <Toolbar showInactive={showInactive} onShowInactive={setShowInactive} inactiveCount={labs.filter((l) => !isActive(l)).length} addLabel="เพิ่มแล็บ" onAdd={() => open("new")}>
        <p className="text-sm text-ink-500">แล็บที่ส่งงานครอบฟัน สะพานฟัน ฟันปลอม ฯลฯ</p>
      </Toolbar>
      <Table>
        <THead>
          <tr>
            <TH>ชื่อแล็บ</TH>
            <TH>เบอร์โทร</TH>
            <TH className="text-right">งานค้าง</TH>
            <TH />
          </tr>
        </THead>
        <TBody>
          {shown.map((l) => (
            <tr key={l.id} className={cn(!isActive(l) && "text-ink-400")}>
              <TD className="font-medium">
                {l.name}
                <ActiveBadge active={isActive(l)} />
              </TD>
              <TD className="font-mono">{l.phone ?? "—"}</TD>
              <TD num>{l.openCases}</TD>
              <TD className="text-right">
                <Button size="sm" variant="ghost" onClick={() => open(l)} aria-label={`แก้ไข ${l.name}`}>
                  <Pencil />
                  แก้ไข
                </Button>
              </TD>
            </tr>
          ))}
        </TBody>
      </Table>
      <EditDialog<SettingsLab>
        open={edit !== null}
        onOpenChange={(v) => !v && setEdit(null)}
        title={edit === "new" ? "เพิ่มแล็บ" : "แก้ไขแล็บ"}
        path={edit === "new" || !edit ? "/api/settings/labs" : `/api/settings/labs/${edit.id}`}
        method={edit === "new" ? "POST" : "PUT"}
        body={() => form}
        savedMessage="บันทึกแล็บแล้ว"
        onSaved={(row) => setData((d) => d && { ...d, labs: upsert(d.labs, row) })}
      >
        {(fe) => (
          <>
            <Field label="ชื่อแล็บ" error={fe("name")}>
              {(p) => <Input {...p} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} autoFocus />}
            </Field>
            <Field label="เบอร์โทร" error={fe("phone")}>
              {(p) => <Input {...p} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} inputMode="tel" className="font-mono" />}
            </Field>
            {edit !== "new" && (
              <ActiveToggle
                checked={form.active}
                onChange={(active) => setForm({ ...form, active })}
                hint={`ปิดแล้วส่งงานใหม่ไม่ได้ งานที่ค้างอยู่${edit && edit.openCases ? ` (${edit.openCases} งาน)` : ""}ยังติดตามต่อได้`}
              />
            )}
          </>
        )}
      </EditDialog>
    </div>
  );
}

// ---------- เก้าอี้ทำฟัน ----------
const CHAIR_STATUS = { available: "ว่าง", preparing: "เตรียมห้อง", in_use: "มีคนไข้", maintenance: "ปิดซ่อม" } as const;

function ChairsTab({ chairs, setData }: { chairs: SettingsChair[]; setData: SetData }) {
  const [showInactive, setShowInactive] = useState(false);
  const [edit, setEdit] = useState<SettingsChair | "new" | null>(null);
  const [form, setForm] = useState({ name: "", active: true });
  const open = (c: SettingsChair | "new") => {
    setForm(c === "new" ? { name: `ห้อง ${chairs.length + 1}`, active: true } : { name: c.name, active: isActive(c) });
    setEdit(c);
  };
  const shown = chairs.filter((c) => showInactive || isActive(c));

  return (
    <div className="grid gap-4">
      <Toolbar showInactive={showInactive} onShowInactive={setShowInactive} inactiveCount={chairs.filter((c) => !isActive(c)).length} addLabel="เพิ่มเก้าอี้" onAdd={() => open("new")}>
        <p className="text-sm text-ink-500">ชื่อเก้าอี้แสดงบนจอเรียกคิว — สถานะประจำวันเปลี่ยนที่หน้าคิววันนี้</p>
      </Toolbar>
      <Table>
        <THead>
          <tr>
            <TH>ชื่อ</TH>
            <TH>สถานะตอนนี้</TH>
            <TH className="text-right">นัดล่วงหน้า</TH>
            <TH />
          </tr>
        </THead>
        <TBody>
          {shown.map((c) => (
            <tr key={c.id} className={cn(!isActive(c) && "text-ink-400")}>
              <TD className="font-medium">
                {c.name}
                <ActiveBadge active={isActive(c)} />
              </TD>
              <TD>{isActive(c) ? CHAIR_STATUS[c.status] : "—"}</TD>
              <TD num>{c.upcoming}</TD>
              <TD className="text-right">
                <Button size="sm" variant="ghost" onClick={() => open(c)} aria-label={`แก้ไข ${c.name}`}>
                  <Pencil />
                  แก้ไข
                </Button>
              </TD>
            </tr>
          ))}
        </TBody>
      </Table>
      <EditDialog<SettingsChair>
        open={edit !== null}
        onOpenChange={(v) => !v && setEdit(null)}
        title={edit === "new" ? "เพิ่มเก้าอี้ทำฟัน" : "แก้ไขเก้าอี้"}
        path={edit === "new" || !edit ? "/api/settings/chairs" : `/api/settings/chairs/${edit.id}`}
        method={edit === "new" ? "POST" : "PUT"}
        body={() => form}
        savedMessage="บันทึกเก้าอี้แล้ว"
        onSaved={(row) => setData((d) => d && { ...d, chairs: upsert(d.chairs, row) })}
      >
        {(fe) => (
          <>
            <Field label="ชื่อเก้าอี้ / ห้อง" hint="สั้นๆ เช่น ห้อง 1, Unit A" error={fe("name")}>
              {(p) => <Input {...p} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} autoFocus maxLength={40} />}
            </Field>
            {edit !== "new" && (
              <ActiveToggle checked={form.active} onChange={(active) => setForm({ ...form, active })} hint="ปิดได้เมื่อไม่มีนัดล่วงหน้าที่ใช้เก้าอี้นี้ — ถ้าแค่ซ่อมชั่วคราว ให้ตั้ง “ปิดซ่อม” ที่หน้าคิวแทน" />
            )}
          </>
        )}
      </EditDialog>
    </div>
  );
}

// ---------- ผู้ใช้และบทบาท ----------
/** สรุปสิทธิ์จากเมนูจริงของบทบาทนั้น (lib/nav.ts) — ไม่ต้องเขียนซ้ำ */
const roleHint = (r: Role) => `เห็นเมนู: ${navFor(r).flatMap((g) => g.items.map((i) => i.label)).join(" · ")}`;

function UsersTab({ users, setData }: { users: SettingsUser[]; setData: SetData }) {
  const me = useSession((s) => s.user);
  const [showInactive, setShowInactive] = useState(false);
  const [edit, setEdit] = useState<SettingsUser | "new" | null>(null);
  const [form, setForm] = useState<{ name: string; role: Role; active: boolean }>({ name: "", role: "assistant", active: true });
  const open = (u: SettingsUser | "new") => {
    setForm(u === "new" ? { name: "", role: "assistant", active: true } : { name: u.name, role: u.role, active: isActive(u) });
    setEdit(u);
  };
  const shown = users.filter((u) => showInactive || isActive(u));
  const self = edit !== "new" && edit?.id === me?.id;

  return (
    <div className="grid gap-4">
      <Toolbar showInactive={showInactive} onShowInactive={setShowInactive} inactiveCount={users.filter((u) => !isActive(u)).length} addLabel="เพิ่มผู้ใช้" onAdd={() => open("new")} />
      <Alert tone="info">เดโมนี้ยังเข้าระบบด้วยการเลือกชื่อ — ระบบรหัสผ่านและ MFA จะตามมาในขั้นถัดไป ผู้ใช้ที่ปิดใช้งานจะเข้าระบบไม่ได้ทันที</Alert>
      <Table>
        <THead>
          <tr>
            <TH>ชื่อ</TH>
            <TH>บทบาท</TH>
            <TH />
          </tr>
        </THead>
        <TBody>
          {shown.map((u) => (
            <tr key={u.id} className={cn(!isActive(u) && "text-ink-400")}>
              <TD className="font-medium">
                {u.name}
                {u.id === me?.id && <span className="ml-2 text-xs font-normal text-ink-500">(คุณ)</span>}
                <ActiveBadge active={isActive(u)} />
              </TD>
              <TD>{ROLE_LABEL[u.role]}</TD>
              <TD className="text-right">
                <Button size="sm" variant="ghost" onClick={() => open(u)} aria-label={`แก้ไข ${u.name}`}>
                  <Pencil />
                  แก้ไข
                </Button>
              </TD>
            </tr>
          ))}
        </TBody>
      </Table>
      <EditDialog<SettingsUser>
        open={edit !== null}
        onOpenChange={(v) => !v && setEdit(null)}
        title={edit === "new" ? "เพิ่มผู้ใช้" : "แก้ไขผู้ใช้"}
        path={edit === "new" || !edit ? "/api/settings/users" : `/api/settings/users/${edit.id}`}
        method={edit === "new" ? "POST" : "PUT"}
        body={() => form}
        savedMessage="บันทึกผู้ใช้แล้ว"
        onSaved={(row) => {
          setData((d) => d && { ...d, users: upsert(d.users, row) });
          if (row.id === me?.id) useSession.setState((s) => (s.user ? { user: { ...s.user, name: row.name } } : s));
        }}
      >
        {(fe) => (
          <>
            <Field label="ชื่อที่แสดง" hint="เช่น ทพ.สมชาย ใจดี" error={fe("name")}>
              {(p) => <Input {...p} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} autoFocus />}
            </Field>
            <Field label="บทบาท" hint={self ? "เปลี่ยนบทบาทของตัวเองไม่ได้" : roleHint(form.role)} error={fe("role")}>
              {(p) => (
                <Select {...p} value={form.role} disabled={self} onChange={(e) => setForm({ ...form, role: e.target.value as Role })}>
                  {(Object.keys(ROLE_LABEL) as Role[]).map((r) => (
                    <option key={r} value={r}>
                      {ROLE_LABEL[r]}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            {edit !== "new" && !self && (
              <ActiveToggle checked={form.active} onChange={(active) => setForm({ ...form, active })} hint="ปิดแล้วเข้าระบบไม่ได้ (เช่น ลาออก) — ชื่อในบันทึก/ใบเสร็จเก่ายังอยู่ครบ" />
            )}
          </>
        )}
      </EditDialog>
    </div>
  );
}
