"use client";
import { useQuery } from "@tanstack/react-query";
import { sepoliaClient } from "@/lib/clients";
import { sepoliaContracts } from "@/lib/contracts";
import { useClock } from "./use-clock";

export function usePrice() {
  const now = useClock();
  const query = useQuery({
    queryKey: ["eth-usd-price"],
    queryFn: async () => {
      const [price, maxAge] = await Promise.all([
        sepoliaClient.readContract({ ...sepoliaContracts.ethUsdPriceFeed, functionName: "latestPrice" }),
        sepoliaClient.readContract({ ...sepoliaContracts.ethUsdPriceFeed, functionName: "maxPriceAge" }),
      ]);
      return { ...price, maxAge };
    },
    refetchInterval: 30_000,
    refetchIntervalInBackground: false,
    staleTime: 20_000,
  });
  const quoteAge = query.data ? Math.max(0, (now || Number(query.data.updatedAt)) - Number(query.data.updatedAt)) : 0;
  const usable = Boolean(query.data?.valid && !query.data.stale && BigInt(quoteAge) <= query.data.maxAge && !query.isError);
  return { ...query, quoteAge, usable, convert: (wei: bigint) => usable && query.data ? wei * query.data.answer / (BigInt(10) ** BigInt(query.data.decimals)) : null };
}
