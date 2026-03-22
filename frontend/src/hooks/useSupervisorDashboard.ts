import { useState } from "react";
import { apiGet } from "../lib/api";
import type { SupervisorDashboardResponse } from "../types";

export function useSupervisorDashboard(managerId: string) {
  const [supervisorDashboard, setSupervisorDashboard] = useState<SupervisorDashboardResponse | null>(null);

  async function loadSupervisorDashboard() {
    const response = await apiGet<SupervisorDashboardResponse>(
      `/supervisor/dashboard?manager_id=${encodeURIComponent(managerId)}`,
    );
    setSupervisorDashboard(response);
    return response;
  }

  return {
    supervisorDashboard,
    loadSupervisorDashboard,
  };
}
