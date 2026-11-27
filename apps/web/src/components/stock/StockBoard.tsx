"use client";

import { ArrowDownToLine, ArrowUpFromLine, ChevronDown, ClipboardCheck, Package } from "lucide-react";
import { Fragment, useCallback, useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Alert, Skeleton } from "@/components/ui/feedback";
import { Field, Input } from "@/components/ui/input";
import { toast } from "@/components/ui/toast";
import { api, ApiError } from "@/lib/api";
import { cn } from "@/lib/cn";
import { thaiDate, todayTH } from "@/lib/format";
import { useRole } from "@/lib/session";
import type { StockItem, StockLot, StockMove } from "@/lib/types";

type Filter = "all" | "low" | "expiry";
type Action = { kind: "in" | "out"; item: StockItem } | { kind: "adjust"; item: StockItem; lot: StockLot };
const qty = (n: number) => n.toLocaleString("th-TH", { maximumFractionDigits: 2 });

/** สต็อกวัสดุ: คงเหลือตามล็อต · จุดสั่งซื้อ · วันหมดอายุ · ตัดอัตโนมัติตามหัตถการเมื่อรับชำระ */
export function StockBoard() {
  const role = useRole();
  const [data, setData] = useState<{ items: StockItem[]; moves: StockMove[] } | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [open, setOpen] = useState<string | null>(null);
  const [action, setAction] = useState<Action | null>(null);
  const load = useCallback(() => api<{ items: StockItem[]; moves: StockMove[] }>("/api/stock").then(setData), []);
  useEffect(() => {
    load();
  }, [load]);

  if (!data) return <Skeleton className="m-6 h-64" />;
  const today = todayTH();
  const low = data.items.filter((i) => i.low);
  const expiring = data.items.filter((i) => i.expiringSoon > 0 || i.expired > 0);
  const shown = filter === "low" ? low : filter === "expiry" ? expiring : data.items;

  return (
    <div className="mx-auto grid max-w-6xl gap-5 p-4 sm:p-6">
      <div className="grid grid-cols-3 gap-3">
        <Card className={cn("grid gap-0.5 px-4 py-3", low.length > 0 && "border-warning bg-warning-soft/40")}>
          <span className="text-xs text-ink-500">ต่ำกว่าจุดสั่งซื้อ</span>
          <span className={cn("font-mono text-xl", low.length > 0 ? "text-warning" : "text-ink-900")}>{low.length}</span>
        </Card>
        <Card className="grid gap-0.5 px-4 py-3">
          <span className="text-xs text-ink-500">หมดอายุใน 60 วัน</span>
          <span className="font-mono text-xl">{data.items.filter((i) => i.expiringSoon > 0).length}</span>
        </Card>
        <Card className={cn("grid gap-0.5 px-4 py-3", data.items.some((i) => i.expired > 0) && "border-danger/40 bg-danger-soft/40")}>
          <span className="text-xs text-ink-500">มีล็อตหมดอายุแล้ว</span>
          <span className={cn("font-mono text-xl", data.items.some((i) => i.expired > 0) ? "text-danger" : "text-ink-900")}>
            {data.items.filter((i) => i.expired > 0).length}
          </span>
        </Card>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div role="tablist" className="inline-flex rounded-lg border border-ink-200 bg-white p-0.5">
          {(
            [
              ["all", `ทั้งหมด (${data.items.length})`],
              ["low", `ต้องสั่งซื้อ (${low.length})`],
              ["expiry", `วันหมดอายุ (${expiring.length})`],
            ] as const
          ).map(([v, l]) => (
            <button
              key={v}
              role="tab"
              aria-selected={filter === v}
              onClick={() => setFilter(v)}
              className={cn("rounded-md px-3 py-1.5 text-sm", filter === v ? "bg-navy-700 font-medium text-white" : "text-ink-600 hover:bg-navy-50")}
            >
              {l}
            </button>
          ))}
        </div>
        <p className="text-sm text-ink-500">วัสดุถูกตัดอัตโนมัติตามหัตถการเมื่อรับชำระ (หมดอายุก่อน ใช้ก่อน)</p>
      </div>

      <div className="overflow-x-auto rounded-xl border border-ink-200 bg-white">
        <table className="w-full min-w-[760px] text-sm">
          <thead className="bg-navy-50 text-left text-xs text-ink-500">
            <tr>
              <th className="px-4 py-2.5 font-medium">วัสดุ</th>
              <th className="px-4 py-2.5 text-right font-medium">คงเหลือ</th>
              <th className="px-4 py-2.5 text-right font-medium">จุดสั่งซื้อ</th>
              <th className="px-4 py-2.5 font-medium">หมดอายุถัดไป</th>
              <th className="px-4 py-2.5 font-medium">สถานะ</th>
              <th className="px-4 py-2.5" />
            </tr>
          </thead>
          <tbody className="divide-y divide-ink-100">
            {shown.map((i) => (
              <Fragment key={i.id}>
                <tr className={cn(i.low && "bg-warning-soft/30")}>
                  <td className="px-4 py-2.5">
                    <button onClick={() => setOpen(open === i.id ? null : i.id)} aria-expanded={open === i.id} className="flex items-center gap-2 text-left">
                      <ChevronDown className={cn("size-4 shrink-0 text-ink-400 transition-transform", open === i.id && "rotate-180")} />
                      <span>
                        <span className="block font-medium text-ink-900">{i.name}</span>
                        <span className="text-xs text-ink-500">
                          <span className="font-mono">{i.code}</span> · {i.category}
                        </span>
                      </span>
                    </button>
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <span className={cn("font-mono", i.low && "font-semibold text-warning")}>{qty(i.onHand)}</span> <span className="text-xs text-ink-500">{i.unit}</span>
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono text-ink-500">{qty(i.reorderPoint)}</td>
                  <td className="px-4 py-2.5 whitespace-nowrap">{i.nextExpiry ? thaiDate(i.nextExpiry) : "—"}</td>
                  <td className="px-4 py-2.5">
                    <div className="flex flex-wrap gap-1">
                      {i.low && <Badge tone="warning">ต้องสั่งซื้อ</Badge>}
                      {i.expired > 0 && <Badge tone="danger">หมดอายุ {qty(i.expired)}</Badge>}
                      {i.expiringSoon > 0 && <Badge tone="warning">ใกล้หมดอายุ {qty(i.expiringSoon)}</Badge>}
                      {!i.low && !i.expired && !i.expiringSoon && <Badge tone="success">ปกติ</Badge>}
                    </div>
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="flex justify-end gap-1">
                      <Button size="sm" variant="secondary" onClick={() => setAction({ kind: "in", item: i })}>
                        <ArrowDownToLine />
                        รับเข้า
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setAction({ kind: "out", item: i })} disabled={i.onHand <= 0}>
                        <ArrowUpFromLine />
                        เบิก
                      </Button>
                    </div>
                  </td>
                </tr>
                {open === i.id && (
                  <tr className="bg-navy-50/40">
                    <td colSpan={6} className="px-4 py-3">
                      <div className="grid gap-2 pl-6">
                        {i.lots.length === 0 && <p className="text-sm text-ink-500">ไม่มีของในสต็อก</p>}
                        {i.lots.map((l) => {
                          const expired = !!l.expiry && l.expiry < today;
                          return (
                            <div key={l.id} className="flex flex-wrap items-center gap-3 text-sm">
                              <span className="w-28 font-mono text-ink-600">{l.lot}</span>
                              <span className="w-24 text-right font-mono">
                                {qty(l.qty)} {i.unit}
                              </span>
                              <span className={cn("w-36", expired && "font-medium text-danger")}>{l.expiry ? `หมดอายุ ${thaiDate(l.expiry)}` : "ไม่มีวันหมดอายุ"}</span>
                              <Button size="sm" variant="ghost" onClick={() => setAction({ kind: "adjust", item: i, lot: l })}>
                                <ClipboardCheck />
                                {expired ? "ทิ้ง / ปรับยอด" : "ปรับยอดตามนับจริง"}
                              </Button>
                            </div>
                          );
                        })}
                        {role === "owner" && <ReorderPoint item={i} onSaved={load} />}
                      </div>
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>

      <Card>
        <CardHeader title="ความเคลื่อนไหวล่าสุด" description="รับเข้า · เบิก · ตัดตามหัตถการ · ปรับยอด" />
        <div className="max-h-96 overflow-y-auto">
          <table className="w-full text-sm">
            <tbody className="divide-y divide-ink-100">
              {data.moves.map((m) => (
                <tr key={m.id}>
                  <td className="px-4 py-2 whitespace-nowrap text-ink-500">{thaiDate(m.at, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</td>
                  <td className="px-4 py-2">{m.itemName}</td>
                  <td className={cn("px-4 py-2 text-right font-mono", m.qty > 0 ? "text-success" : "text-ink-800")}>
                    {m.qty > 0 ? "+" : ""}
                    {qty(m.qty)}
                  </td>
                  <td className="px-4 py-2 text-ink-600">
                    {m.reason}
                    {m.shortage ? <Badge tone="danger" className="ml-2">ของไม่พอ ขาด {qty(m.shortage)}</Badge> : null}
                  </td>
                  <td className="px-4 py-2 text-xs text-ink-400">{m.byName}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Dialog open={!!action} onOpenChange={(o) => !o && setAction(null)}>
        {action && (
          <MoveDialog
            action={action}
            onDone={() => {
              setAction(null);
              load();
            }}
          />
        )}
      </Dialog>
    </div>
  );
}

function ReorderPoint({ item, onSaved }: { item: StockItem; onSaved: () => void }) {
  const [v, setV] = useState(String(item.reorderPoint));
  return (
    <form
      className="flex items-center gap-2 pt-1 text-sm"
      onSubmit={async (e) => {
        e.preventDefault();
        try {
          await api(`/api/stock/${item.id}`, { method: "PUT", body: JSON.stringify({ reorderPoint: Number(v) }) });
          toast("บันทึกจุดสั่งซื้อแล้ว");
          onSaved();
        } catch (err) {
          toast((err as ApiError).message, "error");
        }
      }}
    >
      <label htmlFor={`rp-${item.id}`} className="text-ink-600">
        จุดสั่งซื้อ
      </label>
      <Input id={`rp-${item.id}`} type="number" min={0} step="any" value={v} onChange={(e) => setV(e.target.value)} className="h-8 w-24 text-right font-mono" />
      <span className="text-ink-500">{item.unit}</span>
      <Button type="submit" size="sm" variant="ghost" disabled={Number(v) === item.reorderPoint}>
        บันทึก
      </Button>
    </form>
  );
}

function MoveDialog({ action, onDone }: { action: Action; onDone: () => void }) {
  const { item } = action;
  const adjLot = action.kind === "adjust" ? action.lot : null;
  const [amount, setAmount] = useState(action.kind === "adjust" ? String(action.lot.qty) : "");
  const [lot, setLot] = useState("");
  const [expiry, setExpiry] = useState("");
  const [reason, setReason] = useState(action.kind === "adjust" && action.lot.expiry && action.lot.expiry < todayTH() ? "ทิ้งของหมดอายุ" : "");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const title = action.kind === "in" ? `รับเข้า: ${item.name}` : action.kind === "out" ? `เบิกใช้: ${item.name}` : `ปรับยอดล็อต ${adjLot!.lot}`;
  const n = Number(amount);

  return (
    <DialogContent title={title} description={action.kind === "out" ? `คงเหลือ ${qty(item.onHand)} ${item.unit} · ตัดล็อตที่หมดอายุก่อน` : undefined}>
      <form
        className="grid gap-4 p-5"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError(null);
          try {
            const body =
              action.kind === "in"
                ? { qty: n, lot, expiry, reason }
                : action.kind === "out"
                  ? { qty: n, reason }
                  : { lotId: adjLot!.id, counted: n, reason };
            await api(`/api/stock/${item.id}/${action.kind}`, { method: "POST", body: JSON.stringify(body) });
            toast("บันทึกแล้ว");
            onDone();
          } catch (err) {
            setError((err as ApiError).message);
            setBusy(false);
          }
        }}
      >
        <Field label={action.kind === "adjust" ? `นับได้จริง (${item.unit})` : `จำนวน (${item.unit})`}>
          {(p) => <Input {...p} autoFocus type="number" min={0} step="any" required value={amount} onChange={(e) => setAmount(e.target.value)} className="font-mono" />}
        </Field>
        {action.kind === "in" && (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="เลขล็อต">{(p) => <Input {...p} value={lot} maxLength={40} onChange={(e) => setLot(e.target.value)} placeholder="ไม่ระบุได้" />}</Field>
            <Field label="วันหมดอายุ">{(p) => <Input {...p} type="date" value={expiry} onChange={(e) => setExpiry(e.target.value)} />}</Field>
          </div>
        )}
        <Field label={action.kind === "in" ? "หมายเหตุ" : "เหตุผล"}>
          {(p) => (
            <Input
              {...p}
              required={action.kind !== "in"}
              value={reason}
              maxLength={200}
              onChange={(e) => setReason(e.target.value)}
              placeholder={action.kind === "in" ? "เช่น ใบสั่งซื้อ PO-0012" : action.kind === "out" ? "เช่น เบิกใช้ห้อง 2" : "เช่น นับสต็อกสิ้นเดือน"}
            />
          )}
        </Field>
        {error && <Alert>{error}</Alert>}
        <div className="flex justify-end">
          <Button type="submit" disabled={busy || !(n > 0 || (action.kind === "adjust" && n >= 0 && amount !== ""))}>
            <Package />
            บันทึก
          </Button>
        </div>
      </form>
    </DialogContent>
  );
}
