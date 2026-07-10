export type TableDoc = {
  name: string;
  desc: string;
  fields: [string, string][]; // [campo, descrição]
};

export function SchemaTable({ table }: { table: TableDoc }) {
  return (
    <div id={table.name} className="scroll-mt-24">
      <h3 className="font-mono text-base font-semibold text-gray-900">{table.name}</h3>
      <p className="mt-1 text-sm text-gray-600">{table.desc}</p>
      <table className="mt-2 w-full border-collapse text-left text-sm">
        <tbody className="divide-y divide-gray-100">
          {table.fields.map(([field, desc]) => (
            <tr key={field}>
              <td className="whitespace-nowrap py-1.5 pr-4 align-top font-mono text-xs text-tibe-dark">{field}</td>
              <td className="py-1.5 text-gray-600">{desc}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
