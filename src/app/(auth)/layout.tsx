export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-superficie-afundada px-4">
      <div className="w-full max-w-sm rounded-xl bg-superficie p-8 shadow-sm">
        <div className="mb-6 text-center">
          <h1 className="text-3xl font-bold text-texto-marca">Tibé</h1>
          <p className="mt-1 text-sm text-texto-discreto">Gestão agropecuária</p>
        </div>
        {children}
      </div>
    </div>
  );
}
