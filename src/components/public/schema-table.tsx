export type TableDoc = {
  name: string;
  desc: string;
  fields: [string, string][]; // [campo, descrição]
};

export function SchemaTable({ table }: { table: TableDoc }) {
  return (
    <div id={table.name} className="scroll-mt-24">
      <h3 className="font-mono text-base font-semibold text-texto">{table.name}</h3>
      <p className="mt-1 text-sm text-texto-secundario">{table.desc}</p>
      <table className="mt-2 w-full border-collapse text-left text-sm">
        <tbody className="divide-y divide-borda">
          {table.fields.map(([field, desc]) => (
            <tr key={field}>
              <td className="whitespace-nowrap py-1.5 pr-4 align-top font-mono text-xs text-tibe-dark">{field}</td>
              <td className="py-1.5 text-texto-secundario">{desc}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
