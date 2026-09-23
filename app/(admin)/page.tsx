import { createClient } from "@/lib/supabase/server";

export default async function Home() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();

  return (
    <div className="flex h-full w-full items-center gap-2">
      <p>
        Hello <span>{data?.claims.email}</span>
      </p>
    </div>
  );
}
