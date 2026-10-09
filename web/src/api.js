// small wrapper around fetch: sends JSON, keeps the session cookie and turns API errors into exceptions
export class ApiError extends Error {
  constructor(status, message, fields) {
    super(message);
    this.status = status;
    this.fields = fields;
  }
}

async function request(method, url, body) {
  let res;
  try {
    res = await fetch(`/api${url}`, {
      method,
      credentials: 'same-origin',
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError(0, "Couldn't reach the server. Check your connection.");
  }
  if (res.status === 204) return null;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, data.error || `Error ${res.status}`, data.fields);
  return data;
}

export const api = {
  get: (url) => request('GET', url),
  post: (url, body) => request('POST', url, body ?? {}),
  put: (url, body) => request('PUT', url, body),
  patch: (url, body) => request('PATCH', url, body),
  delete: (url) => request('DELETE', url),
};

// the first message of each invalid field, to show under the inputs
export function fieldErrors(error) {
  if (!(error instanceof ApiError) || !error.fields) return {};
  return Object.fromEntries(Object.entries(error.fields).map(([k, v]) => [k, v?.[0]]));
}
