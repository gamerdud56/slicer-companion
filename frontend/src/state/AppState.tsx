import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { api } from '../api/client';

interface AppState {
  activePrinterId: string | null;
  activeFilamentId: string | null;
  activeModelId: string | null;
  printers: any[];
  filaments: any[];
  models: any[];
  setActivePrinter: (id: string | null) => void;
  setActiveFilament: (id: string | null) => void;
  setActiveModel: (id: string | null) => void;
  refresh: () => Promise<void>;
}

const AppStateContext = createContext<AppState>({} as any);

export const AppStateProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [activePrinterId, setActivePrinterIdState] = useState<string | null>(null);
  const [activeFilamentId, setActiveFilamentIdState] = useState<string | null>(null);
  const [activeModelId, setActiveModelIdState] = useState<string | null>(null);
  const [printers, setPrinters] = useState<any[]>([]);
  const [filaments, setFilaments] = useState<any[]>([]);
  const [models, setModels] = useState<any[]>([]);

  const setActivePrinter = useCallback((id: string | null) => {
    setActivePrinterIdState(id);
    if (id) AsyncStorage.setItem('@slicer/activePrinter', id);
  }, []);
  const setActiveFilament = useCallback((id: string | null) => {
    setActiveFilamentIdState(id);
    if (id) AsyncStorage.setItem('@slicer/activeFilament', id);
  }, []);
  const setActiveModel = useCallback((id: string | null) => {
    setActiveModelIdState(id);
    if (id) AsyncStorage.setItem('@slicer/activeModel', id);
  }, []);

  const refresh = useCallback(async () => {
    try {
      const [p, f, m] = await Promise.all([api.listPrinters(), api.listFilaments(), api.listModels()]);
      setPrinters(p);
      setFilaments(f);
      setModels(m);
      // hydrate
      const [ap, af, am] = await Promise.all([
        AsyncStorage.getItem('@slicer/activePrinter'),
        AsyncStorage.getItem('@slicer/activeFilament'),
        AsyncStorage.getItem('@slicer/activeModel'),
      ]);
      setActivePrinterIdState(ap && p.find((x) => x.id === ap) ? ap : p[0]?.id || null);
      setActiveFilamentIdState(af && f.find((x) => x.id === af) ? af : f[0]?.id || null);
      setActiveModelIdState(am && m.find((x) => x.id === am) ? am : m[0]?.id || null);
    } catch (e) {
      console.warn('refresh failed', e);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return (
    <AppStateContext.Provider
      value={{
        activePrinterId,
        activeFilamentId,
        activeModelId,
        printers,
        filaments,
        models,
        setActivePrinter,
        setActiveFilament,
        setActiveModel,
        refresh,
      }}
    >
      {children}
    </AppStateContext.Provider>
  );
};

export const useAppState = () => useContext(AppStateContext);
