import axios from 'axios';

export const axiosForBackend = axios.create({
  withCredentials: true,
  headers: {
    Accept: 'application/json',
  },
});
