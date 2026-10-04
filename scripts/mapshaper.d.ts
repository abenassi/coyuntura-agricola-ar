// mapshaper no publica tipos; esto es lo único que usa scripts/preparar-geometria.ts.
declare module "mapshaper" {
  const mapshaper: {
    applyCommands(comandos: string, entradas: Record<string, string>): Promise<Record<string, string>>;
  };
  export default mapshaper;
}
