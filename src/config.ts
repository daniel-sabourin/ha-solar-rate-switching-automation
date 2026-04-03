export interface Config {
  haUrl: string;
  haToken: string;
  importSensor: string;
  exportSensor: string;
}

export function loadConfig(): Config {
  const haUrl = process.env.HA_URL;
  const haToken = process.env.HA_TOKEN;
  const importSensor = process.env.HA_IMPORT_SENSOR;
  const exportSensor = process.env.HA_EXPORT_SENSOR;

  if (!haUrl) throw new Error("Missing env var: HA_URL");
  if (!haToken) throw new Error("Missing env var: HA_TOKEN");
  if (!importSensor) throw new Error("Missing env var: HA_IMPORT_SENSOR");
  if (!exportSensor) throw new Error("Missing env var: HA_EXPORT_SENSOR");

  return { haUrl, haToken, importSensor, exportSensor };
}
