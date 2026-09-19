export interface ApiResponse<T> {
  status: number;
  body: T;
}

/** Wrapper fino sobre fetch: nada de lógica propia, solo evita repetir `res.json()`/manejo de status en cada escenario. */
export class ApiClient {
  constructor(private readonly baseUrl: string) {}

  async get<T>(path: string): Promise<ApiResponse<T>> {
    const res = await fetch(`${this.baseUrl}${path}`);
    return { status: res.status, body: await parseBody<T>(res) };
  }

  async post<T>(path: string, payload: unknown): Promise<ApiResponse<T>> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    return { status: res.status, body: await parseBody<T>(res) };
  }

  async put<T>(path: string, payload: unknown): Promise<ApiResponse<T>> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    return { status: res.status, body: await parseBody<T>(res) };
  }

  async delete<T>(path: string): Promise<ApiResponse<T>> {
    const res = await fetch(`${this.baseUrl}${path}`, { method: 'DELETE' });
    return { status: res.status, body: await parseBody<T>(res) };
  }
}

async function parseBody<T>(res: Response): Promise<T> {
  const text = await res.text();
  if (text.length === 0) return undefined as T;
  try {
    return JSON.parse(text) as T;
  } catch {
    return text as unknown as T;
  }
}
