import { z } from "zod";

// Annexe B de la spec : valeurs de liste Bridge, à utiliser à l'identique dans le formulaire et l'export.

export const bridgeEntityTypeValues = [
  "Sole Proprietorship",
  "General Partnership (GP)",
  "Limited Partnership (LP)",
  "Limited Liability Partnership (LLP)",
  "Corporation",
  "Limited Liability Company (LLC)",
  "Trust",
  "Cooperative",
  "Nonprofit Organization",
  "Foundation",
  "DAO",
] as const;
export const BridgeEntityTypeSchema = z.enum(bridgeEntityTypeValues);
export type BridgeEntityType = z.infer<typeof BridgeEntityTypeSchema>;

export const bridgeSourceOfFundsValues = [
  "Business Loans",
  "Grants",
  "Inter-Company Funds",
  "Investment Proceeds",
  "Legal Settlement",
  "Owner's Capital",
  "Pension / Retirement",
  "Sale of Assets",
  "Sales of Goods and Services",
  "Third Party Funds",
  "Treasury Reserves",
] as const;
export const BridgeSourceOfFundsSchema = z.enum(bridgeSourceOfFundsValues);
export type BridgeSourceOfFunds = z.infer<typeof BridgeSourceOfFundsSchema>;

// Le formulaire client ne propose que ces deux valeurs ; l'API accepte les autres (cas traités par l'équipe).
export const clientSourceOfFundsValues = ["Owner's Capital", "Sales of Goods and Services"] as const;

export const bridgeRevenueBandValues = [
  "$0 – $99,999 USD",
  "$100,000 – $999,999 USD",
  "$1 million – $9 million USD",
  "$10 million – $49 million USD",
  "$50 million – $249 million USD",
  ">$250 million USD",
] as const;
export const BridgeRevenueBandSchema = z.enum(bridgeRevenueBandValues);
export type BridgeRevenueBand = z.infer<typeof BridgeRevenueBandSchema>;
