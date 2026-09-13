import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Drone Fleet Intelligence",
  description: "Different drones. One shared intelligence layer.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
