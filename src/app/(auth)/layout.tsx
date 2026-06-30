export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-tibe-light px-4">
      <div className="w-full max-w-sm rounded-xl bg-white p-8 shadow-sm">
        <div className="mb-6 text-center">
          <h1 className="text-3xl font-bold text-tibe-dark">Tibé</h1>
          <p className="mt-1 text-sm text-gray-500">Gestão agropecuária</p>
        </div>
        {children}
      </div>
    </div>
  );
}
