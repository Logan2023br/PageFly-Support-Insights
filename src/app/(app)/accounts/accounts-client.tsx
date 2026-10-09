"use client";

import { Check, KeyRound, Loader2, Trash2, UserPlus, X } from "lucide-react";
import { useActionState, useEffect, useRef, useState } from "react";
import type { PublicUser } from "@/lib/auth/users";
import { Badge, buttonClass, cx, InlineError } from "@/components/ui";
import { changePassword, changeRole, createAccount, removeAccount, type ActionState } from "./actions";

const INPUT = "h-9 w-full rounded-[12px] border border-pf-border bg-pf-bg-deep px-3 text-[13px] text-pf-text outline-none placeholder:text-pf-faint focus:border-pf-primary-hi";

function Feedback({ state }: { state: ActionState }) {
  if (state.error) return <InlineError>{state.error}</InlineError>;
  if (state.ok)
    return (
      <p className="flex items-center gap-1.5 text-[12px] font-semibold text-pf-success">
        <Check size={13} /> {state.ok}
      </p>
    );
  return null;
}

export function CreateAccountForm() {
  const [state, action, pending] = useActionState<ActionState, FormData>(createAccount, {});
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state.ok) ref.current?.reset();
  }, [state]);
  return (
    <form ref={ref} action={action} className="grid gap-3">
      <div className="grid gap-3 sm:grid-cols-[1fr_1fr_200px_auto] sm:items-end">
        <label className="grid gap-1.5 text-[12px] font-semibold text-pf-body">
          Username
          <input name="username" required autoComplete="off" placeholder="vd. eli.nguyen" className={INPUT} />
        </label>
        <label className="grid gap-1.5 text-[12px] font-semibold text-pf-body">
          Mật khẩu
          <input name="password" type="password" required minLength={8} autoComplete="new-password" placeholder="Tối thiểu 8 ký tự" className={INPUT} />
        </label>
        <label className="grid gap-1.5 text-[12px] font-semibold text-pf-body">
          Quyền
          <select name="role" defaultValue="member" className={INPUT}>
            <option value="member">Thành viên (chỉ xem)</option>
            <option value="admin">Admin</option>
          </select>
        </label>
        <button type="submit" disabled={pending} className={buttonClass("primary", "sm", "h-9")}>
          {pending ? <Loader2 size={14} className="animate-spin" /> : <UserPlus size={14} strokeWidth={1.75} />} Thêm tài khoản
        </button>
      </div>
      <Feedback state={state} />
    </form>
  );
}

const fmt = (t: number | null) => (t ? new Date(t).toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", dateStyle: "short", timeStyle: "short" }) : "Chưa đăng nhập");

export function AccountRow({ user, isMe }: { user: PublicUser; isMe: boolean }) {
  const [mode, setMode] = useState<"idle" | "password" | "delete">("idle");
  const [pwState, pwAction, pwPending] = useActionState<ActionState, FormData>(async (prev, form) => {
    const r = await changePassword(prev, form);
    if (r.ok) setMode("idle");
    return r;
  }, {});
  const [roleState, roleAction, rolePending] = useActionState<ActionState, FormData>(changeRole, {});
  const [delState, delAction, delPending] = useActionState<ActionState, FormData>(removeAccount, {});
  return (
    <tr className="border-b border-pf-border/60 text-[12.5px] last:border-0">
      <td className="px-4 py-3 align-top">
        <div className="font-semibold text-white">
          {user.username}
          {isMe && <span className="ml-1.5 text-[11px] font-normal text-pf-faint">(bạn)</span>}
        </div>
        <div className="text-[11px] text-pf-faint">Tạo {fmt(user.createdAt)}</div>
      </td>
      <td className="px-3 py-3 align-top">
        {isMe ? (
          <Badge tone={user.role === "admin" ? "violet" : "neutral"}>{user.role === "admin" ? "Admin" : "Thành viên"}</Badge>
        ) : (
          <form action={roleAction} className="flex items-center gap-1.5">
            <input type="hidden" name="id" value={user.id} />
            <select
              name="role"
              defaultValue={user.role}
              disabled={rolePending}
              onChange={(e) => e.currentTarget.form?.requestSubmit()}
              className="h-8 rounded-[10px] border border-pf-border bg-pf-bg-deep px-2 text-[12px] text-pf-text outline-none focus:border-pf-primary-hi"
            >
              <option value="member">Thành viên</option>
              <option value="admin">Admin</option>
            </select>
            {rolePending && <Loader2 size={13} className="animate-spin text-pf-muted" />}
          </form>
        )}
        {roleState.error && <p className="mt-1 text-[11.5px] text-pf-danger">{roleState.error}</p>}
      </td>
      <td className="tabular whitespace-nowrap px-3 py-3 align-top text-pf-muted">{fmt(user.lastLoginAt)}</td>
      <td className="px-3 py-3 align-top">
        {mode === "password" ? (
          <form action={pwAction} className="flex flex-wrap items-center gap-1.5">
            <input type="hidden" name="id" value={user.id} />
            <input name="password" type="password" required minLength={8} autoFocus autoComplete="new-password" placeholder="Mật khẩu mới (≥ 8 ký tự)" className={cx(INPUT, "h-8 w-[200px]")} />
            <button type="submit" disabled={pwPending} className={buttonClass("primary", "sm")}>
              {pwPending ? <Loader2 size={13} className="animate-spin" /> : "Lưu"}
            </button>
            <button type="button" onClick={() => setMode("idle")} className={buttonClass("quiet", "sm", "px-2")} aria-label="Huỷ">
              <X size={14} />
            </button>
          </form>
        ) : mode === "delete" ? (
          <form action={delAction} className="flex flex-wrap items-center gap-1.5">
            <input type="hidden" name="id" value={user.id} />
            <span className="text-[12px] text-pf-danger">Xoá {user.username}?</span>
            <button type="submit" disabled={delPending} className={buttonClass("danger", "sm")}>
              {delPending ? <Loader2 size={13} className="animate-spin" /> : "Xác nhận xoá"}
            </button>
            <button type="button" onClick={() => setMode("idle")} className={buttonClass("quiet", "sm")}>
              Huỷ
            </button>
          </form>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            <button type="button" onClick={() => setMode("password")} className={buttonClass("ghost", "sm")}>
              <KeyRound size={13} strokeWidth={1.75} /> Đổi mật khẩu
            </button>
            {!isMe && (
              <button type="button" onClick={() => setMode("delete")} className={buttonClass("danger", "sm")}>
                <Trash2 size={13} strokeWidth={1.75} /> Xoá
              </button>
            )}
          </div>
        )}
        <div className="mt-1.5">
          <Feedback state={mode === "idle" ? (pwState.ok ? pwState : {}) : mode === "password" ? pwState : delState} />
        </div>
      </td>
    </tr>
  );
}
