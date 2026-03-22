import { useState } from "react";
import { apiGet } from "../lib/api";
import { getErrorText } from "../lib/ui";
import type { ManagerCockpit } from "../types";

export function useCockpit(managerId: string) {
  const [cockpit, setCockpit] = useState<ManagerCockpit | null>(null);
  const [cockpitLoading, setCockpitLoading] = useState(true);
  const [cockpitError, setCockpitError] = useState<string | null>(null);

  async function loadCockpit() {
    setCockpitLoading(true);
    setCockpitError(null);

    try {
      const response = await apiGet<ManagerCockpit>(`/cockpit?manager_id=${encodeURIComponent(managerId)}`);
      setCockpit(response);
      return response;
    } catch (error) {
      setCockpitError(getErrorText(error, "Не удалось загрузить cockpit."));
      throw error;
    } finally {
      setCockpitLoading(false);
    }
  }

  return {
    cockpit,
    cockpitLoading,
    cockpitError,
    loadCockpit,
  };
}
