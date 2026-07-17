import React, { createContext, useContext, useState, useCallback, useEffect, ReactNode } from 'react';
import * as authService from '@/services/auth';
import {
  setStationId as setStationIdHeader,
  clearStationId,
  clearToken,
  setToken,
  getToken,
} from '@/services/api';
import type { AuthUser, StationBrief } from '@/types/auth';

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

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [stations, setStations] = useState<StationBrief[]>([]);
  const [currentStationId, setCurrentStationId] = useState<string | null>(null);
  const [initializing, setInitializing] = useState(true);

  // 应用启动时若有 token，拉取 profile 恢复登录态
  useEffect(() => {
    const token = getToken();
    if (!token) {
      setInitializing(false);
      return;
    }
    authService
      .fetchProfile()
      .then((profile) => {
        setUser({
          id: profile.id,
          phone: profile.phone,
          email: profile.email,
          username: profile.username,
          avatarUrl: profile.avatarUrl,
          currentStationId: profile.currentStationId,
          role: profile.role,
        });
        setStations(profile.stations);
        setCurrentStationId(profile.currentStationId);
        if (profile.currentStationId) {
          setStationIdHeader(profile.currentStationId);
        }
      })
      .catch(() => {
        clearToken();
      })
      .finally(() => setInitializing(false));
  }, []);

  const login = useCallback(async (account: string, password: string) => {
    const result = await authService.login({ account, password });
    setToken(result.token);
    if (result.user.currentStationId) {
      setStationIdHeader(result.user.currentStationId);
    }
    setUser(result.user);
    setStations(result.stations);
    setCurrentStationId(result.user.currentStationId);
  }, []);

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
  }, []);

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
  }, []);

  const refreshProfile = useCallback(async () => {
    const profile = await authService.fetchProfile();
    setUser({
      id: profile.id,
      phone: profile.phone,
      email: profile.email,
      username: profile.username,
      avatarUrl: profile.avatarUrl,
      currentStationId: profile.currentStationId,
      role: profile.role,
    });
    setStations(profile.stations);
    setCurrentStationId(profile.currentStationId);
  }, []);

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
