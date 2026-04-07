import { JournalInboxClient } from "@/components/journal/journal-inbox-client";
import { getTranslations } from "next-intl/server";

export async function generateMetadata() {
  const t = await getTranslations("pageTitle");
  return { title: t("journal") };
}

export default function JournalInboxPage() {
  return <JournalInboxClient />;
}
