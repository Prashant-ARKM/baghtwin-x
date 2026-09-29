import { redirect } from "next/navigation";

// The app shell lives on /well-twin for now; "/" forwards straight to it.
export default function Home() {
  redirect("/well-twin");
}
