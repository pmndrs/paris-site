import type { Metadata } from "next";

import { PreviewGrid } from "@/components/preview-grid";

export const metadata: Metadata = {
  title: "Preview — Advanced React Three Fiber",
  robots: { index: false, follow: false },
};

export default function MobilePreviewPage() {
  return <PreviewGrid />;
}
