import { Metadata } from "next";
import { ErrorView } from "@/components/ui/error-view";

export const metadata: Metadata = {
  title: "404 - Page Not Found | TeleBos",
  description: "The requested page could not be found.",
};

export default function NotFoundErrorPage() {
  return <ErrorView statusCode={404} />;
}
