import axios from 'axios';

export const axiosForBackend = axios.create({
  baseURL: process.env.CLIENT_BASE_PATH || undefined,
  withCredentials: true,
  headers: {
    Accept: 'application/json',
  },
});
