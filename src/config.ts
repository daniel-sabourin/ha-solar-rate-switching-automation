export interface Config {
  haUrl: string;
  haToken: string;
  netSensor: string;
}

export function loadConfig(): Config {
  const haUrl = process.env.HA_URL;
  const haToken = process.env.HA_TOKEN;
  const netSensor = process.env.HA_NET_SENSOR;

  if (!haUrl) throw new Error("Missing env var: HA_URL");
  if (!haToken) throw new Error("Missing env var: HA_TOKEN");
  if (!netSensor) throw new Error("Missing env var: HA_NET_SENSOR");

  return { haUrl, haToken, netSensor };
}
