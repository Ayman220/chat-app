import axios, { AxiosInstance, AxiosResponse } from 'axios';
import { store } from '../store';
import { logout } from '../store/slices/authSlice';
import { performLogout } from '../store/actions/logout';

const api: AxiosInstance = axios.create({
  baseURL: process.env.REACT_APP_API_URL || 'http://localhost:5000/api',
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor to add auth token
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor to handle auth errors
api.interceptors.response.use(
  (response: AxiosResponse) => {
    return response;
  },
  (error) => {
    if (error.response?.status === 401) {
      store.dispatch(performLogout());
    }
    return Promise.reject(error);
  }
);

// API function to fetch last seen data for users
export const fetchLastSeenData = async (userIds: string[]) => {
  const response = await api.post('/users/last-seen', { userIds });
  return response.data.data;
};

export default api; 