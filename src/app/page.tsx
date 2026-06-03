import { redirect } from "next/navigation";

// Root → dashboard. The proxy handles the auth redirect to /login if needed.
export default function HomePage() {
  redirect("/dashboard");
}
