import { Metadata } from "next";
import { ErrorView } from "@/components/ui/error-view";

export const metadata: Metadata = {
  title: "401 - Unauthorized | TeleBos",
  description: "You must be authenticated to access this page.",
};

export default function UnauthorizedPage() {
  return <ErrorView statusCode={401} />;
}
