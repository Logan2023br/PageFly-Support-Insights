import { Suspense } from "react";
import Image from "next/image";
import { redirect } from "next/navigation";
import { readCurrentUser } from "@/lib/auth/current";
import { Panel, Skeleton } from "@/components/ui";
import { LoginForm } from "./login-form";

export const metadata = { title: "Đăng nhập · PageFly Support Insights" };

export default function LoginPage(props: PageProps<"/login">) {
  return (
    <div className="relative mx-auto flex min-h-screen max-w-[400px] flex-col justify-center px-4 py-10">
      <div className="mb-6 text-center">
        <Image src="/pagefly-icon.png" alt="PageFly" width={36} height={36} priority className="mx-auto block size-9 rounded-[12px] shadow-pf-button" />
        <h1 className="mt-4 font-display text-[26px] font-bold tracking-[-0.03em] text-white">PageFly Insights</h1>
        <p className="mt-1 text-[12.5px] text-pf-muted">Đăng nhập để xem số liệu support nội bộ</p>
      </div>
      <Panel className="p-4 sm:p-5">
        <Suspense fallback={<Skeleton className="h-[220px]" />}>
          <Form searchParams={props.searchParams} />
        </Suspense>
      </Panel>
      <p className="mt-4 text-center text-[11.5px] text-pf-faint">Chưa có tài khoản? Liên hệ admin để được cấp.</p>
    </div>
  );
}

async function Form({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const next = typeof sp.next === "string" ? sp.next : "/";
  if (await readCurrentUser()) redirect(next.startsWith("/") && !next.startsWith("//") ? next : "/");
  return <LoginForm next={next} />;
}
