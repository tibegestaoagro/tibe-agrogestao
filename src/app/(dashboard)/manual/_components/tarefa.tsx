/**
 * O molde de toda tarefa do manual: para que serve (uma frase), o passo a passo
 * numerado, e o que pode dar errado com o que fazer. As figuras entram como
 * `children`, entre o passo a passo e os problemas.
 */
export function Tarefa({
  paraQueServe,
  passos,
  problemas,
  children,
}: {
  paraQueServe: string;
  passos: React.ReactNode[];
  problemas?: { quando: string; fazer: React.ReactNode }[];
  children?: React.ReactNode;
}) {
  return (
    <section className="space-y-4">
      <div>
        <h3 className="text-sm font-semibold uppercase tracking-wide text-texto-discreto">Para que serve</h3>
        <p className="mt-1 text-texto">{paraQueServe}</p>
      </div>
      <div>
        <h3 className="text-sm font-semibold uppercase tracking-wide text-texto-discreto">Passo a passo</h3>
        <ol className="mt-2 list-decimal space-y-2 pl-5 text-texto marker:font-semibold marker:text-texto-secundario">
          {passos.map((p, i) => (
            <li key={i} className="pl-1">
              {p}
            </li>
          ))}
        </ol>
      </div>
      {children}
      {problemas && problemas.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold uppercase tracking-wide text-texto-discreto">
            O que pode dar errado
          </h3>
          <ul className="mt-2 space-y-2">
            {problemas.map((p, i) => (
              <li key={i} className="rounded-lg border border-borda bg-superficie p-3 text-sm">
                <p className="font-medium text-texto">{p.quando}</p>
                <p className="mt-1 text-texto-secundario">{p.fazer}</p>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

/** Subtítulo dentro de uma parte que reúne mais de uma tarefa. */
export function Subtitulo({ children }: { children: React.ReactNode }) {
  return <h2 className="mt-10 border-b border-borda pb-2 text-xl font-semibold text-texto first:mt-0">{children}</h2>;
}
