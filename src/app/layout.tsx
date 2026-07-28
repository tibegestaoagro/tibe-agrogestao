import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });

const baseUrl = process.env.NEXTAUTH_URL ?? "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(baseUrl),
  title: {
    default: "Tibé: Gestão agropecuária completa, direto do WhatsApp",
    template: "%s | Tibé",
  },
  description:
    "Plataforma de gestão agropecuária: rebanho, lavoura, prestação de serviço e financeiro, com agente de IA no WhatsApp.",
  openGraph: {
    siteName: "Tibé",
    locale: "pt_BR",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR">
      <body className={`${inter.variable} font-sans antialiased`}>
        {children}
      </body>
    </html>
  );
}
