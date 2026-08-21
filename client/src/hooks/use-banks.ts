import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";

export function useBanks() {
  return useQuery<{ code: string; name: string }[]>({
    queryKey: ["banks"],
    queryFn: async () => {
      const resp = await apiRequest("GET", "/api/wallet/banks");
      const data = await resp.json();
      return data.banks;
    },
    staleTime: 24 * 60 * 60 * 1000,
  });
}
