import axios from 'axios';
import { initMocks } from './mock';

const apiClient = axios.create({ timeout: 15000 });

initMocks(apiClient);

export default apiClient;
