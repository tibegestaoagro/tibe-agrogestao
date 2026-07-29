"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiPost } from "@/lib/client-api";

function clientStrengthError(password: string): string | null {
  if (password.length < 8) return "A senha deve ter ao menos 8 caracteres.";
  if (!/[A-Z]/.test(password)) return "A senha deve ter ao menos 1 letra maiúscula.";
  if (!/[0-9]/.test(password)) return "A senha deve ter ao menos 1 número.";
  if (!/[^A-Za-z0-9]/.test(password)) return "A senha deve ter ao menos 1 símbolo (ex: !@#$%).";
  return null;
}

export default function NewPasswordForm({ resetId }: { resetId: string }) {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const strengthError = clientStrengthError(password);
    if (strengthError) return setError(strengthError);
    if (password !== confirm) return setError("As senhas não coincidem.");

    setError(null);
    setLoading(true);
    const res = await apiPost<{ id: string }>("/api/v1/password-reset/confirm", {
      reset_id: resetId,
      new_password: password,
    });
    setLoading(false);
    if (!res.ok) return setError(res.message);
    router.push("/login");
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div>
        <label htmlFor="password" className="block text-sm font-medium text-gray-700">
          Nova senha
        </label>
        <input
          id="password"
          type="password"
          autoComplete="new-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-tibe-primary focus:ring-1 focus:ring-tibe-primary"
        />
      </div>
      <div>
        <label htmlFor="confirm" className="block text-sm font-medium text-gray-700">
          Confirmar nova senha
        </label>
        <input
          id="confirm"
          type="password"
          autoComplete="new-password"
          required
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-tibe-primary focus:ring-1 focus:ring-tibe-primary"
        />
      </div>

      {error && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      )}

      <button
        type="submit"
        disabled={loading}
        className="w-full rounded-md bg-tibe-primary px-4 py-2 font-medium text-white transition hover:bg-tibe-dark disabled:opacity-60"
      >
        {loading ? "Salvando..." : "Definir nova senha"}
      </button>
    </form>
  );
}
