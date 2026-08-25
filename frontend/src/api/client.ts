import * as Network from 'expo-network';

const BASE = process.env.EXPO_PUBLIC_BACKEND_URL as string;

export class NetworkError extends Error {
  constructor() {
    super('No internet connection. Please check your network and try again.');
    this.name = 'NetworkError';
  }
}

export class ServerError extends Error {
  constructor(message: string, public statusCode: number) {
    super(message);
    this.name = 'ServerError';
  }
}

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try {
      const j = await res.json();
      msg = j.detail || j.message || msg;
    } catch {}
    throw new ServerError(msg, res.status);
  }
  return res.json();
}

async function networkAwareFetch(input: RequestInfo, init?: RequestInit): Promise<Response> {
  const state = await Network.getNetworkStateAsync();
  if (!state.isConnected || !state.isInternetReachable) {
    throw new NetworkError();
  }
  try {
    return await fetch(input, init);
  } catch (e: any) {
    if (e.message?.includes('Network request failed')) {
      throw new NetworkError();
    }
    throw e;
  }
}

export const api = {
  base: BASE,

  listModels: () => networkAwareFetch(`${BASE}/api/models`).then((r) => json<any[]>(r)),
  getModel: (id: string) => networkAwareFetch(`${BASE}/api/models/${id}`).then((r) => json<any>(r)),
  deleteModel: (id: string) => networkAwareFetch(`${BASE}/api/models/${id}`, { method: 'DELETE' }).then((r) => json(r)),
  updateTransform: (id: string, transform: any) =>
    networkAwareFetch(`${BASE}/api/models/${id}/transform`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ transform }),
    }).then((r) => json<any>(r)),

  listPrinters: () => networkAwareFetch(`${BASE}/api/printers`).then((r) => json<any[]>(r)),
  createPrinter: (body: any) =>
    networkAwareFetch(`${BASE}/api/printers`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }).then((r) => json<any>(r)),
  updatePrinter: (id: string, body: any) =>
    networkAwareFetch(`${BASE}/api/printers/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }).then((r) => json<any>(r)),
  deletePrinter: (id: string) => networkAwareFetch(`${BASE}/api/printers/${id}`, { method: 'DELETE' }).then((r) => json(r)),

  listFilaments: () => networkAwareFetch(`${BASE}/api/filaments`).then((r) => json<any[]>(r)),
  createFilament: (body: any) =>
    networkAwareFetch(`${BASE}/api/filaments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }).then((r) => json<any>(r)),
  updateFilament: (id: string, body: any) =>
    networkAwareFetch(`${BASE}/api/filaments/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }).then((r) => json<any>(r)),
  deleteFilament: (id: string) => networkAwareFetch(`${BASE}/api/filaments/${id}`, { method: 'DELETE' }).then((r) => json(r)),
  logUsage: (id: string, grams: number) =>
    networkAwareFetch(`${BASE}/api/filaments/${id}/usage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ grams }),
    }).then((r) => json<any>(r)),

  printerStatus: (id: string) => networkAwareFetch(`${BASE}/api/printers/${id}/status`).then((r) => json<any>(r)),

  listPresets: () => networkAwareFetch(`${BASE}/api/presets`).then((r) => json<any[]>(r)),
  createPreset: (body: any) =>
    networkAwareFetch(`${BASE}/api/presets`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }).then((r) => json<any>(r)),
  deletePreset: (id: string) => networkAwareFetch(`${BASE}/api/presets/${id}`, { method: 'DELETE' }).then((r) => json(r)),

  slice: (body: any) =>
    networkAwareFetch(`${BASE}/api/slice`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }).then((r) => json<any>(r)),

  discover: () => networkAwareFetch(`${BASE}/api/printers/discover`).then((r) => json<any>(r)),
  testConnection: (host: string, api_key: string, type: string = 'octoprint') =>
    networkAwareFetch(`${BASE}/api/printers/test-connection`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ host, api_key, type }),
    }).then((r) => json<any>(r)),
  sendPrint: (body: any) =>
    networkAwareFetch(`${BASE}/api/printers/print`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }).then((r) => json<any>(r)),
};
