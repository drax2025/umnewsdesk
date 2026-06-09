import { createClient } from "@/lib/supabase/server";
import { signOut } from "./login/actions";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export default async function Home() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: profile } = user
    ? await supabase
        .from("profiles")
        .select("full_name, role")
        .eq("id", user.id)
        .single()
    : { data: null };

  const { data: titles } = await supabase
    .from("titles")
    .select("slug, name, domain");

  return (
    <main className="mx-auto max-w-4xl p-8 space-y-6">
      <header className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Union Media Newsroom
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Signed in as <span className="text-foreground">{user?.email}</span>
            {profile?.role ? (
              <Badge variant="outline" className="ml-2">
                {profile.role}
              </Badge>
            ) : null}
          </p>
        </div>
        <form action={signOut}>
          <Button type="submit" variant="outline" size="sm">
            Sign out
          </Button>
        </form>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Titles</CardTitle>
          <CardDescription>Connected to Supabase ✓</CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="space-y-1 text-sm">
            {titles?.map((t) => (
              <li key={t.slug} className="flex justify-between">
                <span>{t.name}</span>
                <span className="text-muted-foreground font-mono text-xs">
                  {t.domain}
                </span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </main>
  );
}
