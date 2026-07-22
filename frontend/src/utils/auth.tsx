import React, { createContext, useContext, useState, useCallback, useEffect, ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import * as authService from '@/services/auth';
import {
  setStationId as setStationIdHeader,
  clearStationId,
  clearToken,
  setToken,
  getToken,
  AUTH_EXPIRED_EVENT,
} from '@/services/api';
import type { AuthUser, StationBrief } from '@/types/auth';
import type { Profile } from '@/types/auth';

interface AuthContextValue {
  user: AuthUser | null;
  stations: StationBrief[];
  currentStationId: string | null;
  initializing: boolean;
  login: (account: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  switchStation: (stationId: string) => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);
export const AUTH_PROFILE_KEY = ['auth', 'profile'] as const;
const AUTH_PROFILE_STALE_TIME = 1000 * 60 * 30;

function toAuthUser(profile: Profile): AuthUser {
  return {
    id: profile.id,
    phone: profile.phone,
    email: profile.email,
    username: profile.username,
    avatarUrl: profile.avatarUrl,
    currentStationId: profile.currentStationId,
    role: profile.role,
  };
}

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const queryClient = useQueryClient();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [stations, setStations] = useState<StationBrief[]>([]);
  const [currentStationId, setCurrentStationId] = useState<string | null>(null);
  const [initializing, setInitializing] = useState(true);

  // 应用启动时若有 token，拉取 profile 恢复登录态
  useEffect(() => {
    const handleAuthExpired = () => {
      clearToken();
      clearStationId();
      setUser(null);
      setStations([]);
      setCurrentStationId(null);
      queryClient.clear();
    };

    window.addEventListener(AUTH_EXPIRED_EVENT, handleAuthExpired);
    return () => window.removeEventListener(AUTH_EXPIRED_EVENT, handleAuthExpired);
  }, [queryClient]);

  useEffect(() => {
    const token = getToken();
    if (!token) {
      setInitializing(false);
      return;
    }
    queryClient
      .fetchQuery({
        queryKey: AUTH_PROFILE_KEY,
        queryFn: () => authService.fetchProfile(),
        staleTime: AUTH_PROFILE_STALE_TIME,
      })
      .then((profile) => {
        setUser(toAuthUser(profile));
        setStations(profile.stations);
        setCurrentStationId(profile.currentStationId);
        if (profile.currentStationId) {
          setStationIdHeader(profile.currentStationId);
        }
      })
      .catch(() => {
        clearToken();
        clearStationId();
      })
      .finally(() => setInitializing(false));
  }, [queryClient]);

  const login = useCallback(async (account: string, password: string) => {
    const result = await authService.login({ account, password });
    setToken(result.token);
    if (result.user.currentStationId) {
      setStationIdHeader(result.user.currentStationId);
    }
    setUser(result.user);
    setStations(result.stations);
    setCurrentStationId(result.user.currentStationId);
    queryClient.setQueryData<Profile>(AUTH_PROFILE_KEY, {
      ...result.user,
      stations: result.stations,
    });
  }, [queryClient]);

  const logout = useCallback(async () => {
    try {
      await authService.logout();
    } catch {
      // 即使后端调用失败也清除本地态
    }
    clearToken();
    clearStationId();
    setUser(null);
    setStations([]);
    setCurrentStationId(null);
    queryClient.clear();
  }, [queryClient]);

  const switchStation = useCallback(async (stationId: string) => {
    const result = await authService.switchStation(stationId);
    setStationIdHeader(stationId);
    setCurrentStationId(stationId);
    setUser((prev) =>
      prev ? { ...prev, currentStationId: stationId, role: result.role } : prev,
    );
    setStations((prev) =>
      prev.map((s) => ({ ...s, isActive: s.id === stationId })),
    );
    queryClient.setQueryData<Profile>(AUTH_PROFILE_KEY, (old) =>
      old
        ? {
            ...old,
            currentStationId: stationId,
            role: result.role,
            stations: old.stations.map((s) => ({ ...s, isActive: s.id === stationId })),
          }
        : old,
    );
  }, [queryClient]);

  const refreshProfile = useCallback(async () => {
    const profile = await queryClient.fetchQuery({
      queryKey: AUTH_PROFILE_KEY,
      queryFn: () => authService.fetchProfile(),
      staleTime: 0,
    });
    setUser(toAuthUser(profile));
    setStations(profile.stations);
    setCurrentStationId(profile.currentStationId);
    if (profile.currentStationId) {
      setStationIdHeader(profile.currentStationId);
    }
  }, [queryClient]);

  return (
    <AuthContext.Provider
      value={{
        user,
        stations,
        currentStationId,
        initializing,
        login,
        logout,
        switchStation,
        refreshProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextValue => {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth 必须在 AuthProvider 内使用');
  }
  return ctx;
};
