import { Metadata } from "next";
import { ErrorView } from "@/components/ui/error-view";

export const metadata: Metadata = {
  title: "503 - Service Unavailable | TeleBos",
  description: "The service is temporarily unavailable or undergoing maintenance.",
};

export default function ServiceUnavailablePage() {
  return <ErrorView statusCode={503} />;
}
