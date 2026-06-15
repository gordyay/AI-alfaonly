// Справочные данные (клиенты, продукты) загружаются один раз и раздаются через
// контекст — для подписей в очереди, профиле и аналитике. Расчётные результаты
// (очередь, склонность, метрики) приходят отдельными запросами.

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { Client, Manager, Product } from "../domain/types";
import { api } from "./client";

interface ReferenceData {
  clients: Client[];
  products: Product[];
  managers: Manager[];
  clientById: Map<string, Client>;
  productById: Map<string, Product>;
  managerById: Map<string, Manager>;
  loading: boolean;
  error: string | null;
}

const ReferenceContext = createContext<ReferenceData | null>(null);

export function ReferenceProvider({ children }: { children: ReactNode }) {
  const [clients, setClients] = useState<Client[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [managers, setManagers] = useState<Manager[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    Promise.all([api.getClients(), api.getProducts(), api.getManagers()])
      .then(([c, p, m]) => {
        if (!active) return;
        setClients(c);
        setProducts(p);
        setManagers(m);
      })
      .catch((e: unknown) => {
        if (active) setError(e instanceof Error ? e.message : "Ошибка загрузки данных");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const value = useMemo<ReferenceData>(
    () => ({
      clients,
      products,
      managers,
      clientById: new Map(clients.map((c) => [c.id, c])),
      productById: new Map(products.map((p) => [p.id, p])),
      managerById: new Map(managers.map((m) => [m.id, m])),
      loading,
      error,
    }),
    [clients, products, managers, loading, error],
  );

  return <ReferenceContext.Provider value={value}>{children}</ReferenceContext.Provider>;
}

export function useReference(): ReferenceData {
  const ctx = useContext(ReferenceContext);
  if (!ctx) throw new Error("useReference must be used within ReferenceProvider");
  return ctx;
}
