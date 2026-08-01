import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import PwaBootstrap from "@/components/pwa/pwa-bootstrap";
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
  // PWA (Onda 1). O iOS não lê o manifesto: instalação e ícone de tela inicial
  // no iPhone dependem exclusivamente destas duas chaves.
  applicationName: "Tibé",
  appleWebApp: { capable: true, title: "Tibé", statusBarStyle: "default" },
  icons: {
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
};

/**
 * `width=device-width, initial-scale=1` continua valendo: o Next parte do
 * viewport padrão e só sobrescreve o que for declarado aqui.
 *
 * A cor precisa ser a mesma `theme_color` do manifesto: é ela que pinta a barra
 * do sistema quando o aplicativo abre instalado.
 */
export const viewport: Viewport = {
  themeColor: "#2E7D32",
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
        <PwaBootstrap />
      </body>
    </html>
  );
}
