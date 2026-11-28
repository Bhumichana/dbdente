"use client";

import { Pencil, Plus, X } from "lucide-react";
import { Fragment, useId, useState } from "react";
import { MoneyInput } from "@/components/billing/inputs";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/feedback";
import { Field, Input, Select } from "@/components/ui/input";
import { TBody, TD, TH, THead, Table } from "@/components/ui/table";
import { cn } from "@/lib/cn";
import { baht } from "@/lib/money";
import type { SettingsData, SettingsMaterial, SettingsProcedure } from "@/lib/types";
import { ActiveBadge, ActiveToggle, EditDialog, isActive, Toolbar, upsert } from "./parts";
import type { SetData } from "./SettingsPage";

const qtyText = (n: number) => n.toLocaleString("th-TH", { maximumFractionDigits: 2 });
const matches = (q: string, ...fields: string[]) => {
  const t = q.trim().toLowerCase();
  return !t || fields.join(" ").toLowerCase().includes(t);
};

/** ช่องกรอกหมวด: พิมพ์ใหม่ได้ หรือเลือกจากหมวดที่มีอยู่ */
function CategoryInput({ value, onValue, options, ...p }: { value: string; onValue: (v: string) => void; options: string[]; id: string }) {
  const listId = useId();
  return (
    <>
      <Input {...p} list={listId} value={value} onChange={(e) => onValue(e.target.value)} />
      <datalist id={listId}>
        {options.map((o) => (
          <option key={o} value={o} />
        ))}
      </datalist>
    </>
  );
}

// ---------- หัตถการและราคา ----------
type ProcForm = {
  code: string;
  name: string;
  category: string;
  price: number;
  materialCost: number;
  keywords: string;
  materials: { itemId: string; qty: string }[];
  active: boolean;
};

const blankProc = (category = ""): ProcForm => ({ code: "", name: "", category, price: 0, materialCost: 0, keywords: "", materials: [], active: true });

export function ProcedureSettings({ data, setData }: { data: SettingsData; setData: SetData }) {
  const [q, setQ] = useState("");
  const [showInactive, setShowInactive] = useState(false);
  const [edit, setEdit] = useState<SettingsProcedure | "new" | null>(null);
  const [form, setForm] = useState<ProcForm>(blankProc());
  const categories = [...new Set(data.procedures.map((p) => p.category))].sort((a, b) => a.localeCompare(b, "th"));
  const materialName = Object.fromEntries(data.materials.map((m) => [m.id, m]));
  const activeMaterials = data.materials.filter(isActive);

  const shown = data.procedures
    .filter((p) => (showInactive || isActive(p)) && matches(q, p.name, p.code, p.category, ...p.keywords))
    .sort((a, b) => a.category.localeCompare(b.category, "th") || a.code.localeCompare(b.code));
  const groups = [...new Set(shown.map((p) => p.category))];

  const open = (p: SettingsProcedure | "new") => {
    setForm(
      p === "new"
        ? blankProc(categories[0])
        : {
            code: p.code,
            name: p.name,
            category: p.category,
            price: p.price,
            materialCost: p.materialCost ?? 0,
            keywords: p.keywords.join(", "),
            materials: (p.materials ?? []).map((m) => ({ itemId: m.itemId, qty: String(m.qty) })),
            active: isActive(p),
          },
    );
    setEdit(p);
  };
  const setMat = (i: number, patch: Partial<ProcForm["materials"][number]>) =>
    setForm({ ...form, materials: form.materials.map((m, j) => (j === i ? { ...m, ...patch } : m)) });

  return (
    <div className="grid gap-4">
      <Toolbar
        q={q}
        onQ={setQ}
        placeholder="ค้นหาชื่อ / รหัส / หมวด"
        showInactive={showInactive}
        onShowInactive={setShowInactive}
        inactiveCount={data.procedures.filter((p) => !isActive(p)).length}
        addLabel="เพิ่มหัตถการ"
        onAdd={() => open("new")}
      />
      {shown.length === 0 ? (
        <EmptyState title="ไม่พบหัตถการ">ลองคำค้นอื่น หรือกด “เพิ่มหัตถการ”</EmptyState>
      ) : (
        <Table className="min-w-[760px]">
          <THead>
            <tr>
              <TH>รหัส</TH>
              <TH>หัตถการ</TH>
              <TH className="text-right">ราคา (บาท)</TH>
              <TH className="text-right">ค่าวัสดุ</TH>
              <TH>ตัดสต็อก</TH>
                <TH />
            </tr>
          </THead>
          <TBody>
            {groups.map((g) => (
              <Fragment key={g}>
                <tr className="bg-ink-50">
                  <td colSpan={6} className="px-4 py-1.5 text-xs font-semibold text-ink-600">
                    {g}
                  </td>
                </tr>
                {shown
                  .filter((p) => p.category === g)
                  .map((p) => (
                    <tr key={p.id} className={cn(!isActive(p) && "text-ink-400")}>
                      <TD className="font-mono text-xs">{p.code}</TD>
                      <TD className="min-w-56">
                        <span className="font-medium">{p.name}</span>
                        <ActiveBadge active={isActive(p)} />
                        {p.keywords.length > 0 && <span className="block text-xs text-ink-500">คำจับคู่: {p.keywords.join(", ")}</span>}
                      </TD>
                      <TD num>{baht(p.price)}</TD>
                      <TD num className="text-ink-500">
                        {p.materialCost ? baht(p.materialCost) : "—"}
                      </TD>
                      <TD className="text-xs text-ink-600">
                        {p.materials?.length
                          ? p.materials.map((m) => `${materialName[m.itemId]?.name ?? "?"} ×${qtyText(m.qty)}`).join(", ")
                          : "—"}
                      </TD>
                      <TD className="text-right">
                        <Button size="sm" variant="ghost" onClick={() => open(p)} aria-label={`แก้ไข ${p.name}`}>
                          <Pencil />
                          แก้ไข
                        </Button>
                      </TD>
                    </tr>
                  ))}
              </Fragment>
            ))}
          </TBody>
        </Table>
      )}
      <p className="text-xs text-ink-500">
        เปลี่ยนราคาแล้วมีผลกับบิลที่เปิดใหม่ — บิลและใบเสร็จเดิมเก็บราคาไว้ในตัวเอง ไม่เปลี่ยนตาม · ค่าวัสดุถูกหักก่อนคิดค่ามือหมอ (DF)
      </p>

      <EditDialog<SettingsProcedure>
        wide
        open={edit !== null}
        onOpenChange={(v) => !v && setEdit(null)}
        title={edit === "new" ? "เพิ่มหัตถการ" : "แก้ไขหัตถการ"}
        path={edit === "new" || !edit ? "/api/settings/procedures" : `/api/settings/procedures/${edit.id}`}
        method={edit === "new" ? "POST" : "PUT"}
        body={() => ({
          ...form,
          keywords: form.keywords.split(/[,\n]/).map((k) => k.trim()).filter(Boolean),
          materials: form.materials.filter((m) => m.itemId).map((m) => ({ itemId: m.itemId, qty: Number(m.qty) })),
        })}
        savedMessage="บันทึกหัตถการแล้ว"
        onSaved={(row) => setData((d) => d && { ...d, procedures: upsert(d.procedures, row) })}
      >
        {(fe) => (
          <>
            <div className="grid items-start gap-4 sm:grid-cols-[140px_1fr]">
              <Field label="รหัส" error={fe("code")}>
                {(p) => <Input {...p} value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })} className="font-mono" maxLength={20} autoFocus={edit === "new"} />}
              </Field>
              <Field label="ชื่อหัตถการ" error={fe("name")}>
                {(p) => <Input {...p} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />}
              </Field>
            </div>
            <div className="grid items-start gap-4 sm:grid-cols-3">
              <Field label="หมวด" hint="ใช้คิด % ค่ามือหมอตามหมวด" error={fe("category")}>
                {(p) => <CategoryInput {...p} value={form.category} onValue={(category) => setForm({ ...form, category })} options={categories} />}
              </Field>
              <Field label="ราคา (บาท)" error={fe("price")}>
                {(p) => <MoneyInput {...p} value={form.price} onValue={(price) => setForm({ ...form, price })} />}
              </Field>
              <Field label="ค่าวัสดุต่อครั้ง (บาท)" error={fe("materialCost")}>
                {(p) => <MoneyInput {...p} value={form.materialCost} onValue={(materialCost) => setForm({ ...form, materialCost })} blankZero placeholder="0" />}
              </Field>
            </div>
            <Field label="คำจับคู่อัตโนมัติ" hint="คั่นด้วยจุลภาค — ถ้าหัตถการในผังฟัน/นัดมีคำเหล่านี้ ระบบดึงรายการนี้เข้าบิลให้เอง" error={fe("keywords")}>
              {(p) => <Input {...p} value={form.keywords} onChange={(e) => setForm({ ...form, keywords: e.target.value })} placeholder="เช่น อุด, filling" />}
            </Field>

            <fieldset className="grid gap-2">
              <legend className="mb-1.5 text-sm font-medium text-ink-700">วัสดุที่ตัดสต็อกเมื่อรับชำระ (ต่อ 1 ครั้ง)</legend>
              {form.materials.map((m, i) => (
                <div key={i} className="flex items-center gap-2">
                  <Select aria-label="วัสดุ" value={m.itemId} onChange={(e) => setMat(i, { itemId: e.target.value })} className="flex-1">
                    <option value="">— เลือกวัสดุ —</option>
                    {[...activeMaterials, ...(materialName[m.itemId] && !isActive(materialName[m.itemId]) ? [materialName[m.itemId]] : [])].map((s) => (
                      <option key={s.id} value={s.id} disabled={form.materials.some((x, j) => j !== i && x.itemId === s.id)}>
                        {s.name} ({s.unit})
                      </option>
                    ))}
                  </Select>
                  <Input aria-label="จำนวน" inputMode="decimal" value={m.qty} onChange={(e) => setMat(i, { qty: e.target.value })} className="w-24 text-right font-mono" />
                  <span className="w-12 text-xs text-ink-500">{materialName[m.itemId]?.unit}</span>
                  <Button size="icon" variant="ghost" aria-label="เอาวัสดุนี้ออก" onClick={() => setForm({ ...form, materials: form.materials.filter((_, j) => j !== i) })}>
                    <X />
                  </Button>
                </div>
              ))}
              {fe("materials") && <p className="text-xs text-danger">{fe("materials")}</p>}
              <Button size="sm" variant="secondary" className="justify-self-start" onClick={() => setForm({ ...form, materials: [...form.materials, { itemId: "", qty: "1" }] })} disabled={!activeMaterials.length}>
                <Plus />
                เพิ่มวัสดุ
              </Button>
            </fieldset>

            {edit !== "new" && (
              <ActiveToggle checked={form.active} onChange={(active) => setForm({ ...form, active })} hint="ปิดแล้วจะไม่แสดงในรายการเลือกตอนออกบิล และไม่ถูกจับคู่อัตโนมัติ" />
            )}
          </>
        )}
      </EditDialog>
    </div>
  );
}

// ---------- วัสดุ ----------
type MatForm = { code: string; name: string; unit: string; category: string; reorderPoint: string; active: boolean };

export function MaterialSettings({ data, setData }: { data: SettingsData; setData: SetData }) {
  const [q, setQ] = useState("");
  const [showInactive, setShowInactive] = useState(false);
  const [edit, setEdit] = useState<SettingsMaterial | "new" | null>(null);
  const [form, setForm] = useState<MatForm>({ code: "", name: "", unit: "", category: "", reorderPoint: "0", active: true });
  const categories = [...new Set(data.materials.map((m) => m.category))].sort((a, b) => a.localeCompare(b, "th"));
  const units = [...new Set(data.materials.map((m) => m.unit))].sort((a, b) => a.localeCompare(b, "th"));
  const usedBy = (id: string) => data.procedures.filter((p) => isActive(p) && p.materials?.some((m) => m.itemId === id));

  const shown = data.materials
    .filter((m) => (showInactive || isActive(m)) && matches(q, m.name, m.code, m.category))
    .sort((a, b) => a.category.localeCompare(b.category, "th") || a.name.localeCompare(b.name, "th"));

  const open = (m: SettingsMaterial | "new") => {
    setForm(
      m === "new"
        ? { code: "", name: "", unit: units[0] ?? "", category: categories[0] ?? "", reorderPoint: "0", active: true }
        : { code: m.code, name: m.name, unit: m.unit, category: m.category, reorderPoint: String(m.reorderPoint), active: isActive(m) },
    );
    setEdit(m);
  };

  return (
    <div className="grid gap-4">
      <Toolbar
        q={q}
        onQ={setQ}
        placeholder="ค้นหาชื่อ / รหัส / หมวด"
        showInactive={showInactive}
        onShowInactive={setShowInactive}
        inactiveCount={data.materials.filter((m) => !isActive(m)).length}
        addLabel="เพิ่มวัสดุ"
        onAdd={() => open("new")}
      >
        <p className="text-sm text-ink-500">รับเข้า / เบิก / นับสต็อก ทำที่หน้าสต็อกวัสดุ</p>
      </Toolbar>
      <Table className="min-w-[720px]">
        <THead>
          <tr>
            <TH>รหัส</TH>
            <TH>วัสดุ</TH>
            <TH>หมวด</TH>
            <TH className="text-right">คงเหลือ</TH>
            <TH className="text-right">จุดสั่งซื้อ</TH>
            <TH />
          </tr>
        </THead>
        <TBody>
          {shown.map((m) => (
            <tr key={m.id} className={cn(!isActive(m) && "text-ink-400")}>
              <TD className="font-mono text-xs">{m.code}</TD>
              <TD className="font-medium">
                {m.name}
                <ActiveBadge active={isActive(m)} />
              </TD>
              <TD>{m.category}</TD>
              <TD num>
                {qtyText(m.onHand)} <span className="font-sans text-xs text-ink-500">{m.unit}</span>
              </TD>
              <TD num className="text-ink-500">
                {qtyText(m.reorderPoint)}
              </TD>
              <TD className="text-right">
                <Button size="sm" variant="ghost" onClick={() => open(m)} aria-label={`แก้ไข ${m.name}`}>
                  <Pencil />
                  แก้ไข
                </Button>
              </TD>
            </tr>
          ))}
        </TBody>
      </Table>

      <EditDialog<SettingsMaterial>
        open={edit !== null}
        onOpenChange={(v) => !v && setEdit(null)}
        title={edit === "new" ? "เพิ่มวัสดุ" : "แก้ไขวัสดุ"}
        description={edit === "new" ? "เพิ่มแล้วไปรับของเข้าที่หน้าสต็อกวัสดุ" : undefined}
        path={edit === "new" || !edit ? "/api/settings/materials" : `/api/settings/materials/${edit.id}`}
        method={edit === "new" ? "POST" : "PUT"}
        body={() => ({ ...form, reorderPoint: Number(form.reorderPoint) })}
        savedMessage="บันทึกวัสดุแล้ว"
        onSaved={(row) => setData((d) => d && { ...d, materials: upsert(d.materials, row) })}
      >
        {(fe) => {
          const used = edit && edit !== "new" ? usedBy(edit.id) : [];
          return (
            <>
              <div className="grid items-start gap-4 sm:grid-cols-[140px_1fr]">
                <Field label="รหัส" error={fe("code")}>
                  {(p) => <Input {...p} value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })} className="font-mono" maxLength={20} autoFocus={edit === "new"} />}
                </Field>
                <Field label="ชื่อวัสดุ" error={fe("name")}>
                  {(p) => <Input {...p} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />}
                </Field>
              </div>
              <div className="grid items-start gap-4 sm:grid-cols-3">
                <Field label="หมวด" error={fe("category")}>
                  {(p) => <CategoryInput {...p} value={form.category} onValue={(category) => setForm({ ...form, category })} options={categories} />}
                </Field>
                <Field label="หน่วยนับ" error={fe("unit")}>
                  {(p) => <CategoryInput {...p} value={form.unit} onValue={(unit) => setForm({ ...form, unit })} options={units} />}
                </Field>
                <Field label="จุดสั่งซื้อ" hint="เตือนเมื่อคงเหลือ ≤ ค่านี้" error={fe("reorderPoint")}>
                  {(p) => <Input {...p} inputMode="decimal" value={form.reorderPoint} onChange={(e) => setForm({ ...form, reorderPoint: e.target.value })} className="text-right font-mono" />}
                </Field>
              </div>
              {edit !== "new" && (
                <ActiveToggle
                  checked={form.active}
                  onChange={(active) => setForm({ ...form, active })}
                  hint={used.length ? `ยังผูกกับหัตถการ ${used.map((p) => p.name).join(", ")} — ต้องเอาออกจากหัตถการก่อนจึงปิดได้` : "ปิดแล้วจะไม่แสดงในหน้าสต็อก (ประวัติการเคลื่อนไหวยังอยู่)"}
                />
              )}
            </>
          );
        }}
      </EditDialog>
    </div>
  );
}
