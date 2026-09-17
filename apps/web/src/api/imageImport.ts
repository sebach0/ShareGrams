import { ApiError } from './client';
import type { ImageRecognitionResult } from './types';

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';

/**
 * No usa apiFetch: esa función siempre manda JSON.stringify, y acá
 * necesitamos FormData (el browser arma el boundary del multipart solo,
 * poniéndole un Content-Type manual se rompe el request).
 */
export async function recognizeImage(token: string, diagramId: string, file: File): Promise<ImageRecognitionResult> {
  const formData = new FormData();
  formData.append('image', file);

  let response: Response;
  try {
    response = await fetch(`${API_URL}/diagrams/${diagramId}/recognize-image`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: formData,
    });
  } catch {
    throw new ApiError(0, 'No se pudo conectar con el servidor. ¿Está corriendo el backend?');
  }

  const data = await response.json().catch(() => undefined);

  if (!response.ok) {
    const message = data && typeof data === 'object' && 'message' in data ? String(data.message) : `Error ${response.status}`;
    throw new ApiError(response.status, message, data);
  }

  return data as ImageRecognitionResult;
}
