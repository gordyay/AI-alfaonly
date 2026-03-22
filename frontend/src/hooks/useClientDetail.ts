import { useEffect, useRef, useState } from "react";
import { apiGet } from "../lib/api";
import type { ClientDetailResponse } from "../types";

export function getDetailCacheKey(clientId: string, workItemId?: string | null) {
  return `${clientId}::${workItemId || "default"}`;
}

export function useClientDetail(selectedClientId: string | null, selectedWorkItemId: string | null) {
  const [clientDetails, setClientDetails] = useState<Record<string, ClientDetailResponse>>({});
  const [detailLoading, setDetailLoading] = useState(false);
  const clientDetailsRef = useRef(clientDetails);

  useEffect(() => {
    clientDetailsRef.current = clientDetails;
  }, [clientDetails]);

  const selectedDetailKey = selectedClientId ? getDetailCacheKey(selectedClientId, selectedWorkItemId) : null;
  const selectedDetail = selectedDetailKey ? clientDetails[selectedDetailKey] ?? null : null;

  async function loadClientDetail(clientId: string, workItemId?: string | null): Promise<ClientDetailResponse> {
    const cacheKey = getDetailCacheKey(clientId, workItemId);
    const cachedDetail = clientDetailsRef.current[cacheKey];
    if (cachedDetail) {
      return cachedDetail;
    }

    setDetailLoading(true);
    try {
      const query = workItemId ? `?work_item_id=${encodeURIComponent(workItemId)}` : "";
      const detail = await apiGet<ClientDetailResponse>(`/client/${clientId}${query}`);
      setClientDetails((current) => ({ ...current, [cacheKey]: detail }));
      return detail;
    } finally {
      setDetailLoading(false);
    }
  }

  async function reloadClientDetail(clientId: string, workItemId?: string | null) {
    const query = workItemId ? `?work_item_id=${encodeURIComponent(workItemId)}` : "";
    const detail = await apiGet<ClientDetailResponse>(`/client/${clientId}${query}`);
    setClientDetails((current) => ({ ...current, [getDetailCacheKey(clientId, workItemId)]: detail }));
    return detail;
  }

  function resetClientDetails() {
    setClientDetails({});
  }

  return {
    clientDetails,
    selectedDetail,
    detailLoading,
    loadClientDetail,
    reloadClientDetail,
    resetClientDetails,
  };
}
