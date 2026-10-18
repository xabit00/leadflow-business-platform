import type { AxiosInstance } from 'axios';
import MockAdapter from 'axios-mock-adapter';

export const initMocks = (client: AxiosInstance): void => {
  if (import.meta.env.VITE_USE_MOCKS !== 'true') return;

  const mock = new MockAdapter(client, { delayResponse: 150 });
  mock.onGet('/health').reply(200, {
    status: 'healthy',
    app_name: 'LeadFlow',
    version: '0.1.0',
    environment: 'frontend-mock',
    timestamp: new Date().toISOString(),
    database: 'Supabase migration pending',
  });
  mock.onAny().networkError();
};
