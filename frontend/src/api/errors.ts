export interface ApiError {
  code: string;
  message: string;
}

export const normalizeError = (error: unknown, fallback = 'Something went wrong. Please try again.'): ApiError => {
  if (error && typeof error === 'object') {
    const value = error as { code?: unknown; message?: unknown };
    if (typeof value.message === 'string') {
      return {
        code: typeof value.code === 'string' ? value.code : 'UNKNOWN',
        message: value.message,
      };
    }
  }

  return { code: 'UNKNOWN', message: fallback };
};
