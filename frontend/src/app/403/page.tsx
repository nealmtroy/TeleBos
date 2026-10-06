import { Metadata } from "next";
import { ErrorView } from "@/components/ui/error-view";

export const metadata: Metadata = {
  title: "403 - Forbidden | TeleBos",
  description: "Access forbidden. You do not have permission to access this page.",
};

export default function ForbiddenPage() {
  return <ErrorView statusCode={403} />;
}
