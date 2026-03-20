import LayoutShell from "@/components/layout/LayoutShell";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <LayoutShell>{children}</LayoutShell>;
}
