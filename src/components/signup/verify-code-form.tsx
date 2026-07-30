"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * Etapas 2 e 3 do cadastro verificado (Módulo 19). O mesmo componente serve
 * WhatsApp e email: só muda o texto e para onde ir depois.
 *
 * O contador aqui é de UI (quando oferecer a correção do destino) e é
 * deliberadamente diferente da validade do código, que é de 10 minutos no
 * servidor. Amarrar os dois faria quem digita devagar perder um código válido.
 */

type Props = {
  channel: "whatsapp" | "email";
  destinationMasked: string;
  allowEditAfterSeconds: number;
};

export default function VerifyCodeForm({
  channel,
  destinationMasked,
  allowEditAfterSeconds,
}: Props) {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(allowEditAfterSeconds);
  const [editing, setEditing] = useState(false);
  const [newDestination, setNewDestination] = useState("");

  useEffect(() => {
    if (secondsLeft <= 0) return;
    const t = setTimeout(() => setSecondsLeft((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [secondsLeft]);

  const isWhatsapp = channel === "whatsapp";
  const label = isWhatsapp ? "WhatsApp" : "email";

  async function handleVerify(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setNotice(null);
    setLoading(true);

    const res = await fetch("/api/v1/signup/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ channel, code }),
    });
    const body = await res.json().catch(() => null);

    if (!res.ok) {
      setLoading(false);
      setError(body?.error?.message ?? "Código inválido ou expirado");
      return;
    }

    if (!body?.data?.completed) {
      setLoading(false);
      router.push("/criar-conta/email");
      router.refresh();
      return;
    }

    // Conta criada: login automático com a senha temporária, que o usuário não
    // precisa digitar. O gate de sessão leva direto para a troca obrigatória.
    const signInRes = await signIn("credentials", {
      email: body.data.email,
      password: body.data.temp_password,
      redirect: false,
    });
    setLoading(false);

    if (!signInRes || signInRes.error) {
      router.push("/login");
      return;
    }
    router.push("/dashboard");
    router.refresh();
  }

  async function handleResend(destination?: string) {
    setError(null);
    setNotice(null);
    setLoading(true);

    const res = await fetch("/api/v1/signup/resend", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ channel, destination: destination ?? null }),
    });
    const body = await res.json().catch(() => null);
    setLoading(false);

    if (!res.ok) {
      setError(body?.error?.message ?? "Não foi possível reenviar o código.");
      return;
    }

    setEditing(false);
    setNewDestination("");
    setCode("");
    setSecondsLeft(allowEditAfterSeconds);
    setNotice(`Código novo enviado para ${destination ?? "o mesmo destino"}.`);
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-600">
        Enviamos um código de 6 dígitos para o seu {label}{" "}
        <strong>{destinationMasked}</strong>.
        {!isWhatsapp && " Confira também a caixa de spam e o lixo eletrônico."}
        {isWhatsapp && " Salve nosso número nos contatos para receber os lembretes sem problema."}
      </p>

      <form onSubmit={handleVerify} className="space-y-4">
        <div>
          <Label htmlFor="code">Código de 6 dígitos</Label>
          <Input
            id="code"
            inputMode="numeric"
            autoComplete="one-time-code"
            required
            maxLength={6}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
            className="text-center text-2xl tracking-[0.5em]"
          />
        </div>

        {error && (
          <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
        )}
        {notice && (
          <p className="rounded-md bg-tibe-light px-3 py-2 text-sm text-tibe-dark">{notice}</p>
        )}

        <Button type="submit" disabled={loading || code.length !== 6} className="w-full">
          {loading ? "Confirmando..." : "Confirmar"}
        </Button>
      </form>

      {secondsLeft > 0 ? (
        <p className="text-center text-xs text-gray-500">
          Não chegou? Você poderá corrigir o {label} em {secondsLeft}s.
        </p>
      ) : editing ? (
        <div className="space-y-2 rounded-md border border-gray-200 p-3">
          <Label htmlFor="destination">
            {isWhatsapp ? "Corrigir número do WhatsApp" : "Corrigir email"}
          </Label>
          <Input
            id="destination"
            type={isWhatsapp ? "tel" : "email"}
            value={newDestination}
            onChange={(e) => setNewDestination(e.target.value)}
            placeholder={isWhatsapp ? "22988887777" : "voce@empresa.com.br"}
          />
          <div className="flex gap-2">
            <Button
              type="button"
              disabled={loading || newDestination.trim().length < 5}
              onClick={() => handleResend(newDestination.trim())}
              className="flex-1"
            >
              Enviar para o novo {label}
            </Button>
            <Button type="button" variant="outline" onClick={() => setEditing(false)}>
              Cancelar
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex justify-center gap-4 text-xs">
          <button
            type="button"
            onClick={() => handleResend()}
            disabled={loading}
            className="text-tibe-primary hover:underline"
          >
            Reenviar código
          </button>
          <button
            type="button"
            onClick={() => setEditing(true)}
            disabled={loading}
            className="text-tibe-primary hover:underline"
          >
            Corrigir {label}
          </button>
        </div>
      )}
    </div>
  );
}
