import { Metadata } from "next";
import { ErrorView } from "@/components/ui/error-view";

export const metadata: Metadata = {
  title: "500 - Server Error | TeleBos",
  description: "An internal server error occurred while processing your request.",
};

export default function ServerErrorPage() {
  return <ErrorView statusCode={500} />;
}
