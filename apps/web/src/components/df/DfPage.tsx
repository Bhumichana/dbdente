"use client";

import { Download, Settings2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { MoneyInput } from "@/components/billing/inputs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Alert, EmptyState, Skeleton } from "@/components/ui/feedback";
import { Field, Input, Select } from "@/components/ui/input";
import { toast } from "@/components/ui/toast";
import { api, ApiError, downloadFile } from "@/lib/api";
import { cn } from "@/lib/cn";
import { thaiDate, todayTH } from "@/lib/format";
import { baht } from "@/lib/money";
import { useRole } from "@/lib/session";
import type { DfRule, DfSummary } from "@/lib/types";

const monthLabel = (m: string) => thaiDate(`${m}-01`, { month: "long", year: "numeric" });

/** ค่ามือหมอ: เจ้าของเห็นทุกคน + ตั้งกฎ · ทันตแพทย์เห็นของตัวเอง */
export function DfPage() {
  const role = useRole();
  const owner = role === "owner";
  const [month, setMonth] = useState(todayTH().slice(0, 7));
  const [list, setList] = useState<DfSummary[] | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [detail, setDetail] = useState<DfSummary | null>(null);
  const [rulesOpen, setRulesOpen] = useState(false);

  const load = useCallback(() => {
    api<{ dentists: DfSummary[] }>(`/api/df?month=${month}`).then((r) => setList(r.dentists));
  }, [month]);
  useEffect(() => {
    load();
  }, [load]);
  // ทันตแพทย์: รายละเอียดของตัวเองมาในคำขอเดียว · เจ้าของ: โหลดเมื่อเลือกทันตแพทย์
  const shownId = owner ? selected : (list?.[0]?.dentistId ?? null);
  useEffect(() => {
    if (!owner || !selected) return;
    api<{ dentists: DfSummary[] }>(`/api/df?month=${month}&dentistId=${selected}`).then((r) => setDetail(r.dentists[0]));
  }, [owner, selected, month]);
  const current = owner ? (detail?.dentistId === selected ? detail : null) : (list?.[0] ?? null);

  async function exportCsv() {
    try {
      await downloadFile(`/api/df/export?month=${month}${owner && selected ? `&dentistId=${selected}` : ""}`, `df-${month}.csv`);
    } catch (e) {
      toast((e as ApiError).message, "error");
    }
  }

  const sum = (k: keyof Pick<DfSummary, "revenue" | "materialCost" | "labCost" | "df" | "topUp" | "total">) => (list ?? []).reduce((s, d) => s + d[k], 0);

  return (
    <div className="mx-auto grid max-w-6xl gap-5 p-4 sm:p-6">
      <div className="flex flex-wrap items-end gap-3">
        <Field label="เดือน" className="w-44">
          {(p) => <Input {...p} type="month" value={month} max={todayTH().slice(0, 7)} onChange={(e) => e.target.value && setMonth(e.target.value)} />}
        </Field>
        <p className="flex-1 pb-2 text-sm text-ink-500">
          คิดจากใบเสร็จที่ชำระแล้วใน{monthLabel(month)} · ฐาน = ยอดสุทธิ − ค่าวัสดุ − ค่าแล็บที่ผูกกับรายการ
        </p>
        {owner && (
          <Button variant="secondary" onClick={() => setRulesOpen(true)}>
            <Settings2 />
            ตั้งกฎ DF
          </Button>
        )}
        <Button variant="secondary" onClick={exportCsv}>
          <Download />
          ส่งออก CSV
        </Button>
      </div>

      {!list && <Skeleton className="h-40" />}

      {owner && list && (
        <div className="overflow-x-auto rounded-xl border border-ink-200 bg-white">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="bg-navy-50 text-left text-xs text-ink-500">
              <tr>
                <th className="px-4 py-2.5 font-medium">ทันตแพทย์</th>
                <th className="px-4 py-2.5 text-right font-medium">รายได้</th>
                <th className="px-4 py-2.5 text-right font-medium">ค่าวัสดุ</th>
                <th className="px-4 py-2.5 text-right font-medium">ค่าแล็บ</th>
                <th className="px-4 py-2.5 text-right font-medium">DF ตาม %</th>
                <th className="px-4 py-2.5 text-right font-medium">ประกันขั้นต่ำ (จ่ายเพิ่ม)</th>
                <th className="px-4 py-2.5 text-right font-medium">รวมจ่าย</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-100">
              {list.map((d) => (
                <tr
                  key={d.dentistId}
                  onClick={() => setSelected(d.dentistId === selected ? null : d.dentistId)}
                  aria-selected={d.dentistId === selected}
                  className={cn("cursor-pointer hover:bg-navy-50/60", d.dentistId === selected && "bg-navy-50")}
                >
                  <td className="px-4 py-2.5">
                    <button className="text-left font-medium text-navy-800 hover:underline">{d.name}</button>
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono">{baht(d.revenue)}</td>
                  <td className="px-4 py-2.5 text-right font-mono text-ink-500">{baht(d.materialCost)}</td>
                  <td className="px-4 py-2.5 text-right font-mono text-ink-500">{baht(d.labCost)}</td>
                  <td className="px-4 py-2.5 text-right font-mono">{baht(d.df)}</td>
                  <td className="px-4 py-2.5 text-right font-mono">{d.topUp ? baht(d.topUp) : "—"}</td>
                  <td className="px-4 py-2.5 text-right font-mono font-semibold text-navy-900">{baht(d.total)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot className="border-t border-ink-200 bg-navy-50/50">
              <tr>
                <td className="px-4 py-2.5 text-ink-500">รวม</td>
                <td className="px-4 py-2.5 text-right font-mono">{baht(sum("revenue"))}</td>
                <td className="px-4 py-2.5 text-right font-mono text-ink-500">{baht(sum("materialCost"))}</td>
                <td className="px-4 py-2.5 text-right font-mono text-ink-500">{baht(sum("labCost"))}</td>
                <td className="px-4 py-2.5 text-right font-mono">{baht(sum("df"))}</td>
                <td className="px-4 py-2.5 text-right font-mono">{baht(sum("topUp"))}</td>
                <td className="px-4 py-2.5 text-right font-mono font-semibold text-navy-900">{baht(sum("total"))}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
      {owner && list && !selected && <p className="text-sm text-ink-500">แตะชื่อทันตแพทย์เพื่อดูรายวันและรายเคส</p>}

      {shownId && !current && <Skeleton className="h-64" />}
      {current && <DfDetail d={current} self={!owner} />}

      <Dialog open={rulesOpen} onOpenChange={setRulesOpen}>
        {rulesOpen && (
          <RulesDialog
            month={month}
            onSaved={() => {
              load();
              setDetail(null);
            }}
          />
        )}
      </Dialog>
    </div>
  );
}

function DfDetail({ d, self }: { d: DfSummary; self: boolean }) {
  const lines = d.lines ?? [];
  return (
    <div className="grid gap-4">
      {self && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat label="รายได้จากเคสของฉัน" value={baht(d.revenue)} />
          <Stat label="หักค่าวัสดุ + ค่าแล็บ" value={baht(d.materialCost + d.labCost)} muted />
          <Stat label="ประกันขั้นต่ำ (จ่ายเพิ่ม)" value={baht(d.topUp)} muted />
          <Stat label="DF รวมเดือนนี้" value={baht(d.total)} strong />
        </div>
      )}
      <p className="text-sm text-ink-600">
        กฎ: ค่าเริ่มต้น <b className="font-mono">{d.rule.defaultPercent}%</b>
        {Object.entries(d.rule.byCategory).map(([k, v]) => (
          <span key={k}>
            {" "}
            · {k} <b className="font-mono">{v}%</b>
          </span>
        ))}
        {d.rule.dailyMinimum > 0 && (
          <>
            {" "}
            · ประกันขั้นต่ำวันละ <b className="font-mono">{baht(d.rule.dailyMinimum)}</b>
          </>
        )}
      </p>

      <div className="grid gap-4 xl:grid-cols-[300px_minmax(0,1fr)] xl:items-start">
        <Card>
          <CardHeader title="รายวัน" description={`เข้าเวร ${d.days.length} วัน`} />
          <div className="max-h-[480px] overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-white text-left text-xs text-ink-500">
                <tr>
                  <th className="px-4 py-2 font-medium">วันที่</th>
                  <th className="px-4 py-2 text-right font-medium">DF</th>
                  <th className="px-4 py-2 text-right font-medium">จ่ายเพิ่ม</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-100">
                {d.days.map((x) => (
                  <tr key={x.date}>
                    <td className="px-4 py-1.5 whitespace-nowrap">{thaiDate(x.date, { day: "numeric", month: "short", weekday: "short" })}</td>
                    <td className="px-4 py-1.5 text-right font-mono">{baht(x.df)}</td>
                    <td className="px-4 py-1.5 text-right font-mono">{x.topUp ? <span className="text-navy-700">+{baht(x.topUp)}</span> : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        {lines.length === 0 ? (
          <EmptyState title="ยังไม่มีเคสในเดือนนี้" />
        ) : (
          <div className="overflow-x-auto rounded-xl border border-ink-200 bg-white">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="bg-navy-50 text-left text-xs text-ink-500">
                <tr>
                  <th className="px-3 py-2.5 font-medium">วันที่</th>
                  <th className="px-3 py-2.5 font-medium">คนไข้ / รายการ</th>
                  <th className="px-3 py-2.5 text-right font-medium">สุทธิ</th>
                  <th className="px-3 py-2.5 text-right font-medium">หัก</th>
                  <th className="px-3 py-2.5 text-right font-medium">%</th>
                  <th className="px-3 py-2.5 text-right font-medium">DF</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-100">
                {lines.map((l) => (
                  <tr key={l.itemId}>
                    <td className="px-3 py-2 whitespace-nowrap">{thaiDate(l.date, { day: "numeric", month: "short" })}</td>
                    <td className="px-3 py-2">
                      <div className="truncate">{l.name}</div>
                      <div className="text-xs text-ink-500">
                        {l.patientName} · <span className="font-mono">{l.receiptNo}</span>
                      </div>
                    </td>
                    <td className="px-3 py-2 text-right font-mono">{baht(l.net)}</td>
                    <td className="px-3 py-2 text-right font-mono text-ink-500">
                      {l.materialCost + l.labCost ? `−${baht(l.materialCost + l.labCost)}` : "—"}
                      {l.labCost > 0 && (
                        <Badge tone="navy" className="ml-1 px-1.5 py-0">
                          แล็บ
                        </Badge>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right font-mono">{l.percent}</td>
                    <td className="px-3 py-2 text-right font-mono font-medium">{baht(l.df)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value, strong, muted }: { label: string; value: string; strong?: boolean; muted?: boolean }) {
  return (
    <Card className="grid gap-0.5 px-4 py-3">
      <span className="text-xs text-ink-500">{label}</span>
      <span className={cn("font-mono text-xl", strong ? "font-semibold text-navy-900" : muted ? "text-ink-600" : "text-ink-900")}>฿{value}</span>
    </Card>
  );
}

/** ตั้งกฎ DF ต่อทันตแพทย์ + ทดลองคำนวณกับข้อมูลเดือนที่เลือกก่อนบันทึก */
function RulesDialog({ month, onSaved }: { month: string; onSaved: () => void }) {
  const [data, setData] = useState<{ categories: string[]; rules: DfRule[] } | null>(null);
  const [dentistId, setDentistId] = useState("");
  const [draft, setDraft] = useState<DfRule | null>(null);
  const [preview, setPreview] = useState<DfSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    api<{ categories: string[]; rules: DfRule[] }>("/api/df/rules").then((r) => {
      setData(r);
      setDentistId(r.rules[0]?.dentistId ?? "");
      setDraft(r.rules[0] ?? null);
    });
  }, []);
  if (!data || !draft) return <DialogContent title="ตั้งกฎ DF">{<Skeleton className="m-5 h-40" />}</DialogContent>;
  const saved = data.rules.find((r) => r.dentistId === dentistId)!;
  const body = { defaultPercent: draft.defaultPercent, byCategory: draft.byCategory, dailyMinimum: draft.dailyMinimum };

  async function run(save: boolean) {
    setBusy(true);
    setError(null);
    try {
      if (save) {
        const r = await api<DfRule>(`/api/df/rules/${dentistId}`, { method: "PUT", body: JSON.stringify(body) });
        setData((d) => d && { ...d, rules: d.rules.map((x) => (x.dentistId === dentistId ? r : x)) });
        toast("บันทึกกฎ DF แล้ว");
        onSaved();
      } else {
        setPreview(await api<DfSummary>("/api/df/preview", { method: "POST", body: JSON.stringify({ dentistId, month, rule: body }) }));
      }
    } catch (e) {
      setError((e as ApiError).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <DialogContent title="ตั้งกฎค่ามือหมอ (DF)" description="% ตามหมวดหัตถการ (เว้นว่าง = ใช้ค่าเริ่มต้น) และประกันรายได้ขั้นต่ำต่อวันที่เข้าเวร" className="max-w-2xl">
      <div className="grid gap-4 overflow-y-auto p-5">
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="ทันตแพทย์" className="sm:col-span-3">
            {(p) => (
              <Select
                {...p}
                value={dentistId}
                onChange={(e) => {
                  setDentistId(e.target.value);
                  setDraft(data.rules.find((r) => r.dentistId === e.target.value)!);
                  setPreview(null);
                }}
              >
                {data.rules.map((r) => (
                  <option key={r.dentistId} value={r.dentistId}>
                    {r.name}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label="% ค่าเริ่มต้น">
            {(p) => (
              <Input
                {...p}
                type="number"
                min={0}
                max={100}
                step={0.5}
                value={draft.defaultPercent}
                onChange={(e) => {
                  setDraft({ ...draft, defaultPercent: Number(e.target.value) });
                  setPreview(null);
                }}
                className="font-mono"
              />
            )}
          </Field>
          <Field label="ประกันขั้นต่ำต่อวัน (บาท)" hint="0 = ไม่มี" className="sm:col-span-2">
            {(p) => (
              <MoneyInput
                {...p}
                value={draft.dailyMinimum}
                onValue={(v) => {
                  setDraft({ ...draft, dailyMinimum: v });
                  setPreview(null);
                }}
              />
            )}
          </Field>
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          {data.categories.map((c) => (
            <label key={c} className="flex items-center gap-2 text-sm">
              <span className="flex-1 text-ink-700">{c}</span>
              <Input
                aria-label={`% หมวด ${c}`}
                type="number"
                min={0}
                max={100}
                step={0.5}
                placeholder={String(draft.defaultPercent)}
                value={draft.byCategory[c] ?? ""}
                onChange={(e) => {
                  const byCategory = { ...draft.byCategory };
                  if (e.target.value === "") delete byCategory[c];
                  else byCategory[c] = Number(e.target.value);
                  setDraft({ ...draft, byCategory });
                  setPreview(null);
                }}
                className="h-9 w-24 text-right font-mono"
              />
              <span className="text-ink-400">%</span>
            </label>
          ))}
        </div>

        {preview && (
          <Alert tone="info">
            ทดลองคำนวณ{monthLabel(month)}: DF <b className="font-mono">{baht(preview.df)}</b> + จ่ายเพิ่ม <b className="font-mono">{baht(preview.topUp)}</b> = รวม{" "}
            <b className="font-mono">{baht(preview.total)}</b>
            <span className="block text-xs">ยังไม่บันทึก — ตัวเลขจริงตอนนี้ใช้กฎเดิม ({saved.defaultPercent}% ค่าเริ่มต้น)</span>
          </Alert>
        )}
        {error && <Alert>{error}</Alert>}
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="secondary" disabled={busy} onClick={() => run(false)}>
            ทดลองคำนวณ
          </Button>
          <Button disabled={busy} onClick={() => run(true)}>
            บันทึกกฎ
          </Button>
        </div>
      </div>
    </DialogContent>
  );
}
