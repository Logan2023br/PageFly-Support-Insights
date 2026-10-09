"use client";

import { Loader2, LogIn } from "lucide-react";
import { useActionState } from "react";
import { InlineError, buttonClass } from "@/components/ui";
import { loginAction, type LoginState } from "./actions";

const INPUT = "h-11 w-full rounded-[12px] border border-pf-border bg-pf-bg-deep px-3 text-[13.5px] text-pf-text outline-none placeholder:text-pf-faint focus:border-pf-primary-hi";

export function LoginForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState<LoginState, FormData>(loginAction, {});
  return (
    <form action={action} className="grid gap-3">
      <input type="hidden" name="next" value={next} />
      <label className="grid gap-1.5 text-[12px] font-semibold text-pf-body">
        Username
        <input name="username" autoComplete="username" autoFocus required defaultValue={state.username} className={INPUT} placeholder="vd. eli.nguyen" />
      </label>
      <label className="grid gap-1.5 text-[12px] font-semibold text-pf-body">
        Mật khẩu
        <input name="password" type="password" autoComplete="current-password" required className={INPUT} placeholder="••••••••" />
      </label>
      {state.error && <InlineError>{state.error}</InlineError>}
      <button type="submit" disabled={pending} className={buttonClass("primary", "md", "mt-1 h-11 w-full")}>
        {pending ? <Loader2 size={16} className="animate-spin" /> : <LogIn size={16} strokeWidth={1.75} />}
        {pending ? "Đang đăng nhập…" : "Đăng nhập"}
      </button>
    </form>
  );
}
